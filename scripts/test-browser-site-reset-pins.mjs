#!/usr/bin/env node
// THE SITE RESET — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-browser-site-reset.mjs (its behaviour legs and every mutant / browser CONTROL stay there): the CLI prints THE shared-loop sentence on a failed or timed-out verb (data/bin/vibespace-browser + src/browser-stuck.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-browser-site-reset-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const ST = require('../src/browser-stuck.js');
console.log('— the unattributed loop: the CLI says THE sentence (source pin)');
{
    const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
    ok(/after\.loopShared && !after\.loop && \(code !== 0 \|\| timedOut\)[^\n]*DS\.loopSharedText\(\)\} \[navigation_loop_shared\]/.test(cliSrc) && /cannot tell whether it is yours/.test(ST.loopSharedText()) && /tab close/.test(ST.loopSharedText()) && /site-reset --host <host>/.test(ST.loopSharedText()) && !/https?:/.test(ST.loopSharedText()), 'the CLI prints THE sentence (no address; `tab close`, `tab new`, `site-reset --host`) on a failed or timed-out verb there [navigation_loop_shared]');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
