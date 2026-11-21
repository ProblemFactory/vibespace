#!/usr/bin/env node
// THE LAYOUT HISTORY — SOURCE PIN (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy scripts/test-layout-history.mjs
// (its rollback store legs stay there): the rollback row names the change that followed it (src/lib/setup-flows.js). The file is read BY NAME, so
// ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-layout-history-pins.mjs
import './scratch.mjs';
import fs from 'node:fs'; import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass=0, fail=0; const ok=(c,n,e)=>{ if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)');if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.error('  ✗ '+n+(e?'\n    '+e:''));}};
console.log('— the rollback row names the change that followed it (source pin)');
ok(/const change = Array\.isArray\(e\.change\) && e\.change\.length[\s\S]{0,200}t\('\{desktop\} went from \{a\} to \{b\} windows', \{ desktop: n \|\| t\('Desktop'\), a, b \}\)[\s\S]{0,700}escHtml\(t\('Then: \{changes\}', \{ changes: change \}\)\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8')), 'the Restore dialog draws it under the row ("Then: HR went from 3 to 1 windows"), escaped');
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);
