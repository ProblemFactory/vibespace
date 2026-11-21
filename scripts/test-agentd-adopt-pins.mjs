#!/usr/bin/env node
// THE DEVICE AGENT'S ADOPTION — THE SOURCE-TEXT LEG (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-agentd-adopt.mjs, whose real daemons stay there: the legacy fallback recognises claude / codex
// cmdlines. It reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-agentd-adopt-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');

let failed = 0;
const check = (name, cond, extra) => { if (typeof name !== 'string') throw new TypeError(`check(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`);
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};

console.log('— legacy meta (no startTime) still adopts via the CLI-name fallback —');
{
  // 'sleep' matches neither argv0 'sh' nor claude|codex — the honest outcome
  // for an UNKNOWN legacy child is refusing to claim it (synthesize), but a
  // claude/codex cmdline (the only real remote-chat children) must adopt.
  // Emulate by checking the regex directly against a claude-style cmdline:
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf8');
  check('legacy fallback recognizes claude/codex cmdlines', /\(\^\|\[\/\\s\]\)\(claude\|codex\)/.test(src), '');
}

console.log(failed ? `\n${failed} FAILED` : '\nagentd adoption text pins passed');

process.exit(failed ? 1 : 0);
