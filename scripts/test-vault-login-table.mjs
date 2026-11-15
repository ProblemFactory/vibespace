#!/usr/bin/env node
// test-vault-login-table — vault-login ROUND 32 (SHAPE S): the generated table, its legs and one mutant per law as ONE in-process
// suite (lane chrome-157, the round-32 take-over; 主开发's ruling Q5 — measured alone, far over the fast tier's 10 s ⇒ its own heavy
// row). THE ONE SENTENCE: the agent locates the form, the vault fills it, the agent never gets the value; shape S: a restart ends
// every recheck, a tab that carried a fence or a guard is held until it navigates.
//   · the TABLE (scripts/fixtures/r32-login-table.mjs): fence × guards × can-it-look × page × address × connection — every
//     surviving cell through the real engine (fake kernel + relay + cdp-mediator + browser-keeper + vault-engine + browser-logins +
//     browser-dialogs + routes/browser), both doors read, the expected verdict from the law-written oracle, pruned cells by name;
//   · the LEGS: the deletions; the RAM stash and THE ONE browser identity (browser-keeper browserIdentityOfRecord); both doors; every
//     verb admitted on a fenced tab against a page that copies the typed value into its title and address (Q3); a check across a
//     navigation (law 5); the one record kind;
//   · THE CURES (the owner's B: we defend against mistakes, not against an agent's deliberate attack, unless the defence can be
//     proven to hold): a check that keeps failing has a bound; the next address checked at the lift (a GET form, a base64 router);
//     a restart or a reconnect holds by the DOCUMENT; the window before the fences are back answers from the record; a browser that
//     reuses the process number is another; a restore reads the logins only to re-hydrate the scrub list (by behaviour);
//   · ONE MUTANT PER LAW, each red by name, each failing by name when its anchor is gone (Q6), and Q7's cell with its mutant.
// No real site, no profile of the owner's, no real vault: scratch homes and stand-ins only. The values typed are shorter than the
// mask's floor ON PURPOSE (masking cannot hide a leak), and no failure text carries one (the fixture scrubs every planted value).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { runR32LoginTable, runR32Mutants } from './fixtures/r32-login-table.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => {
  if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(extra).slice(0, 4000) : '')); }
  return !!c;
};

console.log('— the round-32 table and its legs');
await runR32LoginTable({ repoDir: REPO, ok });
console.log('— one mutant per law (+ Q7\'s cell)');
const MUT = mutantCopies('vl-r32-mutants', REPO);
await runR32Mutants({ repoDir: REPO, ok, MUT });
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 17 })) ok(r.pass, 'mutant-copy census: ' + r.name, r.pass ? undefined : r.detail);

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
