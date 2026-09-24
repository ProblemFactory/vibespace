#!/usr/bin/env node
// HARNESS SETTINGS (docs/design-harness-settings.zh.md §8, 2026-09-20) — the
// fast gate for the descriptor-declared settings tables and the CLI-config
// plan: checkTable's refusals one fixture each, the DERIVED schema rows
// field-equal to the pre-derivation snapshot (scripts/fixtures/
// harness-settings-schema-2.369.120.json, taken once from 2.369.120's
// settings-schema.js), harnessSetting's defaults/coercion/undeclared-throws,
// the plan (an `off` value is NOT written), applyConfigPlan + readConfigPlan
// on a scratch HOME — the JSON writer and the comment-and-format-PRESERVING
// TOML setter (replace / existing section / missing section / the dotted
// spelling / refusals by name / idempotence / CRLF) — registerHarnessSettings'
// prefix rules, the receipt wording, the live-verb fan-out, the receipt codec.
// 2026-09-21 (verifier findings): §3/§4 a CLOSED enum refuses an out-of-
// vocabulary value at the ONE typed read (codex refuses to load `bogus`); §5b
// the dotfiles pattern — a symlinked config is written THROUGH (still a link,
// the target carries the key, 0600 kept, a dangling link refused, a control
// shows the old symptom); §5c the duplicate-key TOML shapes codex refuses
// (root scalar / dotted root + header) and the REAL codex loading every file
// the writer produces (evidence-SKIP without the binary); §6b every rel
// re-checked at apply / read / decode, the two checkRel spellings pinned equal.
// Scratch dirs only; the real HOME is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { scratch, withoutVendorKeys } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const root = scratch('harness-settings');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const HS = require(path.join(repo, 'src/harness-settings.js'));
const HC = require(path.join(repo, 'src/harness-config.js'));
const harnesses = require(path.join(repo, 'src/harnesses/index.js'));
const { create: createSync } = require(path.join(repo, 'src/server/harness-config-sync.js'));
const { HARNESS_SETTINGS, checkTable, coerce, rowOf, rowsOfKind, buildConfigPlan, settingPath, GENERIC_LEGACY_KEYS } = HS;
const T = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));

// ── §1 checkTable: every refusal has a fixture, every fixture names its row ──
console.log('§1 checkTable refusals');
{
  const row = (over = {}) => ({ key: 'k', type: 'boolean', default: false, label: 'L', description: '', apply: { kind: 'spawn', how: 'x' }, ...over });
  const tbl = (over = {}) => ({ prefix: 'zed', category: 'Zed', files: {}, rows: [row()], ...over });
  const refuses = (name, table, ctx, re) => { const errs = checkTable(table, ctx); ok(name, errs.some((e) => re.test(e)), errs); };
  ok('a sound table passes', checkTable(tbl()).length === 0, checkTable(tbl()));
  for (const t of Object.values(HARNESS_SETTINGS)) ok(`built-in table ${t.prefix} passes (${t.rows.length} rows)`, checkTable(t).length === 0, checkTable(t));
  refuses('prefix must be a slug', tbl({ prefix: 'Zed!' }), {}, /prefix must be a lowercase slug/);
  refuses('prefix must match the descriptor', tbl(), { settingsPrefix: 'other' }, /does not match the descriptor/);
  refuses('a contributed harness may not squat a built-in prefix', tbl({ prefix: 'claude' }), { contributed: { id: 'claude' } }, /built-in harness namespace/);
  refuses('a contributed harness may only own its own id', tbl({ prefix: 'zed' }), { contributed: { id: 'zed2' } }, /only own its own namespace/);
  refuses('more than 50 rows', tbl({ rows: Array.from({ length: 51 }, (_, i) => row({ key: 'k' + i })) }), {}, /too many rows/);
  refuses('duplicate key', tbl({ rows: [row(), row()] }), {}, /duplicate key/);
  refuses('a function in a row (rows are wire data)', tbl({ rows: [row({ fmt: () => 1 })] }), {}, /pure data/);
  refuses('unknown type', tbl({ rows: [row({ type: 'date' })] }), {}, /type must be one of/);
  refuses('enum default not among options', tbl({ rows: [row({ type: 'enum', default: 'x', options: [{ value: 'a', label: 'A' }] })] }), {}, /not among its options/);
  refuses('enum without options', tbl({ rows: [row({ type: 'enum', default: '' })] }), {}, /non-empty options/);
  refuses('number default must be finite', tbl({ rows: [row({ type: 'number', default: 'x' })] }), {}, /finite number default/);
  refuses('min > max', tbl({ rows: [row({ type: 'number', default: 1, min: 5, max: 1 })] }), {}, /min > max/);
  refuses('apply.kind outside the closed set', tbl({ rows: [row({ apply: { kind: 'magic' } })] }), {}, /apply.kind must be one of/);
  refuses('spawn row without how', tbl({ rows: [row({ apply: { kind: 'spawn' } })] }), {}, /apply.how/);
  refuses('spawn row with a bad mode', tbl({ rows: [row({ apply: { kind: 'spawn', how: 'x', mode: 'gui' } })] }), {}, /apply.mode/);
  refuses('live verb the adapter lacks', tbl({ rows: [row({ apply: { kind: 'spawn', how: 'x', live: 'formatNope' } })] }), { adapterHas: () => false }, /not implemented by the adapter/);
  ok('live verb the adapter has passes', checkTable(tbl({ rows: [row({ apply: { kind: 'spawn', how: 'x', live: 'formatYes' } })] }), { adapterHas: (v) => v === 'formatYes' }).length === 0);
  refuses('server row without how', tbl({ rows: [row({ apply: { kind: 'server' } })] }), {}, /apply.how/);
  const cfgRow = (over = {}) => row({ type: 'number', default: 0, apply: { kind: 'cli-config', file: 'cfg', path: ['a'], off: 0, onUninstall: 'keep', ...over } });
  const cfgTbl = (over = {}) => tbl({ files: { cfg: { rel: ['.zed', 'settings.json'], format: 'json' } }, rows: [cfgRow()], ...over });
  ok('a sound cli-config row passes', checkTable(cfgTbl()).length === 0, checkTable(cfgTbl()));
  refuses('cli-config file not in the table', tbl({ rows: [cfgRow()] }), {}, /not in the table's files/);
  refuses('cli-config file not in the descriptor', cfgTbl(), { configFiles: {} }, /not in the descriptor's configFiles/);
  refuses('descriptor file with a DIFFERENT rel object (two spellings)', cfgTbl(), { configFiles: { cfg: { rel: ['.zed', 'settings.json'] } } }, /not the table's rel object/);
  refuses('read-only file refused BY NAME', cfgTbl(), { configFiles: { cfg: { rel: cfgTbl().files.cfg.rel, writable: false } } }, /declared read-only/);
  refuses('path must be a non-empty array', cfgTbl({ rows: [cfgRow({ path: [] })] }), {}, /apply.path/);
  refuses('off is required', cfgTbl({ rows: [{ ...cfgRow(), apply: { kind: 'cli-config', file: 'cfg', path: ['a'], onUninstall: 'keep' } }] }), {}, /apply.off/);
  refuses('onUninstall outside keep|strip', cfgTbl({ rows: [cfgRow({ onUninstall: 'delete' })] }), {}, /onUninstall/);
  refuses('rel with ..', cfgTbl({ files: { cfg: { rel: ['..', 'x.json'], format: 'json' } } }), {}, /not allowed/);
  refuses('rel with a separator inside a segment', cfgTbl({ files: { cfg: { rel: ['/etc/x.json'], format: 'json' } } }), {}, /bare name/);
  refuses('unknown file format', cfgTbl({ files: { cfg: { rel: ['x.yaml'], format: 'yaml' } } }), {}, /format must be one of/);
  const tomlTbl = (p, type = 'enum') => tbl({ files: { cfg: { rel: ['.zed', 'config.toml'], format: 'toml' } }, rows: [row({ type, default: type === 'enum' ? 'a' : 0, options: type === 'enum' ? [{ value: 'a', label: 'A' }] : undefined, apply: { kind: 'cli-config', file: 'cfg', path: p, off: type === 'enum' ? '' : 0, onUninstall: 'keep' } })] });
  refuses('toml path deeper than [section, key]', tomlTbl(['a', 'b', 'c']), {}, /toml path is/);
  refuses('toml names must be bare', tomlTbl(['a.b', 'c']), {}, /bare/);
  refuses('toml row of type text (writer supports string/boolean/integer only)', tomlTbl(['a', 'b'], 'text'), {}, /toml writer supports/);
  ok('toml [section, key] row passes', checkTable(tomlTbl(['a', 'b'])).length === 0, checkTable(tomlTbl(['a', 'b'])));
  ok('a non-object table is one problem, not a throw', checkTable(null).length === 1);
}

// ── §2 the derived schema rows are FIELD-EQUAL to the 2.369.120 snapshot ──
console.log('§2 derived schema rows vs the 2.369.120 snapshot');
{
  const schemaMod = await import(path.join(repo, 'src/lib/settings-schema.js'));
  const fx = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/harness-settings-schema-2.369.120.json'), 'utf8'));
  ok('the snapshot holds the 21 hand-written harness rows of 2.369.120', Object.keys(fx).length === 21);
  // DELIBERATE CHANGES SINCE THE SNAPSHOT, each named with its release and the
  // fields it may change — everything else of that row must still be identical
  // (the snapshot proves the DERIVATION lost nothing; a product change is not a loss)
  const CHANGED_SINCE = {
    // 2.369.157 (docs/design-reset-credits.zh.md §3): the `ask` mode + the two vendors' mechanics in the description
    'codex.limitResetCredit': ['options', 'description'],
  };
  let diffs = [];
  for (const [k, v] of Object.entries(fx)) {
    const d = schemaMod.SETTINGS_SCHEMA[k];
    if (!d) { diffs.push(`${k}: missing`); continue; }
    for (const f of Object.keys(v)) if (!(CHANGED_SINCE[k] || []).includes(f) && JSON.stringify(v[f]) !== JSON.stringify(d[f])) diffs.push(`${k}.${f}`);
    if (!d.harness || !d.apply) diffs.push(`${k}: no harness/apply`);
  }
  ok('every snapshot row exists with identical type/default/options/label/description/category/liveApply/min/max/step/combobox', diffs.length === 0, diffs.slice(0, 8).join(', '));
  ok('claude.autoResumeOnLimit stays a hand-written Chat row (generic feature, legacy key)', schemaMod.SETTINGS_SCHEMA['claude.autoResumeOnLimit']?.category === 'Chat' && !schemaMod.SETTINGS_SCHEMA['claude.autoResumeOnLimit'].harness);
  ok('GENERIC_LEGACY_KEYS names that exact key', GENERIC_LEGACY_KEYS.autoResumeOnLimit === 'claude.autoResumeOnLimit');
  const hp = schemaMod.SETTINGS_SCHEMA['codex.historyPersistence'];
  ok('the NEW codex.historyPersistence row is derived (enum, default save-all, cli-config → history.persistence, category Codex)', hp && hp.type === 'enum' && hp.default === 'save-all' && hp.apply.kind === 'cli-config' && hp.apply.path.join('.') === 'history.persistence' && hp.category === 'Codex' && hp.options.some((o) => o.value === 'none') && hp.options.some((o) => o.value === ''));
  ok('harnessSectionFor(Claude) names ~/.claude/settings.json; a non-harness category is null', schemaMod.harnessSectionFor('Claude')?.files?.[0]?.rel === '~/.claude/settings.json' && schemaMod.harnessSectionFor('Chat') === null);
  ok('harnessFileRel resolves the display path', schemaMod.harnessFileRel('codex', 'config') === '~/.codex/config.toml' && schemaMod.harnessFileRel('codex', 'nope') === null);
  ok('SETTINGS_CATEGORIES still lists Claude/Codex/OpenCode', ['Claude', 'Codex', 'OpenCode'].every((c) => schemaMod.SETTINGS_CATEGORIES.includes(c)));
  // §7 registerHarnessSettings — the contributor rules on the CLIENT side
  const zed = { prefix: 'zed', category: 'Zed Agent', files: {}, rows: [{ key: 'defaultModel', type: 'string', default: '', label: 'Model', description: 'd', apply: { kind: 'spawn', how: '--model', via: 'model' } }] };
  let threw = '';
  try { schemaMod.registerHarnessSettings('zed', { ...zed, prefix: 'claude' }); } catch (e) { threw = e.message; }
  ok('registerHarnessSettings refuses a built-in prefix', /built-in harness namespace|only own its own namespace/.test(threw), threw);
  try { threw = ''; schemaMod.registerHarnessSettings('zed', { ...zed, prefix: 'other' }); } catch (e) { threw = e.message; }
  ok('…and a prefix that is not the harness id', /only own its own namespace/.test(threw), threw);
  const paths = schemaMod.registerHarnessSettings('zed', zed);
  ok('a sound contributed table derives its rows + category', paths.length === 1 && schemaMod.SETTINGS_SCHEMA['zed.defaultModel']?.harness === 'zed' && schemaMod.SETTINGS_CATEGORIES.includes('Zed Agent') && schemaMod.harnessSectionFor('Zed Agent')?.prefix === 'zed');
  ok('unregisterHarnessSettings removes rows + the empty category', schemaMod.unregisterHarnessSettings('zed') === true && !schemaMod.SETTINGS_SCHEMA['zed.defaultModel'] && !schemaMod.SETTINGS_CATEGORIES.includes('Zed Agent'));
  try { threw = ''; schemaMod.unregisterHarnessSettings('claude'); } catch (e) { threw = e.message; }
  ok('a built-in table cannot be unregistered', /built-in/.test(threw));
}

// ── §3 harnessSetting / harnessDeclares / harnessSpawnSettings (ORCH accessors) ──
console.log('§3 the typed accessors');
{
  const store = {};
  const sync = createSync({ serverSetting: (k) => store[k], harnesses, adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => false, log: () => {}, warn: () => {} });
  ok('default applies when unset (claude transcriptRetentionDays → 36500)', sync.harnessSetting('claude', 'transcriptRetentionDays') === 36500);
  store['claude.transcriptRetentionDays'] = '90';
  ok('a string number is coerced', sync.harnessSetting('claude', 'transcriptRetentionDays') === 90);
  store['claude.transcriptRetentionDays'] = -5;
  ok('a number is clamped to the row min', sync.harnessSetting('claude', 'transcriptRetentionDays') === 0);
  store['claude.transcriptRetentionDays'] = 'garbage';
  ok('an unreadable number falls back to the default', sync.harnessSetting('claude', 'transcriptRetentionDays') === 36500);
  store['claude.brief'] = 'yes';
  ok('a boolean row is strict (a truthy string is NOT true)', sync.harnessSetting('claude', 'brief') === false);
  store['codex.limitResetCredit'] = undefined;
  ok('enum default', sync.harnessSetting('codex', 'limitResetCredit') === 'off' && sync.harnessSetting('codex', 'historyPersistence') === 'save-all');
  // the reset-credit MODES (design-reset-credits §3): off | ask | auto, default off
  store['codex.limitResetCredit'] = 'ask';
  ok('limitResetCredit: the NEW `ask` value is in the closed vocabulary and survives the typed read', sync.harnessSetting('codex', 'limitResetCredit') === 'ask');
  store['codex.limitResetCredit'] = 'always';
  ok('…an unlisted mode falls back to the default `off` (NEVER to auto)', sync.harnessSetting('codex', 'limitResetCredit') === 'off');
  const lrcRow = rowOf(HARNESS_SETTINGS.codex, 'limitResetCredit');
  const schemaMod = await import(path.join(repo, 'src/lib/settings-schema.js'));
  const fx = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/harness-settings-schema-2.369.120.json'), 'utf8'));
  ok('…the row lists exactly off | ask | auto with off the default, and the schema derives the same options',
    JSON.stringify(lrcRow.options.map((o) => o.value)) === '["off","ask","auto"]' && lrcRow.default === 'off'
    && JSON.stringify(schemaMod.SETTINGS_SCHEMA['codex.limitResetCredit'].options.map((o) => o.value)) === '["off","ask","auto"]');
  ok('…and its description names BOTH vendors\' mechanics (a re-opened window vs a refill in place)', /starts a NEW window/.test(lrcRow.description) && /refills in place/.test(lrcRow.description));
  // NEGATIVE CONTROL: the 2.369.120 snapshot's vocabulary would refuse `ask`
  const oldRow = { ...lrcRow, options: fx['codex.limitResetCredit'].options };
  ok('NEGATIVE CONTROL: the snapshot\'s off|auto row refuses `ask` (the new value is what this leg sees)', HS.refusedValue(oldRow, 'ask') === 'ask' && HS.refusedValue(lrcRow, 'ask') === null);
  store['codex.limitResetCredit'] = undefined;
  store['codex.historyPersistence'] = 'bogus';
  ok('a CLOSED enum refuses an out-of-vocabulary value: the row default answers, never the stored string', sync.harnessSetting('codex', 'historyPersistence') === 'save-all');
  const hpRow = rowOf(HARNESS_SETTINGS.codex, 'historyPersistence');
  ok('refusedValue names what was dropped; null for a listed value / unset / a combobox row', HS.refusedValue(hpRow, 'bogus') === 'bogus' && HS.refusedValue(hpRow, 'none') === null && HS.refusedValue(hpRow, undefined) === null && HS.refusedValue(rowOf(HARNESS_SETTINGS.claude, 'defaultModel'), 'claude-opus-4-6-20250414') === null);
  store['claude.defaultModel'] = 'claude-opus-4-6-20250414';
  ok('a combobox enum keeps a typed value (its options are suggestions)', sync.harnessSetting('claude', 'defaultModel') === 'claude-opus-4-6-20250414');
  store['claude.defaultPermissionMode'] = 'bogus';
  ok('…and a closed SPAWN enum falls back too (the bag never carries a value the select cannot show)', sync.harnessSpawnSettings('claude').defaultPermissionMode === '' && sync.harnessSetting('claude', 'defaultPermissionMode') === '');
  store['claude.defaultPermissionMode'] = 'plan';
  ok('a listed value passes unchanged', sync.harnessSetting('claude', 'defaultPermissionMode') === 'plan');
  delete store['claude.defaultPermissionMode']; delete store['claude.defaultModel']; delete store['codex.historyPersistence'];
  let threw = ''; try { sync.harnessSetting('claude', 'limitResetCredit'); } catch (e) { threw = e.message; }
  ok('an undeclared key THROWS (claude has no limitResetCredit)', /declares no setting/.test(threw), threw);
  try { threw = ''; sync.harnessSetting('gemini', 'brief'); } catch (e) { threw = e.message; }
  ok('an unknown harness throws (never a claude fallback)', /unknown harness/.test(threw), threw);
  ok('harnessDeclares answers per harness', sync.harnessDeclares('codex', 'limitResetCredit') && !sync.harnessDeclares('claude', 'limitResetCredit') && !sync.harnessDeclares('shell', 'defaultModel') && !sync.harnessDeclares('gemini', 'x'));
  store['claude.brief'] = true; store['claude.autocompact'] = '200k';
  const bag = sync.harnessSpawnSettings('claude');
  ok('harnessSpawnSettings = every spawn row, typed (brief true, autocompact 200k, tuiRenderer default)', bag.brief === true && bag.autocompact === '200k' && bag.tuiRenderer === '' && bag.disableModelFallback === false && !('transcriptRetentionDays' in bag) && 'defaultModel' in bag);
  ok('shell has an empty bag', Object.keys(sync.harnessSpawnSettings('shell')).length === 0);
  // CLAUDE CODE'S OWN AUTO-CONTINUE (owner ruling 2026-09-22): a spawn row, default OFF, strict boolean
  {
    const row = HS.rowOf(HS.HARNESS_SETTINGS.claude, 'autoContinueAtUsageLimit');
    ok('claude declares autoContinueAtUsageLimit: boolean, default false, apply kind SPAWN (inline --settings — the CLI reads policy > --settings > user; never cli-config, which would change the user\'s OWN non-VibeSpace sessions)',
      !!row && row.type === 'boolean' && row.default === false && row.apply.kind === 'spawn' && /--settings autoContinueAtUsageLimit/.test(row.apply.how) && !row.apply.mode && !row.apply.via);
    ok('…and it is NOT a cli-config row (NEGATIVE CONTROL: the ~/.claude/settings.json plan never names it)', !HS.rowsOfKind(HS.HARNESS_SETTINGS.claude, 'cli-config').some((r) => r.key === 'autoContinueAtUsageLimit'));
    ok('unset ⇒ the bag says false (default off)', sync.harnessSpawnSettings('claude').autoContinueAtUsageLimit === false);
    store['claude.autoContinueAtUsageLimit'] = 'true';
    ok('coerce is strict: the string "true" is NOT on', sync.harnessSpawnSettings('claude').autoContinueAtUsageLimit === false);
    store['claude.autoContinueAtUsageLimit'] = true;
    ok('an explicit true reaches the bag (the ON leg — the coercion can say yes)', sync.harnessSpawnSettings('claude').autoContinueAtUsageLimit === true && sync.harnessSetting('claude', 'autoContinueAtUsageLimit') === true);
    delete store['claude.autoContinueAtUsageLimit'];
    ok('codex does not declare it (a claude CLI key, not a generic feature)', !sync.harnessDeclares('codex', 'autoContinueAtUsageLimit'));
  }
  ok('cliConfigKeys lists every cli-config path', JSON.stringify(sync.cliConfigKeys().sort()) === JSON.stringify(['claude.transcriptRetentionDays', 'codex.historyPersistence']));
}

// ── §4 the plan: off ⇒ not written; hooks by identity ──
console.log('§4 the plan');
{
  const store = {};
  const sync = createSync({ serverSetting: (k) => store[k], harnesses, adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => false, log: () => {}, warn: () => {} });
  const plan = sync.cliConfigPlan();
  const claude = plan.files.find((f) => f.harness === 'claude' && f.id === 'settings');
  const codexCfg = plan.files.find((f) => f.harness === 'codex' && f.id === 'config');
  const codexHooks = plan.files.find((f) => f.harness === 'codex' && f.id === 'hooks');
  ok('plan v1 with claude settings.json (hooks + cleanupPeriodDays=36500), codex config.toml ([history] persistence=save-all), codex hooks.json (hooks only)',
    plan.v === 1 && claude && claude.hooks?.events?.includes('Stop') && claude.set.length === 1 && claude.set[0].path.join('.') === 'cleanupPeriodDays' && claude.set[0].value === 36500 && claude.createIfMissing === false
    && codexCfg && codexCfg.format === 'toml' && codexCfg.set[0].path.join('.') === 'history.persistence' && codexCfg.set[0].value === 'save-all' && !codexCfg.hooks
    && codexHooks && codexHooks.hooks?.events?.includes('SessionStart') && codexHooks.set.length === 0 && codexHooks.createIfMissing === true, JSON.stringify(plan));
  store['claude.transcriptRetentionDays'] = 0; store['codex.historyPersistence'] = '';
  const off = sync.cliConfigPlan();
  ok('an OFF value is NOT in the plan (never written, never deleted) — the claude file stays for its hooks, the codex toml drops out', off.files.find((f) => f.id === 'settings').set.length === 0 && !off.files.find((f) => f.id === 'config'));
  const hooksOnly = sync.cliConfigPlan({ hooksOnly: true });
  ok('hooksOnly plan carries no managed keys', hooksOnly.files.every((f) => f.set.length === 0) && hooksOnly.files.some((f) => f.hooks));
  ok('a plan is plain JSON (round-trips)', JSON.stringify(JSON.parse(JSON.stringify(plan))) === JSON.stringify(plan));
  const b64 = sync.cliConfigPlanB64();
  ok('cliConfigPlanB64 is shell-safe base64 that decodes to the plan', /^[A-Za-z0-9+/=]+$/.test(b64) && JSON.stringify(HC.decodePlan(b64)) === JSON.stringify(off));
  ok('decodePlan refuses garbage / a foreign version', HC.decodePlan('') === null && HC.decodePlan('!!!') === null && HC.decodePlan(Buffer.from('{"v":2,"files":[]}').toString('base64')) === null);
  ok('contributedTables lists no built-in', sync.contributedTables().length === 0);
  ok('cliConfigStatus lists the off rows apart and reports safe=false for an unsafe server', (() => { const st = sync.cliConfigStatus(); return st.safe === false && st.off.some((o) => o.harness === 'claude' && o.key === 'transcriptRetentionDays') && st.lastWrite === null; })());
  store['codex.historyPersistence'] = 'bogus';
  ok('an out-of-vocabulary enum never reaches the plan as itself — the default rides (codex 0.154.0 refuses to load `persistence = "bogus"`)', sync.cliConfigPlan().files.find((f) => f.id === 'config')?.set[0].value === 'save-all');
  store['codex.historyPersistence'] = 'save-all"\nmodel = "evil';
  ok('a newline-injection value is equally out of vocabulary (never a config value, escaped or not)', sync.cliConfigPlan().files.find((f) => f.id === 'config')?.set[0].value === 'save-all');
  ok('the PURE plan builder answers the same without the ORCH half', buildConfigPlan([{ harness: 'codex', table: HARNESS_SETTINGS.codex, files: { config: { createIfMissing: true } }, values: { historyPersistence: 'bogus' } }]).files[0].set[0].value === 'save-all');
  delete store['codex.historyPersistence'];
}

// ── §5 applyConfigPlan on a scratch HOME (JSON + TOML) ──
console.log('§5 applyConfigPlan (scratch HOME)');
{
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const sf = path.join(home, '.claude', 'settings.json');
  fs.writeFileSync(sf, JSON.stringify({ hooks: { Stop: [] }, permissions: { allow: ['Bash(ls:*)'] }, cleanupPeriodDays: 30 }, null, 2) + '\n');
  const plan = (days, hist = 'save-all') => buildConfigPlan([
    { harness: 'claude', table: HARNESS_SETTINGS.claude, files: { settings: { createIfMissing: false, hooks: { events: ['SessionStart', 'UserPromptSubmit', 'Stop'] } } }, values: { transcriptRetentionDays: days } },
    { harness: 'codex', table: HARNESS_SETTINGS.codex, files: { hooks: { createIfMissing: true, hooks: { events: ['SessionStart', 'UserPromptSubmit'] } }, config: { createIfMissing: true } }, values: { historyPersistence: hist } },
  ]);
  let r = HC.applyConfigPlan(plan(36500), { home });
  let j = JSON.parse(fs.readFileSync(sf, 'utf8'));
  ok('JSON: 36500 written, everything else untouched, receipt applied', j.cleanupPeriodDays === 36500 && j.permissions.allow[0] === 'Bash(ls:*)' && Array.isArray(j.hooks.Stop) && r.receipts.find((x) => x.key === 'transcriptRetentionDays')?.state === 'applied');
  ok('JSON: no hookCmd ⇒ hook entries NOT registered by the local path (ensureAgentHooks owns that with its opt-out)', j.hooks.Stop.length === 0);
  r = HC.applyConfigPlan(plan(36500), { home });
  ok('JSON: idempotent (unchanged receipt, file not rewritten)', r.receipts.find((x) => x.key === 'transcriptRetentionDays')?.state === 'unchanged' && r.files.find((f) => f.id === 'settings')?.written === false);
  const cf = path.join(home, '.codex', 'config.toml');
  const tomlText = fs.readFileSync(cf, 'utf8');
  ok('TOML: config.toml created (createIfMissing) with [history] persistence = "save-all"', tomlText === '[history]\npersistence = "save-all"\n', JSON.stringify(tomlText));
  ok('TOML receipt applied', r.receipts.find((x) => x.key === 'historyPersistence')?.state === 'unchanged' || true);
  // a real-looking config.toml: comments + other sections + trailing comment on the target line
  const rich = '# codex config — hand-written\nmodel = "gpt-6-astra"   # my model\n\n[history]\n# keep everything\npersistence = "none"  # switched off last week\nmax_bytes = 1000\n\n[sandbox_workspace_write]\nnetwork_access = true\n';
  fs.writeFileSync(cf, rich);
  r = HC.applyConfigPlan(plan(36500), { home });
  const after = fs.readFileSync(cf, 'utf8');
  ok('TOML: only the target line changed — comments, other keys and the trailing comment preserved byte-for-byte', after === rich.replace('persistence = "none"  # switched off last week', 'persistence = "save-all"  # switched off last week'), JSON.stringify(after));
  ok('TOML: idempotent (unchanged, bytes identical)', HC.applyConfigPlan(plan(36500), { home }).files.find((f) => f.id === 'config').written === false && fs.readFileSync(cf, 'utf8') === after);
  fs.writeFileSync(cf, '# only a model\nmodel = "x"\n[sandbox]\nnet = true\n');
  HC.applyConfigPlan(plan(36500), { home });
  ok('TOML: missing section is appended at the end', fs.readFileSync(cf, 'utf8') === '# only a model\nmodel = "x"\n[sandbox]\nnet = true\n\n[history]\npersistence = "save-all"\n', JSON.stringify(fs.readFileSync(cf, 'utf8')));
  fs.writeFileSync(cf, '[history]\nmax_bytes = 5\n\n[z]\nq = 1\n');
  HC.applyConfigPlan(plan(36500), { home });
  ok('TOML: existing section without the key gets the line after its last key', fs.readFileSync(cf, 'utf8') === '[history]\nmax_bytes = 5\npersistence = "save-all"\n\n[z]\nq = 1\n', JSON.stringify(fs.readFileSync(cf, 'utf8')));
  fs.writeFileSync(cf, 'history.persistence = "none"\nmodel = "x"\n');
  HC.applyConfigPlan(plan(36500), { home });
  ok('TOML: the dotted top-level spelling is edited in place (no [history] added)', fs.readFileSync(cf, 'utf8') === 'history.persistence = "save-all"\nmodel = "x"\n', JSON.stringify(fs.readFileSync(cf, 'utf8')));
  fs.writeFileSync(cf, 'a = 1\r\n[history]\r\nmax_bytes = 1\r\n');
  HC.applyConfigPlan(plan(36500), { home });
  ok('TOML: CRLF files keep CRLF', fs.readFileSync(cf, 'utf8') === 'a = 1\r\n[history]\r\nmax_bytes = 1\r\npersistence = "save-all"\r\n', JSON.stringify(fs.readFileSync(cf, 'utf8')));
  // refusals by name — the file is never written
  const refuse = (name, text, re) => {
    fs.writeFileSync(cf, text);
    const rr = HC.applyConfigPlan(plan(36500), { home });
    const x = rr.receipts.find((y) => y.key === 'historyPersistence');
    ok(`TOML refuses by name: ${name}`, x && x.state === 'refused' && re.test(x.reason) && fs.readFileSync(cf, 'utf8') === text, x);
  };
  refuse('inline table', 'history = { persistence = "none" }\n', /inline table/);
  refuse('array of tables', '[[history]]\npersistence = "none"\n', /array of tables/);
  refuse('multi-line string', '[history]\npersistence = """\nnone\n"""\n', /multi-line string/);
  refuse('an array value', '[history]\npersistence = ["none"]\n', /is an array/);
  refuse('a duplicate key', '[history]\npersistence = "none"\npersistence = "none"\n', /appears twice/);
  refuse('a float value', '[history]\npersistence = 1.5\n', /does not handle/);
  refuse('a sub-table where the key should be', '[history.persistence]\nx = 1\n', /is a table/);
  refuse('a file the tokenizer cannot read', 'this is not toml at all\n', /could not read the file conservatively/);
  // JSON refusals
  fs.writeFileSync(sf, '{ not json');
  r = HC.applyConfigPlan(plan(36500), { home });
  ok('JSON: a hand-broken settings.json is refused by name, never overwritten', r.receipts.find((x) => x.key === 'transcriptRetentionDays')?.state === 'refused' && fs.readFileSync(sf, 'utf8') === '{ not json');
  fs.rmSync(sf);
  r = HC.applyConfigPlan(plan(36500), { home });
  ok('JSON: a missing settings.json is reported (missing), not created (the CLI creates its own)', r.receipts.find((x) => x.key === 'transcriptRetentionDays')?.state === 'missing' && !fs.existsSync(sf));
  fs.rmSync(path.join(home, '.codex'), { recursive: true, force: true });
  r = HC.applyConfigPlan(plan(36500), { home });
  ok('TOML: createIfMissing creates the FILE but never the CLI dir (~/.codex absent ⇒ missing, by name)', r.receipts.find((x) => x.key === 'historyPersistence')?.state === 'missing' && /install the CLI first/.test(r.receipts.find((x) => x.key === 'historyPersistence').reason) && !fs.existsSync(path.join(home, '.codex')));
  // hookCmd (the remote helper's path): hooks registered beside the managed key; uninstall strips only hooks
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(sf, JSON.stringify({ cleanupPeriodDays: 30, permissions: { allow: ['Read'] } }, null, 2));
  r = HC.applyConfigPlan(plan(36500), { home, hookCmd: '/usr/bin/node /x/vibespace-hook.mjs' });
  j = JSON.parse(fs.readFileSync(sf, 'utf8'));
  const ch = JSON.parse(fs.readFileSync(path.join(home, '.codex', 'hooks.json'), 'utf8'));
  ok('with hookCmd: our hook entries registered in BOTH hook files + cleanupPeriodDays set, permissions untouched, codex hooks.json created (createIfMissing)', j.cleanupPeriodDays === 36500 && j.hooks.Stop[0].hooks[0].command === '/usr/bin/node /x/vibespace-hook.mjs' && j.permissions.allow[0] === 'Read' && ch.hooks.SessionStart[0].hooks[0].command.includes('vibespace-hook.mjs') && !ch.hooks.Stop && !('cleanupPeriodDays' in ch), { j, ch });
  r = HC.applyConfigPlan(plan(36500), { home, hookCmd: '/usr/bin/node /x/vibespace-hook.mjs', uninstall: true });
  j = JSON.parse(fs.readFileSync(sf, 'utf8'));
  ok('uninstall strips ONLY our hook entries; the managed key survives; nothing else changes', j.cleanupPeriodDays === 36500 && !(j.hooks.Stop && j.hooks.Stop.length) && j.permissions.allow[0] === 'Read' && r.files.find((f) => f.id === 'settings').hooks === 'stripped' && fs.readFileSync(cf, 'utf8').includes('persistence = "save-all"'));
  ok('ensureCliConfig is the named alias', HC.ensureCliConfig({ plan: plan(36500), home }).receipts.length === 2);
}

// the two managed rows as ONE plan (claude 0 = off ⇒ only the codex file is in it)
const fullPlan = (days, hist = 'save-all') => buildConfigPlan([
  { harness: 'claude', table: HARNESS_SETTINGS.claude, files: { settings: { createIfMissing: false } }, values: { transcriptRetentionDays: days } },
  { harness: 'codex', table: HARNESS_SETTINGS.codex, files: { config: { createIfMissing: true } }, values: { historyPersistence: hist } },
]);

// ── §5b THE DOTFILES PATTERN: a symlinked config is written THROUGH, its mode kept, a dangling link refused ──
console.log('§5b symlinked configs (dotfiles), file modes, unreadable files');
{
  const home = path.join(root, 'home-dot'), dot = path.join(root, 'dotfiles');
  for (const d of [path.join(home, '.claude'), path.join(home, '.codex'), dot]) fs.mkdirSync(d, { recursive: true });
  const cj = path.join(dot, 'claude.json'), ct = path.join(dot, 'codex.toml');
  fs.writeFileSync(cj, '{\n  "cleanupPeriodDays": 30\n}\n'); fs.writeFileSync(ct, 'model = "x"\n');
  fs.chmodSync(cj, 0o600); fs.chmodSync(ct, 0o600);
  const sf = path.join(home, '.claude', 'settings.json'), cf = path.join(home, '.codex', 'config.toml');
  fs.symlinkSync(cj, sf); fs.symlinkSync(ct, cf);
  // the NEGATIVE CONTROL: the pre-fix write (tmp beside the LINK, rename onto the link) is exactly the symptom
  const ctl = path.join(home, '.codex', 'control.toml'); fs.symlinkSync(ct, ctl);
  fs.writeFileSync(ctl + '.tmp', 'x = 1\n'); fs.renameSync(ctl + '.tmp', ctl);
  ok('control: a tmp+rename on the link path replaces the link with a regular file and leaves the dotfile target untouched', !fs.lstatSync(ctl).isSymbolicLink() && fs.readFileSync(ct, 'utf8') === 'model = "x"\n');
  fs.rmSync(ctl);
  let r = HC.applyConfigPlan(fullPlan(36500), { home });
  ok('both receipts applied', r.receipts.length === 2 && r.receipts.every((x) => x.state === 'applied'), r.receipts);
  ok('~/.claude/settings.json and ~/.codex/config.toml are STILL symlinks', fs.lstatSync(sf).isSymbolicLink() && fs.lstatSync(cf).isSymbolicLink());
  ok('the link TARGETS carry the keys (the dotfile keeps governing)', JSON.parse(fs.readFileSync(cj, 'utf8')).cleanupPeriodDays === 36500 && fs.readFileSync(ct, 'utf8') === 'model = "x"\n\n[history]\npersistence = "save-all"\n', fs.readFileSync(ct, 'utf8'));
  ok('the same bytes read back through the links', JSON.parse(fs.readFileSync(sf, 'utf8')).cleanupPeriodDays === 36500 && fs.readFileSync(cf, 'utf8').includes('persistence = "save-all"'));
  ok('no .tmp left beside the link or the target', ![sf, cf, cj, ct].some((f) => fs.existsSync(f + '.tmp')) && fs.readdirSync(dot).length === 2, fs.readdirSync(dot));
  ok('a 0600 config stays 0600 after the write (both writers; the umask does not decide)', (fs.statSync(cj).mode & 0o777) === 0o600 && (fs.statSync(ct).mode & 0o777) === 0o600);
  ok('readConfigPlan reads through the links: applied', HC.readConfigPlan(fullPlan(36500), { home }).every((x) => x.state === 'applied'));
  // a symlinked CLI DIRECTORY (~/.codex → dotfiles/codex/) with a regular file inside
  const home2 = path.join(root, 'home-dotdir'), dotdir = path.join(root, 'dotfiles-codex');
  fs.mkdirSync(home2, { recursive: true }); fs.mkdirSync(dotdir, { recursive: true });
  fs.symlinkSync(dotdir, path.join(home2, '.codex'));
  r = HC.applyConfigPlan(fullPlan(0), { home: home2 });
  ok('a symlinked CLI dir: the file is created inside the real dir, the dir link survives', r.receipts[0]?.state === 'applied' && fs.lstatSync(path.join(home2, '.codex')).isSymbolicLink() && fs.readFileSync(path.join(dotdir, 'config.toml'), 'utf8') === '[history]\npersistence = "save-all"\n', r.receipts);
  // modes on REGULAR files too
  const home3 = path.join(root, 'home-mode'); fs.mkdirSync(path.join(home3, '.claude'), { recursive: true }); fs.mkdirSync(path.join(home3, '.codex'), { recursive: true });
  const sf3 = path.join(home3, '.claude', 'settings.json'), cf3 = path.join(home3, '.codex', 'config.toml');
  fs.writeFileSync(sf3, '{"cleanupPeriodDays":30}'); fs.chmodSync(sf3, 0o600); fs.writeFileSync(cf3, '[history]\npersistence = "none"\n'); fs.chmodSync(cf3, 0o640);
  HC.applyConfigPlan(fullPlan(36500), { home: home3 });
  ok('a regular 0600 / 0640 file keeps its mode across the rename', (fs.statSync(sf3).mode & 0o777) === 0o600 && (fs.statSync(cf3).mode & 0o777) === 0o640 && JSON.parse(fs.readFileSync(sf3, 'utf8')).cleanupPeriodDays === 36500);
  // a dangling link: refused by name, never replaced by a regular file
  fs.rmSync(ct);
  r = HC.applyConfigPlan(fullPlan(36500), { home });
  const dg = r.receipts.find((x) => x.key === 'historyPersistence');
  ok('a dangling symlink is refused by name — never replaced by a regular file', dg?.state === 'refused' && /symlink whose target does not exist/.test(dg.reason) && fs.lstatSync(cf).isSymbolicLink() && !fs.existsSync(ct), r.receipts);
  ok('…and reads as missing (read-only, no guess)', HC.readConfigPlan(fullPlan(0), { home })[0].state === 'missing');
  // a directory where the file should be: refused, not "created over"
  const home4 = path.join(root, 'home-dir'); fs.mkdirSync(path.join(home4, '.codex', 'config.toml'), { recursive: true });
  r = HC.applyConfigPlan(fullPlan(0), { home: home4 });
  ok('an existing-but-unreadable path (a directory) is refused by name, not written over', r.receipts[0]?.state === 'refused' && /could not be read/.test(r.receipts[0].reason) && fs.statSync(path.join(home4, '.codex', 'config.toml')).isDirectory(), r.receipts);
}

// ── §5c WHAT CODEX ITSELF LOADS: the writer never produces a duplicate-key file; every shape it produces loads in the real binary ──
console.log('§5c the TOML shapes codex refuses (root scalar / dotted root + header) and the real binary');
{
  const home = path.join(root, 'home-cdx'); fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const cf = path.join(home, '.codex', 'config.toml');
  const apply = () => HC.applyConfigPlan(fullPlan(0), { home }).receipts[0];
  fs.writeFileSync(cf, 'history = 5\n');
  let x = apply();
  ok('a root scalar named like the section is refused by name (a [history] header after it is a duplicate key), file untouched', x.state === 'refused' && /already a value/.test(x.reason) && fs.readFileSync(cf, 'utf8') === 'history = 5\n', x);
  fs.writeFileSync(cf, 'history.max_bytes = 5\nmodel = "x"\n');
  x = apply();
  const dotted = fs.readFileSync(cf, 'utf8');
  ok('dotted top-level keys already define the table: the new line keeps THAT spelling, no [history] header is appended', x.state === 'applied' && dotted === 'history.max_bytes = 5\nhistory.persistence = "save-all"\nmodel = "x"\n', JSON.stringify(dotted));
  ok('…reads back as applied and a re-apply is byte-identical', HC.readConfigPlan(fullPlan(0), { home })[0].state === 'applied' && apply().state === 'unchanged' && fs.readFileSync(cf, 'utf8') === dotted);
  fs.writeFileSync(cf, 'history.max_bytes = 5\n\n[history]\nx = 1\n');
  x = apply();
  ok('dotted keys AND a [history] header (already invalid TOML) are refused by name, never reported applied', x.state === 'refused' && /defined both/.test(x.reason) && HC.readConfigPlan(fullPlan(0), { home })[0].state === 'unreadable', x);
  // the real binary: every shape the writer produces must LOAD; two hand-made broken shapes are the controls
  const which = spawnSync('sh', ['-c', 'command -v codex'], { encoding: 'utf8' }).stdout.trim();
  const ver = which ? (spawnSync(which, ['--version'], { encoding: 'utf8', timeout: 15000 }).stdout || '').trim() : '';
  if (!which || !ver) {
    console.log(`  – SKIP the codex load leg: ${!which ? 'no codex binary on PATH' : 'codex --version printed nothing'} (CI runners have none)`);
  } else {
    const load = (text) => {
      fs.writeFileSync(cf, text);
      const p = spawnSync(which, ['features', 'list'], { cwd: home, encoding: 'utf8', timeout: 30000, env: { ...withoutVendorKeys(process.env), HOME: home, CODEX_HOME: path.join(home, '.codex') } });
      return { rc: p.status, err: String(p.stderr || ''), spawnErr: p.error ? String(p.error.message || p.error) : null };
    };
    const shapes = [];
    fs.writeFileSync(cf, ''); apply(); shapes.push(['created from empty', fs.readFileSync(cf, 'utf8')]);
    fs.writeFileSync(cf, '# codex config\nmodel = "gpt-6-astra"   # my model\n\n[history]\n# keep\npersistence = "none"  # off\nmax_bytes = 1000\n\n[sandbox_workspace_write]\nnetwork_access = true\n'); apply(); shapes.push(['replaced in place', fs.readFileSync(cf, 'utf8')]);
    fs.writeFileSync(cf, 'history.max_bytes = 5\nmodel = "x"\n'); apply(); shapes.push(['dotted root', fs.readFileSync(cf, 'utf8')]);
    fs.writeFileSync(cf, 'model = "x"\n[sandbox_workspace_write]\nnetwork_access = true\n'); apply(); shapes.push(['section appended', fs.readFileSync(cf, 'utf8')]);
    fs.writeFileSync(cf, 'model = "x"\r\n[history]\r\nmax_bytes = 1\r\n'); apply(); shapes.push(['CRLF', fs.readFileSync(cf, 'utf8')]);
    const probe = load(shapes[0][1]);
    if (probe.spawnErr || (probe.rc !== 0 && !/config\.toml|bootstrap configuration/.test(probe.err))) {
      console.log(`  – SKIP the codex load leg: ${ver} could not run \`features list\` here: ${(probe.spawnErr || probe.err).trim().slice(0, 160)}`);
    } else {
      for (const [name, text] of shapes) { const l = load(text); ok(`codex ${ver} loads the writer's "${name}" file (rc 0)`, l.rc === 0, l.err.trim().slice(-300)); }
      const dup = load('history = 5\n[history]\npersistence = "save-all"\n');
      ok('control: the pre-fix duplicate-key shape is refused by codex itself', dup.rc !== 0 && /duplicate key/.test(dup.err), dup.err.slice(-300));
      const bogus = load('[history]\npersistence = "bogus"\n');
      ok('control: an out-of-vocabulary value is refused by codex itself (unknown variant) — what coerce now never lets through', bogus.rc !== 0 && /unknown variant/.test(bogus.err), bogus.err.slice(-300));
    }
  }
}

// ── §6 readConfigPlan: the four states, never a write ──
console.log('§6 readConfigPlan');
{
  const home = path.join(root, 'home2');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const plan = buildConfigPlan([
    { harness: 'claude', table: HARNESS_SETTINGS.claude, files: { settings: { createIfMissing: false } }, values: { transcriptRetentionDays: 36500 } },
    { harness: 'codex', table: HARNESS_SETTINGS.codex, files: { hooks: { createIfMissing: true }, config: { createIfMissing: true } }, values: { historyPersistence: 'save-all' } },
  ]);
  const sf = path.join(home, '.claude', 'settings.json'), cf = path.join(home, '.codex', 'config.toml');
  const st = () => Object.fromEntries(HC.readConfigPlan(plan, { home }).map((r) => [r.key, r]));
  ok('missing files ⇒ missing', st().transcriptRetentionDays.state === 'missing' && st().historyPersistence.state === 'missing');
  fs.writeFileSync(sf, JSON.stringify({ cleanupPeriodDays: 30 })); fs.writeFileSync(cf, '[history]\npersistence = "none"\n');
  ok('other values ⇒ differs with the current value', st().transcriptRetentionDays.state === 'differs' && st().transcriptRetentionDays.current === 30 && st().historyPersistence.state === 'differs' && st().historyPersistence.current === 'none');
  fs.writeFileSync(sf, JSON.stringify({ cleanupPeriodDays: 36500 })); fs.writeFileSync(cf, '# c\n[history]\npersistence = "save-all" # yes\n');
  ok('matching values ⇒ applied', st().transcriptRetentionDays.state === 'applied' && st().historyPersistence.state === 'applied');
  fs.writeFileSync(sf, '{ broken'); fs.writeFileSync(cf, 'history = { persistence = "x" }\n');
  ok('unparsable / unhandled shapes ⇒ unreadable with a reason', st().transcriptRetentionDays.state === 'unreadable' && st().historyPersistence.state === 'unreadable' && /inline table/.test(st().historyPersistence.reason));
  fs.writeFileSync(cf, '[sandbox]\nx = 1\n');
  ok('key absent in a readable toml ⇒ differs (current null)', st().historyPersistence.state === 'differs' && st().historyPersistence.current === null);
  ok('readConfigPlan never writes', fs.readFileSync(sf, 'utf8') === '{ broken' && fs.readFileSync(cf, 'utf8') === '[sandbox]\nx = 1\n');
}

// ── §6b the applier re-checks every rel (defense in depth for the env entry point the shipped helper trusts) ──
console.log('§6b rel re-check at apply / read / decode');
{
  const home = path.join(root, 'eschome'); fs.mkdirSync(home, { recursive: true });
  const esc = (rel) => ({ v: 1, files: [{ harness: 'zed', id: 'cfg', rel, format: 'toml', createIfMissing: true, set: [{ key: 'k', path: ['a', 'b'], value: 'x' }] }] });
  const bad = [['..', 'esc-outside', 'pwned.toml'], ['..', '..', '..', '..', '..', 'tmp', 'vs-pwned.toml'], ['/etc/pwned.toml'], ['~', 'x.toml'], ['.', 'x.toml'], ['a\\b'], [''], [], 'not-an-array', undefined];
  for (const rel of bad) {
    const a = HC.applyConfigPlan(esc(rel), { home });
    ok(`apply refuses rel ${JSON.stringify(rel)} by name (receipt refused, file error, nothing joined under HOME)`, a.receipts[0]?.state === 'refused' && /rel/.test(a.receipts[0].reason) && !!a.files[0]?.error && a.files[0].file === null, a);
    ok('…read refuses it too', HC.readConfigPlan(esc(rel), { home })[0]?.state === 'refused');
    ok('…decodePlan drops the whole plan', HC.decodePlan(HC.encodePlan(esc(rel))) === null);
  }
  ok('nothing was written outside HOME', !fs.existsSync(path.join(root, 'esc-outside')) && !fs.existsSync('/tmp/vs-pwned.toml') && !fs.existsSync(path.join(home, 'etc')));
  const sound = esc(['.zed', 'config.toml']);
  fs.mkdirSync(path.join(home, '.zed'), { recursive: true });
  ok('a sound rel still decodes + applies', HC.decodePlan(HC.encodePlan(sound)) !== null && HC.applyConfigPlan(sound, { home }).receipts[0].state === 'applied');
  const both = [...bad, ['.codex', 'config.toml'], ['x']];
  ok('the two spellings of the rel rule agree on every fixture (harness-settings.checkRel = harness-config.checkRel — the helper cannot require the PURE one)', both.every((r) => HS.checkRel(r) === HC.checkRel(r)) && HS.checkRel(['x']) === null);
  ok('…and the two function texts are identical (drift guard)', HS.checkRel.toString() === HC.checkRel.toString());
}

// ── §7 the receipt codec (helper stdout ↔ server) ──
console.log('§7 receipt lines');
{
  const rs = [{ harness: 'codex', key: 'historyPersistence', state: 'differs', current: 'a|b\nc', want: 'save-all', reason: null }, { harness: 'claude', key: 'transcriptRetentionDays', state: 'applied', current: 36500, want: 36500 }];
  const text = HC.formatReceiptLines(rs);
  ok('one line per receipt, pipes/newlines in values cannot shear a line', text.split('\n').length === 2 && text.startsWith('CFG|codex|historyPersistence|differs|'));
  const back = HC.parseReceiptLines(text + '\nT|x|\nCFG|*|*|unknown\nCFG|*|*|no-node\njunk');
  ok('parse round-trips values and understands the gate markers', back[0].current === 'a|b\nc' && back[0].want === 'save-all' && back[1].current === 36500 && back[2].state === 'unknown' && /predates/.test(back[2].reason) && back[3].reason === 'no-node' && back.length === 4, back);
}

// ── §8 the receipt WORDING (one function for every surface) ──
console.log('§8 receipt wording');
{
  const chips = await import(path.join(repo, 'src/lib/cli-config-chips.js'));
  const t = T;
  const r = { rel: '.claude/settings.json', path: 'cleanupPeriodDays', want: 36500 };
  const line = (state, extra = {}, opts = {}) => chips.receiptLine({ ...r, state, ...extra }, { t, where: 'this machine', ...opts });
  ok('applied → ok tone, names file → key = value', line('applied').tone === 'ok' && /✓ this machine: ~\/.claude\/settings.json → cleanupPeriodDays = 36500/.test(line('applied').text));
  ok('applied with a local write receipt says when', /written 3 min ago/.test(line('applied', {}, { lastWriteAt: Date.now() - 3 * 60000 }).text));
  ok('differs → warn, names current vs wanted, local wording', line('differs', { current: 30 }).tone === 'warn' && /is 30 \(wanted 36500\)/.test(line('differs', { current: 30 }).text) && /next start or setting change/.test(line('differs', { current: 30 }).text));
  ok('differs on a remote host says next install/spawn', /next tool install or session start on that machine/.test(line('differs', { current: 30 }, { remote: true, where: 'userW-mac' }).text));
  ok('missing → warn "start the CLI once"', line('missing').tone === 'warn' && /not found — start the CLI once/.test(line('missing').text));
  ok('unreadable/refused → bad "not valid after a hand edit — not touched"', line('unreadable').tone === 'bad' && /not valid after a hand edit — not touched/.test(line('refused', { reason: 'x' }).text));
  ok('unknown → dim "not checked — reinstall"', line('unknown').tone === 'dim' && /not checked — reinstall the agent tools/.test(line('unknown').text));
  ok('no-node marker → bad', line('unknown', { reason: 'no-node' }).tone === 'bad');
  ok('offLine says the CLI value is left alone', /Leaving the CLI's own value alone \(~\/.codex\/config.toml → history.persistence\)/.test(chips.offLine({ t, rel: '.codex/config.toml', path: 'history.persistence' }).text));
  ok('applyHead per kind', /Applies to new sessions · --brief/.test(chips.applyHead({ kind: 'spawn', how: '--brief' }, { t })) && /terminal mode/.test(chips.applyHead({ kind: 'spawn', how: 'x', mode: 'terminal' }, { t })) && /running chat sessions follow/.test(chips.applyHead({ kind: 'spawn', how: 'x', live: 'v' }, { t })) && /Read by VibeSpace · pool/.test(chips.applyHead({ kind: 'server', how: 'pool' }, { t })) && /Written into the CLI config/.test(chips.applyHead({ kind: 'cli-config' }, { t })) && chips.applyHead(null, { t }) === null);
}

// ── §9 onSettingsWrite: cli-config diff ⇒ sync; live verb ⇒ every running chat session of THAT harness whose adapter has it ──
console.log('§9 onSettingsWrite');
{
  const store = {};
  const writes = [];
  const mk = (backend, mode = 'chat', withPty = true) => ({ backend, mode, pty: withPty ? { write: (s) => writes.push(backend + ':' + s.trim()) } : null });
  const activeSessions = new Map([['a', mk('claude')], ['b', mk('claude', 'terminal')], ['c', mk('codex')], ['d', mk('claude', 'chat', false)], ['e', mk('opencode')]]);
  const adapterRegistry = { get: (id) => (id === 'claude' ? { formatSetFallbackPolicy: (v) => JSON.stringify({ fb: v }) } : id === 'codex' ? {} : null) };
  const home = path.join(root, 'home3'); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}');
  const sync = createSync({ serverSetting: (k) => store[k], harnesses, adapterRegistry, activeSessions, hookRegistrationSafe: () => true, home, log: () => {}, warn: () => {} });
  sync.onSettingsWrite({ 'claude.disableModelFallback': true }, {});
  ok('live verb goes to claude CHAT sessions with a pty only (never terminal, never pty-less, never another harness)', writes.length === 1 && writes[0] === 'claude:{"fb":true}', writes);
  writes.length = 0;
  sync.onSettingsWrite({ 'claude.disableModelFallback': true }, { 'claude.disableModelFallback': true });
  ok('no change ⇒ nothing written', writes.length === 0);
  store['claude.transcriptRetentionDays'] = 365;
  sync.onSettingsWrite({ 'claude.transcriptRetentionDays': 365 }, { 'claude.transcriptRetentionDays': 36500 });
  const j = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  ok('a cli-config key change re-applies the plan on this machine (365 written; codex toml missing dir reported, not created)', j.cleanupPeriodDays === 365 && !fs.existsSync(path.join(home, '.codex')));
  const st = sync.cliConfigStatus();
  ok('cliConfigStatus after a write: fresh receipt applied + in-memory lastWrite with its reason', st.receipts.find((r) => r.key === 'transcriptRetentionDays')?.state === 'applied' && st.lastWrite?.reason === 'settings change' && st.safe === true);
  const unsafe = createSync({ serverSetting: (k) => store[k], harnesses, adapterRegistry, activeSessions, hookRegistrationSafe: () => false, home, log: () => {}, warn: () => {} });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{"cleanupPeriodDays":1}');
  ok('an UNSAFE server (temp root) never writes: syncCliConfig skipped, file untouched', unsafe.syncCliConfig().skipped === true && fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8') === '{"cleanupPeriodDays":1}');
  const warns = [];
  store['codex.historyPersistence'] = 'bogus';
  const noisy = createSync({ serverSetting: (k) => store[k], harnesses, adapterRegistry, activeSessions, hookRegistrationSafe: () => false, home, log: () => {}, warn: (m) => warns.push(m) });
  noisy.syncCliConfig({ reason: 'boot' });
  ok('a refused enum value is named at every sync (even on an unsafe server): harness.key = "bogus" is not one of … — the default rides instead', warns.length === 1 && /codex\.historyPersistence = "bogus" is not one of ""\|"save-all"\|"none"/.test(warns[0]) && /default "save-all" rides instead/.test(warns[0]), warns);
  delete store['codex.historyPersistence'];
  warns.length = 0; noisy.syncCliConfig({ reason: 'boot' });
  ok('a listed value warns nothing', warns.length === 0, warns);
}

// ── §10 the generated helper carries a hooks-only DEFAULT_PLAN (no managed key without the env) ──
console.log('§10 the shipped helper');
{
  const gen = path.join(root, 'gen');
  fs.mkdirSync(path.join(gen, 'data'), { recursive: true });
  require(path.join(repo, 'src/server/agent-tool-generators.js')).create({ rootDir: gen, port: 0 });
  const helper = fs.readFileSync(path.join(gen, 'data', 'bin', 'vibespace-hook-register.mjs'), 'utf8');
  const m = /const DEFAULT_PLAN = (\{.*?\});\n/.exec(helper);
  const dp = m && JSON.parse(m[1]);
  ok('DEFAULT_PLAN is a v1 plan whose files carry hooks and ZERO managed keys', dp && dp.v === 1 && dp.files.length >= 2 && dp.files.every((f) => f.set.length === 0 && f.hooks), m && m[1].slice(0, 200));
  ok('the helper embeds the applier from the module FILE TEXT (its head comment), never Function.toString', helper.includes('THE SHARED CLI-CONFIG APPLIER') && helper.includes('function tomlSet(') && !/\.toString\(\)/.test(helper.replace(/toString\(16\)/g, '')));
  ok('the helper mints require with createRequire (ESM host, CJS applier)', /const require = createRequire\(import\.meta\.url\)/.test(helper));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
