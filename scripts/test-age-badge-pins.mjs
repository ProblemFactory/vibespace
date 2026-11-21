#!/usr/bin/env node
// THE AGE BADGE's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-age-badge-chrome.mjs (its browser /
// hub legs and every mutant CONTROL stay there): the tree carries the cure (public/style.css: one line, each badge clear of its ring's label) and the taskbar badge draws the compact mark (src/lib/usage-meter.js). Each reads the file it pins BY NAME, so ci.mjs's affected rule
// selects this suite on a change of that file.
// Run: node scripts/test-age-badge-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof msg !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
const CURE = /\.usage-age-badge, \.acct-donut-age \{ position: absolute; right: -7px;([^}]*)white-space: nowrap; \}\n(?:\/\*[\s\S]*?\*\/\n)?\.acct-donut-age \{ top: -7px; \}\n\.usage-age-badge \{ top: -9px; \}/;
const MARK = '${escHtml(c.staleMark || c.staleAge)}';

console.log('— the cure and the mark (source pins)');
ok(CURE.test(CSS), 'the tree carries the cure: one line (nowrap), each badge placed clear of its ring\'s label');
const UM_SRC = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
ok(UM_SRC.includes(MARK), 'the taskbar badge draws the compact mark (its words stay in the tooltip)');

console.log(`\ntest-age-badge-pins: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
