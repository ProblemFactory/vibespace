#!/usr/bin/env node
// THE INCIDENT DIALOG's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-incident.mjs (its browser /
// hub legs and every mutant CONTROL stay there): the scene rows spell no harness lock dir, listing or CLI, and no backend id branch in src/incident.js. Each reads the file it pins BY NAME, so ci.mjs's affected rule
// selects this suite on a change of that file.
// Run: node scripts/test-incident-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINNED = 'src/incident.js';   // the file these legs read, BY NAME: the moved legs build its path with path.join, which ci.mjs's affected rule cannot see
void PINNED;
let failed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };

console.log('— src/incident.js reads the harness rows (source pins)');
{
  const incCode = fs.readFileSync(path.join(repo, 'src', 'incident.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // code, not its history comments
  check('scene rows: incident.js spells no harness lock dir, listing or CLI (local and remote read the rows)', !/\.claude\/sessions|\.codex\/sessions|claude --version|codex --version|\|claude\||\|codex\|/.test(incCode) && !/'\.claude', 'sessions'/.test(incCode));
}
check('incident.js carries no backend id branch (the registry is the only harness knowledge)', !/['"]codex['"]\s*\?|backend === ['"]codex['"]|=== ['"]claude['"]/.test(fs.readFileSync(path.join(repo, 'src', 'incident.js'), 'utf8')));

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
