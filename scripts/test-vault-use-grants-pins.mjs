#!/usr/bin/env node
// THE STANDING GRANTS — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-vault-use-grants.mjs (its behaviour legs and every mutant / browser CONTROL stay there): ⑩ round 9 ruling C — the grant road is judged on shape.destKnown, never shape.always (src/server/vault-run-door.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-vault-use-grants-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
console.log('⑩ ruling C — the grant road reads destKnown (source pins)');
{
  const DSRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  // round 9 (seam ruling C with vault-agent-own): the GRANT road is judged on `shape.destKnown` (the reader READ every
  // destination), NOT `shape.always` (whether «always» would be OFFERED) — decoupled so a keyed routing flag whose host is read,
  // which withholds «always», is still coverable by a grant naming it. Pinned so an edit reverting the gate to shape.always is RED.
  ok(/destinationKnown: !!shape\.destKnown/.test(DSRC), 'the standing verdictFor passes destinationKnown = shape.destKnown, not shape.always (ruling C)');
  ok(/shape\.destKnown && !dest\.opaque && dest\.hosts\.length/.test(DSRC), 'the host-scoped paste short-circuit is gated on shape.destKnown (ruling C)');
  ok(!/destinationKnown: !!shape\.always/.test(DSRC) && !/verdict\.ask && !refused && shape\.always &&/.test(DSRC), 'no grant-road gate reads shape.always for destination knowledge — the two facts stay decoupled');
}

console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
