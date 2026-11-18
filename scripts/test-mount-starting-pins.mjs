#!/usr/bin/env node
// A MOUNT STILL STARTING — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-mount-starting.mjs (its behaviour legs and every mutant / browser CONTROL stay there): the row offers no Connect while starting, the keyed starting line patched in place, its words in zh/ja (src/lib/sidebar-mounts.js, src/lib/i18n-zh.js, src/lib/i18n-ja.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-mount-starting-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// ── the row: no Connect while starting, the line says what it waits for ──
const sb = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
ok(/\} else if \(!isCred && !m\.starting\) \{/.test(sb) && /if \(!isCred && !m\.starting\) \{\s*row\.classList\.add\('mounts-row-clickable'\)/.test(sb), 'the row offers NO Connect (button or row click) while starting');
ok(/sl\.dataset\.key = 'mount-start:' \+ m\.id/.test(sb) && /if \(!sl\.isConnected\) \{ clearInterval\(tick\); return; \} sl\.textContent = words\(\);/.test(sb), 'the starting line is keyed and its elapsed time is patched in place');
const key = 'Starting — rebuilding its cache index ({files} files), {elapsed} so far; it mounts by itself when the scan ends (waits up to {max} min)';
ok(sb.includes(key) && ['zh', 'ja'].every((l) => fs.readFileSync(path.join(REPO, `src/lib/i18n-${l}.js`), 'utf8').includes(JSON.stringify(key) + ':')), 'the starting words are translated (zh/ja)');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
