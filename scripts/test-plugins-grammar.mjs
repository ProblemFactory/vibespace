#!/usr/bin/env node
// test-plugins-grammar — lane plugin-settings-p0 (the VS Code plugin model, docs/design-plugin-settings.zh.md): the
// Plugins sidebar is a plain LIST and a plugin's configuration lives in All Settings. ① a census over
// `ls src/plugins/*.js`: every plugin has a settings table (src/plugin-settings.js) or says why not (`noSettings`),
// every table names a real plugin, helper files are not plugins ② the sidebar: a row = dot · name + description ·
// chip · ONE switch · [install] · ⚙ and the list draws no other control — no key box, no feature checkbox, no budget
// (RED CONTROL = the base's card: its Turn on button, key box and 3 checkboxes) ③ no engine / route reads a
// plugin's configuration out of plugins.json `config` (only frp's relay token, a secret, lives there) ④ lane
// llm-plugin-rename (the Decision API plugin is the LLM plugin): a census over src/ + scripts/ + data/bin + the agent docs
// + public/ — the old name is in no file but the migration, the registry's declared legacy env spellings and the legs that
// prove them (each row says why); the design docs keep their FILE names (history) — RED: a planted user-visible string.
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
// lane decision-spend-readout: the ONE extra line a row may carry is a READOUT under the description (the LLM plugin's
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
const READERS = ['src/server/decision-engine.js', 'src/server/voice-teach-engine.js', 'src/routes/voice.js', 'src/plugins/llm.js', 'src/plugins/voice-input.js', 'src/plugins/tailscale.js', 'src/plugins/frp.js'];
const BASE_PATH = { 'src/plugins/llm.js': 'src/plugins/decision-api.js' };   // the base (7b6fa3c7b) knew the LLM plugin by its old file name
const code = (src) => src.split('\n').map((l) => l.replace(/\s\/\/ .*$/, '')).filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n'); // comments may say "never rec.config"
const configReads = (src) => (code(src).match(/(peek\(\)|rec)\.config\b|\.config \|\| \{\}|\(\(plugin\.peek\(\) \|\| \{\}\)\.config\)/g) || []).length;
const hits = READERS.map((f) => [f, configReads(read(f))]).filter(([f, n]) => n && f !== 'src/plugins/frp.js');
ok(!hits.length, `③ no config reads in ${READERS.length - 1} engines / plugins / routes${hits.length ? ' — ' + JSON.stringify(hits) : ''}`);
const frp = read('src/plugins/frp.js');
ok(/token: c\.token \|\| FRPS_TOKEN/.test(frp) && /serverAddr: v\.serverAddr \|\| FRPS_ADDR/.test(frp) && /subDomainHost: v\.subDomainHost/.test(frp), '③ frp reads only its relay TOKEN (a secret) from its record; the address / port / subdomain host are settings rows');
const baseSrcs = READERS.map((f) => base(BASE_PATH[f] || f));
const baseHits = baseSrcs.includes(null) ? null : baseSrcs.map(configReads).reduce((a, x) => a + x, 0);
if (baseHits === null) skip('③ RED CONTROL (the base config reads)'); else ok(baseHits >= 4, `③ RED CONTROL: the base reads plugin configuration from plugins.json ${baseHits} times`);

console.log('④ the old plugin name is gone from every file an owner or an agent reads (lane llm-plugin-rename)');
// the needles: the id, the English name, the zh / ja names, the old env prefix; the design docs keep their FILE names
const OLD_NAME = /decision-api|Decision API|决策 ?API|判定 ?API|DECISION_API/;
const DOC_NAME = /design-decision-api(\.zh)?\.md/g;
// the files where the old name is RIGHT — each with why (a row that holds no hit any more is RED: it would hide a new one)
const ALLOWED = {
  'src/server/migrations.js': 'the 2026-10-llm-rename migration moves the stores off the old id (a shipped migration\'s note is never edited)',
  'src/integration-registry.js': 'the LLM row\'s declared legacy spellings (clusterEnv.legacy) — the fleet\'s presets still carry them',
  'scripts/test-migrations.mjs': 'the stores of a pre-rename instance the migration moves (fixtures)',
  'scripts/test-cluster-presets.mjs': 'the legacy env leg (the old prefix alone resolves; both set ⇒ the new one wins)',
  'scripts/test-plugin-settings.mjs': 'its RED control reads the base\'s plugin file at its old path (git show 7b6fa3c7b)',
  'scripts/test-plugins-grammar.mjs': 'this census\'s own needles + the base file\'s old path',
  'scripts/test-settings-view.mjs': 'its §9b word needle + the base\'s row words as that needle\'s RED control',
};
const nameCensus = (files, readOf) => {
  const hits = {};
  for (const f of files) {
    let t; try { t = readOf(f); } catch { continue; }
    const n = t.replace(DOC_NAME, '').split('\n').filter((l) => OLD_NAME.test(l)).length;
    if (n) hits[f] = n;
  }
  return { hits, offenders: Object.keys(hits).filter((f) => !Object.hasOwn(ALLOWED, f)) };
};
let tracked = null;
try { tracked = execFileSync('git', ['-C', repo, 'ls-files', '--', 'src', 'scripts', 'data/bin', 'docs/agent', 'public'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter((f) => f && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|wasm)$/i.test(f)); } catch { tracked = null; }
if (!tracked || !tracked.length) console.log('  SKIP ④ — no git file list here (the census reads the tracked files)');
else {
  const nc = nameCensus(tracked, read);
  ok(tracked.length > 400 && !nc.offenders.length, `④ ${tracked.length} files: the old name only in the ${Object.keys(nc.hits).length} allowed (${Object.entries(nc.hits).map(([f, n]) => f + ' ' + n).join(', ')})${nc.offenders.length ? ' — RED: ' + nc.offenders.map((f) => f + ' ' + nc.hits[f]).join(', ') : ''}`);
  const dead = Object.keys(ALLOWED).filter((f) => !nc.hits[f]);
  ok(!dead.length, `④ every allowed row still holds the old name (a dead row would hide a new hit)${dead.length ? ' — dead: ' + dead.join(', ') : ''}`);
  // RED CONTROLS — a planted user-visible string in three shapes, through the SAME census
  const plant = (f, from, to) => nameCensus([f], (x) => { const t = read(x); if (!t.includes(from)) throw new Error('anchor'); return t.replace(from, to); }).offenders.includes(f);
  ok(plant('src/plugins/llm.js', "label: 'LLM',", "label: 'Decision API',"), '④ RED CONTROL: the plugin\'s label planted back as "Decision API" is caught');
  ok(plant('src/lib/i18n-zh.js', '"Judging model": "判断模型",', '"Judging model": "决策 API 判断模型",'), '④ RED CONTROL: a zh word planted back as 「决策 API」 is caught');
  ok(plant('src/lib/settings-ui.js', "pluginCategoryOf('llm')", "pluginCategoryOf('decision-api')"), '④ RED CONTROL: the old id planted back into a client door is caught');
  ok(!OLD_NAME.test('see docs/design-decision-api.zh.md §2.2'.replace(DOC_NAME, '')), '④ the design doc\'s FILE name is not a hit (its head note says the plugin is the LLM plugin now)');
  const was = base(BASE_PATH['src/plugins/llm.js']);
  if (was === null) skip('④ RED CONTROL (the base plugin file)'); else ok(OLD_NAME.test(was), '④ RED CONTROL: the base\'s plugin file (7b6fa3c7b) names the old plugin — the needle reads it');
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
