// THE PLANTED SITES of test-suite-files-parse §3 (B-0d3e, 主开发 r2677: «a non-vacuity floor is never a count of debt: a census
// proves it can see by a PLANTED site in a fixture of its own»). NEVER imported, NEVER run. It sits in scripts/lib/ so that §1's
// walk admits it by the SAME filter as every script it censuses (主开发 r2799: no branch of its own — a broken filter loses the
// plant with the lists), and §3 takes its row out before any list is judged. What the censuses find HERE: plantedCut, whose own
// parameter is the anchor of a product edit that reaches a loader and fails by no name, is exactly ONE unanchored control edit
// and ONE anchor helper; plantedHandedText (the SECOND LIST's plant, scripts/lib/param-text-census.mjs paramTextEdits, B-0d3e
// slice 8, 主开发 r2678), HANDED the text, its literal-anchored edit the text a copy loads, is ONE edit of that list and none of
// the other two. A copy with a site taken out finds none of it (§3's RED controls). Change it only with §3's legs beside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(REPO, 'src/pairing-token.js'), 'utf8');
export const plantedCut = (MUT, from, to) => { if (src.split(from).length !== 2) return null; return MUT.load('src/pairing-token.js', src.replace(from, to), 'census-plant'); };
export const plantedHandedText = (MUT, text) => MUT.load('src/pairing-token.js', text.replace('const ', 'let '), 'census-plant-handed');
