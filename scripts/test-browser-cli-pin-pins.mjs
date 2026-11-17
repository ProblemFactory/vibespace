#!/usr/bin/env node
// THE BROWSER CLI PIN's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy
// scripts/test-browser-cli-pin.mjs (its keeper / installer legs and every mutant CONTROL stay there): browser-env's floor probe asks
// the pin reader (src/server/browser-env.js), the panel's offer label and its Maintenance row (src/lib/browser-trace-view.js), the
// browser.cli setting (src/lib/settings-schema.js) and the route's cli body (src/routes/browser.js). Each reads the file BY NAME,
// so ci.mjs's affected rule selects this suite on a change of one of them.
// Run: node scripts/test-browser-cli-pin-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };

console.log('— the CLI pin, its panel row, its setting and its route (source pins)');
{
  const be = read('src/server/browser-env.js');
  ok(/createBrowserFacts\(\{ pinned: require\('\.\.\/browser-facts\.js'\)\.cliPinReader\(dataDir\) \}\)/.test(be), 'browser-env\'s floor probe asks the pinned CLI (the keeper\'s pin file — two modules, one file)');
  ok(/cliOfferLabel\(w\.offer, t, \{ version: w\.version, table: st\.cli && st\.cli\.table \}\)/.test(read('src/lib/browser-trace-view.js')), 'the panel labels the button with the version the install installs');
  const tv = read('src/lib/browser-trace-view.js');
  ok(/root\.append\(bar, body\)/.test(tv) && /mt\.append\(cliRow, swl, hint\)/.test(tv) /* design 015: the Maintenance section */ && /fetchJson\('\/api\/browser\/cli'\)/.test(tv) && /fetchJson\('\/api\/browser\/cli\/install', jsonInit\('POST', \{ version \}\)\)/.test(tv) && /showConfirmDialog\(\{ \.\.\.cliConfirmWords\(f, t, \{ version \}\) \}\)/.test(tv) && /app\.settings\?\.set\?\.\('browser\.cli', 'path'\)/.test(tv),
    'the Agent browser panel: the Browser CLI row (its own fetch), the install behind the download confirm, the setting written by the row\'s act');
  ok(/'browser\.cli': \{\s*type: 'string', default: 'path',/.test(read('src/lib/settings-schema.js')) && /serverSetting\('browser\.cli'\)/.test(read('src/server/browser-keeper.js')), 'the setting is declared (Agent browser) and read by the keeper');
  const rs = read('src/routes/browser.js');
  ok(/const cli = b\.cli && typeof b\.cli === 'object' && b\.cli\.version \? \{ version: String\(b\.cli\.version\)/.test(rs) && (rs.match(/\{ const g = await cliGoneVerdict\(k, (e|r)\.browser\); if \(g\) return failVerdict\(res, g\); \}/g) || []).length === 4, 'the agent\'s answers carry the CLI by VERSION only (never the program\'s path) and all four /resolve forms (lane jobs-browser\'s job form joined at the 2.369.202 integration) refuse a gone CLI before the agent runs anything (verify r3: the keeper\'s doors\' fact, awaited)');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
