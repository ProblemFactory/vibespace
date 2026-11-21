#!/usr/bin/env node
// THE DESKTOP STREAM'S KEEPALIVE — THE SOURCE-TEXT LEG (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-desktop-stream-keepalive.mjs, whose real bridges and every patched-copy CONTROL stay
// there: §4 the singleton Desktop window opts into the reconnect ladder. It reads the file it pins BY NAME, so ci.mjs's
// affected rule selects this suite on a change of it.
// Run: node scripts/test-desktop-stream-keepalive-pins.mjs
import './scratch.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

console.log('§4 the client opts in: the singleton Desktop window walks the reconnect ladder too');
{
  const fs = await import('node:fs');
  const dw = fs.readFileSync(path.join(repo, 'src/lib/desktop-window.js'), 'utf8');
  ok('desktop-window.js passes autoReconnect: true (2.369.118 — the Desktop no longer sits on "Disconnected" until a click)', /autoReconnect: true/.test(dw));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
