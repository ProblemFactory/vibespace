#!/usr/bin/env node
// THE PROFILE-BLINDNESS NUDGE — SOURCE PIN (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-profile-blindness-chip.mjs (its hub + agent legs stay there): the nudge route names no spend reason and asks no ladder
// (src/routes/browser.js). The file is read BY NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-profile-blindness-chip-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
console.log('— the nudge route: zero billed turns by construction (source pin)');
const routeSrc = fs.readFileSync(path.join(repo, 'src/routes/browser.js'), 'utf8');
ok(!/spendGuard|authorizeUnattendedSpend|spendReason|deliverToConversation/.test(routeSrc), 'the nudge route names no spend reason and asks no ladder — zero billed turns by construction');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
