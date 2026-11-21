#!/usr/bin/env node
// THE INBOX WINDOW — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-inbox-window-ui.mjs, whose real browser legs and the pre-lane patched-bundle CONTROL (with its premise)
// stay there: ⑳ the run card and the agent's request card render VERBATIM, never markdown. They read the window module BY
// NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-inbox-window-ui-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`check(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };

  console.log('⑳ RED CONTROL (the pre-lane window on a patched bundle), then the window\'s 「Reopen and send」 on an ended conversation');
  {
    const wsrc = fs.readFileSync(path.join(repo, 'src/lib/inbox-window.js'), 'utf8');

    check('vault-run-ask (the run card) renders VERBATIM, never markdown — its type is in the isCmd command list so a `*` or `#` in the command line shows as typed (SEAM int330, q-043 P0-f)', /const isCmd = [^;]*vault-run-ask/.test(wsrc), (wsrc.match(/const isCmd = [^;]*;/) || [])[0]);
    check('vault-grant-ask (the agent\'s request card) renders VERBATIM, never markdown — its type is in the `plain` list so the entry ref and the agent\'s OWN words (a `*`, a `# y`, two lines) show as typed, escaped (SEAM int331, q-043 P0-c / vault-scrub-forms §8)', /const plain = [^;]*vault-grant-ask/.test(wsrc), (wsrc.match(/const plain = [^;]*;/) || [])[0]);
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');

process.exit(failed ? 1 : 0);
