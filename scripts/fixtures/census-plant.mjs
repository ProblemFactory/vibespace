// THE PLANTED SITE of test-suite-files-parse §3 (B-0d3e, 主开发 r2677: «a non-vacuity floor is never a count of debt: a census
// proves it can see by a PLANTED site in a fixture of its own»). NEVER imported, NEVER run. §1's walk parses this file like
// every other under scripts/, and §3 asks the two censuses (scripts/mutant-copy.mjs scriptCensus) what they find HERE: the one
// helper below, whose own parameter is the anchor of a product edit that reaches a loader and fails by no name, is exactly ONE
// unanchored control edit and ONE anchor helper. A copy with its edit taken out finds neither (§3's RED control). The SECOND
// LIST's plant (scripts/lib/param-text-census.mjs paramTextEdits, B-0d3e slice 8, 主开发 r2678) is the helper after it: HANDED the text, its literal-anchored edit
// is the text a copy loads — ONE edit of that list and none of the other two. Every plant stands outside every list
// (scripts/fixtures/unanchored-controls.json, anchor-helpers.json, param-text-edits.json count scripts/*.mjs and
// scripts/lib/*.mjs only). Change it only with §3's legs beside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(REPO, 'src/pairing-token.js'), 'utf8');
export const plantedCut = (MUT, from, to) => { if (src.split(from).length !== 2) return null; return MUT.load('src/pairing-token.js', src.replace(from, to), 'census-plant'); };
export const plantedHandedText = (MUT, text) => MUT.load('src/pairing-token.js', text.replace('const ', 'let '), 'census-plant-handed');
