#!/usr/bin/env node
// THE MAC SIGN-IN (ARD) — THE SOURCE-TEXT LEG (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from
// the heavy scripts/test-mac-ard-signin-chrome.mjs, whose browser legs stay there: §7 the launcher hands its own close to the
// machine's dialog. It reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of it (the
// name drops «-chrome»: no fast suite carries a chrome name — test-ci-gate).
// Run: node scripts/test-mac-ard-signin-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (typeof msg !== 'string') throw new TypeError(`ok(): the name is a ${typeof msg} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };

console.log('§7 the launcher hands its own close to the machine\'s dialog (the Apps dialog closes with it)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/lib/desktop-app-launcher.js'), 'utf8');
  ok(/showMachineDesktopDialog\(app, m, \{[^}]*closeOpener: close,/.test(src) && /const \{ overlay, body, close(?:, raised)?(?:, ready, live)? \} = createModalShell\(\{ id: 'desktop-launch-dialog'/.test(src), 'desktop-app-launcher.js passes the Apps dialog\'s close as closeOpener');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
