#!/usr/bin/env node
// THE AGGREGATED IM's PAGE — THE SOURCE-TEXT LEG (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-channels-aggregate-ui.mjs, whose browser legs stay there (and which exits when no browser is on
// the box — so this pin ran nowhere without one): the mail frame's applied height re-judges the live set. It reads the file
// it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-channels-aggregate-ui-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

  // WIRING PIN (lane-mirror-197, 2026-09-29): the DOM half re-judges the live set after every APPLIED height — a row that
  // slides into the visible band because a frame above shrank crosses no observer threshold and fires no scroll, the two
  // triggers the reconcile had; the runner saw the 7th of 7 short mails on screen as a blank box
  { const cmf = fs.readFileSync(path.join(repo, 'src/lib/channel-mail-frame.js'), 'utf8'); const APPLY = "s.h = hv.h; s.frame.style.height = hv.h + 'px'; s.box.dataset.h = String(hv.h);"; const at = cmf.indexOf(APPLY); const fnEnd = cmf.indexOf('\n  }\n', at); const nextLater = cmf.indexOf('later();', at);
    ok(at > 0 && cmf.split(APPLY).length === 2 && nextLater > at && nextLater < fnEnd, 'WIRING PIN: an APPLIED height re-judges the live set — `later()` follows the apply inside applyHeight (channel-mail-frame.js)'); }

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
