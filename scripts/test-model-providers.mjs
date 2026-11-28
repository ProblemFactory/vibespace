#!/usr/bin/env node
// test-model-providers — FAST (in-process: the PURE record + the store on a scratch data dir + the two routes on a loopback
// express app over a REAL AccountManager). Design q-053 r1 §1 / §3 / §6 row P0a (lane provider-record; the owner 2026-10-20:
// "区分不同 provider … 如果是无法自动获取的就必须允许用户在配置账号的时候配置可用的模型和 id"). Listed rows come from a
// FIXTURE (scripts/fixtures/provider-models/catalogs.json) — no vendor call anywhere.
//   ① THE EIGHT KINDS × the schema: the closed table, every row's fields, a record of each kind validates; every kind's
//      model-id regex refuses the empty id (THE gate) and accepts its own family's example
//   ② THE BUILT-IN RECORDS: the two first-party subscription presets + the two logins today's roster holds; every account
//      (backend × type, legacy, the machine login, a projected `pv-` row) names one; who lists each
//   ③ THE RECORD SHAPE: the closed fields (a planted value never survives), the row shape
//   ④ CONFIGURED VALIDATION: each field's code, duplicates, aliases land on a row, the default, the record's own rules
//   ⑤ SERVES / RESOLVE over the alias table: a configured provider (default, exact, alias, not served), a DANGLING alias is
//      never passed on, `none` serves nothing, a harness-listed provider (its catalog is a menu: any id of its family), a
//      provider-API list (closed), the same model in two spellings
//   ⑥ RED CONTROLS (patched in-memory copies of src/model-providers.js): a model-id regex that lets the empty id through;
//      an alias resolved to an id NOT IN THE TABLE; the save that lets a dangling alias through
//   ⑦ THE STORE (data/providers.json): put / refuse whole / 0600 / reload / a bad hand-edited record skipped by name / a
//      built-in id refused / setModels (listed ⇒ refused, errors by row and field, zero rows ⇒ none)
//   ⑧ THE ROUTES: every roster account names its provider with its harness's rows; a projected `pv-` row; the save (400 by
//      field, 409 listed, 403 an agent's bearer, 404); ⑨ wiring pins (the routes, the catalogs, the roster's 模型…, Test's id)
//   U1 CURE (lane lg-providers, the coordinator's A/B/C): ⑭ the plain-http rule on the PARSED address (three shapes, three
//      controls), the tail of a short key, the store writer's «failed» undone per act, the vault not set up, a preset's
//      address at the add, «has a key» from the vault's names, the person-only list; ⑨ the change broadcast run for real
//   ⑩–⑬ MODELS AT A SESSION (lane models-at-session = row P0c): the MENU of a provider (open / closed / EMPTY — the law:
//      empty ⇔ no row) with its RED control ⑪ (a copy that never says empty = a silent empty menu); ⑫ a running
//      conversation's pick re-resolved against its provider; ⑬ the listed-provider refresh's rules (the list URL per kind,
//      the vault, once a minute — fetchedAt counts —, one in flight, the credential header, the /models parsers, the 1000 rows)
//   ⑭ THE THIRD-PARTY ROAD (lane lg-providers, B-d578 U1): the SHIPPED presets (each draft a valid record, words without a
//      technical word), fits (the kind decides: claude / codex / opencode-later), the key rules (an Anthropic subscription
//      login refused by name), the store over a REAL vault on a scratch dir (sealed FIRST, the file never holds the key,
//      locked ⇒ nothing written, rekey / patch / remove / keyOf), the doors (a person's only, 201 / 400 / 423 / 404), the
//      refresh's key resolver; RED controls: a fits without the wire rule lets DeepSeek into codex; a key rule without
//      the subscription refusal takes a Claude login; a store that skips the seal writes a record while the vault is locked
//   ⑮ THE PROVIDER TEST (lane lg-providers U4): a FAKE CLI (scripts/fixtures/provider-test/fake-cli.js) reports what it was
//      handed — its homes all fresh and EMPTY (the machine's planted login unreachable), every credential name stripped, the
//      key only where the harness reads it, nothing in argv; the verdicts; the redaction; every refusal by name with NOTHING
//      spawned (a vendor's own host, no address, the vault locked, the key gone, not a person, unfit, in flight); the door;
//      RED controls: the runner without its fresh homes / its address verdict / its key check / its person check
//   ⑯ THE WIZARD AND THE ROSTER (lane lg-providers U5): rosterRowsOf (one row per fitting harness), list().providerRows
//      beside the accounts, THE FIRST SCREEN's words census (RED: a card naming ANTHROPIC_BASE_URL), the wiring pins
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';   // the page doors' controls: ESM copies beside the real files
import { anchored } from './scratch.mjs';   // the tree's control helper (an anchor gone or not unique fails by name)
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/model-providers.js');
const M = require(SRC);
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/provider-models/catalogs.json'), 'utf-8'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const codes = (errs) => errs.map((e) => e.code);
// a patched copy of the PURE module, compiled in memory (never written into the tree)
function mutant(pairs) {
  let s = fs.readFileSync(SRC, 'utf-8');
  for (const [from, to] of pairs) { if (!s.includes(from)) throw new Error('mutant anchor missing: ' + from.slice(0, 80)); s = s.replace(from, to); }
  const m = new Module(SRC); m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC)); m._compile(s, SRC);
  return m.exports;
}
const EXAMPLE = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5.5', google: 'gemini-3-pro-preview', openrouter: 'deepseek/deepseek-chat', any: 'llama3.1:8b' };

// ── ① the eight kinds × the schema ────────────────────────────────────────────────────────────────────────
console.log('① the nine kinds × the schema');
// the design's eight + `anthropic-compatible` (lane lg-providers U1: a third party under its own ids at an Anthropic-compatible address)
const WANT_KINDS = ['anthropic-subscription', 'anthropic-api', 'anthropic-compatible', 'openai-responses', 'openai-chat', 'google-subscription', 'google-api', 'openrouter', 'self-hosted'];
ok(gateOf(eq(M.KIND_IDS, WANT_KINDS)) && M.KINDS.length === 9, `exactly the nine kinds, in order (${M.KIND_IDS.join(' · ')})`);
const kindRowOk = (k) => typeof k.label === 'string' && k.label && ['anthropic', 'openai', 'google', 'openrouter', 'any'].includes(k.family)
  && typeof k.wire === 'string' && Array.isArray(k.harnesses) && k.harnesses.length > 0 && Array.isArray(k.auths) && k.auths.length > 0
  && k.auths.every((a) => M.AUTHS.includes(a)) && typeof k.subscription === 'boolean' && typeof k.keyed === 'boolean'
  && M.MODELS_SOURCES.includes(k.modelsSource) && (k.modelsSource === 'listed' ? M.LISTED_BY.includes(k.listedBy) : k.listedBy === null)
  && k.idPattern instanceof RegExp && typeof k.idHint === 'string' && Object.isFrozen(k);
ok(verdictOf(M.KINDS.every(kindRowOk)), 'every kind row carries the schema (label, family, wire, harnesses, auths ⊂ AUTHS, subscription, keyed, modelsSource / listedBy, idPattern, idHint; frozen)', M.KINDS.filter((k) => !kindRowOk(k)).map((k) => k.id));
ok(gateOf(eq(M.KINDS.filter((k) => k.subscription).map((k) => k.id), ['anthropic-subscription', 'google-subscription'])) && verdictOf(M.KINDS.filter((k) => k.subscription).every((k) => !k.keyed && eq(k.auths, ['oauth']))), 'the two subscription kinds are the first-party ones: no key of ours, the CLI\'s own login (oauth)');
ok(verdictOf(eq(M.KINDS.map((k) => k.harnesses[0]), ['claude', 'claude', 'claude', 'codex', 'opencode', 'gemini', 'gemini', 'codex', 'opencode'])), 'the projection by interface shape: claude ↔ anthropic-*, codex ↔ openai-responses / openrouter, gemini ↔ google-*, opencode ↔ the rest (q-045 §2.2)');
const recordOf = (k) => ({ id: `pv-test-${k.id}`, kind: k.id, label: 'A ' + k.id, auth: k.auths[0], keyRef: k.keyed ? `providers:pv-test-${k.id}#key` : null, modelsSource: k.modelsSource, models: k.modelsSource === 'configured' ? [{ id: EXAMPLE[k.family], label: '', context: '200k', caps: ['tools'] }] : [] });
const perKind = M.KINDS.map((k) => [k.id, codes(M.validateProvider(recordOf(k)))]);
ok(verdictOf(perKind.every(([, c]) => c.length === 0)), 'a record of EACH kind (its defaults + one example row where configured) validates', perKind.filter(([, c]) => c.length));
const emptyRefused = (X) => X.KINDS.every((k) => !k.idPattern.test('') && codes(X.validateModelRow(k.id, { id: '' })).includes('id-pattern'));
ok(verdictOf(emptyRefused(M)), 'every kind\'s model-id regex REFUSES the empty id (validateModelRow says id-pattern) — the regex is the only empty-id gate');
ok(verdictOf(M.KINDS.every((k) => k.idPattern.test(EXAMPLE[k.family]) && !k.idPattern.test(' ' + EXAMPLE[k.family]) && !k.idPattern.test(EXAMPLE[k.family] + ' x'))), 'every kind accepts its family\'s example id and refuses one with a space');
const fam = (id) => M.kindOf(id).idPattern;
ok(!fam('anthropic-api').test('gpt-5') && !fam('google-api').test('claude-opus-5') && !fam('openrouter').test('gpt-5') && !fam('openai-chat').test('GPT-5') && gateOf(fam('self-hosted').test('Qwen/Qwen3-32B')) && !fam('anthropic-subscription').test('claude-'), 'the families are kept apart (anthropic ⇏ gpt-5, google ⇏ claude-, openrouter needs vendor/model, openai is lower-case, self-hosted takes Qwen/…; a bare prefix is not an id)');

// ── ② the built-in records ────────────────────────────────────────────────────────────────────────────────
console.log('② the built-in records');
ok(verdictOf(eq(M.PRESETS.map((p) => p.id), ['pv-anthropic-subscription', 'pv-google-subscription', 'pv-anthropic-api', 'pv-openai-chatgpt'])), 'the built-ins: the two subscription presets §1 names first, then the Console key and the ChatGPT login', M.PRESETS.map((p) => p.id));
ok(verdictOf(M.PRESETS.every((p) => M.validateProvider(p).length === 0 && Object.isFrozen(p) && Object.isFrozen(p.models) && p.keyRef === null && p.modelsSource === 'listed' && p.listedBy === 'harness-cache' && p.preset === p.id.slice(3))), 'every built-in validates, is frozen, names NO key (its account\'s own credential) and is listed by its harness\'s catalog');
ok(M.presetOf('pv-anthropic-subscription').kind === 'anthropic-subscription' && M.presetOf('pv-google-subscription').kind === 'google-subscription' && M.presetOf('pv-openai-chatgpt').kind === 'openai-responses' && M.presetOf('pv-openai-chatgpt').auth === 'oauth', 'the kinds: anthropic-subscription, google-subscription; the ChatGPT login = the Responses wire over oauth');
const acct = (o) => M.accountProviderId(o);
const projTable = [
  [{ id: 'sub-1', backend: 'claude', type: 'subscription' }, 'pv-anthropic-subscription'], [{ id: 'pool-1', backend: 'claude', type: 'pooled' }, 'pv-anthropic-subscription'],
  [{ id: 'acct-1', backend: 'claude', type: 'api' }, 'pv-anthropic-api'], [{ id: 'acct-legacy' }, 'pv-anthropic-api'],
  [{ id: 'cxs-1', backend: 'codex', type: 'subscription' }, 'pv-openai-chatgpt'], [{ id: 'pool-2', backend: 'codex', type: 'pooled' }, 'pv-openai-chatgpt'],
  [{ id: 'gms-1', backend: 'gemini', type: 'subscription' }, 'pv-google-subscription'], [{ backend: 'codex' }, 'pv-openai-chatgpt'], [{ backend: 'claude' }, 'pv-anthropic-subscription'],
  [{ id: 'pv-deadbeef01', backend: 'claude', type: 'provider' }, 'pv-deadbeef01'], [{ id: 'x', backend: 'opencode', type: 'api' }, null], [null, null],
];
ok(verdictOf(projTable.every(([a, want]) => acct(a) === want)), 'every account names its provider: claude sub / pool / Console key / a legacy record (no backend, no type), codex sub / pool, gemini sub, the machine\'s own login, a projected pv- row (its own id), a harness with no account table ⇒ null', projTable.filter(([a, w]) => acct(a) !== w));
ok(verdictOf(Object.values(M.ACCOUNT_PRESETS).every((id) => !!M.presetOf(id))), 'every projection target is a built-in record');
ok(gateOf(eq(M.PRESETS.map(M.listerOf), ['claude', 'gemini', 'claude', 'codex'])) && M.listerOf(recordOf(M.kindOf('openrouter'))) === null, 'who lists each built-in: claude, gemini, claude, codex; a configured record has no lister');

// ── ③ the record shape ────────────────────────────────────────────────────────────────────────────────────
console.log('③ the record shape');
ok(verdictOf(eq(M.PROVIDER_FIELDS, ['id', 'kind', 'label', 'preset', 'baseUrl', 'auth', 'keyRef', 'models', 'defaultModel', 'aliases', 'modelsSource', 'listedBy', 'fetchedAt', 'lastTestAt', 'tail', 'createdAt', 'wire', 'tested'])), 'PROVIDER_FIELDS = §1\'s record, field for field (+ tail, createdAt, a self-hosted one\'s wire — U1 — and the Test\'s verdicts per harness — U4)');
const planted = M.normalizeProvider({ ...recordOf(M.kindOf('openrouter')), key: 'sk-or-v1-planted', apiKey: 'x', token: 'y', models: [{ id: 'a/b', secret: 'z' }] });
ok(gateOf(eq(Object.keys(planted), M.PROVIDER_FIELDS)) && !JSON.stringify(planted).includes('planted') && verdictOf(eq(Object.keys(planted.models[0]), M.MODEL_FIELDS)), 'normalizeProvider keeps EXACTLY the closed fields: a planted key / apiKey / token (and a row\'s extra field) never survive');
ok(gateOf(eq(M.MODEL_FIELDS, ['id', 'label', 'context', 'caps'])) && verdictOf(eq(M.normalizeModelRow({ id: 'gpt-5.5', label: ' ', context: '1M', caps: ['1m', 'tools', 'nope'] }), { id: 'gpt-5.5', label: 'gpt-5.5', context: 1000000, caps: ['tools', '1m'] })), 'a row = id · label (defaults to the id) · context (200k / 1M parsed) · caps (CAPS order, unknown dropped once valid)');
ok(gateOf(eq(M.CAPS, ['tools', 'vision', 'reasoning', '1m'])) && verdictOf(M.CAPS.every((c) => typeof M.CAP_WORDS[c] === 'string')), 'the four capabilities, each with its words');
ok(M.parseContext('200k') === 200000 && M.parseContext('1M') === 1000000 && M.parseContext(' 128000 ') === 128000 && gateOf(Number.isNaN(M.parseContext('big'))) && M.parseContext('') === null && M.formatContext(200000) === '200k' && M.formatContext(1000000) === '1M' && M.formatContext(163840) === '163840', 'context: 200k / 1M / a bare number in, 200k / 1M / the number out');

// ── ④ configured validation ───────────────────────────────────────────────────────────────────────────────
console.log('④ configured validation');
const vr = (k, row) => codes(M.validateModelRow(k, row));
ok(verdictOf(eq(vr('openai-chat', { id: 'gpt-5.5', label: 'GPT', context: '400k', caps: ['tools'] }), [])), 'a good row: no error');
ok(gateOf(eq(vr('openai-chat', { id: '' }), ['id-pattern'])) && gateOf(eq(vr('openai-chat', {}), ['id-pattern'])) && gateOf(eq(vr('openai-chat', { id: 'a'.repeat(129) }), ['id-long'])) && verdictOf(eq(vr('google-api', { id: 'gpt-5' }), ['id-pattern'])), 'the id: empty / missing ⇒ id-pattern, 129 chars ⇒ id-long, another family ⇒ id-pattern');
ok(gateOf(eq(vr('openai-chat', { id: 'x', label: 'l'.repeat(61) }), ['label-long'])) && gateOf(eq(vr('openai-chat', { id: 'x', context: '0' }), ['context-range'])) && gateOf(eq(vr('openai-chat', { id: 'x', context: '10.5M' }), ['context-range'])) && gateOf(eq(vr('openai-chat', { id: 'x', context: 'big' }), ['context-range'])) && gateOf(eq(vr('openai-chat', { id: 'x', context: '10M' }), [])) && gateOf(eq(vr('openai-chat', { id: 'x', caps: ['tools', 'magic'] }), ['caps-unknown'])) && verdictOf(eq(vr('nope', { id: 'x' }), ['kind-unknown'])), 'label > 60, context 0 / > 10M / not a number, an unknown cap, an unknown kind — each by its code (10M itself is fine)');
const vm = M.validateModels('openai-chat', { models: [{ id: 'deepseek-chat' }, { id: 'deepseek-chat' }, { id: 'deepseek-reasoner', context: '64k' }], aliases: { opus: 'deepseek-reasoner', sonnet: 'deepseek-v9', 'bad name': 'deepseek-chat' }, defaultModel: 'deepseek-v9' });
ok(!vm.ok && gateOf(vm.errors.some((e) => e.index === 1 && e.code === 'id-duplicate')) && gateOf(vm.errors.some((e) => e.alias === 'sonnet' && e.code === 'alias-dangling')) && gateOf(vm.errors.some((e) => e.alias === 'bad name' && e.code === 'alias-name')) && gateOf(vm.errors.some((e) => e.code === 'default-dangling')) && verdictOf(eq(vm.value.aliases, { opus: 'deepseek-reasoner' })), 'the save: a duplicate (at its row), an alias to an id NOT IN THE TABLE, a bad alias name, a default not in the list — each named; the good alias kept', vm.errors);
ok(verdictOf(codes(M.validateModels('openai-chat', { models: Array.from({ length: 201 }, (_, i) => ({ id: 'm' + i })) }).errors).includes('too-many')), 'more than 200 rows ⇒ too-many');
const v2 = M.validateModels('openrouter', { models: [{ id: 'deepseek/deepseek-chat', label: '', context: '128k', caps: ['reasoning', 'tools'] }], aliases: { sonnet: 'deepseek/deepseek-chat' }, defaultModel: 'deepseek/deepseek-chat' });
ok(gateOf(v2.ok) && verdictOf(eq(v2.value.models, [{ id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat', context: 128000, caps: ['tools', 'reasoning'] }])), 'a good save: the rows as kept (label = id, context in tokens, caps in order)');
const rec = (o) => codes(M.validateProvider({ ...recordOf(M.kindOf('openrouter')), ...o }));
ok(gateOf(eq(rec({ models: [], modelsSource: 'configured' }), ['configured-empty'])) && gateOf(eq(rec({ modelsSource: 'none' }), ['none-has-models'])) && gateOf(eq(rec({ modelsSource: 'listed', listedBy: null }), ['listed-by'])) && gateOf(rec({ keyRef: 'sk-or-v1-abcdef' }).includes('key-ref')) && gateOf(eq(rec({ keyRef: 'providers:pv-x#key' }), [])) && gateOf(eq(rec({ baseUrl: 'ftp://x' }), ['base-url'])) && gateOf(eq(rec({ baseUrl: 'https://openrouter.ai/api/v1' }), [])) && gateOf(eq(rec({ auth: 'oauth' }), ['auth-kind'])) && gateOf(eq(rec({ id: 'acct-1' }), ['provider-id'])) && verdictOf(eq(rec({ label: '' }), ['label-long'])), 'the record: configured with no row, none with rows, listed with no lister, a KEY VALUE where a vault entry belongs, a bad base URL, an auth the kind has not, a non-pv id, no label — each refused by its code');
ok(verdictOf(codes(M.validateProvider({ ...recordOf(M.kindOf('openrouter')), aliases: { opus: 'nope/none' } })).includes('alias-dangling')), 'the record\'s aliases land on its rows, or it is refused');

// ── ⑤ serves / resolve over the alias table ───────────────────────────────────────────────────────────────
console.log('⑤ servesModel / resolveModel over the alias table');
const ds = M.normalizeProvider({ id: 'pv-deepseek', kind: 'openai-chat', label: 'DeepSeek', modelsSource: 'configured', models: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }], aliases: { opus: 'deepseek-reasoner', sonnet: 'deepseek-chat', haiku: 'deepseek-chat' }, defaultModel: 'deepseek-chat' });
ok(M.validateProvider(ds).length === 0, 'the fixture record (DeepSeek-like: two rows, three claude-side aliases, a default) validates');
const R = (p, m) => M.resolveModel(p, m);
ok(R(ds, '') === 'deepseek-chat' && R(ds, null) === 'deepseek-chat' && R(ds, 'deepseek-reasoner') === 'deepseek-reasoner' && R(ds, 'opus') === 'deepseek-reasoner' && R(ds, 'sonnet') === 'deepseek-chat', 'resolve: \'\' = its default; an exact row; an alias → ITS row (opus → deepseek-reasoner, sonnet → deepseek-chat)');
ok(R(ds, 'gpt-5') === null && !M.servesModel(ds, 'gpt-5') && !M.servesModel(ds, 'claude-opus-5') && gateOf(M.servesModel(ds, 'opus')) && verdictOf(M.servesModel(ds, '')), 'servesModel: an id it has not ⇒ false (§2 rule 1: not a candidate); an alias it maps ⇒ true');
const dangling = { ...ds, aliases: { ...ds.aliases, opus: 'deepseek-v9' } };
const danglingRefused = (X) => X.resolveModel(dangling, 'opus') === null && !X.servesModel(dangling, 'opus');
ok(verdictOf(danglingRefused(M)), 'a DANGLING alias (opus → an id not in the table, a record built past validation) resolves to NOTHING — never passed on to the harness');
ok(R({ ...ds, defaultModel: '' }, '') === 'deepseek-chat' && R({ ...ds, defaultModel: 'gone' }, '') === null, 'no default ⇒ the first row; a default not in the table ⇒ nothing');
const none = M.normalizeProvider({ id: 'pv-none', kind: 'self-hosted', label: 'Box', modelsSource: 'none' });
ok(M.validateProvider(none).length === 0 && R(none, '') === null && R(none, 'llama3.1:8b') === null && M.modelsOf(none).length === 0, '`none` serves nothing (never a silent empty menu: P0c says so)');
const claudeSub = M.withListed(M.presetOf('pv-anthropic-subscription'), FIX.harness.claude);
ok(claudeSub.models.length === FIX.harness.claude.length - 1 && !claudeSub.models.some((m) => m.id === '') && verdictOf(eq(claudeSub.models.find((m) => m.id === 'opus[1m]'), { id: 'opus[1m]', label: 'opus[1m] (latest, 1M context)', context: 1000000, caps: ['1m'] })), 'a harness-listed record filled from the FIXTURE catalog: the Default row dropped, `[1m]` ⇒ 1M + the cap', claudeSub.models.slice(0, 3));
ok(R(claudeSub, '') === '' && R(claudeSub, 'opus') === 'opus' && R(claudeSub, 'opus[1m]') === 'opus[1m]' && R(claudeSub, 'claude-opus-5-5') === 'claude-opus-5-5' && R(claudeSub, 'claude-haiku-4-5') === 'claude-haiku-4-5-20251001' && R(claudeSub, 'gpt-5') === null && R(claudeSub, 'deepseek-chat') === null, 'harness-listed: \'\' = the harness\'s own default; its aliases; ANY claude- id (the catalog is a menu, the CLI runs its vendor\'s ids); a dated snapshot found; another family ⇒ not served');
ok(verdictOf(eq(M.listedRows([{ id: '' }, { id: 'a' }, { id: 'a' }, { id: 'b c' }, null, { id: 'x'.repeat(129) }]).map((r) => r.id), ['a'])), 'listedRows drops the empty, the repeated, the spaced, the null and the over-long');
const orApi = M.normalizeProvider({ id: 'pv-or', kind: 'openrouter', label: 'OpenRouter', modelsSource: 'listed', listedBy: 'provider-api', models: FIX.providerApi.openrouter, fetchedAt: 1792400000000 });
ok(M.validateProvider(orApi).length === 0 && R(orApi, 'anthropic/claude-sonnet-4.5') === 'anthropic/claude-sonnet-4.5' && R(orApi, 'qwen/qwen3-coder:free') === 'qwen/qwen3-coder:free' && R(orApi, 'anthropic/claude-sonnet-9') === null && M.listerOf(orApi) === null, 'a provider-API list (the fixture\'s OpenRouter rows) is CLOSED: its rows resolve, an unlisted id of the same shape does not');
ok(gateOf(M.sameModel('opus[1m]', 'opus')) && gateOf(M.sameModel('Claude-Opus-5', 'opus-5')) && gateOf(M.sameModel('gpt-5.5-2026-01-20', 'gpt-5.5')) && !M.sameModel('gpt-5-mini', 'gpt-5') && !M.sameModel('', 'x'), 'the same model spelled two ways: [1m], claude-, case, a dated snapshot — never a sibling (gpt-5-mini ≠ gpt-5)');
const src = M.sourceOf;
ok(gateOf(eq(src(claudeSub), { key: 'Listed by {harness}', params: { harness: 'claude' } })) && src(orApi).key === 'Listed by the provider' && src(ds).key === 'Entered by you' && src(none).key === 'No models configured for this provider', 'the source in words: listed by its harness / by the provider, entered by you, none configured');

// ── ⑥ RED controls ────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ RED controls (patched in-memory copies)');
const m1 = mutant([['  openai: /^[a-z0-9][a-z0-9.-]*$/,', '  openai: /^[a-z0-9.-]*$/,']]);
ok(gateOf(emptyRefused(M)) && !emptyRefused(m1) && verdictOf(eq(codes(m1.validateModelRow('openai-chat', { id: '' })), [])), 'MUTANT: the openai model-id regex with `*` lets the EMPTY id through ⇒ ① "every kind refuses the empty id" goes RED (the real one: green)');
const m2 = mutant([['    return rows.some((r) => r.id === to) ? to : null;', '    return to;']]);
ok(gateOf(danglingRefused(M)) && !danglingRefused(m2) && m2.resolveModel(dangling, 'opus') === 'deepseek-v9', 'MUTANT: resolveModel passing an alias on without the table ⇒ opus resolves to deepseek-v9, an id NOT IN THE TABLE ⇒ ⑤ goes RED (the real one: green)');
const m3 = mutant([["    if (!models.some((m) => m.id === target)) { errors.push({ alias: name, field: 'aliases', code: 'alias-dangling' }); continue; }\n", '']]);
const savesDangling = (X) => X.validateModels('openai-chat', { models: [{ id: 'deepseek-chat' }], aliases: { opus: 'deepseek-v9' } }).ok;
ok(!savesDangling(M) && verdictOf(savesDangling(m3)), 'MUTANT: the save without the alias check accepts opus → deepseek-v9 ⇒ RED (the real one refuses it)');

// ── ⑦ the store ───────────────────────────────────────────────────────────────────────────────────────────
console.log('⑦ the store (data/providers.json)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvrec-'));
const DATA = path.join(dir, 'data'); fs.mkdirSync(DATA);
const logs = [];
const catalogOf = (h) => FIX.harness[h] || null;
const PS = require(path.join(ROOT, 'src/server/provider-store.js'));
let store = PS.create({ dataDir: DATA, catalogOf, log: (m) => logs.push(m) });
ok(store.list().length === 4 && store.get('pv-anthropic-subscription').models.length === 11 && store.get('pv-openai-chatgpt').models.length === 3 && store.get('pv-google-subscription').models.length === 3 && !fs.existsSync(store.file), 'a fresh store: the four built-ins, each filled from its harness\'s catalog NOW; nothing written');
const r1 = store.put({ id: 'pv-deepseek', kind: 'openai-chat', label: 'DeepSeek', keyRef: 'providers:pv-deepseek#key', modelsSource: 'configured', models: [{ id: 'deepseek-chat', context: '64k' }], aliases: { sonnet: 'deepseek-chat' } });
const d1 = await store.durable();   // the store writer's thread writes it; a person's act awaits the disk (lane lg-providers U1 cure (C))
const st1 = fs.statSync(store.file);
const disk1 = JSON.parse(fs.readFileSync(store.file, 'utf-8'));
ok(gateOf(r1.ok) && d1 === true && (st1.mode & 0o777) === 0o600 && disk1.v === 1 && disk1.providers.length === 1 && disk1.providers[0].models[0].context === 64000 && verdictOf(eq(Object.keys(disk1.providers[0]), M.PROVIDER_FIELDS)), 'put: written whole (v 1, 0600), the closed fields, the row as kept', { mode: (st1.mode & 0o777).toString(8) });
const before = fs.readFileSync(store.file, 'utf-8');
const r2 = store.put({ id: 'pv-bad', kind: 'openai-chat', label: 'Bad', modelsSource: 'configured', models: [{ id: '' }] });
const r3 = store.put({ id: 'pv-anthropic-subscription', kind: 'anthropic-subscription', label: 'Mine' });
ok(!r2.ok && gateOf(r2.errors.some((e) => e.code === 'id-pattern' && e.index === 0)) && !r3.ok && r3.errors[0].code === 'built-in-id' && fs.readFileSync(store.file, 'utf-8') === before, 'put refuses WHOLE: an empty model id (by row), a built-in id — the file is unchanged');
ok(store.setModels('pv-anthropic-subscription', { models: [{ id: 'claude-x-1' }] }).code === 'listed' && store.setModels('pv-nope', { models: [] }).code === 'unknown', 'setModels on a built-in ⇒ listed (its harness owns the rows); an unknown id ⇒ unknown');
const r4 = store.setModels('pv-deepseek', { models: [{ id: 'deepseek-chat' }, { id: 'Deep Seek' }], aliases: {} });
ok(!r4.ok && r4.code === 'invalid' && gateOf(eq(r4.errors, [{ index: 1, field: 'id', code: 'id-pattern' }])) && fs.readFileSync(store.file, 'utf-8') === before, 'setModels with a bad row ⇒ invalid, the error at row 1 / field id; nothing written', r4);
const r5 = store.setModels('pv-deepseek', { models: [{ id: 'deepseek-chat', label: 'V3' }, { id: 'deepseek-reasoner', caps: ['reasoning'] }], aliases: { opus: 'deepseek-reasoner' }, defaultModel: 'deepseek-chat' });
ok(gateOf(r5.ok) && r5.provider.modelsSource === 'configured' && r5.provider.models.length === 2 && gateOf(eq(r5.provider.aliases, { opus: 'deepseek-reasoner' })) && gateOf(store.editable('pv-deepseek')) && !store.editable('pv-anthropic-subscription'), 'setModels: saved as configured; only a kept, unlisted record is editable');
await store.durable();
store = PS.create({ dataDir: DATA, catalogOf, log: (m) => logs.push(m) });
ok(gateOf(eq(store.get('pv-deepseek').models.map((m) => m.id), ['deepseek-chat', 'deepseek-reasoner'])) && store.get('pv-deepseek').defaultModel === 'deepseek-chat', 'a new store over the same file reads the record back');
const r6 = store.setModels('pv-deepseek', { models: [] });
ok(gateOf(r6.ok) && r6.provider.modelsSource === 'none' && r6.provider.models.length === 0 && M.validateProvider(r6.provider).length === 0, 'zero rows ⇒ the record says none (never an empty configured)');
store.put({ id: 'pv-ds2', kind: 'openai-chat', label: 'DS2', modelsSource: 'configured', models: [{ id: 'deepseek-chat' }] });
await store.durable();
const hand = JSON.parse(fs.readFileSync(store.file, 'utf-8'));
hand.providers.push({ id: 'pv-hand', kind: 'openrouter', label: 'Hand', modelsSource: 'configured', models: [{ id: '' }] }, { id: 'pv-anthropic-api', kind: 'anthropic-api', label: 'Shadow' });
fs.writeFileSync(store.file, JSON.stringify(hand));
logs.length = 0;
store = PS.create({ dataDir: DATA, catalogOf, log: (m) => logs.push(m) });
ok(store.get('pv-hand') === null && store.get('pv-ds2') !== null && store.get('pv-anthropic-api').label === 'Anthropic API (Console key)' && gateOf(logs.some((l) => l.includes('"pv-hand"') && l.includes('id-pattern'))) && verdictOf(logs.some((l) => l.includes('"pv-anthropic-api"') && l.includes('built-in-id'))), 'load: a hand-edited bad record is SKIPPED BY NAME in the log (never half-read); a record shadowing a built-in is skipped; the good one stays', logs);

// ── ⑧ the routes over a real AccountManager ─────────────────────────────────────────────────────────────────
console.log('⑧ the routes');
const express = require(path.join(ROOT, 'node_modules/express'));
const { AccountManager } = require(path.join(ROOT, 'src/accounts.js'));
const am = new AccountManager({ dataDir: DATA });
const sub = am.createSubscription({ name: 'Work Max' }).id;
const cx = am.createCodexSubscription({ name: 'Plus' }).id;
const key = am.add({ name: 'Console', key: 'sk-ant-api03-' + 'q'.repeat(40) }).id;
const app = express();
app.use(express.json());
require(path.join(ROOT, 'src/routes/account-models.js')).registerAccountModelRoutes(app, { accounts: am, providers: store });
const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
const base = `http://127.0.0.1:${srv.address().port}`;
const get = async (id) => { const r = await fetch(`${base}/api/accounts/${encodeURIComponent(id)}/models`); return [r.status, await r.json()]; };
const put = async (id, body, headers = {}) => { const r = await fetch(`${base}/api/accounts/${encodeURIComponent(id)}/models`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
try {
  const [s1, a1] = await get(sub);
  ok(s1 === 200 && a1.account.id === sub && a1.account.backend === 'claude' && a1.provider.id === 'pv-anthropic-subscription' && gateOf(a1.provider.models.some((m) => m.id === 'opus[1m]')) && a1.editable === false, 'a claude subscription names Anthropic subscription, its rows = claude\'s catalog, not editable', { s1, p: a1.provider && a1.provider.id });
  const [, a2] = await get(cx);
  const [, a3] = await get(key);
  ok(a2.provider.id === 'pv-openai-chatgpt' && gateOf(eq(a2.provider.models.map((m) => m.id), ['gpt-5.5', 'gpt-5.5-codex', 'gpt-5.5-mini'])) && a3.provider.id === 'pv-anthropic-api' && a3.provider.models.length === 11 && !JSON.stringify(a3).includes('qqqq'), 'a ChatGPT login names its provider with codex\'s catalog; the Console key names Anthropic API (and the answer carries no key)');
  const [s4, a4] = await get('pv-ds2');
  ok(s4 === 200 && a4.account.type === 'provider' && a4.provider.kind === 'openai-chat' && a4.editable === true && !('keyRef' in a4.provider) && !('baseUrl' in a4.provider) && !('tail' in a4.provider) && a4.provider.refreshable === false, 'a projected third-party row (pv-…): its record, editable — never where the vault keeps its key, its address or its tail (a GET from the person\'s plain-http page carries no Origin: this door answers what anyone may read; U1 cure (B))');
  store.put({ id: 'pv-lst1', kind: 'self-hosted', label: 'Lst', preset: 'other', baseUrl: 'https://llm.example.test/v1', keyRef: null, wire: 'openai-chat', modelsSource: 'listed', listedBy: 'provider-api' });
  const [sl, al] = await get('pv-lst1');
  ok(sl === 200 && al.provider.refreshable === true && !('baseUrl' in al.provider) && M.refreshable({ ...al.provider, refreshable: undefined }) === false, 'a LISTED self-hosted record (its own address): the GET answers refreshable true, decided on the server off the whole record — the stripped record alone would say false (the read, R7)', al.provider && al.provider.refreshable);
  const [s5, a5] = await put('pv-ds2', { models: [{ id: 'deepseek-chat' }, { id: '' }] });
  ok(s5 === 400 && a5.code === 'invalid' && verdictOf(eq(a5.errors, [{ index: 1, field: 'id', code: 'id-pattern' }])), 'PUT a row with an empty id ⇒ 400, the refusal at row 1 / field id (the dialog marks it)', a5);
  const [s6, a6] = await put('pv-ds2', { models: [{ id: 'deepseek-chat', context: '64k', caps: ['tools'] }, { id: 'deepseek-reasoner' }], aliases: { opus: 'deepseek-reasoner' } });
  ok(s6 === 200 && gateOf(a6.ok) && a6.provider.models[0].context === 64000 && JSON.parse(fs.readFileSync(store.file, 'utf-8')).providers.find((p) => p.id === 'pv-ds2').models.length === 2, 'PUT good rows ⇒ 200, written to data/providers.json before the answer');
  const [s7, a7] = await put(sub, { models: [{ id: 'claude-x-1' }] });
  const [s8, a8] = await put('pv-ds2', { models: [{ id: 'deepseek-chat' }] }, { Authorization: 'Bearer vsst_planted' });
  const [s9] = await get('acct-nobody');
  ok(s7 === 409 && a7.code === 'listed' && s8 === 403 && a8.code === 'agent_forbidden' && s9 === 404, 'PUT on a listed account ⇒ 409 listed; an agent\'s bearer ⇒ 403 (the owner enters models); an unknown id ⇒ 404');
} finally { srv.close(); }

// ── ⑨ wiring pins ──────────────────────────────────────────────────────────────────────────────────────────
console.log('⑨ wiring pins');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf-8');
const aur = read('src/server/account-usage-routes.js');
ok(gateOf(/require\('\.\/provider-store\.js'\)\.create\(\{ dataDir: path\.join\(rootDir, 'data'\), catalogOf:/.test(aur)) && verdictOf(aur.includes("require('../routes/account-models.js').registerAccountModelRoutes(app, { accounts, providers });")), 'account-usage-routes makes the ONE store (data/providers.json, the harness catalogs) and registers the two routes');
// THE CHANGE BROADCAST'S WIRING (U1 cure — a leg for what had none): the hub's own onChange line, RUN with a stand-in
// broadcastAll and a REAL AccountManager — a provider write tells every page (providers-changed) AND re-announces the
// account lists (the rosters it fits read them)
{
  const OC = "registerProviderRoutes(app, { providers, tester, onChange: ";
  const line = aur.split('\n').find((l) => l.includes(OC));
  if (!line) throw new Error('the anchor of the broadcast leg (the onChange line) is not in the source');
  const body = line.slice(line.indexOf(OC) + OC.length, line.lastIndexOf(' });'));
  const wire = (text) => { const sent = [], lists = []; const bd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvbc-')); const acc = new AccountManager({ dataDir: bd, onChange: (l) => lists.push(l) }); const f = new Function('broadcastAll', 'accounts', `return (${text});`)((m) => sent.push(m), acc); f({ what: 'add', id: 'pv-bc1' }); fs.rmSync(bd, { recursive: true, force: true }); return { sent, lists }; };
  const w = wire(body);
  ok(gateOf(eq(w.sent, [{ type: 'providers-changed', what: 'add', id: 'pv-bc1' }])) && w.lists.length === 1 && verdictOf(Array.isArray(w.lists[0].accounts)), 'THE BROADCAST: a provider write sends providers-changed (what + id) to every page and the account manager re-announces its lists once', w);
  const cut = body.replace("broadcastAll({ type: 'providers-changed', what, id });", '');
  const wc = cut !== body ? wire(cut) : null;
  ok(!!wc && wc.sent.length === 0 && wc.lists.length === 1, 'CONTROL: the line without its broadcast tells no page ⇒ the broadcast leg goes RED');
}
ok(verdictOf(read('server.js').includes('getModels: () => AVAILABLE_MODELS,')), 'server.js hands the routes the live harness catalogs (AVAILABLE_MODELS)');
const ma = read('src/lib/manage-agents.js');
const items = ma.match(/items\.push\(\{ label: t\('Models…'\)[^\n]*openAccountModelsDialog\(\{ accountId: id, name: a\?\.name \|\| '', onTest: \(model\) => doTest\(model\) \}\) \}\);/g) || [];
ok(items.length === 2 && (ma.match(/const doTest = \(model = ''\) => \{/g) || []).length === 2 && (ma.match(/ephemeral: true, hostId: selectedHost \|\| undefined, \.\.\.\(model \? \{ model \} : \{\}\) \}\);/g) || []).length === 2, 'both rosters\' ⋯ carry 模型… (the dialog with the roster\'s own Test), and Test hands THE ROW\'S id to the session it opens');
const dlg = read('src/lib/account-models.js');
ok(gateOf(/from '\.\.\/model-providers\.js'/.test(dlg)) && gateOf(dlg.includes('validateModels(st.provider.kind, input)')) && gateOf(dlg.includes("onTest(row.id.trim())")) && !/disabled/.test(dlg), 'the dialog checks with the PURE rules before the save, tests with the row\'s id, greys nothing');

// ── ⑩–⑬ MODELS AT A SESSION (lane models-at-session = q-053 Train 1 row P0c): the menu, the pick, the refresh's rules ─────
console.log('⑩ the menu of a provider (a new conversation\'s model menu, a running one\'s badge list)');
const ANS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/provider-models/models-answers.json'), 'utf-8'));
const CLAUDE = FIX.harness.claude;
const cfg = M.normalizeProvider({ id: 'pv-ds', kind: 'self-hosted', label: 'DeepSeek', modelsSource: 'configured', models: [{ id: 'deepseek-chat', label: 'Chat', context: '128k', caps: ['tools'] }, { id: 'deepseek-reasoner', caps: ['reasoning'] }], aliases: { fast: 'deepseek-chat' }, defaultModel: 'deepseek-reasoner' });
const orFresh = M.normalizeProvider({ id: 'pv-or', kind: 'openrouter', label: 'OpenRouter', keyRef: 'integrations:openrouter#apiKey', modelsSource: 'listed', listedBy: 'provider-api' });
const orListed = M.normalizeProvider({ ...orFresh, models: M.parseListed(ANS.openrouter).rows, fetchedAt: 1792490000000 });
const noneRec = M.normalizeProvider({ id: 'pv-nothing', kind: 'openai-chat', label: 'Nothing', modelsSource: 'none' });
const MENUS = [
  ['no provider (a harness with no account table)', null, CLAUDE, { open: true, empty: false, first: '', n: CLAUDE.length, defaultId: '' }],
  ['a harness-listed preset (Anthropic subscription)', M.presetOf('pv-anthropic-subscription'), CLAUDE, { open: true, empty: false, first: '', n: CLAUDE.length, defaultId: '' }],
  ['a harness-listed preset with no catalog yet (gemini before its table)', M.presetOf('pv-google-subscription'), null, { open: true, empty: false, first: '', n: 1, defaultId: '' }],
  ['a configured record', cfg, CLAUDE, { open: false, empty: false, first: 'deepseek-chat', n: 2, defaultId: 'deepseek-reasoner' }],
  ['a provider-listed record, fetched', orListed, CLAUDE, { open: false, empty: false, first: 'deepseek/deepseek-chat-v3.1', n: 3, defaultId: 'deepseek/deepseek-chat-v3.1' }],
  ['a provider-listed record never fetched', orFresh, CLAUDE, { open: false, empty: true, first: undefined, n: 0, defaultId: null }],
  ['a record that says none', noneRec, CLAUDE, { open: false, empty: true, first: undefined, n: 0, defaultId: null }],
];
for (const [what, p, cat, want] of MENUS) {
  const m = M.menuOf(p, cat);
  ok(m.open === want.open && m.empty === want.empty && (m.models[0] && m.models[0].id) === want.first && m.models.length === want.n && m.defaultId === want.defaultId, `menuOf — ${what}: ${want.empty ? 'EMPTY (the one line)' : `${want.n} row(s), ${want.open ? 'open (Custom… stays)' : 'closed (exactly the rows)'}`}`, m);
}
ok(verdictOf(eq(M.menuOf(M.presetOf('pv-openai-chatgpt'), [{ id: 'gpt-5.5', label: 'gpt-5.5', efforts: ['low', 'ultra'] }]).models, [{ id: '', label: 'Default' }, { id: 'gpt-5.5', label: 'gpt-5.5', efforts: ['low', 'ultra'] }])), 'a harness-listed menu keeps the harness\'s own rows WHOLE (codex\'s per-model efforts ride on) and leads with its Default');
// THE LAW: never a silent empty menu — on every menu, `empty` ⇔ no row (the surface draws the one line exactly then)
const law = (MP) => MENUS.every(([, p, cat]) => { const m = MP.menuOf(p, cat); return m.empty === (m.models.length === 0); });
ok(verdictOf(law(M)), 'THE LAW on every menu above: empty ⇔ no row (the surface\'s one line is drawn exactly when nothing could be picked)');
ok(M.MENU_EMPTY === 'No models configured for this provider — set up', 'the one line\'s words: "No models configured for this provider — set up" (zh 此提供方未配置模型 — 去设置)');

console.log('⑪ RED control: an empty menu (a patched copy of menuOf that never says empty)');
const m4 = mutant([['  if (!rows.length) return { models: [], empty: true, open: false, defaultId: null };\n', '']]);
const silent = m4.menuOf(noneRec, CLAUDE);
ok(!law(m4) && silent.empty === false && silent.models.length === 0, 'CONTROL: the copy without the empty branch hands a `none` provider\'s menu out as {models: [], empty: false} — a SILENT EMPTY MENU — and the law above goes RED on it', silent);

console.log('⑫ a running conversation\'s pick, re-resolved against its provider');
ok(gateOf(eq(M.resolvePick(cfg, 'fast'), { ok: true, model: 'deepseek-chat' })) && gateOf(eq(M.resolvePick(cfg, 'DeepSeek-Chat'), { ok: true, model: 'deepseek-chat' })) && verdictOf(eq(M.resolvePick(cfg, 'deepseek-reasoner'), { ok: true, model: 'deepseek-reasoner' })), 'a configured provider: an alias lands on its row\'s id, another spelling on the row\'s own, a row as itself');
ok(gateOf(eq(M.resolvePick(cfg, 'gpt-9'), { ok: false, code: 'not-served' })) && verdictOf(eq(M.resolvePick(noneRec, 'x'), { ok: false, code: 'not-served' })), 'an id the provider does not serve is refused (never sent); `none` serves nothing');
ok(gateOf(eq(M.resolvePick(M.withListed(M.presetOf('pv-anthropic-subscription'), CLAUDE), 'opus'), { ok: true, model: 'opus' })) && gateOf(eq(M.resolvePick(M.withListed(M.presetOf('pv-anthropic-subscription'), CLAUDE), 'opusplan'), { ok: true, model: 'opusplan' })) && verdictOf(eq(M.resolvePick(null, ' gpt-x '), { ok: true, model: 'gpt-x' })), 'a harness-listed provider passes what it cannot resolve to the harness (its own aliases — opusplan — are the CLI\'s to judge, as before); no provider ⇒ as typed');

console.log('⑬ the listed-provider refresh — its rules (the request itself: src/server/provider-models.js, test-provider-models)');
ok(gateOf(eq(M.LISTABLE_KINDS, ['openrouter', 'openai-chat', 'openai-responses', 'self-hosted'])) && M.modelsEndpointOf(orFresh) === 'https://openrouter.ai/api/v1/models' && M.modelsEndpointOf({ kind: 'openai-chat', baseUrl: 'http://127.0.0.1:9/v1/' }) === 'http://127.0.0.1:9/v1/models' && M.modelsEndpointOf({ kind: 'openai-chat' }) === null && M.modelsEndpointOf({ kind: 'anthropic-api', baseUrl: 'https://x.test/v1' }) === null && M.modelsEndpointOf({ kind: 'google-api', baseUrl: 'https://x.test' }) === null, 'the list\'s URL: an OpenAI-compatible kind\'s <base>/models (OpenRouter\'s own base when none is named); no base, or a kind that lists no such way ⇒ none');
ok(gateOf(M.refreshable(orFresh)) && !M.refreshable(cfg) && !M.refreshable(noneRec) && !M.refreshable(M.presetOf('pv-anthropic-subscription')), 'only a record its PROVIDER lists is refreshed (configured, none, a harness-listed built-in: never)');
const T0 = 1792494000000;
const V = (o) => M.refreshVerdict({ provider: orFresh, vault: 'unlocked', now: T0, ...o });
ok(verdictOf(eq(V({}), { ok: true, url: 'https://openrouter.ai/api/v1/models' })), 'unlocked, never asked ⇒ the press asks — at the record\'s list URL');
ok(V({ vault: 'locked' }).code === 'vault_locked' && V({ vault: 'not_set_up' }).code === 'vault_not_set_up' && V({ vault: undefined }).code === 'vault_locked', 'GATE the vault: locked (or unknown) ⇒ vault_locked; not set up ⇒ vault_not_set_up — before anything is read or sent');
ok(gateOf(eq(V({ lastAt: T0 - 59000 }), { ok: false, code: 'cooldown', retryAfterMs: 1000 })) && gateOf(V({ lastAt: T0 - 60000 }).ok) && verdictOf(eq(M.refreshVerdict({ provider: { ...orFresh, fetchedAt: T0 - 30000 }, vault: 'unlocked', now: T0 }), { ok: false, code: 'cooldown', retryAfterMs: 30000 })), 'GATE once a minute per provider: an attempt 59 s ago ⇒ cooldown (1 s left); 60 s ⇒ asks; the KEPT fetchedAt counts too (a restart does not reopen it)');
ok(V({ inFlight: true }).code === 'in-flight' && M.refreshVerdict({ provider: cfg, vault: 'unlocked', now: T0 }).code === 'not-listed' && M.refreshVerdict({ provider: null, vault: 'unlocked', now: T0 }).code === 'unknown', 'one in flight; a record its provider does not list ⇒ not-listed; none ⇒ unknown');
ok(gateOf(eq(M.authHeaders(orFresh, 'k1'), { authorization: 'Bearer k1' })) && gateOf(eq(M.authHeaders({ auth: 'x-api-key' }, 'k2'), { 'x-api-key': 'k2' })) && verdictOf(eq(M.authHeaders(orFresh, null), {})), 'the credential header follows the record\'s auth (bearer · x-api-key); no key ⇒ none');
const pOR = M.parseListed(ANS.openrouter), pOA = M.parseListed(ANS.openai);
ok(gateOf(pOR.ok) && pOR.skipped === 3 && gateOf(eq(pOR.rows.map((r) => r.id), ['deepseek/deepseek-chat-v3.1', 'anthropic/claude-sonnet-4.5', 'qwen/qwen3-coder:free'])) && gateOf(eq(pOR.rows[1], { id: 'anthropic/claude-sonnet-4.5', label: 'Anthropic: Claude Sonnet 4.5', context: 1000000, caps: ['tools', 'vision', 'reasoning', '1m'] })) && verdictOf(eq(pOR.rows[0].caps, ['tools'])), 'an OpenRouter list: its name, context and caps (tools · image input · reasoning · 1M) per row; an empty id, a spaced id and a repeat skipped (counted)', pOR);
ok(gateOf(pOA.ok) && gateOf(eq(pOA.rows, [{ id: 'gpt-5.5', label: 'gpt-5.5', context: null, caps: [] }, { id: 'gpt-5.5-mini', label: 'gpt-5.5-mini', context: null, caps: [] }])) && M.parseListed({ models: [] }).code === 'bad-answer' && M.parseListed(null).code === 'bad-answer', 'an OpenAI-compatible list: the ids as rows; an answer that is no list ⇒ bad-answer');
const many = { data: Array.from({ length: 1005 }, (_, i) => ({ id: `v/m-${i}` })) };
const pMany = M.parseListed(many);
ok(pMany.rows.length === M.REFRESH.maxRows && pMany.skipped === 5 && M.validateProvider({ ...orFresh, models: pMany.rows }).length === 0 && gateOf(codes(M.validateProvider({ ...orFresh, models: [...pMany.rows, { id: 'v/x' }] })).includes('too-many')) && verdictOf(codes(M.validateProvider({ ...cfg, models: pMany.rows.slice(0, 201) })).includes('too-many')), `a provider may list up to ${M.REFRESH.maxRows} rows (more are skipped, counted); an owner's configured table stays at ${M.MODELS_MAX}`);
ok(M.validateProvider(orFresh).length === 0 && verdictOf(codes(M.validateProvider({ ...orFresh, keyRef: 'sk-or-v1-abcdef' })).includes('key-ref')), 'a key named by its Vault reference — an Integrations row\'s `apiKey` field (integrations:openrouter#apiKey) — validates; a key VALUE still never does');
ok(M.accountProviderId({ id: 'acct-1', backend: 'claude', type: 'api', providerId: 'pv-ds' }) === 'pv-ds' && M.accountProviderId({ id: 'acct-1', backend: 'claude', type: 'api', providerId: 'evil/../x' }) === 'pv-anthropic-api', 'an account that NAMES its third-party provider (providerId — the pool\'s member lookup reads the same field) rides it; a malformed name is ignored');
ok(M.REFRESH.cooldownMs === 60000 && M.REFRESH.timeoutMs === 15000 && M.REFRESH.maxBytes === 1048576 && Object.keys(M.REFRESH_WORDS).length === 14, 'the door\'s numbers: once a minute, 15 s, 1 MB; every refusal has its words (14 with write-failed — lane lg-providers U1 cure)');

// ── ⑭ THE THIRD-PARTY ROAD (lane lg-providers, B-d578 U1) ──────────────────────────────────────────────────
console.log('⑭ the third-party road: shipped presets, fits, the key, the store over a real vault, the doors');
const TECH = /https?:|ANTHROPIC_|OPENAI_|base[_ ]?url|\bapi\b|\benv\b|token|\bwire\b|responses/i;   // the wizard's first screen says none of these
ok(gateOf(eq(M.SHIPPED.map((p) => p.id), ['deepseek', 'kimi', 'glm', 'minimax', 'openrouter', 'other'])) && verdictOf(/^\d{4}-\d{2}-\d{2}$/.test(M.SHIPPED_AT)), `the shipped presets (dated ${M.SHIPPED_AT}): DeepSeek · Kimi · GLM · MiniMax · OpenRouter · other / self-hosted`);
const shipBad = M.SHIPPED.filter((p) => { const d = M.draftOf(p.id, { baseUrl: p.baseRequired ? 'http://127.0.0.1:9/v1' : null, model: p.models.length || p.listed ? null : 'my-model' }); return !d || codes(M.validateProvider({ ...d, id: 'pv-census', keyRef: M.keyRefOf('pv-census') })).length || !M.kindOf(p.kind) || !M.kindOf(p.kind).keyed || !M.kindOf(p.kind).auths.includes(p.auth) || p.bases.some((b) => !/^https:\/\/[^\s/]+\//.test(b.url) || !M.REGIONS.includes(b.region)) || (p.bases[0] && p.bases[0].region !== 'global') || TECH.test(p.blurb) || (p.models.length && !p.models.some((m) => m.id === p.defaultModel)); });
ok(shipBad.length === 0, 'every preset: a keyed kind with its auth, https addresses per region (global first), a default that is one of its rows, a blurb with no technical word — and its draft (with the person\'s choices) is a valid record', shipBad.map((p) => p.id));
const dk = M.draftOf('kimi', { region: 'cn' }), dOther = M.draftOf('other', { baseUrl: ' http://10.0.0.5:8000/v1 ', model: 'Qwen/Qwen3-32B', label: 'Lab' }), dOr = M.draftOf('openrouter');
ok(dk.baseUrl === 'https://api.moonshot.cn/anthropic' && M.draftOf('kimi').baseUrl === 'https://api.moonshot.ai/anthropic' && dOther.baseUrl === 'http://10.0.0.5:8000/v1' && dOther.label === 'Lab' && gateOf(eq(dOther.models.map((m) => m.id), ['Qwen/Qwen3-32B'])) && dOther.defaultModel === 'Qwen/Qwen3-32B' && dOther.modelsSource === 'configured' && dOr.modelsSource === 'listed' && dOr.listedBy === 'provider-api' && M.draftOf('nope') === null, 'a draft: the region picks the address; a typed address and an «Other…» model are kept (the model becomes the default row); OpenRouter is listed by its own /models (Train 1\'s refresh); an unknown preset ⇒ null');
const F = (kind, wire) => { const f = M.fits({ kind, wire }); const w = (h) => (f[h].ok ? '✓' : f[h].code); return `${w('claude')} ${w('codex')} ${w('opencode')}`; };
ok(F('anthropic-compatible') === '✓ wire later' && F('openrouter') === 'wire ✓ later' && F('anthropic-api') === '✓ wire later' && F('openai-chat') === 'wire wire later' && F('nope') === 'kind-unknown kind-unknown kind-unknown', 'fits — the kind decides (claude · codex · opencode): an Anthropic-compatible third party ✓ / not Codex / OpenCode later; OpenRouter Codex only; Chat-only none yet; an unknown kind none');
ok(F('self-hosted') === 'wire wire later' && F('self-hosted', 'anthropic-messages') === '✓ wire later' && F('self-hosted', 'openai-responses') === 'wire ✓ later' && F('self-hosted', 'openai-chat') === 'wire wire later' && verdictOf(eq(M.WIRES, ['anthropic-messages', 'openai-responses', 'openai-chat'])), 'a SELF-HOSTED one fits by the interface the person says it speaks: none said ⇒ none (a vLLM / Ollama /v1 is Chat Completions); Anthropic Messages ⇒ Claude Code; Responses ⇒ Codex (adversarial read r1)');
ok(M.FIT_HARNESSES.slice().sort().join() === 'claude,codex,gemini,opencode' && M.fits({ kind: 'google-api' }).gemini.code === 'later' && gateOf(M.fitsHarness({ kind: 'anthropic-compatible' }, 'claude')) && !M.fitsHarness({ kind: 'anthropic-compatible' }, 'codex') && verdictOf(Object.keys(M.FIT_WORDS).every((c) => typeof M.FIT_WORDS[c] === 'string')), 'fitsHarness answers one harness; every code has its words');
const OAT = ['sk-ant-', 'oat01-', 'q'.repeat(40)].join('');   // built at runtime (never a token-shaped literal)
const vk = (k) => codes(M.validateKey(k));
const CONSOLE = ['sk-ant-', 'api03-', 'z'.repeat(40)].join('');
ok(gateOf(eq(vk(`"${OAT}"`), ['key-subscription'])) && gateOf(eq(vk(`ANTHROPIC_AUTH_TOKEN=${OAT}`), ['key-subscription'])) && gateOf(eq(vk(JSON.stringify({ claudeAiOauth: { accessToken: OAT } })), ['key-subscription'])) && gateOf(eq(vk(['sk-ant-', 'sid01-', 'w'.repeat(30)].join('')), ['key-subscription'])) && gateOf(eq(vk(CONSOLE), ['key-anthropic'])) && gateOf(eq(vk('"sk-provider-1234"'), ['key-shape'])) && gateOf(eq(vk('MY_KEY=sk-provider-1234'), ['key-shape'])) && verdictOf(eq(vk('sk-or-v1-abc.def_ghi-123'), [])), 'an Anthropic credential ANYWHERE in the paste: quoted, after NAME=, inside a JSON blob, a claude.ai session key ⇒ key-subscription; a Console key ⇒ key-anthropic (it belongs on an Anthropic API account); quotes or a NAME= around another key ⇒ key-shape (adversarial read r1)');
ok(gateOf(eq(vk(''), ['key-empty'])) && gateOf(eq(vk('   '), ['key-empty'])) && gateOf(eq(vk('abc def ghij'), ['key-space'])) && gateOf(eq(vk('short'), ['key-short'])) && gateOf(eq(vk('k'.repeat(513)), ['key-long'])) && gateOf(eq(vk(OAT), ['key-subscription'])) && gateOf(eq(vk(' sk-provider-key-1234 '), [])) && Object.keys(M.KEY_ERRORS).length === 15, 'the key: empty, a space inside, too short, too long ⇒ by code; an ANTHROPIC SUBSCRIPTION LOGIN ⇒ key-subscription (never sent to a third party); a good key (trimmed) passes');
const recA = (o) => ({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1', model: 'm1' }), id: 'pv-c3', keyRef: M.keyRefOf('pv-c3'), ...o });
ok(gateOf(codes(M.validateProvider(recA({ baseUrl: 'http://203.0.113.7/v1' }))).includes('base-url-plain')) && gateOf(codes(M.validateProvider(recA({ baseUrl: 'http://llm.example.test/v1' }))).includes('base-url-plain')) && gateOf(['http://127.0.0.1/v1', 'http://192.168.1.20/v1', 'http://10.1.2.3/v1', 'http://172.20.0.4/v1', 'http://gpu-box:8000/v1', 'http://lab.local/v1', 'http://[::1]:9/v1'].every((u) => codes(M.validateProvider(recA({ baseUrl: u }))).length === 0)) && codes(M.validateProvider(recA({ baseUrl: 'http://203.0.113.7/v1', keyRef: null }))).length === 0, 'a record that names a key: plain http only on the person\'s own network (loopback, private ranges, .local, a dotless name) — a public host must be https (a record with no key is not judged)');
// a KEYED record's address carries no query and no fragment (U2 r1 NOTE 11 — a `?api-key=` would ride codex's command line);
// a keyless one may (lane lg-providers U2 cure: the rule had no leg — its record came from draftOf, which sets no keyRef)
ok(gateOf(codes(M.validateProvider(recA({ baseUrl: 'https://llm.example.test/v1?api-key=x' }))).includes('base-url-credentials')) && gateOf(codes(M.validateProvider(recA({ baseUrl: 'https://llm.example.test/v1#k' }))).includes('base-url-credentials')) && codes(M.validateProvider(recA({ baseUrl: 'https://llm.example.test/v1?api-version=1', keyRef: null }))).length === 0, 'a record that names a KEY: no query, no fragment on its address (base-url-credentials — it would ride the command line); a keyless record\'s query is taken');
const mQuery = mutant([["  else if (p.baseUrl !== null && p.keyRef !== null && /[?#]/.test(p.baseUrl)) errors.push({ field: 'baseUrl', code: 'base-url-credentials' });\n", '']]);
ok(!codes(mQuery.validateProvider(recA({ baseUrl: 'https://llm.example.test/v1?api-key=x' }))).includes('base-url-credentials'), 'CONTROL: the record rules without the query rule take «?api-key=x» on a keyed record ⇒ the query leg goes RED');
// an address refused for a % sign, a backslash or a non-ASCII character gets ITS OWN words — never the sentence about the
// scheme (the chain cure, the coordinator's U4 point 2)
const CHARS = ['https://llm%2Eexample.test/v1', 'https://llm.example.test\\v1', 'https://llm．example.test/v1', 'https\uff1a//llm.example.test/v1', 'https://llm\u3000x.test/v1', 'https://llm example.test/v1'];   // + a full-width colon and space: the shape check would have said «https://» (the read, R3)
ok(gateOf(CHARS.every((u) => eq(codes(M.validateProvider(recA({ baseUrl: u }))), ['base-url-chars']))) && gateOf(eq(codes(M.validateProvider(recA({ baseUrl: 'ftp://llm.example.test' }))), ['base-url'])) && typeof M.KEY_ERRORS['base-url-chars'] === 'string' && M.KEY_ERRORS['base-url-chars'] !== M.KEY_ERRORS['base-url'] && !/https?:/.test(M.KEY_ERRORS['base-url-chars']), 'a % sign, a backslash, a full-width dot, colon or space ⇒ base-url-chars with its own words, judged before the shape (no word about https://); a wrong scheme keeps base-url', CHARS.map((u) => codes(M.validateProvider(recA({ baseUrl: u })))));
const mChars = mutant([["errors.push({ field: 'baseUrl', code: 'base-url-chars' })", "errors.push({ field: 'baseUrl', code: 'base-url' })"]]);
ok(verdictOf(CHARS.every((u) => eq(codes(mChars.validateProvider(recA({ baseUrl: u }))), ['base-url']))), 'CONTROL: the rule folded back into base-url tells a person who typed a % sign to start with https:// ⇒ the words leg goes RED');
// (A) THE PLAIN-HTTP RULE IS JUDGED ON THE PARSED ADDRESS (U1 cure — the coordinator's (A)): the platform's URL parser gives
// the host, a literal is judged by its value. Shape 1 — a PUBLIC NAME that begins like a private range; shape 2 — the TEXT
// and the parser disagree on the host (a user part, a `\` the parser reads as a path); shape 3 — an IPv6 group the parser
// writes without its leading zeros. Each would send the key in clear over the internet.
const SHAPE1 = ['http://10.example.com/v1', 'http://192.168.attacker.net/v1', 'http://127.0.0.1.nip.io/v1', 'http://172.16.example.org/v1', 'http://169.254.cloud.example/v1'];
const SHAPE2 = ['http://evil.example\\@10.0.0.1/v1', 'http://10.0.0.1@evil.example/v1', 'http://u:pw@192.168.1.2/v1'];
const SHAPE3 = ['http://[fc::1]/v1', 'http://[fe8::1]/v1'];
const PUBLIC = ['http://172.32.0.1/v1', 'http://11.0.0.1/v1', 'http://192.169.1.1/v1', 'http://203.0.113.7/v1', 'http://[2001:db8::1]/v1', 'http://ai./v1', 'http://[::ffff:808:808]/v1', 'http://100.64.1.2/v1'];   // «ai.» a top-level domain; an IPv4-mapped public one; 100.64/10 the internet providers' shared range
const OWN = ['http://127.0.0.1/v1', 'http://10.1.2.3:9/v1', 'http://172.31.0.4/v1', 'http://192.168.1.20/v1', 'http://169.254.1.1/v1', 'http://0x7f.1/v1', 'http://LOCALHOST/v1', 'http://gpu-box:8000/v1', 'http://lab.local./v1', 'http://[::1]:9/v1', 'http://[fd12:3456::1]/v1', 'http://[fe80::1]/v1', 'http://0.0.0.0/v1', 'http://gpu.localhost/v1', 'http://[::ffff:7f00:1]/v1'];   // 0.0.0.0 = this machine (what a local server prints); an IPv4-mapped loopback
const ownOf = (X, list) => list.filter((u) => X.ownNetworkUrl(u));
ok(ownOf(M, SHAPE1).length === 0 && ownOf(M, SHAPE2).length === 0 && ownOf(M, SHAPE3).length === 0 && ownOf(M, PUBLIC).length === 0 && ownOf(M, OWN).length === OWN.length, 'THE PARSED ADDRESS: a public name that begins like a private range, a host the text and the parser disagree on (a user part, a backslash), an IPv6 group written short, a public literal — NONE is the person\'s own network; every loopback / private / link-local literal (0x7f.1 is 127.0.0.1 to the parser), localhost, .local and a dotless name is', { s1: ownOf(M, SHAPE1), s2: ownOf(M, SHAPE2), s3: ownOf(M, SHAPE3), pub: ownOf(M, PUBLIC), own: OWN.filter((u) => !M.ownNetworkUrl(u)) });
ok(gateOf(SHAPE1.every((u) => codes(M.validateProvider(recA({ baseUrl: u }))).includes('base-url-plain'))) && verdictOf(SHAPE1.every((u) => codes(M.validateProvider(recA({ baseUrl: u.replace('http:', 'https:') }))).length === 0)), 'the record refuses each shape-1 address in plain http (base-url-plain — the key would leave in clear); the same host over https is taken');
const mPrefix = mutant([['  if (u.username || u.password) return false;\n', "  if (u.username || u.password) return false;\n  if (/^(127|10|192\\.168|169\\.254|172\\.(1[6-9]|2\\d|3[01]))\\./.test(u.hostname)) return true;\n"]]);
ok(ownOf(mPrefix, SHAPE1).length === SHAPE1.length && verdictOf(SHAPE1.every((u) => !codes(mPrefix.validateProvider(recA({ baseUrl: u }))).includes('base-url-plain'))), 'CONTROL (A) shape 1: the rule as a PREFIX MATCH on the host text takes «10.example.com» and its kin as the person\'s network ⇒ the shape-1 leg goes RED');
const mText = mutant([["  try { u = new URL(String(url || '')); } catch { return false; }\n  if (u.username || u.password) return false;\n", "  const m = /^https?:\\/\\/([^/?#]+)/i.exec(String(url || ''));\n  u = { hostname: (m ? m[1].replace(/^[^@]*@/, '') : '').replace(/:\\d+$/, '') };\n"]]);
ok(ownOf(mText, SHAPE2).length >= 2 && ownOf(mText, ['http://evil.example\\@10.0.0.1/v1']).length === 1, 'CONTROL (A) shape 2: the host read off the TEXT with the user part cut by hand takes «evil.example\\@10.0.0.1» (the parser sends it to evil.example) and «u:pw@192.168.1.2» ⇒ the shape-2 leg goes RED', ownOf(mText, SHAPE2));
const m6 = mutant([["/^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6)", "/^f[cd][0-9a-f]{0,2}:/.test(v6) || /^fe[89ab][0-9a-f]?:/.test(v6)"]]);
ok(ownOf(m6, SHAPE3).length === SHAPE3.length, 'CONTROL (A) shape 3: the IPv6 ranges matched without the full first group take «fc::1» (00fc — public) ⇒ the shape-3 leg goes RED');
// (B) A SHORT KEY SHOWS NO HALF OF ITSELF: the tail only for a key of 20 characters or more
ok(M.tailOf('sk-short-ky1') === null && M.tailOf('k'.repeat(19)) === null && M.tailOf('k'.repeat(19) + 'Z') === 'kkkZ' && M.tailOf(` ${'a'.repeat(16)}9z8y `) === '9z8y', 'the tail: none for a key under 20 characters (an 8- or 12-character key never shows a third or a half of itself); the last four of a longer one');
ok(gateOf(eq(codes(M.validateProvider(recA({ keyRef: M.keyRefOf('pv-other1') }))), ['key-ref-foreign'])) && verdictOf(eq(codes(M.validateProvider(recA({ kind: 'openrouter', wire: 'openai-chat', models: [{ id: 'a/b' }], defaultModel: 'a/b' }))), ['wire-kind'])), 'a record naming ANOTHER provider\'s sealed key is refused (key-ref-foreign — it would hand that key to this address); only a self-hosted one carries a wire');
ok(gateOf(codes(M.validateProvider({ ...M.draftOf('other', { baseUrl: 'https://user:pw@llm.example.test/v1', model: 'm1' }), id: 'pv-c1' })).includes('base-url-credentials')) && codes(M.validateProvider({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1?k=@x', model: 'm1' }), id: 'pv-c2' })).length === 0, 'an address carrying user:password@ is refused (it would ride codex\'s command line and every log — U2); an @ after the host is not one');
ok(M.keyEntryOf('pv-a1') === 'provider:pv-a1' && M.keyRefOf('pv-a1') === 'secrets:provider:pv-a1#key' && M.providerOfKeyRef(M.keyRefOf('pv-a1')) === 'pv-a1' && M.providerOfKeyRef('integrations:openrouter#apiKey') === null && M.providerOfKeyRef('secrets:provider:pv-a1#value') === null && M.tailOf(' sk-provider-key-1234 ') === '1234' && M.tailOf('abc') === null, 'the key\'s vault entry provider:<id>, its reference secrets:provider:<id>#key (round trip; another store\'s or field\'s is not one), the tail = the last four characters');

const VE = require(path.join(ROOT, 'src/server/vault-engine.js'));
const PDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-'));
const vault = VE.create({ dataDir: PDIR, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
const PW = 'correct horse battery staple';
await vault.setup(PW, {});
const KEY = ['sk-', 'prov', 'ider-', 'planted-', '7f3a9c'].join('');
let pstore = PS.create({ dataDir: PDIR, catalogOf, vault: () => vault, now: () => 1792500000000, log: () => {} });
const a1 = await pstore.add({ preset: 'deepseek', key: ` ${KEY} `, label: '' });
const disk = () => (fs.existsSync(pstore.file) ? fs.readFileSync(pstore.file, 'utf-8') : '');
const pid = a1.ok ? a1.provider.id : null;
const box = vault.secretGet(M.keyEntryOf(pid));
ok(gateOf(a1.ok) && gateOf(/^pv-[0-9a-f]{12}$/.test(pid)) && a1.provider.keyRef === M.keyRefOf(pid) && a1.provider.tail === KEY.slice(-4) && a1.provider.label === 'DeepSeek' && a1.provider.createdAt === 1792500000000 && gateOf(box.ok) && box.value.toString('utf8') === KEY, 'add: the key sealed in the VAULT under provider:<id> (trimmed), the record names it by reference + its last four characters', { a1, box: box && box.ok });
ok(!disk().includes(KEY) && !disk().includes(KEY.slice(3, -4)) && JSON.parse(disk()).providers[0].tail === KEY.slice(-4), 'data/providers.json never holds the key (nor its middle) — only the tail');
ok(gateOf(eq(pstore.keyOf(pid), { ok: true, value: KEY })) && pstore.keyOf('pv-anthropic-api').code === 'unknown' && pstore.keyOf('pv-nobody').code === 'unknown', 'keyOf: the ONE reader answers the value for a kept record; a built-in or unknown id ⇒ unknown');
const before2 = disk();
const bad = await Promise.all([pstore.add({ preset: 'deepseek', key: OAT }), pstore.add({ preset: 'other', key: KEY }), pstore.add({ preset: 'zzz', key: KEY }), pstore.add({ preset: 'deepseek', key: 'x' })]);
ok(gateOf(eq(bad.map((r) => r.ok ? 'ok' : r.errors.map((e) => e.field + ':' + e.code).join('+')), ['key:key-subscription', 'baseUrl:base-url', 'preset:preset-unknown', 'key:key-short'])) && disk() === before2 && vault.secretNames().filter((n) => n.name.startsWith('provider:')).length === 1, 'add refuses WHOLE by field (a Claude login, a self-hosted one with no address, an unknown preset, a short key) — nothing written, nothing sealed', bad.map((r) => r.errors));
vault.lock('door');
const lockedAdd = await pstore.add({ preset: 'glm', key: KEY });
ok(lockedAdd.code === 'vault_locked' && disk() === before2 && pstore.keyOf(pid).code === 'vault_locked' && (await pstore.rekey(pid, KEY + 'x')).code === 'vault_locked', 'a LOCKED vault: add ⇒ vault_locked, nothing written; keyOf and rekey ⇒ vault_locked by name');
await vault.unlock(PW, {});
const rk = await pstore.rekey(pid, 'sk-provider-second-key-0042');
ok(gateOf(rk.ok) && rk.provider.tail === '0042' && pstore.keyOf(pid).value === 'sk-provider-second-key-0042' && !disk().includes('second-key'), 'rekey: the new key sealed over the old, the tail rewritten, still nothing of it in the file');
const pt = await pstore.patch(pid, { label: 'My DeepSeek', defaultModel: 'deepseek-reasoner' });
const ptBad = await pstore.patch(pid, { defaultModel: 'gpt-9' });
ok(gateOf(pt.ok) && pt.provider.label === 'My DeepSeek' && pt.provider.defaultModel === 'deepseek-reasoner' && !ptBad.ok && gateOf(codes(ptBad.errors).includes('default-dangling')) && (await pstore.patch('pv-anthropic-api', { label: 'x' })).code === 'built-in', 'patch: rename + default (validated whole: a default not in the table refused); a built-in ⇒ built-in');
pstore = PS.create({ dataDir: PDIR, catalogOf, vault: () => vault, log: () => {} });
ok(pstore.get(pid).label === 'My DeepSeek' && pstore.thirdParty().length === 1 && PS.forDir(PDIR) === pstore, 'a new store over the same file reads it back (and is THE store of its data dir — the Vault row names its key by it)');
ok(gateOf(eq((await pstore.patch(pid, { baseUrl: 'https://elsewhere.example.test/anthropic', key: KEY })).errors.map((e) => e.code), ['base-url-fixed'])) && pstore.get(pid).baseUrl === 'https://api.deepseek.com/anthropic', 'a PRESET\'s address is VibeSpace\'s: a new one is refused (base-url-fixed) — the sealed key never moves to a host the preset does not name (adversarial read r1)');
const own = await pstore.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', model: 'qwen3', wire: 'anthropic-messages' });
const mv1 = own.ok ? await pstore.patch(own.provider.id, { baseUrl: 'https://gpu.example.test/v1' }) : null;
const afterMv1 = own.ok ? pstore.get(own.provider.id).baseUrl : null;   // read BEFORE the second patch moves it
const mv2 = own.ok ? await pstore.patch(own.provider.id, { baseUrl: 'https://gpu.example.test/v1', key: 'sk-new-key-for-gpu-7777' }) : null;
ok(gateOf(own.ok) && own.provider.wire === 'anthropic-messages' && gateOf(M.fitsHarness(own.provider, 'claude')) && !mv1.ok && gateOf(codes(mv1.errors).includes('key-empty')) && afterMv1 === 'http://127.0.0.1:9/v1' && gateOf(mv2.ok) && mv2.provider.baseUrl === 'https://gpu.example.test/v1' && mv2.provider.tail === '7777' && pstore.keyOf(own.provider.id).value === 'sk-new-key-for-gpu-7777', 'a SELF-HOSTED one (the person said Anthropic Messages ⇒ Claude Code fits): a new address only WITH the key pasted again (without ⇒ refused, nothing moved; with ⇒ moved, the new key sealed, its tail)');
await pstore.remove(own.provider.id);
vault.secretPut(M.keyEntryOf('pv-orphan1'), 'sk-orphan-key-0001');
const orph = await pstore.remove('pv-orphan1');
ok(gateOf(orph.ok) && orph.orphan === true && vault.secretGet(M.keyEntryOf('pv-orphan1')).value === null && (await pstore.remove('pv-never1')).code === 'unknown', 'an ORPHANED key (its record gone) is still removed by the provider\'s own door — the Vault row\'s Remove never answers 404 for a key that is there; an id with neither ⇒ unknown');
const SSRC = path.join(ROOT, 'src/server/provider-store.js');
const storeMutant = (pairs) => { let t = fs.readFileSync(SSRC, 'utf-8'); for (const [from, to] of pairs) { if (!t.includes(from)) throw new Error('mutant anchor missing: ' + from.slice(0, 80)); t = t.replace(from, to); } const m = new Module(SSRC); m.filename = SSRC; m.paths = Module._nodeModulePaths(path.dirname(SSRC)); m._compile(t, SSRC); return m.exports; };
// (C) THE STORE'S WRITES GO THROUGH THE STORE WRITER, AND ITS ANSWER DECIDES (U1 cure — the coordinator's (C)): a writer
// that answers «failed» puts memory back for every act of a person — the record not kept, the sealed key not kept either
// (a new key: the old one sealed again), nothing removed — and the act is refused write-failed by name.
{
  const FDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-f-'));
  let answer = true; let hold = null; const marked = [];
  const fakeW = { dirty: (file, o) => marked.push([path.basename(file), o.name, o.mode]), durable: () => (hold ? new Promise((r) => { const h = hold; hold = null; h(r); }) : Promise.resolve(answer)) };
  const provNames = () => vault.secretNames().filter((n) => n.name.startsWith('provider:')).map((n) => n.name).sort();
  const fst = PS.create({ dataDir: FDIR, catalogOf, vault: () => vault, writer: fakeW, log: () => {} });
  const fk = await fst.add({ preset: 'kimi', key: KEY });
  const fid = fk.ok ? fk.provider.id : null;
  ok(gateOf(fk.ok) && gateOf(eq(marked[0], ['providers.json', 'providers.write', 0o600])) && !fs.existsSync(fst.file), 'the act marks data/providers.json with THE STORE WRITER (its name, 0600) and the WRITER writes it — no write on the main loop (the suite\'s writer is a stand-in: nothing lands)', marked[0]);
  answer = false;
  const names0 = provNames();
  const fa = await fst.add({ preset: 'glm', key: KEY });
  const fr = await fst.rekey(fid, 'sk-provider-would-be-new-5555');
  const fp = await fst.patch(fid, { label: 'Renamed' });
  const ft = await fst.noteTested(fid, 'claude', 'ok', 1792500000001);
  const fm = await fst.remove(fid);
  ok(gateOf([fa, fr, fp, ft, fm].every((r) => !r.ok && r.code === 'write-failed')) && gateOf(eq(fst.thirdParty().map((x) => x.id), [fid])) && verdictOf(eq(provNames(), names0)), 'A FAILED SAVE: add · new key · rename · the Test\'s verdict · remove ⇒ each refused write-failed; memory holds what it held (one record), the vault the keys it held', [fa, fr, fp, ft, fm].map((r) => r.code));
  ok(fst.keyOf(fid).value === KEY && fst.get(fid).tail === KEY.slice(-4) && fst.get(fid).label === fk.provider.label && !fst.get(fid).tested.claude && fst.get(fid) !== null, '…the new key\'s failed save SEALS THE OLD KEY AGAIN (the tail names the key the vault holds), the rename is undone, no verdict kept, the record not removed and its key still there');
  // a write that came in BETWEEN the act's change and the writer's answer keeps its change (the undo is the act's own record)
  answer = true;
  hold = (r) => { hold = null; setImmediate(() => { fst.put({ id: 'pv-between1', kind: 'openai-chat', label: 'Between', modelsSource: 'configured', models: [{ id: 'm-1' }] }); r(false); }); };
  const fb = await fst.patch(fid, { label: 'Renamed again' });
  ok(fb.code === 'write-failed' && fst.get(fid).label === fk.provider.label && fst.get('pv-between1') !== null, 'the undo is the act\'s OWN record: a write that landed while the act waited for the disk keeps its change', { fb: fb.code });
  // …and a write to the SAME record meanwhile (Train 1's models save — a new object) keeps ITS fields; the act's own is undone
  const between = (fn) => { hold = (r) => { hold = null; setImmediate(() => { fn(); r(false); }); }; };
  between(() => fst.setModels(fid, { models: [{ id: 'kimi-between' }] }));
  const fc = await fst.patch(fid, { label: 'Renamed thrice' });
  ok(fc.code === 'write-failed' && fst.get(fid).label === fk.provider.label && verdictOf(eq(fst.get(fid).models.map((m) => m.id), ['kimi-between'])), 'the undo puts back ONLY the fields the act changed, where they still hold its value: a models save that landed on the SAME record meanwhile keeps its rows, the rename is undone', { label: fst.get(fid).label });
  const PSs = storeMutant([["    for (const k of Object.keys(to)) if (!same(from[k], to[k]) && same(r[k], to[k])) back[k] = from[k];\n    return Object.keys(back).length ? { ...r, ...back } : r;\n", '    return r === to ? from : r;\n']]);
  {
    let hs = null;
    const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-s-'));
    const sst = PSs.create({ dataDir: sdir, catalogOf, vault: () => vault, writer: { dirty() { }, durable: () => (hs ? new Promise((r) => { const h = hs; hs = null; h(r); }) : Promise.resolve(true)) }, log: () => {} });
    const sa = await sst.add({ preset: 'kimi', key: KEY });
    hs = (r) => setImmediate(() => { sst.setModels(sa.provider.id, { models: [{ id: 'kimi-between' }] }); r(false); });
    await sst.patch(sa.provider.id, { label: 'Renamed thrice' });
    ok(sst.get(sa.provider.id).label === 'Renamed thrice', 'CONTROL (C): an undo by the record\'s IDENTITY (the first cut) finds a record another write replaced and undoes nothing — the refused rename stays ⇒ the same-record leg goes RED');
    vault.secretDrop(M.keyEntryOf(sa.provider.id)); fs.rmSync(sdir, { recursive: true, force: true });
  }
  // the vault LOCKED while the act waited: the old key cannot be sealed again — the record keeps the act's fields (it names the
  // key the vault holds) and its write stays owed; with NO key before, a failed new key is dropped (the vault as it was)
  between(() => vault.lock('door'));
  const fl = await fst.rekey(fid, 'sk-provider-locked-meanwhile-6666');
  await vault.unlock(PW, {});
  ok(fl.code === 'write-failed' && fst.keyOf(fid).value === 'sk-provider-locked-meanwhile-6666' && fst.get(fid).tail === '6666', 'the vault locked meanwhile: the new key stays (the old one could not be sealed again) and the record\'s tail names IT — never a record that names one key while the vault holds another', { tail: fst.get(fid).tail });
  vault.secretDrop(M.keyEntryOf(fid));
  answer = false;
  const fn0 = await fst.rekey(fid, 'sk-provider-no-old-key-7777');
  answer = true;
  ok(fn0.code === 'write-failed' && fst.hasKey(fid) === false && fst.get(fid).tail === '6666', 'no key before: a new key whose save failed is DROPPED from the vault, the record as it was');
  const PSu = storeMutant([['    records = undo(records);\n', '']]);
  const udir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-u-'));
  const ust = PSu.create({ dataDir: udir, catalogOf, vault: () => vault, writer: { dirty() { }, durable: async () => false }, log: () => {} });
  const ua = await ust.add({ preset: 'glm', key: KEY });
  ok(ua.code === 'write-failed' && ust.thirdParty().length === 1, 'CONTROL (C): a store that does not undo on the writer\'s «failed» keeps a record the disk never got (it would show, and be spent, until the next restart drops it) ⇒ the failed-save leg goes RED');
  fs.rmSync(FDIR, { recursive: true, force: true }); fs.rmSync(udir, { recursive: true, force: true });
}
// THE VAULT NOT SET UP: the add refuses by name, nothing written, nothing sealed; the Test's reader says the same
{
  const NDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-n-'));
  const nvault = VE.create({ dataDir: NDIR, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
  const nst = PS.create({ dataDir: NDIR, catalogOf, vault: () => nvault, log: () => {} });
  const na = await nst.add({ preset: 'deepseek', key: KEY });
  const nn = PS.create({ dataDir: NDIR, catalogOf, vault: () => null, log: () => {} });
  const nb = await nn.add({ preset: 'deepseek', key: KEY });
  ok(nvault.state() === 'not_set_up' && na.code === 'vault_not_set_up' && nb.code === 'vault_not_set_up' && !fs.existsSync(nst.file) && nst.thirdParty().length === 0 && nvault.secretNames().length === 0, 'THE VAULT NOT SET UP (and no vault at all): the add ⇒ vault_not_set_up by name — no record, no file, no entry (the page asks the person to set the vault up)', { na, nb });
  fs.rmSync(NDIR, { recursive: true, force: true });
}
// a PRESET's address is VibeSpace's AT THE ADD as at the patch; «has a key» asks the VAULT's names
{
  const fx = await pstore.add({ preset: 'deepseek', key: KEY, baseUrl: 'https://elsewhere.example.test/anthropic' });
  const fy = await pstore.add({ preset: 'kimi', key: KEY, baseUrl: '   ' });
  ok(!fx.ok && gateOf(eq(fx.errors.map((e) => e.field + ':' + e.code), ['baseUrl:base-url-fixed'])) && gateOf(fy.ok) && fy.provider.baseUrl === 'https://api.moonshot.ai/anthropic', 'the ADD refuses an address for a preset that has its own (base-url-fixed — as the patch does); an empty one is no address and the preset\'s stands', fx.errors);
  const PSa = storeMutant([["      if (!shipped.baseRequired && typeof i.baseUrl === 'string' && i.baseUrl.trim()) errors.push({ field: 'baseUrl', code: 'base-url-fixed' });\n", '']]);
  const adir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-a-'));
  const ax = await PSa.create({ dataDir: adir, catalogOf, vault: () => vault, log: () => {} }).add({ preset: 'deepseek', key: KEY, baseUrl: 'https://elsewhere.example.test/anthropic' });
  ok(gateOf(ax.ok) && ax.provider.baseUrl === 'https://elsewhere.example.test/anthropic', 'CONTROL: an add without the rule keeps DeepSeek\'s record pointed at another host (the key goes there) ⇒ the add leg goes RED');
  if (ax.ok) vault.secretDrop(M.keyEntryOf(ax.provider.id));
  fs.rmSync(adir, { recursive: true, force: true });
  const hid = fy.provider.id;
  const had = pstore.hasKey(hid);
  vault.secretDrop(M.keyEntryOf(hid));   // the entry gone (a vault reset, the Vault window's own Remove of the key)
  ok(had === true && pstore.hasKey(hid) === false && pstore.get(hid).keyRef === M.keyRefOf(hid) && pstore.hasKey('pv-anthropic-api') === false, '«has a key» asks the VAULT\'S NAMES (no key read): the record still names its entry, but the entry is gone ⇒ false');
  await pstore.remove(hid);
}
// A NEW KEY OR A NEW ADDRESS CLEARS «TESTED» (the chain cure, the coordinator's U4 point 1): the wizard never says «Works» for a
// key or an address that was never tested; a rename keeps it
{
  const t0 = (await pstore.add({ preset: 'other', key: KEY, baseUrl: 'https://llm.example.test/v1', model: 'm1', wire: 'anthropic-messages', label: 'TestMe' })).provider;
  await pstore.noteTested(t0.id, 'claude', 'ok', 1792500000100);
  const a = pstore.get(t0.id);
  await pstore.patch(t0.id, { label: 'TestMe2' });
  const b = pstore.get(t0.id);
  const rk2 = await pstore.rekey(t0.id, 'sk-provider-retest-key-31337');
  const c = pstore.get(t0.id);
  await pstore.noteTested(t0.id, 'claude', 'ok', 1792500000200);
  const mv = await pstore.patch(t0.id, { baseUrl: 'https://llm2.example.test/v1', key: 'sk-provider-moved-key-424242' });
  const d = pstore.get(t0.id);
  ok(gateOf(a.tested.claude) && a.lastTestAt === 1792500000100 && gateOf(b.tested.claude) && b.lastTestAt === 1792500000100 && gateOf(rk2.ok) && !c.tested.claude && c.lastTestAt === null && gateOf(mv.ok) && !d.tested.claude && d.lastTestAt === null, 'a NEW KEY clears tested + lastTestAt, a NEW ADDRESS (with its key) clears them, a rename keeps them — «Works» only for what was tested', { a: a.tested, c: c.tested, d: d.tested });
  const PSt = storeMutant([[', tested: {}, lastTestAt: null };   // a new key was never tested', ' };   // a new key was never tested']]);
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-t-'));
  const tst = PSt.create({ dataDir: tdir, catalogOf, vault: () => vault, log: () => {} });
  const x0 = (await tst.add({ preset: 'other', key: KEY, baseUrl: 'https://llm.example.test/v1', model: 'm1', wire: 'anthropic-messages', label: 'TestMe' })).provider;
  await tst.noteTested(x0.id, 'claude', 'ok', 1792500000300);
  await tst.rekey(x0.id, 'sk-provider-retest-key-31337');
  ok(!!tst.get(x0.id).tested.claude, 'CONTROL: a new key that keeps the old «tested» lets the wizard say «Works» for a key nobody tested ⇒ the leg goes RED');
  vault.secretDrop(M.keyEntryOf(x0.id)); fs.rmSync(tdir, { recursive: true, force: true });
  const genBefore = pstore.generationOf(t0.id);
  await pstore.remove(t0.id);
  ok(genBefore >= 2 && pstore.generationOf(t0.id) === 0, 'the key GENERATION counts each new key / address (2 here) and leaves with the record (the map never grows past the live records — the chain cure\'s read)', { genBefore });
  const PSg = storeMutant([['      gen.delete(id);   // its key generation goes with it', '      // gen kept']]);
  const gdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-g-'));
  const gst = PSg.create({ dataDir: gdir, catalogOf, vault: () => vault, log: () => {} });
  const g0 = (await gst.add({ preset: 'other', key: KEY, baseUrl: 'https://llm.example.test/v1', model: 'm1', wire: 'anthropic-messages', label: 'Gen' })).provider;
  await gst.rekey(g0.id, 'sk-provider-generation-key-5150');
  await gst.remove(g0.id);
  ok(gst.generationOf(g0.id) === 1, 'CONTROL: a store that keeps a removed record\'s generation keeps it for the process\'s life ⇒ the leg goes RED');
  fs.rmSync(gdir, { recursive: true, force: true });
}
const VIu = require(path.join(ROOT, 'src/vault-inventory.js'));
const vrow = VIu.secretRowOf(vault.secretNames().find((n) => n.name === M.keyEntryOf(pid)), { providerName: (id) => pstore.get(id).label });
ok(gateOf(vrow) && vrow.field === 'key' && vrow.kind === 'api-key' && vrow.label === 'Model provider key · My DeepSeek' && !JSON.stringify(vrow).includes('0042') && verdictOf(eq(VIu.doorsOf({ store: 'secrets', entry: M.keyEntryOf(pid), field: 'key' }).delete, { method: 'DELETE', path: `/api/providers/${pid}`, confirm: 'provider' })), 'the Vault window\'s row: «Model provider key · <its name>», no character of the key; its Remove = the provider\'s own DELETE (confirm words «provider»)', vrow);
const PMk = require(path.join(ROOT, 'src/server/provider-models.js'));
const keyOfRef = PMk.vaultKeyOf({ getIntegrations: () => null, providers: pstore });
ok(gateOf(eq(keyOfRef(M.keyRefOf(pid)), { ok: true, value: 'sk-provider-second-key-0042' })) && gateOf(eq(keyOfRef(M.keyRefOf(pid), pid), { ok: true, value: 'sk-provider-second-key-0042' })) && keyOfRef(M.keyRefOf(pid), 'pv-someone-else').code === 'key-unreadable' && keyOfRef(M.keyRefOf('pv-gone')).code === 'key-unreadable' && keyOfRef('integrations:openrouter#apiKey').code === 'key-unreadable', 'the listed-model refresh reads a provider\'s OWN key through the store (an unknown one / an Integrations row with no store ⇒ key-unreadable)');

// the doors on a loopback app
const papp = express();
papp.use(express.json());
const changes = [];
require(path.join(ROOT, 'src/routes/providers.js')).registerProviderRoutes(papp, { providers: pstore, onChange: (c) => changes.push(c) });
const psrv = await new Promise((res) => { const s2 = papp.listen(0, '127.0.0.1', () => res(s2)); });
const pbase = `http://127.0.0.1:${psrv.address().port}`;
const SAME = { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' };
const call = async (method, p2, body, headers = SAME) => { const r = await fetch(pbase + p2, { method, headers, body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json()]; };
try {
  const [g1, l1] = await call('POST', '/api/providers/list', {});
  const [g2, l2] = await call('POST', '/api/providers/list', {}, { ...SAME, Authorization: 'Bearer vsst_planted' });
  const [g3, l3] = await call('POST', '/api/providers/list', {}, { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' });
  const g4 = (await fetch(pbase + '/api/providers')).status;   // the old GET (a bare app answers 404 with no JSON)
  const [g5, l5] = await call('POST', '/api/providers/list', {}, { 'Content-Type': 'application/json' });   // no Origin, no Sec-Fetch-Site: a script on this machine, not a page
  ok(g1 === 200 && l1.shipped.length === 6 && gateOf(l1.shipped[0].fits.claude.ok) && !l1.shipped[0].fits.codex.ok && l1.providers.length === 1 && l1.providers[0].id === pid && gateOf(l1.providers[0].fits.claude.ok) && l1.providers[0].hasKey === true && !('keyRef' in l1.providers[0]) && !JSON.stringify(l1).includes('second-key') && !JSON.stringify(l1).includes('secrets:provider'), 'GET: the shipped presets with what each fits, the kept records with theirs — no key, and not where the vault keeps it (hasKey only)');
  ok(g2 === 403 && l2.code === 'human_only' && g3 === 403 && l3.code === 'cross_site' && g4 === 404 && g5 === 403 && l5.code === 'cross_site' && !JSON.stringify([l2, l3, l5]).includes(KEY.slice(-4)) && !JSON.stringify([l2, l3]).includes('deepseek.com'), 'THE ROSTER IS THE PERSON\'S (U1 cure (B)): the list through the same person verdict as the writes — an agent\'s bearer ⇒ 403 human_only, another site ⇒ 403 cross_site, neither reads a label, an address or a tail; a caller with no page at all (no Origin, no Sec-Fetch-Site) neither; the old GET is gone (404)', { g2, g3, g4, g5 });
  const [b1, x1] = await call('POST', '/api/providers', { preset: 'glm', key: KEY }, { ...SAME, Authorization: 'Bearer vsst_planted' });
  const [b2, x2] = await call('POST', '/api/providers', { preset: 'glm', key: KEY }, { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' });
  const [b3] = await call('DELETE', `/api/providers/${pid}`, null, { Authorization: 'Bearer jbt_planted' });
  ok(b1 === 403 && x1.code === 'human_only' && b2 === 403 && x2.code === 'cross_site' && b3 === 403 && pstore.thirdParty().length === 1 && changes.length === 0, 'EVERY WRITE IS A PERSON\'S: an agent\'s bearer ⇒ 403 human_only, another site ⇒ 403 cross_site, a job token cannot remove — nothing changed, nothing announced');
  const [c1, y1] = await call('POST', '/api/providers', { preset: 'glm', region: 'cn', key: KEY });
  const [c2, y2] = await call('POST', '/api/providers', { preset: 'glm', key: OAT });
  vault.lock('door');
  const [c3, y3] = await call('POST', '/api/providers', { preset: 'glm', key: KEY });
  await vault.unlock(PW, {});
  ok(c1 === 201 && y1.provider.baseUrl === 'https://open.bigmodel.cn/api/anthropic' && gateOf(y1.provider.fits.claude.ok) && c2 === 400 && y2.errors[0].code === 'key-subscription' && c3 === 423 && y3.code === 'vault_locked' && changes.length === 1 && changes[0].what === 'add', 'POST: 201 with the record (the region\'s address); a Claude login ⇒ 400 by field; a locked vault ⇒ 423 vault_locked; only the kept one is announced', { y1: y1.provider && y1.provider.baseUrl, y2, y3 });
  const gid = y1.provider.id;
  const [d1, z1] = await call('POST', `/api/providers/${gid}/key`, { key: 'sk-provider-third-9999' });
  const [d2, z2] = await call('PATCH', `/api/providers/${gid}`, { label: 'GLM (work)' });
  const [d3, z3] = await call('DELETE', `/api/providers/${gid}`);
  const [d4] = await call('DELETE', `/api/providers/${gid}`);
  ok(d1 === 200 && z1.provider.tail === '9999' && d2 === 200 && z2.provider.label === 'GLM (work)' && d3 === 200 && z3.keyDropped === true && d4 === 404 && pstore.get(gid) === null && vault.secretGet(M.keyEntryOf(gid)).value === null && verdictOf(eq(changes.map((c) => c.what), ['add', 'rekey', 'patch', 'remove'])), 'new key · rename · remove (the record AND its vault entry; a second remove ⇒ 404), each announced once');
} finally { psrv.close(); }
{
  // CONTROL (B): the list without its person line answers a caller with no page — the label, the address, the tail
  const RP = path.join(ROOT, 'src/routes/providers.js');
  const LIST_LINE = "  app.post('/api/providers/list', (req, res) => {\n    if (!person(req, res)) return;\n";
  const rsrc = fs.readFileSync(RP, 'utf-8');
  if (!rsrc.includes(LIST_LINE)) throw new Error('the anchor of the control «the list\'s person line» is not in the source');
  const rm = new Module(RP); rm.filename = RP; rm.paths = Module._nodeModulePaths(path.dirname(RP)); rm._compile(rsrc.replace(LIST_LINE, "  app.post('/api/providers/list', (req, res) => {\n"), RP);
  const mapp = express(); mapp.use(express.json());
  rm.exports.registerProviderRoutes(mapp, { providers: pstore });
  const msrv = await new Promise((res) => { const s2 = mapp.listen(0, '127.0.0.1', () => res(s2)); });
  try {
    const r = await fetch(`http://127.0.0.1:${msrv.address().port}/api/providers/list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    ok(r.status === 200 && verdictOf(JSON.stringify(j).includes('My DeepSeek')), 'CONTROL (B): a list door without the person verdict hands a script with no page the provider\'s name and tail ⇒ the person leg goes RED');
  } finally { msrv.close(); }
  // THE «OTHER OR SELF-HOSTED» CARD fits a harness when one of its interfaces does (the U5 pictures: it read «Not for Claude»)
  {
    const otherOf = async (Mod) => {
      const a2 = express(); a2.use(express.json()); Mod.registerProviderRoutes(a2, { providers: pstore });
      const s2 = await new Promise((res) => { const x = a2.listen(0, '127.0.0.1', () => res(x)); });
      try { const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/providers/list`, { method: 'POST', headers: SAME, body: '{}' }); return ((await r.json()).shipped || []).find((x) => x.id === 'other') || null; } finally { s2.close(); }
    };
    const FITS_LINE = 'const shippedPub = (s) => ({ ...s, fits: shippedFits(s) });';
    if (rsrc.split(FITS_LINE).length !== 2) throw new Error('the anchor of the control «the self-hosted card\'s fit» is not in the source once');
    const fm = new Module(RP); fm.filename = RP; fm.paths = Module._nodeModulePaths(path.dirname(RP)); fm._compile(rsrc.replace(FITS_LINE, 'const shippedPub = (s) => ({ ...s, fits: MP.fits({ kind: s.kind }) });'), RP);   // stale-pins: kept — the control's REPLACEMENT is the first cut's line, gone from the product on purpose
    const other = await otherOf(require(RP)), other0 = await otherOf(fm.exports);
    ok(!!other && gateOf(other.fits.claude.ok) && gateOf(other.fits.codex.ok) && !other.fits.opencode.ok, 'the «Other or self-hosted» card is offered to Claude Code AND Codex (the person names the interface on the next screen) — never «Not for Claude» for a service that can speak its interface', other && other.fits);
    ok(!!other0 && !other0.fits.claude.ok, 'CONTROL: the card judged with no interface (the first cut) reads «Not for Claude» ⇒ the leg goes RED', other0 && other0.fits);
  }
  // AN ACT THAT THROWS answers 500 with words — an async door's rejection never hangs the request (Express 4 answers none)
  const tapp2 = express(); tapp2.use(express.json());
  require(RP).registerProviderRoutes(tapp2, { providers: { thirdParty: () => [], hasKey: () => false, add: async () => { throw new Error('boom'); } } });
  const tsrv2 = await new Promise((res) => { const s2 = tapp2.listen(0, '127.0.0.1', () => res(s2)); });
  try {
    let st = 0, j2 = null;
    try { const r = await fetch(`http://127.0.0.1:${tsrv2.address().port}/api/providers`, { method: 'POST', headers: SAME, body: JSON.stringify({ preset: 'glm', key: KEY }), signal: AbortSignal.timeout(5000) }); st = r.status; j2 = await r.json(); } catch (e) { st = e.name; }
    ok(st === 500 && gateOf(j2) && j2.code === 'failed' && !JSON.stringify(j2).includes('boom'), 'an act that THROWS (a malformed body, a store fault) answers 500 «the provider could not be changed» — never a request left hanging, never the fault\'s own text', { st });
  } finally { tsrv2.close(); }
}

console.log('⑭ RED controls');
const mFits = mutant([["    else if (!k.harnesses.includes(h)) out[h] = { ok: false, code: 'wire' };\n", '']]);
ok(!M.fitsHarness({ kind: 'anthropic-compatible' }, 'codex') && verdictOf(mFits.fitsHarness({ kind: 'anthropic-compatible' }, 'codex')), 'CONTROL: fits without the wire rule puts DeepSeek (an Anthropic-compatible address) under Codex ⇒ RED (the real one says it does not offer what Codex needs)');
const mKey = mutant([["  if (/sk-ant-(?:oat|ort|sid)/i.test(k)) return [{ field: 'key', code: 'key-subscription' }];\n  if (/sk-ant-/i.test(k)) return [{ field: 'key', code: 'key-anthropic' }];\n", '']]);
ok(M.validateKey(OAT).length === 1 && mKey.validateKey(OAT).length === 0, 'CONTROL: the key rule without the subscription refusal takes a Claude login as a provider key ⇒ RED');
const mAnchored = mutant([["  if (/sk-ant-(?:oat|ort|sid)/i.test(k)) return", "  if (/^sk-ant-(?:oat|ort|sid)/.test(k)) return"], ["  if (/sk-ant-/i.test(k)) return", "  if (/^sk-ant-/.test(k)) return"]]);
ok(codes(M.validateKey(`"${OAT}"`)).join() === 'key-subscription' && codes(mAnchored.validateKey(`"${OAT}"`)).join() === 'key-shape' && codes(mAnchored.validateKey(`ANTHROPIC_AUTH_TOKEN=${OAT}`)).join() === 'key-shape' && codes(mAnchored.validateKey(JSON.stringify({ t: OAT }))).join() === 'key-shape', 'CONTROL: the rule ANCHORED at the start (the first cut) no longer names a quoted / NAME= / JSON-wrapped subscription login for what it is ⇒ the anywhere leg above goes RED');
const mFitKind = mutant([["const fitKindOf = (p) => (p && p.kind === 'self-hosted' ? WIRE_KIND[p.wire] || 'openai-chat' : p && p.kind);", "const fitKindOf = (p) => p && p.kind;"]]);
ok(!M.fitsHarness({ kind: 'self-hosted' }, 'claude') && gateOf(mFitKind.fitsHarness({ kind: 'self-hosted' }, 'claude')) && verdictOf(mFitKind.fitsHarness({ kind: 'self-hosted' }, 'codex')), 'CONTROL: fits by the kind\'s list alone (the first cut) tells a person with a Chat-only vLLM server that Claude Code AND Codex fit ⇒ RED');
const PSm = storeMutant([['      const sealed = seal(id, i.key);\n', '      const sealed = { ok: true };\n']]);
const MDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-m-'));
vault.lock('door');
const mstore = PSm.create({ dataDir: MDIR, catalogOf, vault: () => vault, log: () => {} });
const ma1 = await mstore.add({ preset: 'glm', key: KEY });
ok(gateOf(ma1.ok) && gateOf(fs.existsSync(mstore.file)) && mstore.keyOf(ma1.provider.id).code === 'vault_locked', 'CONTROL: a store that skips the seal WRITES a record while the vault is locked (a provider whose key was never kept) ⇒ RED (the real one refuses vault_locked with the file untouched)');
fs.rmSync(PDIR, { recursive: true, force: true }); fs.rmSync(MDIR, { recursive: true, force: true });

// ── ⑮ THE PROVIDER TEST (lane lg-providers, B-d578 U4 — the coordinator's five musts, 2026-11-17T23:24Z) ──────────────
console.log('⑮ the provider test: a FAKE CLI, empty homes, a third party only, a key or nothing, a person\'s press');
{
  const PTM = require(path.join(ROOT, 'src/provider-test-model.js'));
  const PTRF = path.join(ROOT, 'src/server/provider-test.js');
  const PTR = require(PTRF);
  const TDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvtest-suite-'));
  const tvault = VE.create({ dataDir: TDIR, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
  await tvault.setup(PW, {});
  const tstore = PS.create({ dataDir: TDIR, vault: () => tvault, log: () => {} });
  const TKEY = ['sk-', 'third', '-party-', 'test-', '9b1e5a'].join('');
  const addOther = async (host, wire, label) => (await tstore.add({ preset: 'other', key: TKEY, baseUrl: `https://${host}/v1`, model: 'm-1', wire, label })).provider;
  const P = { ok: await addOther('llm.example.test', 'anthropic-messages', 'Good'), refuse: await addOther('refuse.example.test', 'anthropic-messages', 'Refuse'), down: await addOther('down.example.test', 'anthropic-messages', 'Down'),
    nomodel: await addOther('nomodel.example.test', 'anthropic-messages', 'NoModel'), slow: await addOther('slow.example.test', 'anthropic-messages', 'Slow'), leak: await addOther('leak.example.test', 'anthropic-messages', 'Leak'),
    codex: await addOther('llm.example.test', 'openai-responses', 'GoodCodex') };
  // THE MACHINE'S OWN SIGN-IN, planted exactly where an unguarded child would find it (its HOME, its config variables)
  const MACHINE = path.join(TDIR, 'machine-home');
  fs.mkdirSync(path.join(MACHINE, '.claude'), { recursive: true }); fs.writeFileSync(path.join(MACHINE, '.claude', '.credentials.json'), '{"claudeAiOauth":{}}');
  fs.mkdirSync(path.join(MACHINE, '.codex')); fs.writeFileSync(path.join(MACHINE, '.codex', 'auth.json'), '{}');
  const FAKE = path.join(TDIR, 'fake-cli.js');
  fs.copyFileSync(path.join(ROOT, 'scripts/fixtures/provider-test/fake-cli.js'), FAKE); fs.chmodSync(FAKE, 0o755);
  const REPORT = path.join(TDIR, 'report.json');
  const AMB = { PATH: process.env.PATH, FAKE_REPORT: REPORT, HOME: MACHINE, CLAUDE_CONFIG_DIR: path.join(MACHINE, '.claude'), CLAUDE_SECURESTORAGE_CONFIG_DIR: path.join(MACHINE, '.claude'), CODEX_HOME: path.join(MACHINE, '.codex'),
    CLAUDE_CODE_OAUTH_TOKEN: 'ambient-oat', ANTHROPIC_API_KEY: 'ambient-console', ANTHROPIC_AUTH_TOKEN: 'ambient-token', OPENAI_API_KEY: 'ambient-openai', VIBESPACE_PROVIDER_KEY: 'ambient-provider',
    CLAUDE_CODE_USE_FOUNDRY: '1', ANTHROPIC_CUSTOM_HEADERS: 'x-planted: 1', AWS_SECRET_ACCESS_KEY: 'ambient-aws', LANG: 'C.UTF-8' };
  const NO_MDIR = fs.mkdtempSync(path.join(TDIR, 'managed-none-'));   // the machine's managed Claude settings folder, stood in EMPTY (never the box's own)
  const mk = (Mod = PTR, o = {}) => Mod.create({ providers: tstore, cliFor: async () => FAKE, agentEnv: () => ({ ...AMB }), scratchRoot: TDIR, timeoutMs: 8000, managedDir: NO_MDIR, ...o });
  const slowRunner = mk(PTR, { timeoutMs: 400 });   // only the timeout leg runs on a short bound (a loaded machine never flakes the rest)
  const runner = mk();
  const report = () => { try { return JSON.parse(fs.readFileSync(REPORT, 'utf8')); } catch { return null; } };
  const fresh = () => { try { fs.rmSync(REPORT); } catch { } };
  const scratchLeft = () => fs.readdirSync(TDIR).filter((n) => n.startsWith('vs-pvtest-'));
  const run = async (Mod, id, harness, by = 'human') => { fresh(); const r = await Mod.runProviderTest(id, harness, { by }); return { r, rep: report() }; };

  const c1 = await run(runner, P.ok.id, 'claude');
  const homes1 = c1.rep ? c1.rep.homes : {};
  ok(c1.r.kept === true, 'the verdict was kept: the answer says so (kept)');
  const kf = await run(mk(PTR, { providers: { ...tstore, noteTested: async () => ({ ok: false, code: 'write-failed' }) } }), P.ok.id, 'claude');
  ok(gateOf(kf.r.ok) && kf.r.verdict === 'ok' && kf.r.kept === false && verdictOf(read('src/routes/providers.js').includes('kept: r.kept !== false')), 'a verdict whose write FAILED is said in the answer (kept: false — the door passes it on) and logged (the chain cure)', kf.r);
  ok(gateOf(c1.r.ok) && c1.r.verdict === 'ok' && c1.r.detail === '' && tstore.get(P.ok.id).tested.claude.verdict === 'ok' && tstore.get(P.ok.id).lastTestAt === c1.r.at, 'claude, a good third party: verdict ok, kept on the record (tested.claude + lastTestAt)', c1.r);
  ok(!!c1.rep && verdictOf(['HOME', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CODEX_HOME'].every((h) => homes1[h] && !homes1[h].dir.startsWith(MACHINE) && homes1[h].files.length === 0)), 'MUST 1 — as the fake saw it: HOME, XDG_CONFIG_HOME and EVERY harness\'s config variable are fresh EMPTY folders of the run\'s own (no sign-in file, no stored credential; the machine\'s planted login reachable from none)', homes1);
  ok(!!c1.rep && !c1.rep.envNames.includes('CLAUDE_CODE_OAUTH_TOKEN') && !c1.rep.envNames.includes('OPENAI_API_KEY') && c1.rep.keyVars.ANTHROPIC_API_KEY === null && !c1.rep.envNames.includes('VIBESPACE_PROVIDER_KEY') && c1.rep.keyVars.ANTHROPIC_AUTH_TOKEN === TKEY && c1.rep.base === 'https://llm.example.test/v1', 'MUST 1/4 — the sanitized env with every credential name stripped (the ambient OAuth token, Console key, OpenAI key, provider key gone); the provider\'s key ONLY in the variable the harness reads; the third party\'s address', c1.rep && { names: c1.rep.envNames.filter((n) => /KEY|TOKEN|OAUTH/.test(n)), base: c1.rep.base });
  const a1 = c1.rep ? c1.rep.argv : [];
  ok(!!c1.rep && !a1.some((a) => a.includes(TKEY)) && a1[0] === '-p' && a1[1] === 'ok' && !a1.includes('--bare') && gateOf(a1.join(' ').includes('--max-turns 1 --settings {"apiKeyHelper":""} --disallowedTools Bash,')) && a1.slice(-2).join(' ') === '--model m-1' && scratchLeft().length === 0, 'MUST 4 — nothing of the key in argv (claude: -p ok, one turn, a machine-wide apiKeyHelper neutralized, no tools, --model <the provider\'s row>; not --bare: it would take ANTHROPIC_API_KEY only); the scratch folder removed after the run', a1);
  ok(!!c1.rep && gateOf(['CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_CUSTOM_HEADERS', 'AWS_SECRET_ACCESS_KEY'].every((n) => !c1.rep.envNames.includes(n))) && verdictOf(c1.rep.envNames.includes('LANG')), 'MUST 1 — every vendor-family name the env doors do not know is gone too (Foundry, custom headers, cloud credentials); an ordinary name (LANG) stays', c1.rep && c1.rep.envNames.filter((n) => /^(AWS|ANTHROPIC|CLAUDE)/.test(n)));
  const c2 = await run(runner, P.codex.id, 'codex');
  const ix = c2.rep ? c2.rep.argv.indexOf('exec') : -1;
  ok(c2.r.verdict === 'ok' && ix > 0 && gateOf(c2.rep.argv.slice(0, ix).includes(`model_providers.pv_${P.codex.id.slice(3)}.base_url="https://llm.example.test/v1"`)) && c2.rep.argv.slice(ix).join(' ') === 'exec --skip-git-repo-check --sandbox read-only --model m-1 ok' && c2.rep.keyVars.VIBESPACE_PROVIDER_KEY === TKEY && c2.rep.homes.CODEX_HOME.files.length === 0 && !c2.rep.homes.CODEX_HOME.dir.startsWith(MACHINE) && !c2.rep.argv.some((a) => a.includes(TKEY)), 'codex: its -c provider table ahead of `exec … ok`, its key in VIBESPACE_PROVIDER_KEY only, CODEX_HOME an empty folder of the run (no auth.json), nothing of the key in argv', c2.rep && c2.rep.argv);
  const V = {};
  for (const w of ['refuse', 'down', 'nomodel', 'slow', 'leak']) V[w] = (await run(w === 'slow' ? slowRunner : runner, P[w].id, 'claude')).r;
  ok(V.refuse.verdict === 'key-refused' && V.down.verdict === 'unreachable' && V.nomodel.verdict === 'not-served' && V.slow.verdict === 'timeout' && V.leak.verdict === 'failed' && scratchLeft().length === 0, 'the verdict a person reads: a 401 ⇒ key-refused · ECONNREFUSED ⇒ unreachable · a 404 not_found_error ⇒ not-served · no end within the bound ⇒ timeout (the child killed) · anything else ⇒ failed; every scratch folder removed', Object.fromEntries(Object.entries(V).map(([k, v]) => [k, v.verdict])));
  ok(!V.leak.detail.includes(TKEY) && gateOf(V.leak.detail.includes('••••')) && V.leak.detail.length <= PTM.DETAIL_MAX && verdictOf(V.refuse.detail.includes('401')), 'the child\'s words are REDACTED before anyone reads them (the key the CLI printed ⇒ ••••), cut to 300 characters', V.leak.detail);
  const SS = require(path.join(ROOT, 'src/secret-shapes.js'));
  const shaped = PTM.redact(`request failed: key ${['sk-', 'or-v1-', 'f'.repeat(40)].join('')} was rejected`, 'no-such-key-here', SS.redactSecrets);
  ok(typeof V.leak.detail === 'string' && gateOf(V.leak.detail.includes('request failed')) && typeof shaped === 'string' && !shaped.includes('f'.repeat(40)) && verdictOf(shaped.includes('rejected')), 'the detail is TEXT through the real redactSecrets (it answers { text, redacted }): a person reads the words with every secret shape masked — never «[object Object]»', { leak: V.leak.detail, shaped });
  const cut = PTM.redact(`head ${TKEY.slice(0, 11)}|${TKEY.slice(11)} tail`, TKEY);
  ok(!cut.includes(TKEY.slice(0, 8)) && !cut.includes(TKEY.slice(-8)) && gateOf(cut.includes('head')) && verdictOf(cut.includes('tail')), 'a key CUT in two (a chunk\'s edge) leaves no piece of 8 characters or more', cut);
  // THE REFUSALS — by name, NOTHING spawned (the fake writes no report)
  const putRec = (id, baseUrl) => { const r = tstore.put({ id, kind: 'self-hosted', label: id, preset: 'other', baseUrl, keyRef: M.keyRefOf(id), wire: 'anthropic-messages', modelsSource: 'configured', models: [{ id: 'm-1' }] }); tvault.secretPut(M.keyEntryOf(id), TKEY); return r; };
  putRec('pv-vendor1', 'https://api.anthropic.com'); putRec('pv-vendor2', 'https://claude.ai./x'); putRec('pv-noaddr1', null); putRec('pv-vendor3', 'https://API.ANTHROPIC.COM/v1');
  const nomod = (await tstore.add({ preset: 'other', key: TKEY, baseUrl: 'https://llm.example.test/v1', wire: 'anthropic-messages', label: 'NoRows' })).provider;
  const refusals = [];
  const refuse = async (what, Mod, id, harness, code, by) => { const x = await run(Mod, id, harness, by); refusals.push([what, x.r.code]); ok(!x.r.ok && x.r.code === code && x.rep === null, `REFUSED BY NAME (${code}), NOTHING SPAWNED — ${what}`, x.r); };
  await refuse('MUST 2: an address on the vendor\'s own hosts (api.anthropic.com)', runner, 'pv-vendor1', 'claude', 'vendor-own');
  await refuse('MUST 2: claude.ai. (a trailing dot is the same host)', runner, 'pv-vendor2', 'claude', 'vendor-own');
  await refuse('MUST 2: no address («use the default»)', runner, 'pv-noaddr1', 'claude', 'no-address');
  await refuse('MUST 2: the vendor\'s host in capitals', runner, 'pv-vendor3', 'claude', 'vendor-own');
  await refuse('no model to ask with (never the CLI\'s own default id at a third party)', runner, nomod.id, 'claude', 'model-none');
  const bypass = ['https://api.anthropic.com\\x.test/v1', 'https://api%2Eanthropic%2Ecom/v1', 'https://api\uff0eanthropic\uff0ecom/v1'];
  ok(gateOf(bypass.every((u) => !PTM.addressVerdict({ id: 'pv-x9', kind: 'self-hosted', baseUrl: u }).ok)) && gateOf(bypass.every((u) => codes(M.validateProvider({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1', model: 'm' }), id: 'pv-x8', keyRef: M.keyRefOf('pv-x8'), baseUrl: u })).includes('base-url-chars'))) && PTM.addressVerdict({ id: 'pv-x9', kind: 'self-hosted', baseUrl: 'https://api.anthropic.com/v1' }).code === 'vendor-own', 'MUST 2 — the addresses a regex and the CLIs\' URL parser read differently (a backslash, %2E, full-width dots — each reaches api.anthropic.com) are refused, by the Test AND by the record rules', bypass.map((u) => PTM.addressVerdict({ id: 'pv-x9', kind: 'self-hosted', baseUrl: u })));
  tvault.lock('door');
  await refuse('MUST 3: the vault locked (the key cannot be read — it never runs without one)', runner, P.ok.id, 'claude', 'vault_locked');
  await tvault.unlock(PW, {});
  tvault.secretDrop(M.keyEntryOf(P.down.id));
  await refuse('MUST 3: the key entry gone', runner, P.down.id, 'claude', 'no-key');
  await refuse('MUST 5: not a person\'s press (no by: human)', runner, P.ok.id, 'claude', 'human_only', 'timer');
  await refuse('a harness the provider does not serve (Anthropic-compatible under Codex)', runner, P.ok.id, 'codex', 'unfit');
  await refuse('a built-in record (the first-party Console key) is never a third-party test', runner, 'pv-anthropic-api', 'claude', 'unknown');
  ok(gateOf(eq([...PTM.VENDOR_OWN_HOSTS], ['anthropic.com', 'claude.ai', 'claude.com', 'openai.com', 'chatgpt.com'])) && PTM.addressVerdict({ id: 'pv-x9', kind: 'self-hosted', baseUrl: 'https://eu.api.openai.com/v1' }).code === 'vendor-own' && gateOf(PTM.addressVerdict({ id: 'pv-x9', kind: 'self-hosted', baseUrl: 'https://api.anthropic.com.evil.test/v1' }).ok) && PTM.addressVerdict({ id: 'pv-x9', kind: 'self-hosted', baseUrl: 'https://user@api.openai.com/v1' }).code === 'vendor-own', 'the vendor hosts by suffix (eu.api.openai.com is OpenAI\'s; api.anthropic.com.evil.test is not; a user@ in front changes nothing)');
  const p1 = slowRunner.runProviderTest(P.slow.id, 'claude', { by: 'human' });
  const p2 = await slowRunner.runProviderTest(P.slow.id, 'claude', { by: 'human' });
  await p1;
  ok(p2.code === 'in-flight', 'one test per provider × harness at a time (a second press while one runs ⇒ in-flight)', p2);
  fresh();
  const cm = await mk(PTR, { cliFor: async () => null }).runProviderTest(P.ok.id, 'claude', { by: 'human' });
  ok(gateOf(cm.ok) && cm.verdict === 'cli-missing' && report() === null, 'no CLI on this machine ⇒ verdict cli-missing, nothing spawned');
  ok(cm.kept === false, 'no CLI ⇒ nothing ran: the answer says no verdict was kept (the read, R9)');
  // THE MACHINE'S MANAGED CLAUDE SETTINGS NAME A KEY HELPER (主开发 23:45Z): the test's empty homes do not reach that folder and
  // it outranks every setting the test passes — the CLI would send the organisation's credential to the provider. Refused by name,
  // nothing spawned, the slot freed (a stand-in managed folder)
  const MDIR = fs.mkdtempSync(path.join(TDIR, 'managed-'));
  fs.writeFileSync(path.join(MDIR, 'managed-settings.json'), JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' }));
  fresh();
  let keyReads = 0;
  const counting = { ...tstore, keyOf: (id) => { keyReads++; return tstore.keyOf(id); } };
  const mhRunner = mk(PTR, { managedDir: MDIR, providers: counting });   // ONE runner: its slot must be free again after a refusal
  const mh1 = await mhRunner.runProviderTest(P.ok.id, 'claude', { by: 'human' });
  const mhRan = report(), mhKeyReads = keyReads;
  fs.rmSync(path.join(MDIR, 'managed-settings.json'));
  fresh();
  const mh2 = await mhRunner.runProviderTest(P.ok.id, 'claude', { by: 'human' });
  ok(!mh1.ok && mh1.code === 'managed-helper' && gateOf(/managed-settings\.json$/.test(String(mh1.where))) && gateOf(/\{where\}/.test(PTM.REFUSAL_WORDS['managed-helper'])) && !!PTM.REFUSAL_WORDS['windows-policy-unread'] && !/administrator/i.test(PTM.REFUSAL_WORDS['windows-policy-unread'])
    && gateOf(read('src/routes/providers.js').includes("...(where ? { where } : {})")) && gateOf(read('src/lib/provider-roster.js').includes('showToast(testToastWords(x), {'))
    && mhRan === null && mhKeyReads === 0 && !!PTM.REFUSAL_WORDS['managed-helper'] && gateOf(mh2.ok) && report() !== null && keyReads === 1,
    'the machine\'s managed Claude settings set a key helper: the test is refused by name (managed-helper), the FILE named (the route passes it on, the roster\'s toast says it; the Windows policy unread has its own words), NOTHING spawned and the vault key NEVER read; the managed file gone, the SAME runner tests again (its slot was freed)', { mh1, mh2: mh2.verdict, mhKeyReads, keyReads });
  fs.writeFileSync(path.join(MDIR, 'managed-settings.json'), JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' }));
  fresh();
  const ptrPatched = (pairs) => { let s = fs.readFileSync(PTRF, 'utf-8'); for (const [from, to] of pairs) s = anchored(s, from, to, 'the Test without its managed check'); const m = new Module(PTRF); m.filename = PTRF; m.paths = Module._nodeModulePaths(path.dirname(PTRF)); m._compile(s, PTRF); return m.exports; };   // compiled in memory beside the real file (this block runs before the suite's runnerMutant)
  const mhx = await mk(ptrPatched([["      if (h.creds.keyHelper) { const mh = await MANAGED.managedHelperFact({ dir: managedDir, ...(managedOpts || {}) }); if (mh.named !== false) return { ok: false, code: mh.cause === 'windows-absent' ? (mh.onWsl === false ? 'windows-policy-absent-native' : 'windows-policy-absent') : mh.cause === 'windows-unread' ? 'windows-policy-unread' : 'managed-helper', where: mh.where }; }\n", '']]), { managedDir: MDIR }).runProviderTest(P.ok.id, 'claude', { by: 'human' });
  ok(gateOf(mhx.ok) && report() !== null, 'CONTROL: the test without the managed-settings check spawns the CLI under the managed helper ⇒ the leg above goes RED', mhx.verdict);
  // THE TEST'S WINDOWS VERDICTS (the cure2 read: no leg drove them): a STAND-IN reg.exe by its full path through the Test's
  // `managedOpts` seam (never the box's own): the helper absent or unable to start ⇒ windows-policy-absent; failing ⇒
  // windows-policy-unread; a policy value whose JSON does not parse ⇒ managed-helper (the administrator's) — the key named, nothing
  // spawned, the vault key never read
  {
    const RDIR = fs.mkdtempSync(path.join(TDIR, 'reg-'));
    const standReg = (name, body, mode = 0o755) => { const f = path.join(RDIR, name); fs.writeFileSync(f, '#!/bin/sh\n' + body + '\n', { mode }); return f; };
    const NOKEY = "echo 'ERROR: The system was unable to find the specified registry key or value.' >&2; exit 1";
    const BAD = JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' }).slice(0, -1) + ',}';   // a trailing comma: not JSON
    const winOpts = (regExe) => ({ platform: 'linux', wsl: true, drvfsDir: NO_MDIR, reg: { regExe, env: {}, boundMs: 4000 } });
    const cases = { absent: path.join(RDIR, 'no-such', 'reg.exe'), nativeAbsent: path.join(RDIR, 'no-such-native', 'reg.exe'), noStart: standReg('noexec.exe', 'exit 0', 0o644), failing: standReg('fail.exe', 'exit 5'),
      malformed: standReg('bad.exe', `case "$2" in HKLM*) printf '\\r\\nHKEY_LOCAL_MACHINE\\\\SOFTWARE\\\\Policies\\\\ClaudeCode\\r\\n    Settings    REG_SZ    %s\\r\\n\\r\\n' '${BAD}';; *) ${NOKEY};; esac`) };
    const got = {};
    for (const [k, regExe] of Object.entries(cases)) { fresh(); keyReads = 0; const o = k === 'nativeAbsent' ? { platform: 'win32', wsl: false, reg: { regExe, env: {}, boundMs: 4000 } } : winOpts(regExe); const r = await mk(PTR, { managedOpts: o, providers: counting }).runProviderTest(P.ok.id, 'claude', { by: 'human' }); got[k] = { code: r.code, where: r.where, ran: report() !== null, keyReads }; }
    ok(got.absent.code === 'windows-policy-absent' && got.nativeAbsent.code === 'windows-policy-absent-native' && got.noStart.code === 'windows-policy-absent' && got.failing.code === 'windows-policy-unread' && got.malformed.code === 'managed-helper'
      && verdictOf(Object.values(got).every((g) => /HKLM/.test(String(g.where)) && !g.ran && g.keyReads === 0)),
      'the Test\'s Windows verdicts: the helper absent or unable to start ⇒ its own words with no retry (windows-policy-absent), failing ⇒ could not read (windows-policy-unread), a policy value that does not parse ⇒ the administrator\'s (managed-helper) — HKLM named, nothing spawned, the key never read', got);
  }
  // (主开发 01:46Z) EACH TEST DOOR NAMES THE FILE — never a literal «{where}»: the route fills its own text (and hands `where`), the
  // roster's toast and the wizard's row word it with the file (en, zh, ja carry the placeholder)
  {
    const rapp = express(); rapp.use(express.json());
    const MF = '/etc/claude-code/managed-settings.json';
    require(path.join(ROOT, 'src/routes/providers.js')).registerProviderRoutes(rapp, { providers: tstore, tester: { runProviderTest: async () => ({ ok: false, code: 'managed-helper', where: MF }) } });
    const rs = await new Promise((r) => { const x = rapp.listen(0, '127.0.0.1', () => r(x)); });
    try {
      const rr = await fetch(`http://127.0.0.1:${rs.address().port}/api/providers/${encodeURIComponent(P.ok.id)}/test`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: JSON.stringify({ harness: 'claude' }) });
      const rb = await rr.json();
      ok(rr.status === 409 && rb.code === 'managed-helper' && rb.where === MF && gateOf(rb.error.includes(MF)) && !rb.error.includes('{where}'),
        'the route\'s Test door names the file: its own text filled (no «{where}» left) and `where` handed on', rb);
    } finally { rs.close(); }
  }
  // …and with NO place to name (主开发 02:49Z): the route's own text says the sentence WITHOUT its parentheses — never «()»
  {
    const rapp = express(); rapp.use(express.json());
    require(path.join(ROOT, 'src/routes/providers.js')).registerProviderRoutes(rapp, { providers: tstore, tester: { runProviderTest: async () => ({ ok: false, code: 'windows-policy-unread' }) } });
    const rs = await new Promise((r) => { const x = rapp.listen(0, '127.0.0.1', () => r(x)); });
    try {
      const rr = await fetch(`http://127.0.0.1:${rs.address().port}/api/providers/${encodeURIComponent(P.ok.id)}/test`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: JSON.stringify({ harness: 'claude' }) });
      const rb = await rr.json();
      ok(rr.status === 409 && rb.code === 'windows-policy-unread' && !('where' in rb) && gateOf(/Windows policy for Claude Code, so the test/.test(rb.error)) && !/\(\s*\)|\{where\}/.test(rb.error),
        'the route\'s text with NO place to name: the sentence without its parentheses (never «()»), no `where` handed', rb);
    } finally { rs.close(); }
  }
  // EACH PAGE TEST DOOR, DRIVEN (the cure2 read: a leg at each door, not a text pin): the REAL wizard row's words (`errorWords`) and
  // the REAL roster toast's (`testToastWords`) for a refusal naming its source — the source said, no «{where}» left; the ONE words
  // function both call (`refusalWords`) through the zh and ja dictionaries likewise. CONTROLS (ESM copies beside the real files,
  // anchored()): the wizard row worded without the file, the toast without the refusal's words ⇒ RED
  {
    const MF = '/etc/claude-code/managed-settings.json';
    const CODES = ['managed-helper', 'windows-policy-absent', 'windows-policy-absent-native', 'windows-policy-unread'];
    const refused = (code) => ({ ok: false, code, where: code === 'managed-helper' ? MF : 'HKLM\\SOFTWARE\\Policies\\ClaudeCode' });
    const said = (s, r) => typeof s === 'string' && s.includes(r.where) && !s.includes('{where}');
    const WZ = await import(pathToFileURL(path.join(ROOT, 'src/lib/provider-wizard.js')).href);
    const RO = await import(pathToFileURL(path.join(ROOT, 'src/lib/provider-roster.js')).href);
    ok(gateOf(CODES.every((c) => said(WZ.errorWords(refused(c)), refused(c)) && said(RO.testToastWords(refused(c)), refused(c)))) && RO.testToastWords({ ok: true, verdict: 'ok' }) === PTM.VERDICT_WORDS.ok
      && verdictOf(read('src/lib/provider-roster.js').includes('showToast(testToastWords(x), {')),
      'each page Test door, driven: the wizard row\'s words and the roster toast\'s name the source for every refusal that carries one — no «{where}» left (the toast shows these words)', CODES.map((c) => WZ.errorWords(refused(c)).slice(0, 70)));
    const dictOf = async (f) => (await import(pathToFileURL(path.join(ROOT, f)).href)).default;
    const trOf = (d) => (s, p) => (Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
    const zhja = [];
    for (const [lang, f] of [['zh', 'src/lib/i18n-zh.js'], ['ja', 'src/lib/i18n-ja.js']]) { const d = await dictOf(f); for (const c of CODES) zhja.push({ lang, c, s: PTM.refusalWords(refused(c), trOf(d), 'failed'), has: Object.prototype.hasOwnProperty.call(d, PTM.REFUSAL_WORDS[c]) }); }
    ok(zhja.length === 8 && verdictOf(zhja.every((x) => x.has && said(x.s, refused(x.c)) && x.s !== PTM.refusalWords(refused(x.c), trOf({}), 'failed'))),
      'the words both doors share, through the zh and ja dictionaries: each refusal translated, its source in it, no «{where}» left', zhja.filter((x) => !(x.has && said(x.s, refused(x.c)))).map((x) => x.lang + ' ' + x.c));
    // NO PLACE TO NAME (主开发 02:49Z): said WITHOUT its parentheses — never «()» / «（）» — at both page doors and in zh and ja
    const bare = (s) => typeof s === 'string' && s.length > 20 && !/\(\s*\)|（\s*）|\{where\}/.test(s);
    const noWhere = (c) => ({ ok: false, code: c });
    const bareAll = [];
    for (const c of CODES) bareAll.push(WZ.errorWords(noWhere(c)), RO.testToastWords(noWhere(c)));
    for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) { const d = await dictOf(f); for (const c of CODES) bareAll.push(PTM.refusalWords(noWhere(c), trOf(d), 'failed')); }
    ok(bareAll.length === 16 && gateOf(bareAll.every(bare)) && PTM.fillWhere('A ({where}) B', '') === 'A B' && PTM.fillWhere('甲（{where}）乙', '') === '甲乙' && PTM.fillWhere('A ({where}) B', 'x') === 'A (x) B',
      'a refusal with no place to name is said without its parentheses at both page doors, in en, zh and ja — never «()»', bareAll.filter((s) => !bare(s)).slice(0, 3));
    const PM = mutantCopies('model-providers-doors', ROOT);
    const WSRC = read('src/lib/provider-wizard.js'), RSRC = read('src/lib/provider-roster.js');
    const wizCut = await import(pathToFileURL(PM.write('src/lib/provider-wizard.js', anchored(WSRC, "refusalWords(r, t, 'Something went wrong')", "t((r && REFUSAL_WORDS[r.code]) || (r && r.error) || 'Something went wrong')", 'the wizard row without the file'), 'wiz-no-where')).href);
    const rosCut = await import(pathToFileURL(PM.write('src/lib/provider-roster.js', anchored(RSRC, "refusalWords(x, t, 'failed')", "t((x && x.error) || 'failed')", 'the toast without the refusal words'), 'toast-no-words')).href);
    const mh = refused('managed-helper');
    ok(!said(wizCut.errorWords(mh), mh) && !said(rosCut.testToastWords(mh), mh),
      'CONTROLS: the wizard row worded without the file, the toast without the refusal\'s words ⇒ the door legs go RED', [wizCut.errorWords(mh).slice(0, 70), rosCut.testToastWords(mh)]);
    for (const r of copiesCensus(PM.files, PM.dir, ROOT, { minCopies: 2 })) ok(verdictOf(r.name), r.pass, r.detail);
  }
  // A NEW KEY WHILE A TEST RUNS (the chain cure's read, R2): the run tested the OLD key — its verdict is not written onto the new one
  const midRun = slowRunner.runProviderTest(P.slow.id, 'claude', { by: 'human' });
  await tstore.rekey(P.slow.id, 'sk-third-party-rekeyed-midrun-2718');
  const mr = await midRun;
  ok(gateOf(mr.ok) && mr.kept === false && mr.changed === true && gateOf(read('src/routes/providers.js').includes("if (r.changed) return res.status(409).json({ ok: false, code: 'changed', error: PT.REFUSAL_WORDS.changed });")) && !tstore.get(P.slow.id).tested.claude, 'a NEW KEY while a Test runs (up to 60 s): the run tested the old key — its verdict is NOT written onto the new one (kept: false); the door answers it as a refusal with its own words («changed» — test it again), never «Works»', mr);
  // THE DRAIN (the read, R5/R6): a CLI that exits leaving a CHILD of its own holding the pipes — ended on proof before the folder goes
  const pLinger = await addOther('linger.example.test', 'anthropic-messages', 'Linger');
  const aliveNow = (pid) => { try { return !/^\d+ \(.*\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return false; } };
  const goneWithin = async (pid, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 50))) if (!aliveNow(pid)) return true; return !aliveNow(pid); };
  fresh(); try { fs.rmSync(REPORT + '.linger'); } catch { }
  const lg = await mk(PTR, { drainMs: 200 }).runProviderTest(pLinger.id, 'claude', { by: 'human' });
  const gpid = (() => { try { return Number(fs.readFileSync(REPORT + '.linger', 'utf8')); } catch { return 0; } })();
  ok(gateOf(lg.ok) && lg.verdict === 'ok' && gpid > 0 && verdictOf(await goneWithin(gpid, 2000)), 'a CLI that exits leaving a CHILD of its own holding the pipes: the run settles at the drain and the child is ended (the group, on proof a member of ours lives — cli-models-door\'s law) — nothing outlives the scratch folder', { gpid, verdict: lg.verdict });

  // MUST 5 — the person's door
  const tapp = express(); tapp.use(express.json());
  require(path.join(ROOT, 'src/routes/providers.js')).registerProviderRoutes(tapp, { providers: tstore, tester: runner });
  const tsrv = await new Promise((res) => { const s2 = tapp.listen(0, '127.0.0.1', () => res(s2)); });
  const tbase = `http://127.0.0.1:${tsrv.address().port}`;
  const tpost = async (id, body, headers) => { fresh(); const r = await fetch(`${tbase}/api/providers/${id}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return [r.status, await r.json(), report()]; };
  try {
    const [s1, j1, r1] = await tpost(P.ok.id, { harness: 'claude' }, { 'Sec-Fetch-Site': 'same-origin' });
    const [s2, j2, r2] = await tpost(P.ok.id, { harness: 'claude' }, { 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer vsst_planted' });
    const [s3, j3, r3] = await tpost(P.ok.id, { harness: 'claude' }, { 'Sec-Fetch-Site': 'cross-site' });
    const [s4, j4] = await tpost('pv-vendor1', { harness: 'claude' }, { 'Sec-Fetch-Site': 'same-origin' });
    ok(s1 === 200 && j1.verdict === 'ok' && j1.words === 'Works' && r1 !== null && s2 === 403 && j2.code === 'human_only' && r2 === null && s3 === 403 && j3.code === 'cross_site' && r3 === null && s4 === 409 && j4.code === 'vendor-own', 'MUST 5 — the door: a person\'s press on the page runs it (200, its words); an agent\'s bearer or another site ⇒ 403, nothing spawned; a vendor\'s own address ⇒ 409 by name');
  } finally { tsrv.close(); }

  console.log('⑮ RED controls — each refusal and each home taken out of a patched copy of the runner');
  const RSRC = fs.readFileSync(PTRF, 'utf-8');
  const runnerMutant = (pairs) => { let t = RSRC; for (const [from, to] of pairs) { if (!t.includes(from)) throw new Error('mutant anchor missing: ' + from.slice(0, 80)); t = t.replace(from, to); } const m = new Module(PTRF); m.filename = PTRF; m.paths = Module._nodeModulePaths(path.dirname(PTRF)); m._compile(t, PTRF); return m.exports; };
  const noHomes = mk(runnerMutant([["      for (const v of [c.homeEnvVar, c.spawnEnvVar]) if (typeof v === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(v)) env[v] = await fresh(v);\n", ''], ["    env.HOME = await fresh('HOME');\n", '']]));
  const xa = await run(noHomes, P.ok.id, 'claude');
  ok(gateOf(xa.rep) && gateOf(xa.rep.homes.HOME) && verdictOf(xa.rep.homes.HOME.files.includes('.claude/.credentials.json')), 'CONTROL MUST 1: a runner without the fresh homes hands the child the MACHINE\'S HOME — its sign-in file reachable ⇒ the empty-homes leg goes RED', xa.rep && xa.rep.homes);
  const noAddr = mk(runnerMutant([['    if (!a.ok) return { ok: false, code: a.code };\n', '']]));
  const xb = await run(noAddr, 'pv-vendor1', 'claude');
  ok(xb.rep !== null && xb.rep.base === 'https://api.anthropic.com', 'CONTROL MUST 2: a runner without the address verdict RUNS a print-mode child at the vendor\'s own host ⇒ the vendor-own leg goes RED', xb.r);
  tvault.lock('door');
  const noKey = mk(runnerMutant([["    if (!k.ok || !k.value) return { ok: false, code: k.ok ? 'no-key' : k.code };\n", '']]));
  const xc = await run(noKey, P.ok.id, 'claude');
  await tvault.unlock(PW, {});
  ok(xc.rep !== null && !xc.rep.keyVars.ANTHROPIC_AUTH_TOKEN, 'CONTROL MUST 3: a runner without the key check RUNS with no key at all («see what happens») ⇒ the vault-locked leg goes RED', xc.r);
  const noPerson = mk(runnerMutant([["    if (by !== 'human') return { ok: false, code: 'human_only' };\n", '']]));
  const xd = await run(noPerson, P.ok.id, 'claude', 'timer');
  ok(xd.rep !== null, 'CONTROL MUST 5: a runner without the person check runs for a timer ⇒ the human_only leg goes RED', xd.r);
  const noStrip = mk(runnerMutant([['    for (const n of credentialEnvNames(ds)) delete env[n];\n', '']]));
  const xe = await run(noStrip, P.ok.id, 'claude');
  ok(gateOf(xe.rep) && xe.rep.envNames.includes('CLAUDE_CODE_OAUTH_TOKEN') === false && verdictOf(xe.rep.envNames.includes('VIBESPACE_PROVIDER_KEY')), 'CONTROL MUST 1: without the credential strip an ambient VIBESPACE_PROVIDER_KEY rides into the child (the vendor-family strip still takes the CLAUDE_ ones) ⇒ the strip leg goes RED', xe.rep && xe.rep.envNames.filter((n) => /KEY|TOKEN/.test(n)));
  const noFamily = mk(runnerMutant([['    for (const n of Object.keys(env)) if (VENDOR_FAMILY.test(n)) delete env[n];\n', '']]));
  const xf = await run(noFamily, P.ok.id, 'claude');
  ok(gateOf(xf.rep) && gateOf(xf.rep.envNames.includes('CLAUDE_CODE_USE_FOUNDRY')) && verdictOf(xf.rep.envNames.includes('AWS_SECRET_ACCESS_KEY')), 'CONTROL MUST 1: without the vendor-family strip an ambient Foundry switch and a cloud credential reach the child ⇒ the vendor-family leg goes RED');
  const noXdg = mk(runnerMutant([["    env.XDG_CONFIG_HOME = await fresh('XDG_CONFIG_HOME');\n", '']]));
  const xg = await run(noXdg, P.ok.id, 'claude');
  ok(gateOf(xg.rep) && !xg.rep.homes.XDG_CONFIG_HOME, 'CONTROL MUST 1: without the fresh XDG_CONFIG_HOME the child has none of its own (a CLI reading it falls back to the machine\'s ~/.config) ⇒ the empty-homes leg goes RED');
  const noFit = mk(runnerMutant([["    if (!MP.fitsHarness(p, harness) || !h || !h.creds || typeof h.creds.providerSpawn !== 'function' || !h.creds.providerTest || typeof h.creds.providerTest.argv !== 'function') return { ok: false, code: 'unfit' };\n", "    if (!h || !h.creds) return { ok: false, code: 'unfit' };\n"]]));
  const xh = await run(noFit, P.ok.id, 'codex');
  ok(xh.rep !== null, 'CONTROL: without the fit check an Anthropic-compatible provider is run under Codex ⇒ the unfit leg goes RED');
  const noSlot = mk(runnerMutant([["    if (inFlight.has(slot)) return { ok: false, code: 'in-flight' };\n", '']]), { timeoutMs: 400 });
  const q1 = noSlot.runProviderTest(P.slow.id, 'claude', { by: 'human' });
  const q2 = await noSlot.runProviderTest(P.slow.id, 'claude', { by: 'human' });
  await q1;
  ok(gateOf(q2.ok) && q2.verdict === 'timeout', 'CONTROL: without the in-flight slot a second press runs a second child (spends the key twice) ⇒ the in-flight leg goes RED', q2);
  const noGen = mk(runnerMutant([[', gen0);', ');']]), { timeoutMs: 400 });
  const ng = noGen.runProviderTest(P.slow.id, 'claude', { by: 'human' });
  await tstore.rekey(P.slow.id, 'sk-third-party-rekeyed-again-3141');
  const ngr = await ng;
  ok(ngr.kept !== false && !!tstore.get(P.slow.id).tested.claude, 'CONTROL (R2): a run that does not say which key it tested writes its verdict onto the NEW key ⇒ the mid-run leg goes RED', ngr);
  const noDrainEnd = mk(runnerMutant([['drain = setTimeout(() => { afterExit(true); settle(', 'drain = setTimeout(() => { settle(']]), { drainMs: 200 });
  fresh(); try { fs.rmSync(REPORT + '.linger'); } catch { }
  const xl = await noDrainEnd.runProviderTest(pLinger.id, 'claude', { by: 'human' });
  const gp2 = (() => { try { return Number(fs.readFileSync(REPORT + '.linger', 'utf8')); } catch { return 0; } })();
  const left = gp2 > 0 && aliveNow(gp2);
  // end what the control left — the fake's OWN child (its command line names it), nothing else
  try { if (gp2 > 0 && fs.readFileSync(`/proc/${gp2}/cmdline`, 'utf8').includes('fake-cli linger')) process.kill(gp2, 'SIGKILL'); } catch { }
  ok(gateOf(xl.ok) && verdictOf(left), 'CONTROL (R6): a run that settles at the drain without ending the group leaves the CLI\'s child alive past the scratch folder ⇒ the drain leg goes RED', { gp2 });
  fs.rmSync(TDIR, { recursive: true, force: true });
}

// ── ⑯ THE WIZARD AND THE ROSTER (lane lg-providers, B-d578 U5) ───────────────────────────────────────────────────
console.log('⑯ the wizard and the roster: rows per harness beside the accounts, the first screen\'s words, the wiring');
{
  const dsRec = M.normalizeProvider({ ...M.draftOf('deepseek'), id: 'pv-r1', keyRef: M.keyRefOf('pv-r1'), tail: 'ab12', createdAt: 1 });
  const cxRec = M.normalizeProvider({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1', model: 'm-1', wire: 'openai-responses' }), id: 'pv-r2', keyRef: M.keyRefOf('pv-r2'), tested: { codex: { verdict: 'ok', at: 5 } } });
  const noneRec = M.normalizeProvider({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1', model: 'm-1' }), id: 'pv-r3', keyRef: M.keyRefOf('pv-r3') });
  const rows = M.rosterRowsOf([dsRec, cxRec, noneRec, M.presetOf('pv-anthropic-api')]);
  ok(gateOf(eq(rows.map((r) => `${r.id}:${r.backend}`), ['pv-r1:claude', 'pv-r2:codex'])) && rows[0].localOnly === true && M.rosterRowsOf([dsRec], { usable: false })[0].loggedIn === false && rows[0].loggedIn === true && rows[0].type === 'provider' && rows[0].name === 'DeepSeek' && !('tail' in rows[0]) && rows[0].model === 'deepseek-chat' && rows[0].provenance === 'third-party' && gateOf(eq(rows[1].tested, { verdict: 'ok', at: 5 })) && !JSON.stringify(rows).includes('secrets:provider'), 'rosterRowsOf: ONE row per harness a provider fits (DeepSeek → Claude Code, a Responses service → Codex; a self-hosted one that said nothing → none; a built-in → none), type provider, its model and last test, NO key tail (B-ba7d: the list reaches every agent-readable mirror) — never where its key is');
  ok(gateOf(eq(M.rosterRowsOf([dsRec, cxRec], { usable: (p) => p.id === 'pv-r2' }).map((r) => r.loggedIn), [false, true])) && verdictOf(read('src/server/account-usage-routes.js').includes('usable: (p) => open && providers.hasKey(p.id), whyNot: (p) => (!open ? \'vault-locked\' : !providers.hasKey(p.id) ? \'no-key\' : null)')), 'a row is usable when the vault is open AND its record\'s entry is in it (read off the vault\'s names — U1 cure: a vault reset no longer leaves a row that says it can run); the hub hands that test — and (B-d578 F3b) the reason a row cannot start');
  const RDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvrows-'));
  const am2 = new AccountManager({ dataDir: RDIR });
  am2.add({ name: 'Console', key: 'sk-ant-api03-' + 'r'.repeat(40) });
  am2.setProviderRows(() => rows);
  const L = am2.list();
  ok(gateOf(eq(L.providerRows, rows)) && L.accounts.length === 1 && verdictOf(L.accounts.every((a) => a.type !== 'provider')), 'accounts.list(): the provider rows ride BESIDE the accounts (providerRows) — list().accounts, which 43 hub readers walk, holds only accounts.json\'s records');
  fs.rmSync(RDIR, { recursive: true, force: true });
  const TECH = /https?:|ANTHROPIC_|OPENAI_|base[_ ]?url|\bapi\b|\benv\b|token|\bwire\b|responses|\bcli\b/i;
  const wizSrc = read('src/lib/provider-wizard.js');
  // the words screen ① DRAWS, read off the wizard's own pick block (every t('…') literal in it) + what its cards carry
  const pickBlock = wizSrc.slice(wizSrc.indexOf("if (st.step === 'pick') {"), wizSrc.indexOf("if (st.step === 'key') {"));
  const pickLits = [...pickBlock.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const zhD = read('src/lib/i18n-zh.js'), jaD = read('src/lib/i18n-ja.js');
  const tr = (dict, k) => { const m = new RegExp('\\n  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ("(?:[^"\\\\]|\\\\.)*")').exec(dict); return m ? JSON.parse(m[1]) : null; };
  const screen1 = (X) => ['Add a third-party model', ...pickLits, ...X.SHIPPED.flatMap((p) => [p.label, p.blurb])];
  ok(pickLits.length >= 2 && gateOf(pickLits.includes('Pick who serves the model — you pay them by use, with your own key')) && gateOf(pickLits.includes('Not for {harness}')) && !/pw-tech|fold\(/.test(pickBlock), 'screen ①\'s words are read off the wizard\'s own pick block (its lead, «Not for …» on a card the opening agent cannot use) — no technical fold there', pickLits);
  ok(verdictOf(screen1(M).every((w) => [w, tr(zhD, w), tr(jaD, w)].filter(Boolean).every((x) => !TECH.test(x)))), 'and in Chinese and Japanese too: no technical word on screen ①', screen1(M).filter((w) => [tr(zhD, w), tr(jaD, w)].some((x) => x && TECH.test(x))));
  ok(verdictOf(screen1(M).every((w) => !TECH.test(w))), 'THE FIRST SCREEN SAYS NO TECHNICAL WORD: its title, its lead and every card (name + one sentence) — no address, no variable, no interface name', screen1(M).filter((w) => TECH.test(w)));
  const mBlurb = mutant([["blurb: i18nKey('DeepSeek’s models, paid by use with your own key')", "blurb: i18nKey('Set ANTHROPIC_BASE_URL to DeepSeek’s address')"]]);
  ok(verdictOf(screen1(mBlurb).some((w) => TECH.test(w))), 'CONTROL: a card that tells the person to set ANTHROPIC_BASE_URL ⇒ the first-screen census goes RED');
  const wiz = wizSrc, ros = read('src/lib/provider-roster.js'), ma2 = read('src/lib/manage-agents.js'), app2 = read('src/lib/app.js'), meta = read('src/lib/agent-meta.js');
  ok(gateOf(wiz.includes('${escHtml(t(s.label))}</b><span>${escHtml(t(s.blurb))}</span>')) && gateOf(wiz.includes("createModalShell({ id: 'provider-wizard', key: backend,")) && verdictOf(wiz.includes('if (!live()) return;\n      st.tests[h] = { busy: true };')), 'the cards draw each preset\'s name and sentence; the form is keyed by its SUBJECT (the harness it was opened for — §103: never a literal key); no test is started once the form is closed');
  ok(gateOf(['/api/providers\', { preset: s.id, key', '/api/providers/${encodeURIComponent(p.id)}/test`, { harness: h }', "/api/accounts/${encodeURIComponent(p.id)}/models`, { models:", '/api/providers/${encodeURIComponent(p.id)}`, { defaultModel: pick }, \'PATCH\''].every((x) => wiz.includes(x))) && gateOf(wiz.includes('type="password"')) && verdictOf(/<details class="pw-tech">/.test(wiz)), 'the wizard asks only the doors that exist (add, the test per harness, the models save, the default) — the key in a password field, the technical details folded');
  ok(gateOf(ma2.includes("...(!selectedHost ? [{ label: t('Add a third-party model…'), action: () => { done(); openProviderWizard({ backend: 'claude', onDone: refresh }); } }] : []),")) && gateOf(ma2.includes("openProviderWizard({ backend: 'codex', onDone: refresh })")) && (ma2.match(/if \(!selectedHost\) renderProviderRows\(body, '(claude|codex)', \{ refresh, sessions: \(\) => namedLiveRows\(this\) \}\)/g) || []).length === 2 && gateOf(ma2.includes("a.backend === 'codex' && a.type !== 'provider'")) && gateOf(ma2.includes("(x.backend || 'claude') === 'claude' && x.type !== 'provider'")) && verdictOf(ma2.includes("a.backend === be && a.type !== 'provider'")), 'Manage agents: ONE «Add a third-party model…» door per roster and the providers\' rows under each — this machine only; NO roster (Claude Code, Codex, the others) draws a provider row as one of its own accounts');
  ok((app2.match(/accounts: accountRowsOf\((msg|d|withTails\(msg\))\)/g) || []).length === 2 && gateOf(meta.includes('export function accountRowsOf(answer)')) && verdictOf(/answer\.providerRows/.test(meta)), 'the page\'s account cache merges the providers\' rows at BOTH places it is set (the push — the person\'s tails laid on first, B-ba7d — and the read) — New Session, Billing and the badge list them');
  ok(gateOf(ros.includes("t('No usage reading'), t('paid by use')")) && gateOf(['Test', 'Models…', 'Rename…', 'New key…', 'Remove…'].every((w) => ros.includes(`label: t('${w}')`))) && gateOf(ros.includes("if (!rows.length || !sec.isConnected) { sec.remove(); return; }")) && ros.indexOf('body.appendChild(sec);') > 0 && ros.indexOf('body.appendChild(sec);') < ros.indexOf("await fetchJson('/api/providers/list', { method: 'POST'") && !ros.includes("t('Add a third-party model…')") && gateOf(ros.includes("key: id, title")) && verdictOf(/\$\{DOTS\}/.test(ros)), 'a roster row: «no usage reading · paid by use · tested …» and ⋯ (the roster\'s DOTS SVG) Test · Models… · Rename… · New key… · Remove…; its section takes its PLACE before the read (never drifts under another heading), leaves when no provider serves the harness, and adds no second add door; the new-key form is keyed by the provider\'s id');
  ok(gateOf(wiz.includes("if (!other && !pick && !rows.length && !hasModel(st.provider)) { st.error = listed ? (st.listFetched ? t('{provider} answered an empty model list")) && gateOf(wiz.includes(": t('Get the model list first — {provider} has no model yet', { provider: p.label })")) && gateOf(read('src/lib/session-card.js').includes(": a.type === 'provider' ? tr('{name} (third party)', { name: a.name })   // lane lg-providers chain cure")) && verdictOf(read('src/lib/account-models.js').includes("typeof p.refreshable === 'boolean' ? p.refreshable : refreshable(p)")), 'the chain cure\'s page words: the model step\'s Done with nothing chosen says what is missing (never «ready»); the stopped conversation\'s resume popover names a provider row «(third party)», never «API …null» (on another machine it is left out — the next leg); the models dialog\'s Refresh is decided by the server off the whole record');
  // THE REMAINDERS (the coordinator's 20:45Z): the remove confirm names the conversations on that provider; a fetched list that came
  // back empty has its own words; a remote session's provider row is LEFT OUT of the resume popover (never a grey row)
  const ROWS = [{ accountId: 'pv-r1', name: 'Fix the build' }, { accountId: 'acct-1', name: 'Other' }, { accountId: 'pv-r1', name: '' }, { accountId: 'pv-r3', name: 'x'.repeat(80) }, ...Array.from({ length: 9 }, (_, i) => ({ accountId: 'pv-r2', name: 'c' + i }))];
  const on1 = M.conversationsOn(ROWS, 'pv-r1'), on2 = M.conversationsOn(ROWS, 'pv-r2'), on0 = M.conversationsOn(null, 'pv-r1');
  ok(gateOf(eq(on1, { n: 2, names: ['Fix the build', '—'], more: 0 })) && on2.n === 9 && on2.names.length === 8 && on2.more === 1 && gateOf(eq(on0, { n: 0, names: [], more: 0 })) && M.conversationsOn(ROWS, 'pv-r3').names[0].length === 60, 'conversationsOn: the live rows whose account IS this provider, named (an unnamed one «—»), at most eight and «and N more»; none ⇒ n 0', { on1, on2 });
  const mOn = mutant([['  const on = (Array.isArray(rows) ? rows : []).filter((x) => x && x.accountId === id);', '  const on = (Array.isArray(rows) ? rows : []).filter((x) => x && x.accountId);']]);
  ok(mOn.conversationsOn(ROWS, 'pv-r1').n === 13, 'CONTROL: a count that does not match the provider names every conversation on the machine ⇒ the leg goes RED');
  const SC = read('src/lib/session-card.js');
  ok(gateOf(ros.includes('export function providerRemoveWords(p, rows) {')) && gateOf(ros.includes('const w = providerRemoveWords(p, (() => { try { return sessions(); } catch { return []; } })());')) && gateOf(ros.includes('export function namedLiveRows(app) {')) && (ma2.match(/renderProviderRows\(body, '(claude|codex)', \{ refresh, sessions: \(\) => namedLiveRows\(this\) \}\)/g) || []).length === 2 && gateOf(wiz.includes("st.listFetched ? t('{provider} answered an empty model list")) && gateOf(wiz.includes('st.listFetched = true;')) && gateOf(SC.includes("...acctList.filter((a) => !(a.type === 'provider' && s.host) || a === savedPv).map(a => ({ value: a.id, label:")) && gateOf(SC.includes("const savedPv = s.host ? acctList.find((a) => a.type === 'provider' && a.id === overrides.account) || null : null;")) && gateOf(SC.includes("if (savedPv) { const note = document.createElement('div'); note.className = 'session-config-note chat-status-dim'; note.textContent = tr('A third-party model runs on this machine only for now — start the conversation here');")) && !SC.includes('opt.disabled') && !SC.includes("tr('{name} (third party)', { name: a.name }) + (s.host"), 'the page: BOTH rosters hand the remove confirm the sidebar\'s named rows and the roster\'s Remove… asks the ONE words function (driven with a stand-in app in test-manage-agents, with the Vault window\'s door); a list fetched EMPTY says so in its own words; the resume popover LEAVES OUT a provider row when the card carries another machine — no grey row, no hint; when that provider IS the conversation\'s saved pick its row stays by its name and one line says the refusal (never «Custom…» with a raw pv- id) (today a stopped card never carries its host; the create refuses a provider there by name)');   // stale-pins: kept (the absence checks: no disabled option, no hint suffix)
  const ap = read('src/lib/app.js'), sp = read('src/lib/session-props.js'), sl = read('src/lib/session-lifecycle.js'), ra = read('src/resume-account.js');
  ok(gateOf(ap.includes("if (a.type === 'provider') { opts.push(onHost ? [a.id, t('{name} (third party)', { name: a.name }) + ' — ' + t('this machine only'), true]")) && gateOf(sp.includes("if (x.type === 'provider') return !!rHost;")) && gateOf(sl.includes("if (a.type === 'provider') return rHostId ? t('A third-party model runs on this machine only for now")) && verdictOf(ra.includes("if (a.type === 'provider') return { ok: false, why: 'remote-cannot-ship', since: null };")), 'on ANOTHER machine a provider row is never offered as usable — New Session (disabled, «this machine only»), Session Properties, the billing switcher (it would end the session and the create refuse) and the resume bar');

}

// ── ⑳ THE KEY TAILS ARE THE PERSON'S (B-ba7d — the owner's decision 2026-11-18 14:48 PT) ─────────────────────────────────
// GET /api/accounts and the accounts-updated push carry NO key tail (an API-key account's, a provider row's, the CLI's own key's);
// the person's own read (POST /api/accounts/tails, behind the person verdict) answers them. The REAL accounts store, the REAL
// answer and door (src/routes/account-tails.js — account-usage-routes wires exactly these two), a stand-in express.
console.log('⑳ the key tails: the person\'s read only');
{
  const AT = require(path.join(ROOT, 'src/routes/account-tails.js'));
  const TD = path.join(dir, 'tails'); fs.mkdirSync(TD, { recursive: true });
  const HOME0 = process.env.HOME; const TH = path.join(TD, 'home'); fs.mkdirSync(TH, { recursive: true });
  const T_API = ['Zt7x', '9Q2w'].join(''), T_CLI = ['Kc4m', 'R8vn'].join(''), T_PV = ['Xq', '7Z'].join('');   // built at runtime, distinct
  fs.writeFileSync(path.join(TH, '.claude.json'), JSON.stringify({ primaryApiKey: ['sk-ant-', 'api03-', 'c'.repeat(30), T_CLI].join('') }));
  const pushed = [];
  const build = (AM, rowsOf = M.rosterRowsOf) => {
    const a = new AM({ dataDir: fs.mkdtempSync(path.join(TD, 'am-')), onChange: (l) => pushed.push(JSON.stringify(l)) });
    a.setProviderRows(() => rowsOf([{ ...M.draftOf('deepseek'), id: 'pv-tails1', label: 'DeepSeek', tail: T_PV }]));
    const id = a.add({ name: 'Console', key: ['sk-ant-', 'api03-', 'k'.repeat(30), T_API].join('') }).id;
    return { a, id };
  };
  const AGENT = { Authorization: 'Bearer ' + ['vs-sess-', 'a1b2', 'c3d4'].join('') };   // the kind of credential a conversation holds
  const ask = async (base, method, url, headers = {}) => { const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: '{}' } : {}) }); return [r.status, await r.text()]; };
  const anyTail = (s) => [T_API, T_CLI, T_PV].filter((x) => String(s).includes(x));
  const run = async (AM, ATm, rowsOf) => {
    process.env.HOME = TH;
    try {
      pushed.length = 0;
      const { a, id } = build(AM, rowsOf);
      const A = ATm || AT;
      const app = express(); app.use(express.json());
      A.registerAccountTailRoutes(app, { accounts: a, providers: { thirdParty: () => [{ id: 'pv-tails1', tail: T_PV }] } });
      app.get('/api/accounts', (req, res) => res.json(A.accountsAnswer({ accounts: a, hosts: null })));
      const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
      const base = `http://127.0.0.1:${s.address().port}`;
      try {
        const [gs, gb] = await ask(base, 'GET', '/api/accounts', AGENT);
        const [ps, pb] = await ask(base, 'POST', '/api/accounts/tails', AGENT);
        const [xs, xb] = await ask(base, 'POST', '/api/accounts/tails', { 'Sec-Fetch-Site': 'cross-site' });
        const [ms, mb] = await ask(base, 'POST', '/api/accounts/tails', { 'Sec-Fetch-Site': 'same-origin' });   // the person on this page
        const [ls, lb] = await ask(base, 'POST', '/api/accounts/tails');   // no Origin, no Sec-Fetch-Site: a script on this machine (an agent on an open instance), not a page
        return { id, gs, gb, ps, pb, xs, xb, ls, lb, ms, mine: (() => { try { return JSON.parse(mb); } catch { return null; } })(), push: pushed.join('\n'), cliImported: a.cliPrimaryKey() };
      } finally { s.close(); }
    } finally { process.env.HOME = HOME0; }
  };
  const r = await run(AccountManager);
  ok(r.gs === 200 && anyTail(r.gb).length === 0 && gateOf(JSON.parse(r.gb).accounts.some((x) => x.id === r.id)) && gateOf(JSON.parse(r.gb).providerRows.some((x) => x.id === 'pv-tails1')) && JSON.parse(r.gb).cliKey.present === true,
    'a conversation\'s own credential asks for the accounts list: the API-key row, the provider row and the CLI key are all there — and NO key tail anywhere in the reply', anyTail(r.gb));
  ok(pushed.length > 0 && anyTail(r.push).length === 0, 'the accounts-updated push (every client, every agent-readable mirror) carries no key tail', anyTail(r.push));
  ok(r.ps === 403 && anyTail(r.pb).length === 0 && gateOf(/person/.test(r.pb)) && r.xs === 403 && anyTail(r.xb).length === 0 && r.ls === 403 && anyTail(r.lb).length === 0, 'the tails door refuses the conversation\'s credential, a page of another site and a header-less script on this machine (403), no tail in any reply', [r.ps, r.xs]);
  ok(r.ms === 200 && gateOf(r.mine) && gateOf(r.mine.ok) && r.mine.tails.accounts[r.id] === T_API && r.mine.tails.cliKey === T_CLI && !Object.prototype.hasOwnProperty.call(r.mine.tails.accounts, 'pv-tails1') && r.mine.tails.providers['pv-tails1'] === T_PV,
    'the PERSON\'s own read answers the tails: the API-key account\'s, the CLI key\'s and the providers\' (the conversation badges carry none)', r.mine);
  ok(r.cliImported.present === true && r.cliImported.imported === false && !('tail' in r.cliImported), 'the CLI key\'s facts keep what the page compares them for (imported) without the tail', r.cliImported);
  // RED CONTROLS: a patched copy compiled in memory beside the real file (never written into the tree)
  const patched = (rel, pairs) => {
    const f = path.join(ROOT, rel); let s = fs.readFileSync(f, 'utf-8');
    for (const [from, to] of pairs) { if (s.split(from).length !== 2) throw new Error('control anchor not in ' + rel + ' once: ' + from.slice(0, 70)); s = s.replace(from, to); }
    const m = new Module(f); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f)); m._compile(s, f); return m.exports;
  };
  const LIST = "        return base;   // NO key tail (B-ba7d";
  const cl = await run(patched('src/accounts.js', [[LIST, "        return { ...base, tail: a.tail };   // CONTROL (B-ba7d"]]).AccountManager);
  ok(gateOf(anyTail(cl.gb).includes(T_API)) && verdictOf(anyTail(cl.push).includes(T_API)), 'CONTROL: the list with the API key\'s tail (as before this row) hands it to the conversation\'s credential AND the push ⇒ the legs above go RED', anyTail(cl.gb));
  const DOOR = "    const who = personVerdict(req);\n    if (!who.ok) return res.status(403)";
  const cd = await run(AccountManager, patched('src/routes/account-tails.js', [[DOOR, "    const who = { ok: true };\n    if (!who.ok) return res.status(403)"]]));
  ok(cd.ps === 200 && verdictOf(anyTail(cd.pb).includes(T_API)), 'CONTROL: the tails door without the person verdict answers the conversation\'s credential ⇒ the refusal leg goes RED', [cd.ps, anyTail(cd.pb)]);
  const cpv = await run(AccountManager, null, mutant([["localOnly: true,   // NO key tail", "localOnly: true, tail: p.tail || null,   // CONTROL"]]).rosterRowsOf);
  ok(gateOf(anyTail(cpv.gb).includes(T_PV)) && verdictOf(anyTail(cpv.push).includes(T_PV)), 'CONTROL: a provider row with its tail (as before this row) hands it to the conversation\'s credential AND the push ⇒ the provider-row leg goes RED', anyTail(cpv.gb));
  const CLI = "the person's read is keyTails().cliKey\n          present: true,\n";
  const ccl = await run(patched('src/accounts.js', [[CLI, "the person's read is keyTails().cliKey\n          present: true, tail,\n"]]).AccountManager);
  ok(verdictOf(anyTail(ccl.gb).includes(T_CLI)), 'CONTROL: the CLI key\'s facts with its tail (as before this row) hand it to the conversation\'s credential ⇒ the CLI-key leg goes RED', anyTail(ccl.gb));
  // a key added WITHOUT a name: never «API key …<tail>» (its reader's M2) — and a record stored under that old default name is SHOWN as «API key»
  process.env.HOME = TH;
  try {
    const nm = new AccountManager({ dataDir: fs.mkdtempSync(path.join(TD, 'am-noname-')) });
    const nid = nm.add({ name: '', key: ['sk-ant-', 'api03-', 'n'.repeat(30), T_API].join('') }).id;
    nm._state.accounts.push({ id: 'acct-old-default', name: 'API key …' + ['Pz8', 'Lq2', 'Wv'].join(''), type: 'api', tail: ['Pz8', 'Lq2', 'Wv'].join(''), createdAt: 1 });
    const lj = JSON.stringify(nm.list());
    ok(nm.get(nid).name === 'API key' && !lj.includes(T_API) && !lj.includes('Pz8Lq2Wv') && nm.nameShownOf('acct-old-default') === 'API key',
      'a key added without a name is named «API key» (never its tail); a record under the old default name «API key …<tail>» is SHOWN as «API key» in the list and every name that leaves the store', { name: nm.get(nid).name, shown: nm.nameShownOf('acct-old-default') });
    // the ONE-SHOT RENAME (migration 2026-11-default-key-names): the stored old default names become «API key», idempotently; a name the
    // usage ledger stored before it (an event's aname) is masked where it is answered
    const ACC = require(path.join(ROOT, 'src/accounts.js'));
    const rr = nm.renameDefaultKeyNames(), rr2 = nm.renameDefaultKeyNames();
    const MIG = read('src/server/migrations.js'), AUR = read('src/server/account-usage-routes.js'), UH = read('src/usage-history.js');
    ok(rr.length === 1 && rr[0].id === 'acct-old-default' && nm.get('acct-old-default').name === 'API key' && rr2.length === 0
      && ACC.maskDefaultKeyName('API key …' + ['Pz8', 'Lq2', 'Wv'].join('')) === 'API key' && ACC.maskDefaultKeyName('Work') === 'Work'
      && gateOf(MIG.includes("id: '2026-11-default-key-names',")) && gateOf(MIG.includes('const rep = am.renameDefaultKeyNames();'))
      && gateOf(AUR.includes("aname: ev.aname ? require('../accounts').maskDefaultKeyName(ev.aname) : null,")) && verdictOf(UH.includes("tail: null,   // B-ba7d")),
      'the one-shot rename makes every stored «API key …<tail>» name «API key» (idempotent; a boot migration); the ledger\'s stored names are masked where answered (rid-info, the usage rows carry no tail)', { rr, rr2 });
    // THE MIGRATION ITSELF (its reader's S3): the registry's own entry run over a real store; a store-less boot with an old default
    // name on disk FAILS by name (retried next boot); CONTROL: a store whose rename does nothing leaves the tail in the name
    const OLD = 'API key …' + ['Pz8', 'Lq2', 'Wv'].join('');
    const migOf = (accounts, root) => require(path.join(ROOT, 'src/server/migrations.js')).create({ rootDir: root, serverNotice: () => {}, accounts }).MIGRATIONS.find((m) => m.id === '2026-11-default-key-names');
    const root1 = fs.mkdtempSync(path.join(TD, 'mig-')); fs.mkdirSync(path.join(root1, 'data'));
    const m1 = new AccountManager({ dataDir: path.join(root1, 'data') });
    m1._state.accounts.push({ id: 'acct-old-1', name: OLD, type: 'api', tail: ['Pz8', 'Lq2', 'Wv'].join(''), createdAt: 1 });
    const ran = migOf(m1, root1).run();
    const root2 = fs.mkdtempSync(path.join(TD, 'mig-')); fs.mkdirSync(path.join(root2, 'data'));
    fs.writeFileSync(path.join(root2, 'data', 'accounts.json'), JSON.stringify({ accounts: [{ id: 'acct-old-2', name: OLD, type: 'api', tail: ['Pz8', 'Lq2', 'Wv'].join('') }] }));
    const noStore = (() => { try { migOf(null, root2).run(); return 'ran'; } catch (e) { return String(e && e.message); } })();
    ok(ran.length === 1 && m1.get('acct-old-1').name === 'API key' && verdictOf(/no live account store to rename 1 default key name/.test(noStore)),
      'the migration 2026-11-default-key-names, run from the registry over a real store, renames the stored old default name; a boot with no live store and such a name on disk fails by name (retried next boot)', { ran, noStore });
    const NOP = patched('src/accounts.js', [["    for (const a of this._state.accounts) if (a && a.tail && a.name === 'API key …' + a.tail) { a.name = 'API key'; out.push({ id: a.id }); }", "    // CONTROL: the rename does nothing"]]).AccountManager;
    const root3 = fs.mkdtempSync(path.join(TD, 'mig-')); fs.mkdirSync(path.join(root3, 'data'));
    const m3 = new NOP({ dataDir: path.join(root3, 'data') });
    m3._state.accounts.push({ id: 'acct-old-3', name: OLD, type: 'api', tail: ['Pz8', 'Lq2', 'Wv'].join(''), createdAt: 1 });
    migOf(m3, root3).run();
    ok(m3.get('acct-old-3').name === OLD, 'CONTROL: a store whose rename does nothing keeps «API key …<tail>» as the NAME after the migration ⇒ the migration leg goes RED', m3.get('acct-old-3').name);
  } finally { process.env.HOME = HOME0; }
  const aur = read('src/server/account-usage-routes.js');
  ok(gateOf(aur.includes("require('../routes/account-tails.js').registerAccountTailRoutes(app, { accounts, providers });")) && gateOf(aur.includes("app.get('/api/accounts', (req, res) => res.json(require('../routes/account-tails.js').accountsAnswer({ accounts, hosts })));"))
    && aur.indexOf("registerAccountTailRoutes(app, { accounts, providers })") < aur.indexOf("app.post('/api/accounts', (req, res) => {"),
    'the hub serves exactly these two: the accounts list through accountsAnswer, the tails through the person\'s door');
}

// ── ㉑ A WHOLE CREDENTIAL WITH NO VAULT IS THE PERSON'S (B-ee0a — 主开发 2026-11-19 03:16Z) ─────────────────────────────
// With no vault set up, the key reveal (GET / POST /api/accounts/:id/key) and the config export's credentials answered a WHOLE
// credential to any caller. Now the no-vault branch asks the person verdict first: a conversation's / job's / automation's
// credential and a script with no browser headers of this page are refused BY NAME; a set-up vault's branch is unchanged. A paired
// machine's CLI-key tail leaves the accounts-status answer for the person's read. The REAL doors (src/routes/account-tails.js
// revealKeyDoorOf / keepHostCliTail / the tails door; src/routes/persistence.js's export) over the REAL accounts store, a stand-in express.
console.log('㉑ a whole credential with no vault: the person\'s only');
{
  const AT = require(path.join(ROOT, 'src/routes/account-tails.js'));
  const ED = path.join(dir, 'ee0a'); fs.mkdirSync(ED, { recursive: true });
  const KEY = ['sk-ant-', 'api03-', 'w'.repeat(30), ['Pn', '6t', 'Jr2d'].join('')].join('');   // built at runtime
  const a = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ED, 'am-')) });
  const id = a.add({ name: 'Console', key: KEY }).id;
  const AGENT = { Authorization: 'Bearer ' + ['vs-sess-', 'e5f6', 'a7b8'].join('') };   // the kind of credential a conversation holds
  const PAGE = { 'Sec-Fetch-Site': 'same-origin' };   // the person on this page
  const serve = async (A, gate, fn) => {
    const app = express(); app.use(express.json());
    if (gate) app.locals.vaultGate = gate;
    const door = A.revealKeyDoorOf({ accounts: a });
    app.get('/api/accounts/:id/key', door); app.post('/api/accounts/:id/key', door);
    A.registerAccountTailRoutes(app, { accounts: a, providers: null });
    const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const base = `http://127.0.0.1:${s.address().port}`;
    const hit = async (method, url, headers = {}, body) => { const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { } return { status: r.status, text: t, json: j, cc: r.headers.get('cache-control') }; };
    try { return await fn(hit); } finally { s.close(); }
  };
  const K = `/api/accounts/${encodeURIComponent(id)}/key`;
  const real = await serve(AT, null, async (hit) => ({ agentGet: await hit('GET', K, AGENT), agentPost: await hit('POST', K, AGENT), bare: await hit('POST', K), cross: await hit('POST', K, { 'Sec-Fetch-Site': 'cross-site' }), page: await hit('POST', K, PAGE), pageGet: await hit('GET', K, PAGE),
    bareGet: await hit('GET', K), crossGet: await hit('GET', K, { 'Sec-Fetch-Site': 'cross-site' }), queryToken: await hit('POST', K + '?token=' + ['vs', 'ak_', 'q1'].join(''), PAGE) }));   // B-ee0a's take: the kept GET's two rows; a token in the query
  const refusedBy = (r, code) => r.status === 403 && !!r.json && r.json.code === code && !r.text.includes(KEY) && r.json.error === AT.CREDENTIAL_DOOR_WORDS[code];
  ok(gateOf(refusedBy(real.agentGet, 'credential_person_only')) && gateOf(refusedBy(real.agentPost, 'credential_person_only')) && gateOf(refusedBy(real.bare, 'credential_page_only')) && gateOf(refusedBy(real.cross, 'credential_page_only'))
    && real.page.status === 200 && real.page.json.key === KEY && real.pageGet.status === 200 && real.pageGet.json.key === KEY
    && gateOf(refusedBy(real.bareGet, 'credential_page_only')) && gateOf(refusedBy(real.crossGet, 'credential_page_only')) && gateOf(refusedBy(real.queryToken, 'credential_person_only'))
    && verdictOf(Object.values(real).every((r) => r.cc === 'no-store')),
    'NO VAULT: the key reveal answers the whole key to a person on this page only (POST, and the GET kept for older pages) — a conversation\'s credential (a Bearer, or a token in the query) is refused credential_person_only, a header-less script or another site credential_page_only on GET and POST, BY NAME, the key nowhere in the refusal; every answer and refusal carries no-store', { agent: real.agentPost.json, bare: real.bare.json, page: real.page.status, cc: Object.values(real).map((r) => r.cc) });
  const GATE = { state: () => 'unlocked', reveal: () => ({ ok: false, code: 'reveal_needs_password' }), statusOf: () => 403, refusalOf: () => 'the window first' };
  const vaulted = await serve(AT, GATE, async (hit) => ({ page: await hit('POST', K, PAGE), agent: await hit('POST', K, AGENT) }));
  ok(vaulted.page.status === 403 && vaulted.page.json.code === 'reveal_needs_password' && vaulted.agent.json.code === 'reveal_needs_password' && vaulted.page.cc === 'no-store' && vaulted.agent.cc === 'no-store', 'a SET-UP vault\'s branch is unchanged: its window decides (reveal_needs_password here), never this check — and its answers carry no-store too (set before both branches)', vaulted.page.json);
  // a PAIRED machine's CLI-key tail (the ask answered: yes)
  const HT = ['Hq', '3w', 'Zp8c'].join('');
  const sent = AT.keepHostCliTail('host-ee0a', { platform: 'linux', cliKey: { present: true, tail: HT }, subscription: { loggedIn: false } });
  const hostAsk = await serve(AT, null, async (hit) => ({ page: await hit('POST', '/api/accounts/tails', PAGE, { hostId: 'host-ee0a' }), agent: await hit('POST', '/api/accounts/tails', AGENT, { hostId: 'host-ee0a' }), other: await hit('POST', '/api/accounts/tails', PAGE, { hostId: 'host-none' }) }));
  AT.keepHostCliTail('host-gone', { cliKey: { present: true, tail: HT } }); AT.forgetHostCliTail('host-gone');   // B-ee0a's take: a machine removed takes its kept tail
  const gone = await serve(AT, null, async (hit) => hit('POST', '/api/accounts/tails', PAGE, { hostId: 'host-gone' }));
  ok(gone.json.tails.hostCliKey === null && verdictOf(read('src/server/exit-routes.js').includes("try { require('../routes/account-tails.js').forgetHostCliTail(h.id); } catch { }")), 'a machine removed (removeHost — the delete and a machine replaced) takes its kept CLI-key tail with it: the person\'s read answers none (a machine list imported whole, or a probe that lands after the removal, can leave an entry for an id that no longer exists — only ever answered to the person)', gone.json);
  AT.keepHostCliTail('host-ee0a', { cliKey: { present: false } });
  const cleared = await serve(AT, null, async (hit) => hit('POST', '/api/accounts/tails', PAGE, { hostId: 'host-ee0a' }));
  ok(!JSON.stringify(sent).includes(HT) && sent.cliKey.present === true && hostAsk.page.json.tails.hostCliKey === HT && Object.keys(hostAsk.page.json.tails).length === 1 && hostAsk.agent.status === 403 && !hostAsk.agent.text.includes(HT)
    && hostAsk.other.json.tails.hostCliKey === null && cleared.json.tails.hostCliKey === null,
    'a PAIRED machine\'s CLI-key tail: the accounts-status answer carries none (present kept); the person\'s read answers the last probe\'s ({ hostId } — nothing else read), a conversation\'s credential refused; a machine not probed or whose key is gone answers none', { sent: sent.cliKey, page: hostAsk.page.json, other: hostAsk.other.json });
  // THE CONFIG EXPORT's credentials with no vault — the REAL route (src/routes/persistence.js), its accounts bundle stood in
  const P = require(path.join(ROOT, 'src/routes/persistence.js'));
  let importCalls = 0;
  const PD = fs.mkdtempSync(path.join(ED, 'p-'));
  P.setup({ dataDir: PD, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null,
    getAccounts: () => ({ exportBundle: () => ({ accounts: [{ id, key: KEY }] }), importBundle: () => { importCalls++; return { imported: 1, skipped: 0 }; }, persisted: () => Promise.resolve(true) /* B-574d unit 1 (a): the production store's landing */, list: () => ({ accounts: [] }) }), getUsageHistory: () => null, onSettingsWrite: () => { } });
  const expDoor = P.router.stack.find((l) => l.route && l.route.path === '/api/config/export' && l.route.methods.post).route.stack[0].handle;
  const doExport = (headers) => new Promise((resolve) => {
    const out = { status: 200, headers: {} };
    const res = { status(c) { out.status = c; return this; }, set(k, v) { out.headers[k] = v; return this; }, setHeader(k, v) { out.headers[k] = v; }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); }, get headersSent() { return 'body' in out; } };
    expDoor({ body: { sections: [], includeSensitive: ['accounts'], passphrase: 'abcd' }, headers, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out));
  });
  const eAgent = await doExport({ authorization: AGENT.Authorization }), eBare = await doExport({}), ePage = await doExport({ 'sec-fetch-site': 'same-origin' });
  ok(eAgent.status === 403 && eAgent.body.code === 'credential_person_only' && eBare.status === 403 && eBare.body.code === 'credential_page_only' && !JSON.stringify([eAgent.body, eBare.body]).includes(KEY)
    && ePage.status === 200 && !!ePage.body.sensitive && gateOf(Array.isArray(ePage.body.sensitive.manifest)) && verdictOf(ePage.body.sensitive.manifest.includes('accounts')),
    'NO VAULT: the config export\'s credentials leave to a person on this page only — a conversation\'s credential and a header-less script refused by name, nothing exported to them', { agent: eAgent.body, bare: eBare.body, page: ePage.status });
  // …and the IMPORT's credentials (its reader's find, cured in the unit): written in only for the person — a conversation's
  // credential or a header-less script never sets the sign-in password or a login
  const impDoor = P.router.stack.find((l) => l.route && l.route.path === '/api/config/import' && l.route.methods.post).route.stack[0].handle;
  const doImport = (headers) => new Promise((resolve) => {
    const out = { status: 200, headers: {} };
    const res = { status(c) { out.status = c; return this; }, set(k, v) { out.headers[k] = v; return this; }, setHeader(k, v) { out.headers[k] = v; }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); }, get headersSent() { return 'body' in out; } };
    impDoor({ body: { file: ePage.body, sections: [], includeSensitive: ['accounts'], passphrase: 'abcd' }, headers, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out));
  });
  // the IMPORT's order (B-ee0a's take): a refused caller that also names a plain section (bookmarks) writes NOTHING — the check stands
  // before the first section
  const doImportB = (headers) => new Promise((resolve) => {
    const out = { status: 200 };
    const res = { status(c) { out.status = c; return this; }, set() { return this; }, setHeader() { }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); }, get headersSent() { return 'body' in out; } };
    impDoor({ body: { file: { ...ePage.body, sections: { bookmarks: [{ name: 'Planted', url: 'https://example.test/' }] } }, sections: ['bookmarks'], includeSensitive: ['accounts'], passphrase: 'abcd' }, headers, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out));
  });
  const iOrder = await doImportB({ authorization: AGENT.Authorization });
  ok(iOrder.status === 403 && iOrder.body.code === 'credential_person_only' && !fs.existsSync(path.join(PD, 'bookmarks.json')) && importCalls === 0,
    'the import\'s ORDER: a conversation\'s credential that names a plain section (bookmarks) beside the credentials is refused WHOLE — no bookmarks file written, nothing imported', { status: iOrder.status, wrote: fs.existsSync(path.join(PD, 'bookmarks.json')) });
  {   // CONTROL: the person asked only where the credentials are read (below the plain sections) — the refused caller's bookmarks ARE written
    const PF = path.join(ROOT, 'src/routes/persistence.js');
    let ps = fs.readFileSync(PF, 'utf-8');
    ps = anchored(ps, "    if (includeSensitive.length && file.sensitive && !personOnlyDoor(req, res)) return;\n", '', 'the import\'s person check lifted from the top');
    ps = anchored(ps, '    if (includeSensitive.length && file.sensitive) {   // (the person was asked above', "    if (includeSensitive.length && file.sensitive && !personOnlyDoor(req, res)) return;\n    if (includeSensitive.length && file.sensitive) {   // (the person was asked above", 'the import\'s person check put below the plain sections');
    const pm = new Module(PF); pm.filename = PF; pm.paths = Module._nodeModulePaths(path.dirname(PF)); pm._compile(ps, PF);
    const PD2 = fs.mkdtempSync(path.join(ED, 'p2-'));
    pm.exports.setup({ dataDir: PD2, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => ({ importBundle: () => ({ imported: 0 }), list: () => ({ accounts: [] }) }), getUsageHistory: () => null, onSettingsWrite: () => { } });
    const imp2 = pm.exports.router.stack.find((l) => l.route && l.route.path === '/api/config/import' && l.route.methods.post).route.stack[0].handle;
    const o2 = await new Promise((resolve) => {
      const out = { status: 200 };
      const res = { status(c) { out.status = c; return this; }, set() { return this; }, setHeader() { }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); }, get headersSent() { return 'body' in out; } };
      imp2({ body: { file: { ...ePage.body, sections: { bookmarks: [{ name: 'Planted', url: 'https://example.test/' }] } }, sections: ['bookmarks'], includeSensitive: ['accounts'], passphrase: 'abcd' }, headers: { authorization: AGENT.Authorization }, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out));
    });
    ok(o2.status === 403 && verdictOf(fs.existsSync(path.join(PD2, 'bookmarks.json'))), 'CONTROL: the import that asks the person only where the credentials are read writes the refused caller\'s bookmarks first ⇒ the order leg above goes RED', { status: o2.status, wrote: fs.existsSync(path.join(PD2, 'bookmarks.json')) });
  }
  const iAgent = await doImport({ authorization: AGENT.Authorization }), iBare = await doImport({}), callsRefused = importCalls, iPage = await doImport({ 'sec-fetch-site': 'same-origin' });
  ok(iAgent.status === 403 && iAgent.body.code === 'credential_person_only' && iBare.status === 403 && iBare.body.code === 'credential_page_only' && callsRefused === 0 && iPage.status === 200 && importCalls === 1,
    'the config IMPORT\'s credentials are written in only for a person on this page — a conversation\'s credential and a header-less script refused by name, nothing imported for them', { agent: iAgent.body, bare: iBare.body, page: iPage.status, importCalls });
  // (1) THE MOUNT CONFIG DOOR with no vault (B-ee0a's take, 主开发 08:50Z): the person verdict as its siblings — its OWN text (the
  // ONE answer and its two routes, cut from src/server/mounts-plugins-wiring.js as test-vault-contents runs it) in a stand-in app
  const WIRING = read('src/server/mounts-plugins-wiring.js');
  const MSTART = WIRING.indexOf('function mountConfigAnswer('), MPOST = WIRING.indexOf("app.post('/api/mounts/:id/config', ", MSTART);
  const MROUTE = MSTART > 0 && MPOST > MSTART ? WIRING.slice(MSTART, WIRING.indexOf('\n});', MPOST) + 4) : '';
  const agentRefuse = (req, res) => { if (/^Bearer\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || ''))) { res.status(403).json({ code: 'agent-forbidden' }); return true; } return false; };
  const CFG = { id: 'mnt1', type: 's3', name: 'Team bucket', accessKey: 'AK', held: ['secretKey'] };
  const mountServe = async (text, fn) => {
    const app = express(); app.use(express.json()); app.locals.vaultGate = { state: () => 'not_set_up' };
    new Function('app', 'mounts', 'refuseAgentBearer', 'personOnlyDoor', text)(app, { revealNeeded: () => true, config: () => CFG }, agentRefuse, AT.personOnlyDoor);
    const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const hit = async (method, headers = {}) => { const r = await fetch(`http://127.0.0.1:${s.address().port}/api/mounts/mnt1/config`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: '{}' } : {}) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { } return { status: r.status, json: j, cc: r.headers.get('cache-control') }; };
    try { return await fn(hit); } finally { s.close(); }
  };
  const AUTOMATION = { Authorization: 'Bearer ' + ['vs', 'ak_', 'm9', 'x2'].join('') };   // an automation key (not refused by the agent-only guard)
  const mc = await mountServe(MROUTE, async (hit) => ({ bare: await hit('GET'), auto: await hit('GET', AUTOMATION), agent: await hit('GET', { Authorization: 'Bearer ' + ['vss', 't_', 'a1'].join('') }), pagePost: await hit('POST', PAGE), pageGet: await hit('GET', PAGE) }));
  ok(!!MROUTE && mc.bare.status === 403 && mc.bare.json.code === 'credential_page_only' && mc.auto.status === 403 && mc.auto.json.code === 'credential_person_only' && mc.agent.status === 403
    && mc.pagePost.status === 200 && mc.pagePost.json.accessKey === 'AK' && mc.pageGet.status === 200 && verdictOf([mc.bare, mc.auto, mc.pagePost].every((r) => r.cc === 'no-store')),
    'the MOUNT CONFIG door with no vault: a header-less script refused credential_page_only, an AUTOMATION key credential_person_only (the agent-only guard passed it), a conversation\'s token by its own guard; the person on this page answered (POST, the page\'s road, and GET); no-store', { bare: mc.bare.json, auto: mc.auto.json, post: mc.pagePost.status });
  const mc0 = await mountServe(anchored(MROUTE, "  if ((!gate || gate.state() === 'not_set_up') && !personOnlyDoor(req, res)) return;", '', 'the mount config answer without the person check'), async (hit) => ({ bare: await hit('GET'), auto: await hit('GET', AUTOMATION) }));
  ok(mc0.bare.status === 200 && mc0.auto.status === 200, 'CONTROL: the mount config answer without the person check hands the config to a header-less script and an automation key ⇒ the leg above goes RED', { bare: mc0.bare.status, auto: mc0.auto.status });
  // (5) ONE rule that spots a carried credential: src/routes/vault.js's (it counts ?token= / ?vsst= too); desktop-apps and exit-routes ask it
  const VJS = read('src/routes/vault.js');
  ok(VJS.split('const isAnyBearer = ').length === 2 && gateOf(/req\.query\.token != null \|\| req\.query\.vsst != null/.test(VJS)) && gateOf(read('src/routes/desktop-apps.js').includes("const { isAnyBearer } = require('./vault.js');"))
    && gateOf(read('src/server/exit-routes.js').includes("const { isAnyBearer } = require('../routes/vault.js');")) && !/const isAnyBearer =/.test(read('src/routes/desktop-apps.js') + read('src/server/exit-routes.js')),
    'ONE rule spots a carried credential (a Bearer, a body token, a token in the query): src/routes/vault.js\'s — desktop-apps and exit-routes ask it, no copy left', null);
  // the hub's wiring (both doors through these functions) and the page's road
  const AUR = read('src/server/account-usage-routes.js'), PER = read('src/routes/persistence.js'), VR = read('src/lib/vault-reveal.js');
  ok(gateOf(AUR.includes("const revealKeyDoor = AT.revealKeyDoorOf({ accounts });\napp.get('/api/accounts/:id/key', revealKeyDoor);   // KEPT for pages loaded before this build")) && gateOf(AUR.includes("\napp.post('/api/accounts/:id/key', revealKeyDoor);"))
    && gateOf(AUR.includes('const r = AT.keepHostCliTail(req.params.id, await hosts.accountsStatus(req.params.id));')) && gateOf(PER.includes('} else if (!personOnlyDoor(req, res)) return;'))
    && gateOf(VR.includes("{ method: 'POST', headers: { ...revealHeaders(), 'Content-Type': 'application/json' }, body: '{}' }"))
    && verdictOf(read('src/lib/sidebar-mounts.js').includes("api(`/api/mounts/${m.id}/config`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...revealHeaders() }, body: '{}' })")),   // the mount dialog's road too (its delta read: a GET has no Origin on plain http)
    'the wiring: the hub\'s reveal route IS the door (GET and POST), the accounts-status answer goes through the tail keeper, the export asks the person on its no-vault branch; the page reveals by POST', null);
  // CONTROLS — each compiled in memory beside the real file, through its anchor
  const ATF = path.join(ROOT, 'src/routes/account-tails.js');
  const atPatched = (from, to, name) => { const s = anchored(fs.readFileSync(ATF, 'utf-8'), from, to, name); const m = new Module(ATF); m.filename = ATF; m.paths = Module._nodeModulePaths(path.dirname(ATF)); m._compile(s, ATF); return m.exports; };
  const noCheck = atPatched("    if (!personOnlyDoor(req, res)) return;\n    try { res.json({ key: accounts.revealKey(req.params.id) }); }", "    try { res.json({ key: accounts.revealKey(req.params.id) }); }", 'the reveal without the person check');
  const ctl = await serve(noCheck, null, async (hit) => hit('POST', K, AGENT));
  const noStrip = atPatched('  facts.cliKey = { present: !!facts.cliKey.present };\n', '', 'the tail keeper without the strip');
  const kept = noStrip.keepHostCliTail('host-ctl', { cliKey: { present: true, tail: HT } });
  ok(ctl.status === 200 && !!ctl.json && ctl.json.key === KEY && verdictOf(JSON.stringify(kept).includes(HT)), 'CONTROLS: the reveal without the person check hands a conversation\'s credential the whole key; the tail keeper without its strip leaves the tail in the answer ⇒ both legs above go RED', { ctl: ctl.status, kept: kept.cliKey });
  // B-ba7d's FIXES THAT HAD NO LEG (主开发 03:16Z smalls): the write answers, the import's mask, the status route's count by type
  const nT = ['Vc', '8s', 'Kd1x'].join('');
  const nKey = ['sk-ant-', 'api03-', 'n'.repeat(30), nT].join('');
  const wAdd = a.add({ key: nKey }), wAgain = a.add({ key: nKey }), wRen = a.rename(wAdd.id, 'Team'), wMail = a.setEmail(wAdd.id, 'team@example.test');
  const answers = JSON.stringify([wAdd, wAgain, wRen, wMail]);
  ok(wAdd.name === 'API key' && wAgain.existing === true && wRen.name === 'Team' && wMail.email === 'team@example.test' && !answers.includes(nT) && !/"tail"/.test(answers),
    'the write answers (add, the same key again, rename, setEmail) carry no key tail, nor one in a name (a key added without a name is «API key»)', [wAdd, wAgain, wRen, wMail]);
  const iT = ['Gh', '7u', 'Ns3e'].join('');
  const iKey = ['sk-ant-', 'api03-', 'i'.repeat(30), iT].join('');
  const imp = a.importBundle({ accounts: [{ id: 'acct-ee0a01', name: 'API key …' + iKey.slice(-8), key: iKey, backend: 'claude' }] });
  const impRow = (a.list().accounts || []).find((x) => x.id === 'acct-ee0a01');
  ok(imp.imported === 1 && !!impRow && impRow.name === 'API key' && !JSON.stringify(a.list()).includes(iT), 'an export made before the rename brings back no «API key …<tail>»: the imported record is named «API key» (the import\'s mask)', { imp, name: impRow && impRow.name });
  const sapp = express();
  require(path.join(ROOT, 'src/server/backend-status-route.js')).create({ app: sapp, machineProbes: { cliFacts: async () => ({ claude: { loggedIn: false }, codex: {} }) }, accounts: a, claudeCmd: 'claude', codexCmd: 'codex' });
  const ss = await new Promise((r) => { const x = sapp.listen(0, '127.0.0.1', () => r(x)); });
  let stat = null; try { stat = await (await fetch(`http://127.0.0.1:${ss.address().port}/api/backend-status`)).json(); } finally { ss.close(); }
  const apiRows = (a.list().accounts || []).filter((x) => (x.backend || 'claude') === 'claude' && !x.pooled && x.type === 'api').length;
  ok(!!stat && stat.claude.namedLoggedIn === apiRows && apiRows >= 3, 'the backend status (the REAL route over the REAL store) counts an API-key account by its TYPE — an API-key-only machine never reads «not logged in»', { named: stat && stat.claude.namedLoggedIn, apiRows });
  // the decryption-failure error names the account by its PUBLIC name (a record under the old default name never says its tail)
  const dT = ['Fw', '4n', 'Xe6r'].join('');
  const dId = a.add({ name: 'Console', key: ['sk-ant-', 'api03-', 'd'.repeat(30), dT].join('') }).id;
  const dRec = a._state.accounts.find((x) => x.id === dId); dRec.name = 'API key …' + dRec.tail; dRec.keyEnc = 'not-a-sealed-value';
  let dErr = ''; try { a.resolveForSpawn(dId); } catch (e) { dErr = String(e && e.message); }
  ok(gateOf(/account key unavailable/.test(dErr)) && gateOf(dErr.includes('API key')) && !dErr.includes(dT) && !dErr.includes(dRec.tail), 'a key that will not open is named by its PUBLIC name in the error — never the old default «API key …<tail>»', dErr);
  // THE TAILS GENERATION (its reader's MUST — never a wrong tail): the CLI's own key changed on disk (nothing watches it, nothing
  // pushes) moves the word the next time the hub reads it — and pushes the list; a store change moves it too; the list, GET
  // /api/accounts and the person's read carry it (the page reuses a read only under the same word — test-manage-agents)
  const HOME1 = process.env.HOME; const GH = fs.mkdtempSync(path.join(ED, 'home-'));
  process.env.HOME = GH;
  try {
    const pushedGen = [];
    const g = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ED, 'g-')), onChange: (l) => pushedGen.push(l.tailsGen) });
    const cliKey = (t8) => fs.writeFileSync(path.join(GH, '.claude.json'), JSON.stringify({ primaryApiKey: ['sk-ant-', 'api03-', 'z'.repeat(30), t8].join('') }));
    const C1 = ['Aa', '11', 'Bb22'].join(''), C2 = ['Cc', '33', 'Dd44'].join('');
    cliKey(C1);
    const a1 = AT.accountsAnswer({ accounts: g }), a1b = AT.accountsAnswer({ accounts: g });
    cliKey(C2);
    const a2 = AT.accountsAnswer({ accounts: g });
    const gapp = express(); gapp.use(express.json()); AT.registerAccountTailRoutes(gapp, { accounts: g, providers: null });
    const gs = await new Promise((r) => { const x = gapp.listen(0, '127.0.0.1', () => r(x)); });
    const readTails = async () => (await fetch(`http://127.0.0.1:${gs.address().port}/api/accounts/tails`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...PAGE }, body: '{}' })).json();
    let read2 = null, read3 = null, pushedAt3 = 0, pushedAfter3 = 0, a4 = null, pushedAt4 = 0, pushedAfter4 = 0;
    const C3 = ['Gg', '77', 'Hh88'].join('');
    try {
      read2 = await readTails();
      // the person's read is a sight TOO (its delta read): the CLI key changed, then read by the tails door alone — the word moves and the
      // list is pushed (the OTHER tabs ask again)
      cliKey(C3); pushedAt3 = pushedGen.length; read3 = await readTails(); pushedAfter3 = pushedGen.length;
      // a TORN file (a CLI writing it) is no sight: the word does not move, nothing is pushed
      fs.writeFileSync(path.join(GH, '.claude.json'), '{"primaryApiKey": "sk-ant-');
      pushedAt4 = pushedGen.length; a4 = AT.accountsAnswer({ accounts: g }); await readTails(); pushedAfter4 = pushedGen.length;
    } finally { gs.close(); }
    const before = g.tailsGen(); g.add({ name: 'New', key: ['sk-ant-', 'api03-', 'y'.repeat(30), ['Ee', '55', 'Ff66'].join('')].join('') }); const afterAdd = g.tailsGen();
    ok(gateOf(read3) && read3.gen !== read2.gen && pushedAfter3 === pushedAt3 + 1 && read3.tails.cliKey === C3.slice(-8) && gateOf(a4) && a4.tailsGen === read3.gen && pushedAfter4 === pushedAt4,
      'the person\'s read is a sight too: the CLI key changed and read by the tails door alone moves the word and pushes the list (the other tabs ask again); a TORN file moves nothing and pushes nothing', { read2: read2 && read2.gen, read3: read3 && read3.gen, a4: a4 && a4.tailsGen, pushes: [pushedAt3, pushedAfter3, pushedAt4, pushedAfter4] });
    ok(typeof a1.tailsGen === 'string' && a1.tailsGen === a1b.tailsGen && a2.tailsGen !== a1.tailsGen && gateOf(pushedGen.includes(a2.tailsGen)) && gateOf(read2) && read2.gen === a2.tailsGen && read2.tails.cliKey === C2.slice(-8)
      && afterAdd !== before && gateOf(pushedGen.includes(afterAdd)) && !JSON.stringify([a1, a2]).includes(C1) && !JSON.stringify([a1, a2]).includes(C2),
      'the tails generation: the same while nothing changed; the CLI\'s own key changed on disk moves it at the next read (and pushes the list); a store change moves it; the person\'s read answers the word it was read under — no tail in the list', { a1: a1.tailsGen, a2: a2.tailsGen, read: read2 && read2.gen, pushed: pushedGen.length });
  } finally { process.env.HOME = HOME1; }
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
