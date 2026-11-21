#!/usr/bin/env node
// THE KEPT BROWSER — THE SOURCE-TEXT LEG (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-browser-kept.mjs, whose store / keeper / routes legs and every patched-copy CONTROL (with its «control
// setup» precondition) stay there: verify r2 (Y2) — the kept sweep's report is READ by the panel, not only journalled. It
// reads the files it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of either.
// Run: node scripts/test-browser-kept-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;

console.log('— ⑥ the routes: GET / DELETE /api/browser/kept, the housekeeping answer to an agent token');

// verify r2 (Y2): the kept sweep's report (the bound held open by running conversations) is READ by the panel, not only journalled
{
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  const bt = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
  ok(/keptSweep/.test(bt) && /v\.keptSweep/.test(tv) && /conversation is running/.test(tv) && /Forget frees one/.test(tv), 'the housekeeping view carries the kept sweep and the Agent browser panel SAYS the total bound held open by running conversations (what frees it: Forget) — never a report that reaches only the journal');
}

console.log(`\n${fail ? '✗' : '✓'} test-browser-kept-pins: ${pass} passed, ${fail} failed`);

process.exit(fail ? 1 : 0);
