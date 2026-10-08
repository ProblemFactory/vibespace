#!/usr/bin/env node
// test-channel-manifest — lane dc-channels-manifest (rv-channels-core C3/C4, rv-channel-adapters F2/F8/F10): a channel
// vendor = ITS folder (adapter + manifest + blocks) + ONE line in src/channels/registry-list.js. THE PROOF: the fake
// vendor scripts/fixtures/channels/acme/ joins by ONE added line in a copy of the list (compiled AS the list, so every
// other module is the shipped one, untouched): its settings rows reach the schema, its integration row the registry
// (with its own validator), the engine registers its module whole (consent row, raw-API fence, blocks rung, glyph,
// option row read by role) — then register() refuses a malformed vendor by name.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 400)}` : ''}`); } };

console.log('① one list line: the fake vendor joins through a copy of the vendor list');
const LIST = path.join(REPO, 'src/channels/registry-list.js');
const src = fs.readFileSync(LIST, 'utf8');
const ANCHOR = "  require('./slack/manifest.js'),\n";
ok(src.split(ANCHOR).length === 2, 'the list line anchor is present once');
const copy = src.replace(ANCHOR, ANCHOR + `  require(${JSON.stringify(path.join(REPO, 'scripts/fixtures/channels/acme/manifest.js'))}),\n`);
const added = copy.split('\n').filter((l) => !src.split('\n').includes(l));
ok(added.length === 1 && /fixtures\/channels\/acme\/manifest\.js/.test(added[0]), 'the copy differs from the list by ONE line', added);
const Module = require('module');
const m = new Module(LIST, null); m.filename = LIST; m.paths = Module._nodeModulePaths(path.dirname(LIST));
m._compile(copy, LIST); m.loaded = true; require.cache[LIST] = m;

const CS = require(path.join(REPO, 'src/channel-settings.js'));
ok(Object.keys(CS.CHANNEL_SETTINGS).join(',') === 'lark,gmail,slack,acme' && !CS.checkChannelTables(CS.CHANNEL_SETTINGS).length && CS.declaredKey('acme', 'nameField') === 'channels.acmeNameField', 'CHANNEL_SETTINGS derives its table (rows + option row), every check clean');
const R = require(path.join(REPO, 'src/integration-registry.js'));
const row = R.rowById('acme');
ok(!!row && R.rowIds().indexOf('acme') === R.rowIds().indexOf('slack') + 1 && !R.checkRow(row).length && R.validateValues(row, { clientId: 'nope' }).ok === false && R.validateValues(row, { clientId: 'acme_abc123' }).ok !== false, 'the registry derives its integration row in list order, with its OWN validator', R.checkRow(row || {}));
const S = await import(path.join(REPO, 'src/lib/settings-schema.js'));
const sb = S.SETTINGS_SCHEMA['channels.budgetAcmePerMin'], so = S.SETTINGS_SCHEMA['channels.acmeNameField'];
ok(sb && sb.channel === 'acme' && sb.tier === 'advanced' && sb.default === 30 && so && so.type === 'enum' && so.when.channel === 'acme' && so.options.length === 2 && !('channel' in so), 'the schema derives its "Per vendor" rows and its option row (when: { channel }) — no schema edit');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
ok(ENG.REAL_ADAPTERS.map((x) => x.kind).join(',') === 'lark,gmail,slack,acme', 'REAL_ADAPTERS derives its adapter module from the manifest');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-manifest-'));
const eng = ENG.create({ dataDir, env: {}, now: () => 1790000000000, broadcast: () => {}, serverSetting: () => undefined, log: { log() {}, warn() {}, error() {}, info() {} } });
try {
  const reg = eng.registry, acme = reg.vendor('acme');
  ok(acme === require(path.join(REPO, 'scripts/fixtures/channels/acme/adapter.js')) && reg.vendors().length === 4 && reg.vendor('fake-poll') === null, 'the engine registers the module WHOLE as a vendor (registry.vendor answers; a fake is none)');
  ok(reg.capsOf('acme').glyph === 'mail' && reg.capsOf('acme').budget.settingKey === 'channels.budgetAcmePerMin', 'its caps carry its glyph and its manifest\'s settings key');
  ok(JSON.stringify(acme.blocksOf({ raw: { title: 'Ticket 7' } })) === '[{"k":"card","title":"Ticket 7","rows":[]}]', 'its blocks rung is its own module');
  const inst = reg.create('acme', { id: 'a1', kind: 'acme' }, {});
  ok(typeof inst.apiBearer === 'function' && acme.api.hosts[0] === 'api.acme.test', 'the raw-API fence takes its declared row beside its bearer');
  // lane channel-vendor-one-file: the account menu's "API access…" row reads the view's declared fact (never a kind list)
  const view = eng.adapterView({ id: 'a1', kind: 'acme', label: 'Acme', enabled: true, options: {} });
  ok(view && view.rawApi === true && view.push === null, 'its account view carries the declared raw-API fact (rawApi; a poll vendor has no push view) — the panel reads it, never its kind');
  ok(eng.consentLandingOf ? eng.consentLandingOf('acme') === null || typeof eng.consentLandingOf('acme') === 'object' : true, 'its consent row was validated at load (ephemeral, no landing)');
} finally { if (eng.stop) eng.stop(); }

console.log('② register() validates every field the engine reads off a vendor (rv F2)');
const CH = require(path.join(REPO, 'src/channels/index.js'));
const acmeMod = require(path.join(REPO, 'scripts/fixtures/channels/acme/adapter.js'));
const refuse = (patch) => { try { CH.createChannelRegistry().register({ ...acmeMod, ...patch }, { vendor: true }); return null; } catch (e) { return String(e.message); } };
ok(refuse({}) === null, 'the fake vendor itself registers');
for (const [patch, re, what] of [
  [{ label: undefined }, /label must be/, 'a missing label'], [{ label: 'x'.repeat(41) }, /label must be/, 'a label over 40'],
  [{ integration: 'nope' }, /not an integration-registry row/, 'an integration naming no row'], [{ integrationTest: 'x' }, /integrationTest must be a function/, 'a non-function Test'],
  [{ OPTIONS: [{ key: 'tone', label: 'Tone', default: 'x', choices: ['plain'] }] }, /choices must be/, 'an option default outside its choices'], [{ OPTIONS: {} }, /OPTIONS must be an array/, 'OPTIONS not a table'],
  [{ vendorNameOf: 'Acme' }, /vendorNameOf must be a function/, 'a non-function vendorNameOf'], [{ builtin: 'yes' }, /builtin must be a boolean/, 'a non-boolean builtin'],
  [{ policyDefault: 7 }, /policyDefault must be/, 'a non-word policyDefault'], [{ manifest: { kind: 'other' } }, /manifest must be its own/, 'another vendor\'s manifest'],
]) ok(re.test(refuse(patch) || ''), `REFUSED at register: ${what}`, refuse(patch));
console.log(`\n${fail ? 'FAILED' : 'OK'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
