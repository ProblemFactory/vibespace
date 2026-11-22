// THE PLANTED SITE of test-suite-files-parse §3 (B-0d3e, 主开发 r2677: «a non-vacuity floor is never a count of debt: a census
// proves it can see by a PLANTED site in a fixture of its own»). NEVER imported, NEVER run. §1's walk parses this file like
// every other under scripts/, and §3 asks the two censuses (scripts/mutant-copy.mjs scriptCensus) what they find HERE: the one
// helper below, whose own parameter is the anchor of a product edit that reaches a loader and fails by no name, is exactly ONE
// unanchored control edit and ONE anchor helper. A copy with its edit taken out finds neither (§3's RED control). It stands
// outside both lists (scripts/fixtures/unanchored-controls.json, anchor-helpers.json): those count scripts/*.mjs and
// scripts/lib/*.mjs only. Change it only with §3's two legs beside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(REPO, 'src/pairing-token.js'), 'utf8');
export const plantedCut = (MUT, from, to) => { if (src.split(from).length !== 2) return null; return MUT.load('src/pairing-token.js', src.replace(from, to), 'census-plant'); };
