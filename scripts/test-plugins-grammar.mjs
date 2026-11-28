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
// ⑥ lane plugin-consent-layout: both consent bodies open with `.dialog-intro` and the list of powers has its own rule (RED: the
// base 160045063's files).
// ⑦ lane plugin-update-button: the REAL plugins-ui.js in a fake DOM — a plugin that can update has «Update…» (B-db5d: a row of
// the row's «⋯» menu with Uninstall…, never inline), an uploaded / hand-placed one says how instead, the press posts /update and
// says «already up to date»; the chip's menu has no Update (RED: the base 63f59d572's file; anchored copies of the checkpoint's row).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const PS = require(path.join(repo, 'src/plugin-settings.js'));
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
// THE BASE (7b6fa3c7b, the LLM plugin's base — a lane commit master never held): B-43a0 (lane bl-tests-e) — the RED controls
// below ran only where that branch was fetched (the push gate) and SKIPPED everywhere else. The few lines each control counts are
// FROZEN once (scripts/fixtures/off-master/7b6fa3c7b-plugins.json) and read on every checkout, the runner's depth-1 clone too.
const FX43 = JSON.parse(read('scripts/fixtures/off-master/7b6fa3c7b-plugins.json'));

console.log('① every plugin file has a settings table or a reason');
const files = fs.readdirSync(path.join(repo, 'src/plugins')).filter((f) => f.endsWith('.js')).sort();
const plugins = [], helpers = [];
for (const f of files) {
  const m = require(path.join(repo, 'src/plugins', f));
  if (m && typeof m === 'object' && !Array.isArray(m) && typeof m.id === 'string') plugins.push(m); else helpers.push(f);
}
ok(JSON.stringify(helpers) === JSON.stringify(['index.js', 'proc.js', 'which-kept.js']), `① helper files (no plugin id): ${helpers.join(', ')}`); // which-kept.js: where a command lives, KEPT (lane hub-sync-holds, rank 13)
const listed = require(path.join(repo, 'src/plugins/index.js')).map((p) => p.id).sort();
ok(JSON.stringify(plugins.map((p) => p.id).sort()) === JSON.stringify(listed), `① every plugin file is on the one list (${listed.join(', ')})`);
for (const p of plugins) {
  const tbl = PS.PLUGIN_SETTINGS[p.id];
  ok(!!tbl !== (typeof p.noSettings === 'string' && p.noSettings.length > 10), `① ${p.id}: ${tbl ? `a table of ${tbl.rows.length} rows` : `no table — «${p.noSettings}»`}`);
}
ok(verdictOf(Object.keys(PS.PLUGIN_SETTINGS).every((id) => plugins.some((p) => p.id === id))), '① every table names a real plugin');

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
ok(verdictOf(/cb\.setAttribute\('role', 'switch'\)/.test(now)), '② the toggle is a role=switch');
const rowFn = now.slice(now.indexOf('function pluginRow('), now.indexOf('\n}\n', now.indexOf('function pluginRow(')));
// lane ui-phone-and-fit pick 1: the row is the RAIL ROW (src/lib/rail-row.js) — railRow draws lead · the name block · the controls in
// the order given (a fourth control folds into «⋯», its order kept); the law read through it: dot · name+description · chip · switch · [install] · ⚙
const RAIL = read('src/lib/rail-row.js');
ok(gateOf(/railRow\(\{ className: 'plugin-row', lead: dot, name: label,[^}]*desc: description \|\| '',[^}]*main: \[fact\], controls: \[c, sw, install, gear\] \}\)/.test(rowFn))
  && gateOf(/r\.replaceChildren\(\.\.\.\[lead, m, ctl\]\.filter\(Boolean\)\);/.test(RAIL)) && verdictOf(/const list = \(controls \|\| \[\]\)\.filter\(Boolean\);/.test(RAIL)), '② a row appends exactly dot · name+description · chip · [switch — none when it cannot be used, lane ui-controls-and-bugs: railRow drops it] · [install] · ⚙');
ok((listSrc(now).match(/pluginRow\(\{/g) || []).length === 2, '② built-in AND manifest plugins draw through the same row');
// lane decision-spend-readout: the ONE extra line a row may carry is a READOUT under the description (the LLM plugin's
// money today) — a div inside the name+description block, painted from the PURE line, never a control
const factIsReadout = (src, fn) => /main: \[fact\]/.test(fn) && /for \(const x of \(main \|\| \[\]\)\) if \(x\) m\.appendChild\(x\);/.test(RAIL)
  && (src.match(/\bfact = Object\.assign\(document\.createElement\('(\w+)'\)/g) || []).every((m) => /'div'/.test(m))
  && /\bfact = Object\.assign\(document\.createElement\('div'\), \{ className: 'plugin-row-fact' \}\)/.test(src)
  && !/\bfact\.(onclick|addEventListener|tabIndex|contentEditable)\b/.test(src) && /paintDecisionLine\(fact, x, 'short'\)/.test(src);
ok(verdictOf(factIsReadout(listSrc(now), rowFn)), '② the row\'s second line (plugin-row-fact) is a readout in the name+description block: a div, painted from decisionTodayLine, no handler');
const asButton = listSrc(now).replace("fact = Object.assign(document.createElement('div'), { className: 'plugin-row-fact' });", () => "fact = Object.assign(document.createElement('button'), { className: 'plugin-row-fact' }); fact.onclick = () => {};");
ok(asButton !== listSrc(now) && !factIsReadout(asButton, rowFn), '② RED CONTROL: the same line drawn as a button with a handler is refused by the census');
const cb = controls(FX43.panelLines.join('\n'));
ok(FX43.panelLines.length > 5 && cb.inputs > 1 && cb.checkbox >= 3 && cb.integrationCard > 0, `② RED CONTROL: the base's panel (7b6fa3c7b, its control lines frozen) draws ${cb.inputs} inputs, ${cb.checkbox} checkboxes, a key box (${cb.integrationCard} card mounts) — this census refuses it`);
const voiceCard = read('src/lib/voice-plugin-card.js');
ok(!/createElement\('(input|select)'\)/.test(voiceCard) && verdictOf(/renderVoiceSheet/.test(voiceCard)), '② the Voice sheet holds actions only (Connect + proposal cards) — no key box, no language select');

console.log('③ nobody reads a plugin\'s configuration from plugins.json config');
const READERS = ['src/server/decision-engine.js', 'src/server/voice-teach-engine.js', 'src/routes/voice.js', 'src/plugins/llm.js', 'src/plugins/voice-input.js', 'src/plugins/tailscale.js', 'src/plugins/frp.js'];
const code = (src) => src.split('\n').map((l) => l.replace(/\s\/\/ .*$/, '')).filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n'); // comments may say "never rec.config"
const configReads = (src) => (code(src).match(/(peek\(\)|rec)\.config\b|\.config \|\| \{\}|\(\(plugin\.peek\(\) \|\| \{\}\)\.config\)/g) || []).length;
const hits = READERS.map((f) => [f, configReads(read(f))]).filter(([f, n]) => n && f !== 'src/plugins/frp.js');
ok(!hits.length, `③ no config reads in ${READERS.length - 1} engines / plugins / routes${hits.length ? ' — ' + JSON.stringify(hits) : ''}`);
const frp = read('src/plugins/frp.js');
ok(gateOf(/token: c\.token \|\| FRPS_TOKEN/.test(frp)) && gateOf(/serverAddr: v\.serverAddr \|\| FRPS_ADDR/.test(frp)) && verdictOf(/subDomainHost: v\.subDomainHost/.test(frp)), '③ frp reads only its relay TOKEN (a secret) from its record; the address / port / subdomain host are settings rows');
const baseHits = FX43.configReadLines.map((x) => configReads(x.line)).reduce((a, x) => a + x, 0);
ok(FX43.configReadLines.length > 3 && baseHits >= 4, `③ RED CONTROL: the base (7b6fa3c7b, its seven readers' config lines frozen) reads plugin configuration from plugins.json ${baseHits} times`);

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
  'scripts/test-plugin-settings.mjs': 'its RED control re-plants the base\'s second truth, frozen from the plugin\'s old file (7b6fa3c7b)',
  'scripts/test-plugins-grammar.mjs': 'this census\'s own needles',
  'scripts/fixtures/off-master/7b6fa3c7b-plugins.json': 'the base\'s frozen lines (B-43a0): its old id and label ARE what ④\'s RED control reads',
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
  ok(verdictOf(plant('src/plugins/llm.js', "label: 'LLM',", "label: 'Decision API',")), '④ RED CONTROL: the plugin\'s label planted back as "Decision API" is caught');
  ok(verdictOf(plant('src/lib/i18n-zh.js', '"Judging model": "判断模型",', '"Judging model": "决策 API 判断模型",')), '④ RED CONTROL: a zh word planted back as 「决策 API」 is caught');
  ok(verdictOf(plant('src/lib/settings-ui.js', "pluginCategoryOf('llm')", "pluginCategoryOf('decision-api')")), '④ RED CONTROL: the old id planted back into a client door is caught');
  ok(!OLD_NAME.test('see docs/design-decision-api.zh.md §2.2'.replace(DOC_NAME, '')), '④ the design doc\'s FILE name is not a hit (its head note says the plugin is the LLM plugin now)');
  ok(FX43.pluginNames.length === 2 && verdictOf(FX43.pluginNames.every((l) => OLD_NAME.test(l))), '④ RED CONTROL: the base\'s plugin file (7b6fa3c7b, its id and label frozen) names the old plugin — the needle reads it');
}

// ⑤ lane engine-plugin (design-custom-browser-plugin §1.1): the capability word `browser-engine` — the built-in family's half of
// the ONE engine table: a plugin that declares it must have the two verbs (refused by name at registration otherwise), the
// manager lists every one that declares it, and hands out only a verb CAP_VERBS names for a capability it declares
console.log('— ⑤ the capability word browser-engine (CAP_VERBS: probe + launchOptions)');
{
  const PL = require(path.join(repo, 'src/plugins.js'));
  ok(JSON.stringify(PL.CAP_VERBS['browser-engine']) === JSON.stringify(['probe', 'launchOptions']), '⑤ CAP_VERBS[\'browser-engine\'] = [probe, launchOptions] (the engine registry\'s two verbs)');
  const base0 = { install() {}, start() {}, stop() {}, status() { return {}; } };
  const def = (extra = {}) => ({ id: 'fake-engine', label: 'Fake engine', description: 'x', provides: ['browser-engine'], create: () => ({ ...base0, ...extra }) });
  let e1 = null; try { PL.validatePlugin(def(), { ...base0 }); } catch (e) { e1 = e; }
  let e2 = null; try { PL.validatePlugin(def(), { ...base0, probe() {}, launchOptions() {} }); } catch (e) { e2 = e; }
  ok(gateOf(e1) && gateOf(/verb probe\(\) missing/.test(e1.message)) && !e2, '⑤ a built-in plugin declaring browser-engine without probe() is refused BY NAME at registration; with both verbs it registers', e1 && e1.message);
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vs-pg-eng-'));
  try {
    const m = new PL.PluginManager({ dataDir: dir, broadcast: () => {}, plugins: [def({ probe: () => ({ ok: 1 }), launchOptions: () => ({}) }), { id: 'plain-one', label: 'Plain', description: 'x', provides: [], create: () => ({ ...base0 }) }] });
    let e3 = null; try { m.capVerb('plain-one', 'browser-engine', 'probe'); } catch (e) { e3 = e; }
    let e4 = null; try { m.capVerb('fake-engine', 'browser-engine', 'install'); } catch (e) { e4 = e; }
    ok(JSON.stringify(m.providerIds('browser-engine')) === '["fake-engine"]' && m.capVerb('fake-engine', 'browser-engine', 'probe')().ok === 1 && gateOf(e3) && verdictOf(e4), '⑤ providerIds lists every declarer; capVerb hands out only a CAP_VERBS verb of a declared capability (a plugin that does not declare it, or another verb, refused)', { e3: e3 && e3.message, e4: e4 && e4.message });
    const reg = require(path.join(repo, 'src/server/browser-engines.js')).create({ plugins: m });
    ok(JSON.stringify(reg.rows()) === JSON.stringify([{ id: 'builtin.fake-engine', label: 'Fake engine', family: 'builtin', version: null }]), '⑤ …and the engine table addresses a built-in engine `builtin.<id>` (the manifest id rule), beside the manifest family', reg.rows());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ⑥ lane plugin-consent-layout (the owner on the plugin consent dialog, 2026-11-01: «布局问题»): a dialog's explanation is that
// dialog's body text — both consent bodies (the plugin consent + Show capabilities…, the harness-service offer) open with
// `.dialog-intro`, never the Usage window's 10 px dim `.usage-note`; the list of powers has its own rule (padding-left ≤ 20 px,
// margin 0, the intro's size). THE FENCE — the layout itself is measured in headless chrome (test-plugin-consent-chrome).
// RED CONTROL = the base 160045063's files (SKIP by name when the object is absent).
console.log('⑥ the consent dialogs open with their own body text (.dialog-intro); the list of powers has its own rule');
{
  const at = (sha, rel) => { try { return execFileSync('git', ['-C', repo, 'show', `${sha}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const fence = (ui, css) => {
    const intros = ['async _pluginConsentDialog(', '_harnessServiceDialog('].map((fn) => { const a = ui.indexOf(fn); const m = a < 0 ? null : ui.slice(a).match(/body\.innerHTML = `\s*<div class="([^"]+)"/); return m ? m[1] : null; });
    const rule = (sel) => { const m = css.match(new RegExp('^' + sel.replace(/\./g, '\\.') + ' \\{([^}]*)\\}', 'm')); return m ? m[1] : null; };
    const list = rule('.plugin-caps-list'), intro = rule('.dialog-intro'), px = (r, k) => { const m = r && r.match(new RegExp(k + ':\\s*(\\d+)px')); return m ? +m[1] : null; };
    return { intros, listPad: px(list, 'padding-left'), listMargin0: !!list && /margin:\s*0[;\s]/.test(list), listFs: px(list, 'font-size'), introFs: px(intro, 'font-size'), introDim: !intro || /--text-dim/.test(intro) };
  };
  const holds = (f) => f.intros.every((c) => c === 'dialog-intro') && f.listPad != null && f.listPad <= 20 && f.listMargin0 && f.listFs != null && f.listFs === f.introFs && !f.introDim;
  const f = fence(now, read('public/style.css'));
  ok(verdictOf(holds(f)), `⑥ both consent bodies open with ${JSON.stringify(f.intros)}; .plugin-caps-list { padding-left ${f.listPad}px, margin 0: ${f.listMargin0}, ${f.listFs}px } = .dialog-intro's ${f.introFs}px, not --text-dim`);
  const zh = read('src/lib/i18n-zh.js').split('\n').find((l) => l.includes('"Can be chosen as the agent browser: it names the program')) || '';
  ok(verdictOf(zh.includes('它指定一个程序，由 VibeSpace 作为浏览器档案的浏览器来启动')), '⑥ the browser-engine capability in zh names the program VibeSpace starts as a profile\'s browser');
  const bu = at('160045063', 'src/lib/plugins-ui.js'), bc = at('160045063', 'public/style.css');
  if (bu && bc) { const fb = fence(bu, bc); ok(!holds(fb), `⑥ RED CONTROL: the base 160045063 fails the same fence (${JSON.stringify(fb.intros)}, list rule ${fb.listPad == null ? 'absent' : fb.listPad + 'px'})`); }
  else console.log('  SKIP ⑥ RED CONTROL — the base object 160045063 is not in this clone');
}

// ⑦ lane plugin-update-button (the owner, 2026-11-02, asked to press Update on the Custom Browser Kernel row: «有问题，看聊天» —
// the owner's screenshot showed name · switch · ⚙ · 「运行中」 · 「卸载…」 and no Update; it lived ONLY in the status chip's menu, and a
// status chip reads as a badge). The lane's answer was a labelled control on the row (since B-db5d: a row of the row's «⋯»). The REAL plugins-ui.js,
// esbuild-bundled with its imports stubbed (utils: fetchJson / showToast / showContextMenu recorded; i18n: the English words),
// renders the manifest list into a fake DOM: git / path / github-release installs ⇒ «Update…» with Uninstall… (B-db5d: the «⋯» rows);
// a zip install ⇒ no Update button (never a greyed one) + «upload the new .vsp»; a hand-placed folder ⇒ «placed by hand»; a press
// posts /update and toasts «already up to date» on `unchanged: true`, «Updated … to …» otherwise, the server's error on a
// refusal (the button pressable again); the chip's menu lists no Update (ONE door). RED CONTROL = the base 63f59d572's file
// through the same walk (SKIP by name when the object is absent). The row's layout at 1000 × 600 zh: test-plugin-consent-chrome ⑨.
// B-db5d (the owner, 2026-11-18, on this row at a narrow width: «更新 卸载应该收进...里»): Update… and Uninstall… are ROWS OF THE
// ROW'S «⋯» MENU at every width — the walk opens the «⋯» as a person does and presses its rows (Update… first; NO Update row for
// an uploaded file or a hand-placed folder; Uninstall… asks its confirm); a plugin with settings keeps its ⚙ on the row. RED
// CONTROLS 2–4 = anchored copies of this tree's file: the checkpoint's row (the two buttons inline, the ⚙ counted into the «⋯»), an
// in-flight Update… with no why, a refusal that keeps the in-flight why.
console.log('⑦ a plugin that can update has «Update…» in its row\'s «⋯» (B-db5d: with «Uninstall…», never inline); one that cannot says how; the chip has no Update');
{
  const esbuild = require(path.join(repo, 'node_modules/esbuild'));
  const { pathToFileURL } = await import('node:url');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MUT = mutantCopies('plugins-grammar', repo);
  const W = globalThis.__pu = { calls: [], toasts: [], menus: [], confirms: [] };
  const STUBS = {
    './utils.js': `const W = globalThis.__pu;
      export const createModalShell = () => { throw new Error('no modal in this leg'); }; export const freshKey = (k) => k;
      export const fetchJson = (u, o) => W.fetchJson(u, o); export const showToast = (m, o) => { W.toasts.push([m, (o && o.type) || 'info']); };
      export const showConfirmDialog = async (o) => { W.confirms.push(o && o.title); return false; }; export const showContextMenu = (x, y, items) => { W.menus.push(items); };
      export const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); export const copyText = async () => {};
      export const heldWordsOf = (d) => (d && d.code === 'plugins_unread' ? 'plugins held' : null); export const pluginsHeldWords = () => 'plugins held';`,   // B-f276 family unit 1: the held store's words by code
    './i18n.js': 'export const t = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && k in p ? String(p[k]) : m));',
    './agent-meta.js': 'export const BACKEND_META = {};',
    './voice-plugin-card.js': 'export const renderVoiceSheet = () => {};',
    './settings-schema.js': "export const pluginCategoryOf = (id) => (id === 'kit.path' ? 'plugin.kit' : null); export const SETTINGS_SCHEMA = {};",   // kit.path has settings: its ⚙ is a real button (B-db5d: it stays inline)
    './decision-readout.js': 'export const decisionLineOf = () => null, paintDecisionLine = () => {}, liveDecisionLine = () => null;',
    '../plugin-cred-state.js': 'export const pluginGitCredOf = () => null;',
  };
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.dataset = {}; this.attrs = {}; this._text = ''; this.className = ''; this.title = ''; this.disabled = false; this.onclick = null; }
    get classList() { const el = this; const has = () => el.className.split(/\s+/).filter(Boolean); return { add: (...c) => { el.className = [...new Set([...has(), ...c])].join(' '); }, contains: (c) => has().includes(c) }; }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? Object.assign(new El('#text'), { _text: n }) : n); }
    appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
    // the rail row (lane ui-phone-and-fit pick 1) fills a row with replaceChildren and finds its parts by a class or a tag
    replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...ns); }
    querySelectorAll(sel) { return this.all().slice(1).filter((e) => (sel.startsWith('.') ? e.className.split(/\s+/).includes(sel.slice(1)) : e.tagName === sel.toUpperCase())); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    get innerHTML() { return this._html || ''; }
    set innerHTML(h) { this._html = String(h); this._text = this._html.replace(/<[^>]*>/g, ''); this.children = []; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; }
    all() { return [this, ...this.children.flatMap((c) => c.all())]; }
    get isConnected() { return true; }
    click() { return this.onclick ? this.onclick({ currentTarget: this, stopPropagation() { }, preventDefault() { } }) : undefined; }
  }
  globalThis.document = { createElement: (tag) => new El(tag) };
  const SHA = 'a'.repeat(40);
  const mrow = (id, install) => ({ id, label: id, version: '0.1.5', description: 'a plugin', valid: true, enabled: true, server: true, state: 'running', install, contributes: {} });
  const ROWS = [
    mrow('kit.git', { source: 'git', value: 'https://example.invalid/userW/kit.git', ref: 'main', sha: SHA }),
    mrow('kit.path', { source: 'path', value: '/srv/kit' }),
    mrow('kit.release', { source: 'github-release', value: 'userW/kit' }),
    mrow('kit.zip', { source: 'zip', value: 'kit.vsp' }),
    mrow('kit.hand', null),
  ];
  // the server's answers: kit.git = nothing new at its ref; kit.path = a new package; kit.release = a refusal
  W.fetchJson = async (u, o) => {
    W.calls.push([u, (o && o.method) || 'GET']);
    if (u === '/api/plugins') return { plugins: [] };
    if (u === '/api/plugins/manifests') return { plugins: ROWS };
    const m = /^\/api\/plugins\/manifests\/([^/]+)\/update$/.exec(u);
    if (m && m[1] === 'kit.release') return { error: 'the release has no .vsp asset' };
    if (m) return { plugin: { ...ROWS.find((r) => r.id === decodeURIComponent(m[1])) }, previous: null, warnings: [], unchanged: m[1] === 'kit.git' };
    return {};
  };
  const tick = () => new Promise((r) => setTimeout(r, 15));
  const J = JSON.stringify;
  const walk = async (src, tag) => {
    const stub = { name: 'pu-stubs', setup(b) {
      b.onResolve({ filter: /^\.\.?\// }, (a) => (Object.hasOwn(STUBS, a.path) ? { path: a.path, namespace: 'pu-stub' } : null));
      b.onLoad({ filter: /.*/, namespace: 'pu-stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
    } };
    const out = await esbuild.build({ stdin: { contents: src, resolveDir: path.join(repo, 'src/lib'), sourcefile: 'plugins-ui.js', loader: 'js' }, bundle: true, format: 'esm', write: false, plugins: [stub], logLevel: 'silent' });
    const f = path.join(MUT.dir, `plugins-ui-${tag}.mjs`);
    fs.writeFileSync(f, out.outputFiles[0].text); MUT.files.push(f);
    const { installPluginsUI } = await import(pathToFileURL(f).href);
    function App() { }
    installPluginsUI(App);
    const app = new App(); const root = new El('div');
    await app.openPluginsDialog({ container: root });
    const rowOf = (id) => root.all().find((e) => e.className.split(/\s+/).includes('plugin-row') && e.dataset.plugin === id) || null;   // the rail row: 'rail-row plugin-row'
    const buttons = (row) => (row ? row.all().filter((e) => e.tagName === 'BUTTON') : []);
    // B-db5d: THE «⋯» AS A PERSON PRESSES IT — the row's own more button; its menu = the rows showContextMenu was handed (a row's
    // action presses its button: what the button does is what the row does)
    const menuOf = (row) => { const more = row && row.all().find((e) => /\brail-row-more\b/.test(e.className)); if (!more) return null; W.menus.length = 0; more.onclick({ stopPropagation() { } }); return W.menus[0] || []; };
    const rows = {};
    for (const { id } of ROWS) {
      const row = rowOf(id), menu = menuOf(row);
      rows[id] = { buttons: buttons(row).map((e) => e.textContent), inline: buttons(row).some((e) => e.textContent === 'Update…' || e.textContent === 'Uninstall…'), menu: menu ? menu.map((i) => i.label) : null,
        fact: (row && row.all().find((e) => /\bplugin-row-fact\b/.test(e.className)) || {}).textContent || null };
    }
    const press = async (id) => {
      W.calls.length = 0; W.toasts.length = 0;
      const item = (menuOf(rowOf(id)) || []).find((i) => i.label === 'Update…' && typeof i.action === 'function');
      let during = null;
      if (item) { const going = item.action(); const d = (menuOf(rowOf(id)) || []).find((i) => i.label === 'Update…'); during = d ? (d.off || 'live') : 'absent'; await going; await tick(); }   // the «⋯» reopened mid-press
      const again = (menuOf(rowOf(id)) || []).find((i) => i.label === 'Update…');
      return { pressed: !!item, during, calls: W.calls.filter(([u]) => /\/update$/.test(u)), toasts: [...W.toasts], pressableAfter: !!(again && typeof again.action === 'function' && !again.off), titleAfter: again ? again.title : null };
    };
    const pgit = await press('kit.git'), ppath = await press('kit.path'), prel = await press('kit.release');
    // the menu's Uninstall… asks its confirm (refused here: nothing is deleted)
    W.calls.length = 0; W.confirms.length = 0;
    const un = (menuOf(rowOf('kit.zip')) || []).find((i) => i.label === 'Uninstall…' && typeof i.action === 'function');
    if (un) { await un.action(); await tick(); }
    const puninstall = { pressed: !!un, confirms: [...W.confirms], deletes: W.calls.filter(([, m]) => m === 'DELETE').length };
    W.menus.length = 0;
    const chip = rowOf('kit.git') && rowOf('kit.git').all().find((e) => /\bplugin-chip\b/.test(e.className));
    if (chip && chip.onclick) chip.onclick({ currentTarget: chip, stopPropagation() { } });
    return { rows, pgit, ppath, prel, puninstall, menu: (W.menus[0] || []).map((i) => i.label) };
  };
  const ZIP_WORDS = 'Installed from an uploaded file — upload the new .vsp through Install plugin…';
  const HAND_WORDS = 'Placed by hand — reinstall it through Install plugin… to make it updatable';
  const verdict = (w) => ({
    // B-db5d: Update… then Uninstall… are the row's «⋯» rows (never inline buttons); a source that cannot update has NO Update row
    updatable: ['kit.git', 'kit.path', 'kit.release'].every((id) => J(w.rows[id].menu) === J(['Update…', 'Uninstall…']) && !w.rows[id].inline),
    zip: J(w.rows['kit.zip'].menu) === J(['Uninstall…']) && !w.rows['kit.zip'].inline && w.rows['kit.zip'].fact === ZIP_WORDS,
    hand: J(w.rows['kit.hand'].menu) === J(['Uninstall…']) && !w.rows['kit.hand'].inline && w.rows['kit.hand'].fact === HAND_WORDS,
    gearInline: w.rows['kit.path'].buttons.includes('⚙') && !(w.rows['kit.path'].menu || []).includes('Open settings'),
    uninstall: w.puninstall.pressed && J(w.puninstall.confirms) === J(['Uninstall plugin']) && w.puninstall.deletes === 0,
    inFlight: w.pgit.during === 'Updating kit.git…',
    unchanged: J(w.pgit.calls) === J([['/api/plugins/manifests/kit.git/update', 'POST']]) && w.pgit.toasts.some(([m, k]) => m === 'kit.git is already up to date (0.1.5)' && k === 'info') && !w.pgit.toasts.some(([m]) => /^Updated /.test(m)),
    changed: w.ppath.toasts.some(([m]) => m === 'Updated kit.path to 0.1.5') && !w.ppath.toasts.some(([m]) => /up to date/.test(m)),
    refused: w.prel.toasts.some(([m, k]) => m === 'the release has no .vsp asset' && k === 'error') && w.prel.pressableAfter === true && w.prel.titleAfter === '',   // the in-flight why is cleared with the refusal
    oneDoor: w.menu.includes('Show capabilities…') && !w.menu.some((l) => /^Update/.test(l)),
  });
  const w = await walk(now, 'now'), v = verdict(w);
  ok(verdictOf(v.updatable), `⑦ B-db5d: git / path / github-release installs: the row's «⋯» lists «Update…» then «Uninstall…», neither drawn on the row (${['kit.git', 'kit.path', 'kit.release'].map((id) => `${id}: row ${J(w.rows[id].buttons)}, ⋯ ${J(w.rows[id].menu)}`).join(' · ')})`);
  ok(verdictOf(v.zip), `⑦ a zip install: the «⋯» has NO Update row (only ${J(w.rows['kit.zip'].menu)}), the row says «${w.rows['kit.zip'].fact}» (row ${J(w.rows['kit.zip'].buttons)})`);
  ok(verdictOf(v.hand), `⑦ a hand-placed folder: the «⋯» has NO Update row (only ${J(w.rows['kit.hand'].menu)}), the row says «${w.rows['kit.hand'].fact}» (row ${J(w.rows['kit.hand'].buttons)})`);
  ok(verdictOf(v.gearInline), `⑦ B-db5d: a plugin with settings keeps its ⚙ ON the row, never in the «⋯» (kit.path: row ${J(w.rows['kit.path'].buttons)}, ⋯ ${J(w.rows['kit.path'].menu)})`);
  ok(verdictOf(v.uninstall), `⑦ B-db5d: the «⋯»'s «Uninstall…» asks its confirm (${J(w.puninstall.confirms)}) and, refused, deletes nothing (${w.puninstall.deletes} DELETE)`);
  ok(verdictOf(v.inFlight), `⑦ B-db5d: while the update runs, the «⋯»'s Update… is an OFF row that says why — «${w.pgit.during}» (never «not available»)`);
  ok(verdictOf(v.unchanged), `⑦ the press posts /api/plugins/manifests/kit.git/update and, the ref still at its commit (unchanged), toasts ${J(w.pgit.toasts.map(([m]) => m))}`);
  ok(verdictOf(v.changed), `⑦ a new package toasts «Updated … to …» (${J(w.ppath.toasts.map(([m]) => m))})`);
  ok(verdictOf(v.refused), `⑦ a refusal toasts the server's error and the «⋯»'s Update… is pressable again, its in-flight why cleared (${J(w.prel.toasts)}, pressable after: ${w.prel.pressableAfter}, title after: ${J(w.prel.titleAfter)})`);
  ok(verdictOf(v.oneDoor), `⑦ ONE door: the chip's menu lists ${J(w.menu)} — no Update`);
  const b0 = (() => { try { return execFileSync('git', ['-C', repo, 'show', '63f59d572:src/lib/plugins-ui.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } })();
  if (b0 === null) console.log('  SKIP ⑦ RED CONTROL — the base object 63f59d572 is not in this clone');
  else {
    const wb = await walk(b0, 'base'), vb = verdict(wb);
    const red = Object.entries(vb).filter(([, x]) => !x).map(([k]) => k);
    ok(verdictOf(['updatable', 'zip', 'hand', 'unchanged', 'oneDoor'].every((k) => red.includes(k))), `⑦ RED CONTROL: the base 63f59d572 fails the same walk — ${red.join(', ')} (its kit.git row: ${J(wb.rows['kit.git'].buttons)}; its chip menu: ${J(wb.menu)})`);
  }
  // B-db5d RED CONTROLS — anchored copies of THIS tree's file (scratch.mjs anchored: a moved line throws by name; never a git object a
  // shallow clone lacks — a skip is no red): (1) THE CHECKPOINT'S ROW — the cluster not always-folded (Update… / Uninstall… inline,
  // the ⚙ of a plugin with settings counted into the «⋯»); (2) an in-flight Update… whose title says nothing (its OFF row would read
  // «not available»); (3) a refusal that leaves the in-flight why on the row
  const { anchored } = await import('./scratch.mjs');
  const runRed = async (name, from, to, keys) => {
    const code = anchored(now, from, to, name);
    const wc = await walk(code, name.replace(/\W+/g, '-').slice(0, 24)), vc = verdict(wc);
    const red = Object.entries(vc).filter(([, x]) => !x).map(([k]) => k);
    ok(verdictOf(keys.every((k) => red.includes(k))), `⑦ B-db5d RED CONTROL (${name}): the same walk goes red on ${keys.join(', ')} (red: ${red.join(', ')})`);
  };
  await runRed('the checkpoint row', " actions.dataset.railFold = 'always';", '', ['updatable', 'zip', 'hand', 'gearInline', 'unchanged']);
  await runRed('an in-flight Update with no why', "            upd.title = t('Updating {id}…', { id: p.id });", '', ['inFlight']);
  await runRed('a refusal keeping the in-flight why', "if (rr?.error) { upd.disabled = false; upd.title = ''; showToast(heldWordsOf(rr) || rr.error, { type: 'error' }); return; }", "if (rr?.error) { upd.disabled = false; showToast(heldWordsOf(rr) || rr.error, { type: 'error' }); return; }", ['refused']);
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
