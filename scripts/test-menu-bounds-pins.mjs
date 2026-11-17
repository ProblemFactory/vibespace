#!/usr/bin/env node
// THE MENU PLACEMENT's SOURCE PIN (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-menu-bounds-chrome.mjs (its browser /
// hub legs and every mutant CONTROL stay there): ONE placement — showContextMenu (src/lib/utils.js) and the file explorer's builder (src/lib/file-explorer-ops.js) both end in placeMenu. Each reads the file it pins BY NAME, so ci.mjs's affected rule
// selects this suite on a change of that file.
// Run: node scripts/test-menu-bounds-pins.mjs
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };

console.log('— ONE placement (source pin)');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/utils.js'), 'utf8'), ops = fs.readFileSync(path.join(ROOT, 'src/lib/file-explorer-ops.js'), 'utf8');
  check('ONE placement: showContextMenu and the file explorer\'s builder both end in placeMenu (no clamp of their own); only the explorer\'s builder follows its rows', /\n  placeMenu\(pop, x, y, \{ up, placesItself \}\);\n  return pop;\n\}/.test(src) && /\n    placeMenu\(menu, x, y, \{ follow: true \}\);/.test(ops) && !/if \(mr\.bottom > vh\) menu\.style\.top/.test(ops));
}

console.log(failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
