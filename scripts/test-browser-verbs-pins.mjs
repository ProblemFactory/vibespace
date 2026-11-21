#!/usr/bin/env node
// THE agent-browser SHIM's SOURCE CHECKS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-browser-verbs.mjs (its browser /
// hub legs and every mutant CONTROL stay there): data/bin/agent-browser exists, is executable, is a node script carrying src/browser-verbs.js's SHIM_MARKER, and reads no env, opens no network, spawns nothing. Each reads the file it pins BY NAME, so ci.mjs's affected rule
// selects this suite on a change of that file.
// Run: node scripts/test-browser-verbs-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('../src/browser-verbs.js');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const SHIM = path.join(REPO, 'data/bin/agent-browser');

console.log('— the shim (data/bin/agent-browser): its source');
{
  ok(fs.existsSync(SHIM) && (fs.statSync(SHIM).mode & 0o111) !== 0, 'data/bin/agent-browser exists and is executable');
  const src = fs.existsSync(SHIM) ? fs.readFileSync(SHIM, 'utf8') : '';
  ok(src.startsWith('#!/usr/bin/env node') && src.includes(V.SHIM_MARKER), 'the shim is a node script carrying the marker resolvers skip it by');
  ok(!/process\.env|require\(['"](?:https?|net|child_process|fs)['"]\)/.test(src), 'the shim reads no env, opens no network, spawns nothing');
}

console.log(fail ? `FAIL (${fail} failed, ${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
