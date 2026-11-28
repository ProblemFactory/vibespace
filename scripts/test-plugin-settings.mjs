#!/usr/bin/env node
// test-plugin-settings — lane plugin-settings-p0 (docs/design-plugin-settings.zh.md, the VS Code plugin model): a
// plugin's configuration is ONE PURE table (src/plugin-settings.js) derived into All Settings; values live only in
// data/settings.json. ① the ONE validator's truth table (a secret-shaped row and `enabled` are refused) ② the derived
// schema rows equal the tables field by field (legacy `path` keys keep their spelling, land in the Plugins group) +
// manifest rows through the same validator ③ the one-time migration (config present/absent × settings present/absent)
// ④ the engines read the settings rows — a plugins.json `config` plant is NOT seen (RED on the base's plugin file)
// ⑤ writes go through the one writer (a foreign key refused, a default dropped) ⑥ a plugin-config row re-applies.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const PS = require(path.join(repo, 'src/plugin-settings.js'));
const S = await import(path.join(repo, 'src/lib/settings-schema.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plugin-settings-'));

console.log('① the ONE validator (checkPluginRows) — built-in tables and manifest rows');
for (const [id, tbl] of Object.entries(PS.PLUGIN_SETTINGS)) ok(PS.checkPluginRows(tbl.rows, { builtin: true }).length === 0, `① the built-in ${id} table is valid (${tbl.rows.length} rows)`);
const row = (x) => ({ key: 'k', type: 'boolean', default: false, label: 'L', ...x });
const TRUTH = [
  ['a plain boolean row', row({}), true],
  ['secret: true', row({ secret: true }), false],
  ['a secret-shaped key (apiKey)', row({ key: 'apiKey', type: 'string', default: '' }), false],
  ['a secret-shaped key (token)', row({ key: 'token', type: 'string', default: '' }), false],
  ['`enabled` (the on-switch)', row({ key: 'enabled' }), false],
  ['an unknown type', row({ type: 'color' }), false],
  ['an unknown field', row({ hint: 'x' }), false],
  ['a number default outside min..max', row({ type: 'number', default: 5, min: 0, max: 1 }), false],
  ['an enum default not in its options', row({ type: 'enum', default: 'z', options: [{ value: 'a', label: 'A' }] }), false],
  ['a manifest row with a legacy path', row({ path: 'decision.threshold' }), false],
  ['a label missing', { key: 'k', type: 'boolean', default: false }, false],
];
for (const [n, r, want] of TRUTH) ok((PS.checkPluginRows([r]).length === 0) === want, `① ${n} → ${want ? 'accepted' : 'refused'}`);
ok(PS.checkPluginRows([row({ path: 'decision.threshold' })], { builtin: true }).length === 0, '① a BUILT-IN row may keep a legacy spelling through `path`');
ok(verdictOf(PS.checkPluginRows([row({}), row({})]).some((e) => /duplicate/.test(e))), '① a duplicate key is refused');

console.log('② the derivation — every table row is a schema row, field by field, in the Plugins group');
for (const [id, tbl] of Object.entries(PS.PLUGIN_SETTINGS)) {
  const cat = `Plugin: ${tbl.label}`;
  ok(S.pluginCategoryOf(id) === cat && S.settingsGroupOf(cat) === 'plugins' && verdictOf(S.SETTINGS_CATEGORIES.includes(cat)), `② ${id} → the category "${cat}" in the Plugins group`);
  const bad = [];
  for (const r of tbl.rows) {
    const e = S.SETTINGS_SCHEMA[PS.rowPath(id, r)];
    if (!e) { bad.push(r.key + ' missing'); continue; }
    for (const f of ['type', 'default', 'multiline', 'maxLength', 'draft', 'tier']) if (JSON.stringify(e[f]) !== JSON.stringify(r[f])) bad.push(`${r.key}.${f}`);
    if (r.type === 'number') for (const f of ['min', 'max', 'step']) if (e[f] !== r[f]) bad.push(`${r.key}.${f}`);
    if (JSON.stringify((e.options || []).map((o) => o.value)) !== JSON.stringify((r.options || []).map((o) => o.value))) bad.push(r.key + '.options');
    if (e.category !== cat || e.plugin !== id || e.pluginApply !== r.apply || e.liveApply !== true) bad.push(r.key + '.owner');
  }
  ok(!bad.length, `② ${id}: ${tbl.rows.length} derived rows equal the table${bad.length ? ' — ' + bad.join(', ') : ''}`);
}
ok(S.SETTINGS_SCHEMA['decision.threshold']?.category === 'Plugin: LLM' && S.SETTINGS_SCHEMA['decision.attentionBlock']?.category === 'Plugin: LLM' && !S.SETTINGS_SCHEMA['plugin.llm.threshold'], '② the legacy keys decision.threshold / decision.attentionBlock keep their spelling, now under Plugin: LLM (one truth — no second threshold)');
ok(!Object.keys(S.SETTINGS_SCHEMA).some((k) => Object.keys(PS.PLUGIN_SETTINGS).some((id) => k === `plugin.${id}.enabled`)), '② `enabled` is never a settings row');
const links = S.pluginSectionFor('Plugin: LLM');
ok(gateOf(links) && gateOf(links.links.some((l) => l.to.kind === 'integration' && l.to.id === 'llm')) && verdictOf(links.links.some((l) => l.to.kind === 'plugins-panel')), '② the LLM plugin section links the key (Services › Integrations) and the on-switch (the Plugins list)');
ok(gateOf(S.pluginSectionFor('Plugin: Public URLs (frp)').links.some((l) => l.to.kind === 'plugin-secret' && l.to.key === 'token')) && !S.SETTINGS_SCHEMA['plugin.frp.token'], '② the frp relay token is a plugin-held secret link, never a settings row');
const mp = S.registerPluginSettings('hello-zz', 'Hello', [{ key: 'greeting', type: 'string', default: 'hi' }, { key: 'apiKey', type: 'string' }, { key: 'mode', type: 'select', options: ['a', 'b'], default: 'b' }]);
ok(JSON.stringify(mp) === JSON.stringify(['plugin.hello-zz.greeting', 'plugin.hello-zz.mode']) && S.SETTINGS_SCHEMA['plugin.hello-zz.mode'].type === 'enum' && S.settingsGroupOf('Plugin: Hello') === 'plugins', '② a manifest\'s contributes.settings[] goes through the same validator (the secret-shaped apiKey dropped) and derivation');
S.unregisterPluginSettings('hello-zz');
let threw = false; try { S.registerPluginSettings('frp', 'x', []); } catch { threw = true; }
ok(gateOf(threw) && S.unregisterPluginSettings('frp') === false && verdictOf(S.SETTINGS_SCHEMA['plugin.frp.serverAddr']), '② a manifest cannot take over or remove a built-in table');

console.log('③ the one-time move (migration 2026-10-plugin-config-to-settings)');
const cases = [
  ['config present, settings absent', { llm: { enabled: true, config: { attention: true, dailyBudgetCents: 250, threshold: 0.8 } } }, {}, { 'plugin.llm.attention': true, 'plugin.llm.dailyBudgetUsd': 2.5 }, { llm: ['config.attention', 'config.dailyBudgetCents', 'config.threshold'] }],
  ['config present, settings present (settings wins)', { 'voice-input': { config: { language: 'zh', teach: true } } }, { 'plugin.voice-input.language': 'en' }, { 'plugin.voice-input.teach': true }, { 'voice-input': ['config.language', 'config.teach'] }],
  ['config absent, settings present', { tailscale: { enabled: true } }, { 'plugin.tailscale.upFlags': '--ssh' }, {}, {}],
  ['config absent, settings absent', {}, {}, {}, {}],
  ['a default is never written', { llm: { config: { dailyBudgetCents: 100 } } }, {}, {}, { llm: ['config.dailyBudgetCents'] }],
  ['the 4th feature flag (inbox, lane inbox-decision-group) moves like the other three', { llm: { enabled: true, config: { inbox: true, routing: false } } }, {}, { 'plugin.llm.inbox': true }, { llm: ['config.routing', 'config.inbox'] }],
  ['top-level legacy field (tailscale upFlags)', { tailscale: { upFlags: '--ssh' } }, {}, { 'plugin.tailscale.upFlags': '--ssh' }, { tailscale: ['upFlags'] }],
];
for (const [n, plugins, settings, wantPatch, wantStrip] of cases) {
  const r = PS.migrationPlan({ plugins }, settings);
  ok(JSON.stringify(r.patch) === JSON.stringify(wantPatch) && JSON.stringify(r.strip) === JSON.stringify(wantStrip), `③ ${n} → patch ${JSON.stringify(r.patch)} strip ${JSON.stringify(r.strip)}`);
}
const { PluginManager } = require(path.join(repo, 'src/plugins.js'));
const store = (init = {}) => { let s = { ...init }; return { read: () => s, patch: (p) => { s = { ...s, ...p }; for (const [k, v] of Object.entries(s)) if (v === null) delete s[k]; }, get: () => s }; };
const mkData = (state) => { const d = fs.mkdtempSync(path.join(tmp, 'd-')); fs.writeFileSync(path.join(d, 'plugins.json'), JSON.stringify({ plugins: state })); return d; };
const decisionApi = require(path.join(repo, 'src/plugins/llm.js'));
{
  const st = store(); const dir = mkData({ llm: { enabled: true, config: { routing: true, dailyBudgetCents: 300 } } });
  const pm = new PluginManager({ dataDir: dir, plugins: [decisionApi], settings: st });
  const rep = pm.migrateConfigToSettings();
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'plugins.json'), 'utf8'));
  ok(st.get()['plugin.llm.routing'] === true && st.get()['plugin.llm.dailyBudgetUsd'] === 3 && JSON.stringify(after.plugins.llm) === '{"enabled":true}', `③ through the live manager: values moved, plugins.json keeps only enabled (${JSON.stringify(after.plugins.llm)})`);
  const again = pm.migrateConfigToSettings();
  ok(!again.moved.length && !Object.keys(again.stripped).length && rep.moved.length === 2, '③ a second run moves nothing');
}

console.log('④ the engines read the settings rows — a plugins.json config plant is not seen');
const plantRec = { enabled: true, config: { attention: true, rules: true, dailyBudgetCents: 900 } };
const plant = { llm: plantRec };
const decisionOf = (plugin, settings) => {   // the plant sits under the plugin's OWN id (the re-planted copy keeps today's, llm)
  const pm = new PluginManager({ dataDir: mkData({ [plugin.id]: plantRec }), plugins: [plugin], settings: store(settings) });
  return pm._verbs.get(plugin.id).status().decision;
};
let d = decisionOf(decisionApi, {});
ok(d.attention === false && d.rules === false && d.dailyBudgetCents === 100, `④ plant in plugins.json config, nothing in settings → the plugin reads defaults (attention ${d.attention}, budget ${d.dailyBudgetCents}¢)`);
d = decisionOf(decisionApi, { 'plugin.llm.attention': true, 'plugin.llm.dailyBudgetUsd': 0.5, 'decision.threshold': 0.85 });
ok(d.attention === true && d.dailyBudgetCents === 50 && d.threshold === 0.85, '④ the settings rows drive it (attention on, $0.50 → 50¢, decision.threshold 0.85 — the one threshold)');
// B-43a0 (lane bl-tests-e): the control read 7b6fa3c7b's src/plugins/decision-api.js — a lane commit master never held — so it ran
// only at the push gate and SKIPPED everywhere else. The base's SECOND truth is ONE line of that file (its cfg read
// `...(h.peek().config || {})`, data/plugins.json), frozen in scripts/fixtures/off-master/7b6fa3c7b-plugins.json; re-planted into
// TODAY's plugin (a scratch copy, never beside the live plugins — a census reads that folder) it sees the plugins.json plant again.
const FX43 = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/off-master/7b6fa3c7b-plugins.json'), 'utf8'));
const SECOND_TRUTH = (FX43.pluginCfg.match(/\.\.\.\(h\.peek\(\)\.config \|\| \{\}\)/) || [])[0] || null;   // read OFF the frozen line, never typed here
const baseFile = path.join(tmp, 'base-plugin.js'); // the re-planted copy in the scratch dir
try {
  const live = fs.readFileSync(path.join(repo, 'src/plugins/llm.js'), 'utf8');
  const A_CFG = '      const v = h.settings();', A_REQ = "require('../decision-model.js')";   // the control's anchors — each fails BY NAME when gone (rule 06:25Z)
  for (const a of [A_CFG, A_REQ]) ok(verdictOf(live.includes(a)), `④ the anchor of the RED CONTROL is in the source (src/plugins/llm.js): ${a.trim()}`);
  const planted = editAnchor(editAnchor(live, A_CFG, `      const v = { ...h.settings(), ${SECOND_TRUTH} }; // the base's second truth (7b6fa3c7b, frozen)`, "src/plugins/llm.js"),
    A_REQ, `require(${JSON.stringify(path.join(repo, 'src/decision-model.js'))})`, "src/plugins/llm.js");
  ok(!!SECOND_TRUTH && planted !== live, `④ the base's cfg line (frozen) carries its second truth ${SECOND_TRUTH} — the expression re-planted below is that line's own`);
  fs.writeFileSync(baseFile, planted);
  const bd = decisionOf(require(baseFile), {});
  ok(bd.attention === true, `④ RED CONTROL: today's plugin with the base's second truth re-planted (7b6fa3c7b) sees the plugins.json plant (attention ${bd.attention}) — the two-truths bug this lane closes`);
} catch (e) { ok(false, '④ RED CONTROL could not run: ' + e.message); } finally { try { fs.unlinkSync(baseFile); } catch { } }
const engine = require(path.join(repo, 'src/server/decision-engine.js')).create({ dataDir: fs.mkdtempSync(path.join(tmp, 'e-')), integrations: null });
const pmE = new PluginManager({ dataDir: mkData(plant), plugins: [decisionApi], settings: store({ 'plugin.llm.rules': true }), decisionEngine: engine });
const es = engine.status();
ok(gateOf(es) && gateOf(pmE) && (es.features ? es.features.rules === true && es.features.attention === false : true), `④ the decision engine reads the rows through the plugin (features ${JSON.stringify(es && es.features)})`);
const voiceInput = require(path.join(repo, 'src/plugins/voice-input.js'));
let bound = null;
const pmV = new PluginManager({ dataDir: mkData({ 'voice-input': { enabled: true, config: { language: 'zh', teach: true } } }), plugins: [voiceInput], settings: store({ 'plugin.voice-input.language': 'en' }), voiceBind: (v) => { bound = v; }, integrations: () => null });
ok(pmV._verbs.get('voice-input').status().language === 'en' && bound.settings().teach === false, '④ voice input: the language and the teach switch come from the settings rows (the plugins.json plant zh / teach is ignored)');
const teach = require(path.join(repo, 'src/server/voice-teach-engine.js')).create({ client: { connected: () => true }, plugin: { peek: () => ({ config: { teach: true } }), update: () => { }, settings: () => ({}), writeSettings: () => { } } });
let code = null; try { await teach.propose?.({ conv: 'x', text: 'LarkClient' }); } catch (e) { code = e.code || e.status || e.message; }
ok(teach.view().settings.teach === false, `④ the teach engine reads settings (a rec.config teach:true plant leaves it off${code ? ' — ' + code : ''})`);

console.log('⑤ writes go through the one settings writer');
{
  const st = store(); const pm = new PluginManager({ dataDir: mkData({}), plugins: [voiceInput], settings: st, integrations: () => null });
  const h = { w: (p) => pm._writeSettings('voice-input', p) };
  h.w({ language: 'zh' });
  ok(st.get()['plugin.voice-input.language'] === 'zh', '⑤ h.writeSettings lands the row in settings.json');
  h.w({ language: 'auto' });
  ok(!('plugin.voice-input.language' in st.get()), '⑤ writing the default drops the key (sparse store)');
  let refused = false; try { h.w({ apiKey: 'dl_x' }); } catch { refused = true; }
  ok(verdictOf(refused), '⑤ a key outside the plugin\'s table is refused by name');
}

console.log('⑥ a plugin-config row re-applies; a server row does not');
{
  let applied = 0;
  const fake = { id: 'frp', label: 'F', description: '', provides: [], create: () => ({ install() { }, start() { }, stop() { }, status() { return {}; }, applySettings() { applied++; } }) };
  const pm = new PluginManager({ dataDir: mkData({}), plugins: [fake], settings: store() });
  pm.onSettingsWrite({ 'plugin.frp.serverAddr': 'relay.example' }, {});
  pm.onSettingsWrite({ 'plugin.frp.serverAddr': 'relay.example', 'decision.threshold': 0.8 }, { 'plugin.frp.serverAddr': 'relay.example' });
  ok(applied === 1, `⑥ frp's applySettings ran once (relay address moved), not for an unrelated row (${applied})`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
