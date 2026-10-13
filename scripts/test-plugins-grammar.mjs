#!/usr/bin/env node
// test-plugins-grammar — lane plugin-settings-p0 (the VS Code plugin model, docs/design-plugin-settings.zh.md): the
// Plugins sidebar is a plain LIST and a plugin's configuration lives in All Settings. ① a census over
// `ls src/plugins/*.js`: every plugin has a settings table (src/plugin-settings.js) or says why not (`noSettings`),
// every table names a real plugin, helper files are not plugins ② the sidebar: a row = dot · name + description ·
// chip · ONE switch · [install] · ⚙ and the list draws no other control — no key box, no feature checkbox, no budget
// (RED CONTROL = the base's card: its Turn on button, key box and 3 checkboxes) ③ no engine / route reads a
// plugin's configuration out of plugins.json `config` (only frp's relay token, a secret, lives there).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const PS = require(path.join(repo, 'src/plugin-settings.js'));
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
// the base object (7b6fa3c7b) may be absent (a shallow clone): the RED controls then say SKIP by name
const base = (rel) => { try { return execFileSync('git', ['-C', repo, 'show', `7b6fa3c7b:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const skip = (m) => console.log(`  SKIP ${m} — the base object 7b6fa3c7b is not in this clone`);

console.log('① every plugin file has a settings table or a reason');
const files = fs.readdirSync(path.join(repo, 'src/plugins')).filter((f) => f.endsWith('.js')).sort();
const plugins = [], helpers = [];
for (const f of files) {
  const m = require(path.join(repo, 'src/plugins', f));
  if (m && typeof m === 'object' && !Array.isArray(m) && typeof m.id === 'string') plugins.push(m); else helpers.push(f);
}
ok(JSON.stringify(helpers) === JSON.stringify(['index.js', 'proc.js']), `① helper files (no plugin id): ${helpers.join(', ')}`);
const listed = require(path.join(repo, 'src/plugins/index.js')).map((p) => p.id).sort();
ok(JSON.stringify(plugins.map((p) => p.id).sort()) === JSON.stringify(listed), `① every plugin file is on the one list (${listed.join(', ')})`);
for (const p of plugins) {
  const tbl = PS.PLUGIN_SETTINGS[p.id];
  ok(!!tbl !== (typeof p.noSettings === 'string' && p.noSettings.length > 10), `① ${p.id}: ${tbl ? `a table of ${tbl.rows.length} rows` : `no table — «${p.noSettings}»`}`);
}
ok(Object.keys(PS.PLUGIN_SETTINGS).every((id) => plugins.some((p) => p.id === id)), '① every table names a real plugin');

console.log('② the sidebar is a list: name · description · chip · switch · [install] · ⚙ — nothing else');
// the list's controls, counted in the source of the Plugins panel (src/lib/plugins-ui.js minus the dialogs it opens:
// consent, install, the harness service offer — those are not the list)
const listSrc = (src) => { const a = src.indexOf('async openPluginsDialog('); const b = src.indexOf('async _pluginConsentDialog('); return src.slice(0, b > 0 ? b : undefined).slice(a > 0 ? a : 0); };
const helpersSrc = (src) => src.slice(0, src.indexOf('export function installPluginsUI'));
const controls = (src) => ({
  inputs: (src.match(/createElement\('(input|select|textarea)'\)/g) || []).length,
  password: (src.match(/type = 'password'|type: 'password'/g) || []).length,
  checkbox: (src.match(/'checkbox'/g) || []).length,
  budget: (src.match(/Budget|budget/g) || []).length,
  integrationCard: (src.match(/mountIntegrationCard|renderDictationCard/g) || []).length,
});
const now = read('src/lib/plugins-ui.js');
const c = controls(helpersSrc(now) + listSrc(now));
ok(c.inputs === 1 && c.checkbox === 1 && !c.password && !c.integrationCard, `② ONE input in the list's code — the switch's checkbox (role=switch): ${JSON.stringify(c)}`);
ok(/cb\.setAttribute\('role', 'switch'\)/.test(now), '② the toggle is a role=switch');
const rowFn = now.slice(now.indexOf('function pluginRow('), now.indexOf('\n}\n', now.indexOf('function pluginRow(')));
ok(/row\.append\(dot, main, c, sw\);\s*\n\s*if \(install\) row\.appendChild\(install\);\s*\n\s*row\.appendChild\(gear\);/.test(rowFn), '② a row appends exactly dot · name+description · chip · switch · [install] · ⚙');
ok((listSrc(now).match(/pluginRow\(\{/g) || []).length === 2, '② built-in AND manifest plugins draw through the same row');
// lane decision-spend-readout: the ONE extra line a row may carry is a READOUT under the description (the Decision API's
// money today) — a div inside the name+description block, painted from the PURE line, never a control
const factIsReadout = (src, fn) => /if \(fact\) main\.appendChild\(fact\);/.test(fn)
  && (src.match(/\bfact = Object\.assign\(document\.createElement\('(\w+)'\)/g) || []).every((m) => /'div'/.test(m))
  && /\bfact = Object\.assign\(document\.createElement\('div'\), \{ className: 'plugin-row-fact' \}\)/.test(src)
  && !/\bfact\.(onclick|addEventListener|tabIndex|contentEditable)\b/.test(src) && /paintDecisionLine\(fact, x, 'short'\)/.test(src);
ok(factIsReadout(listSrc(now), rowFn), '② the row\'s second line (plugin-row-fact) is a readout in the name+description block: a div, painted from decisionTodayLine, no handler');
const asButton = listSrc(now).replace("fact = Object.assign(document.createElement('div'), { className: 'plugin-row-fact' });", () => "fact = Object.assign(document.createElement('button'), { className: 'plugin-row-fact' }); fact.onclick = () => {};");
ok(asButton !== listSrc(now) && !factIsReadout(asButton, rowFn), '② RED CONTROL: the same line drawn as a button with a handler is refused by the census');
const b = base('src/lib/plugins-ui.js');
const cb = b === null ? null : controls(helpersSrc(b) + listSrc(b));
if (!cb) skip('② RED CONTROL (the base card)'); else ok(cb.inputs > 1 && cb.checkbox >= 3 && cb.integrationCard > 0, `② RED CONTROL: the base's panel (7b6fa3c7b) draws ${cb.inputs} inputs, ${cb.checkbox} checkboxes, a key box (${cb.integrationCard} card mounts) — this census refuses it`);
const voiceCard = read('src/lib/voice-plugin-card.js');
ok(!/createElement\('(input|select)'\)/.test(voiceCard) && /renderVoiceSheet/.test(voiceCard), '② the Voice sheet holds actions only (Connect + proposal cards) — no key box, no language select');

console.log('③ nobody reads a plugin\'s configuration from plugins.json config');
const READERS = ['src/server/decision-engine.js', 'src/server/voice-teach-engine.js', 'src/routes/voice.js', 'src/plugins/decision-api.js', 'src/plugins/voice-input.js', 'src/plugins/tailscale.js', 'src/plugins/frp.js'];
const code = (src) => src.split('\n').map((l) => l.replace(/\s\/\/ .*$/, '')).filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n'); // comments may say "never rec.config"
const configReads = (src) => (code(src).match(/(peek\(\)|rec)\.config\b|\.config \|\| \{\}|\(\(plugin\.peek\(\) \|\| \{\}\)\.config\)/g) || []).length;
const hits = READERS.map((f) => [f, configReads(read(f))]).filter(([f, n]) => n && f !== 'src/plugins/frp.js');
ok(!hits.length, `③ no config reads in ${READERS.length - 1} engines / plugins / routes${hits.length ? ' — ' + JSON.stringify(hits) : ''}`);
const frp = read('src/plugins/frp.js');
ok(/token: c\.token \|\| FRPS_TOKEN/.test(frp) && /serverAddr: v\.serverAddr \|\| FRPS_ADDR/.test(frp) && /subDomainHost: v\.subDomainHost/.test(frp), '③ frp reads only its relay TOKEN (a secret) from its record; the address / port / subdomain host are settings rows');
const baseSrcs = READERS.map((f) => base(f));
const baseHits = baseSrcs.includes(null) ? null : baseSrcs.map(configReads).reduce((a, x) => a + x, 0);
if (baseHits === null) skip('③ RED CONTROL (the base config reads)'); else ok(baseHits >= 4, `③ RED CONTROL: the base reads plugin configuration from plugins.json ${baseHits} times`);

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
