#!/usr/bin/env node
// THE DESKTOP APP KEEPER — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-desktop-app-keeper.mjs, whose real keeper / bridge legs and every patched-copy CONTROL stay there:
// §8 (f) the keeper source spells no rung and looks the recipe UP. It reads the files it pins BY NAME, so ci.mjs's affected
// rule selects this suite on a change of either.
// Run: node scripts/test-desktop-app-keeper-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError(`ok(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };

console.log('§8 r2 — the round-1 verifier\'s findings, each reproduced on the real keeper and closed with a control');

{ // (f) the bring-up is a TABLE LOOKUP: a fourth rung = one row + one recipe, driven end to end with the keeper UNCHANGED
  const src = (fs.readFileSync(path.join(repo, 'src/server/desktop-app-keeper.js'), 'utf8') + '\n' + fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8')).replace(/^\s*(\/\/|\*).*$/gm, ''); // lane C1: the keeper = the hub half + the machine half
  ok(!/rec\.via ===|'Xvfb\+x11vnc'|'Xvnc'|unknown bring-up/.test(src), 'the keeper source spells no rung (no `rec.via ===`, no Xvnc / Xvfb+x11vnc literal, no "unknown bring-up")');
  ok(/display\.RECIPES\[/.test(src) && /M\.recipeFor|resolved\.recipe/.test(src), 'it looks the recipe UP by the name the PURE table gives it');

}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed` : `\nALL PASS (${pass}`}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
