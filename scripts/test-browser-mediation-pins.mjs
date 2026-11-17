#!/usr/bin/env node
// THE MEDIATION WRAPPER's WORDS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy
// scripts/test-browser-mediation.mjs (its mediated CDP legs and every mutant CONTROL stay there): data/bin/vibespace-browser's own
// words about a takeover — it INTERRUPTS the agent, says browser_interrupted, never «not script evaluation». It reads the file BY
// NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-browser-mediation-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 500) : '')); } return !!c; };

console.log('— the wrapper says the takeover truthfully (source pin)');
  { const REPO_DIR = new URL('..', import.meta.url).pathname; const wrapperTxt = fs.readFileSync(path.join(REPO_DIR, 'data/bin/vibespace-browser'), 'utf8'); const manual = fs.readFileSync(path.join(REPO_DIR, 'docs/agent/browser-manual.md'), 'utf8');
    ok(/Taking over INTERRUPTS you/.test(wrapperTxt) && /browser_interrupted/.test(wrapperTxt) && !/not script evaluation/.test(wrapperTxt) && /Taking over interrupts you/.test(manual) && /browser_interrupted/.test(manual) && !/which is NOT fenced/.test(manual) && !/fenceScriptsWhileDriven/.test(wrapperTxt + manual), 'the CLI\'s `watch` and the manual say the same: a takeover interrupts (browser_interrupted) — no surface still says scripts pass or names the retired switch'); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
