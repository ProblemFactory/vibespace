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
//   ⑩–⑬ MODELS AT A SESSION (lane models-at-session = row P0c): the MENU of a provider (open / closed / EMPTY — the law:
//      empty ⇔ no row) with its RED control ⑪ (a copy that never says empty = a silent empty menu); ⑫ a running
//      conversation's pick re-resolved against its provider; ⑬ the listed-provider refresh's rules (the list URL per kind,
//      the vault, once a minute — fetchedAt counts —, one in flight, the credential header, the /models parsers, the 1000 rows)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/model-providers.js');
const M = require(SRC);
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/provider-models/catalogs.json'), 'utf-8'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
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
console.log('① the eight kinds × the schema');
const WANT_KINDS = ['anthropic-subscription', 'anthropic-api', 'openai-responses', 'openai-chat', 'google-subscription', 'google-api', 'openrouter', 'self-hosted'];
ok(eq(M.KIND_IDS, WANT_KINDS) && M.KINDS.length === 8, `exactly the design's eight kinds, in order (${M.KIND_IDS.join(' · ')})`);
const kindRowOk = (k) => typeof k.label === 'string' && k.label && ['anthropic', 'openai', 'google', 'openrouter', 'any'].includes(k.family)
  && typeof k.wire === 'string' && Array.isArray(k.harnesses) && k.harnesses.length > 0 && Array.isArray(k.auths) && k.auths.length > 0
  && k.auths.every((a) => M.AUTHS.includes(a)) && typeof k.subscription === 'boolean' && typeof k.keyed === 'boolean'
  && M.MODELS_SOURCES.includes(k.modelsSource) && (k.modelsSource === 'listed' ? M.LISTED_BY.includes(k.listedBy) : k.listedBy === null)
  && k.idPattern instanceof RegExp && typeof k.idHint === 'string' && Object.isFrozen(k);
ok(M.KINDS.every(kindRowOk), 'every kind row carries the schema (label, family, wire, harnesses, auths ⊂ AUTHS, subscription, keyed, modelsSource / listedBy, idPattern, idHint; frozen)', M.KINDS.filter((k) => !kindRowOk(k)).map((k) => k.id));
ok(eq(M.KINDS.filter((k) => k.subscription).map((k) => k.id), ['anthropic-subscription', 'google-subscription']) && M.KINDS.filter((k) => k.subscription).every((k) => !k.keyed && eq(k.auths, ['oauth'])), 'the two subscription kinds are the first-party ones: no key of ours, the CLI\'s own login (oauth)');
ok(eq(M.KINDS.map((k) => k.harnesses[0]), ['claude', 'claude', 'codex', 'opencode', 'gemini', 'gemini', 'codex', 'opencode']), 'the projection by interface shape: claude ↔ anthropic-*, codex ↔ openai-responses / openrouter, gemini ↔ google-*, opencode ↔ the rest (q-045 §2.2)');
const recordOf = (k) => ({ id: `pv-test-${k.id}`, kind: k.id, label: 'A ' + k.id, auth: k.auths[0], keyRef: k.keyed ? `providers:pv-test-${k.id}#key` : null, modelsSource: k.modelsSource, models: k.modelsSource === 'configured' ? [{ id: EXAMPLE[k.family], label: '', context: '200k', caps: ['tools'] }] : [] });
const perKind = M.KINDS.map((k) => [k.id, codes(M.validateProvider(recordOf(k)))]);
ok(perKind.every(([, c]) => c.length === 0), 'a record of EACH kind (its defaults + one example row where configured) validates', perKind.filter(([, c]) => c.length));
const emptyRefused = (X) => X.KINDS.every((k) => !k.idPattern.test('') && codes(X.validateModelRow(k.id, { id: '' })).includes('id-pattern'));
ok(emptyRefused(M), 'every kind\'s model-id regex REFUSES the empty id (validateModelRow says id-pattern) — the regex is the only empty-id gate');
ok(M.KINDS.every((k) => k.idPattern.test(EXAMPLE[k.family]) && !k.idPattern.test(' ' + EXAMPLE[k.family]) && !k.idPattern.test(EXAMPLE[k.family] + ' x')), 'every kind accepts its family\'s example id and refuses one with a space');
const fam = (id) => M.kindOf(id).idPattern;
ok(!fam('anthropic-api').test('gpt-5') && !fam('google-api').test('claude-opus-5') && !fam('openrouter').test('gpt-5') && !fam('openai-chat').test('GPT-5') && fam('self-hosted').test('Qwen/Qwen3-32B') && !fam('anthropic-subscription').test('claude-'), 'the families are kept apart (anthropic ⇏ gpt-5, google ⇏ claude-, openrouter needs vendor/model, openai is lower-case, self-hosted takes Qwen/…; a bare prefix is not an id)');

// ── ② the built-in records ────────────────────────────────────────────────────────────────────────────────
console.log('② the built-in records');
ok(eq(M.PRESETS.map((p) => p.id), ['pv-anthropic-subscription', 'pv-google-subscription', 'pv-anthropic-api', 'pv-openai-chatgpt']), 'the built-ins: the two subscription presets §1 names first, then the Console key and the ChatGPT login', M.PRESETS.map((p) => p.id));
ok(M.PRESETS.every((p) => M.validateProvider(p).length === 0 && Object.isFrozen(p) && Object.isFrozen(p.models) && p.keyRef === null && p.modelsSource === 'listed' && p.listedBy === 'harness-cache' && p.preset === p.id.slice(3)), 'every built-in validates, is frozen, names NO key (its account\'s own credential) and is listed by its harness\'s catalog');
ok(M.presetOf('pv-anthropic-subscription').kind === 'anthropic-subscription' && M.presetOf('pv-google-subscription').kind === 'google-subscription' && M.presetOf('pv-openai-chatgpt').kind === 'openai-responses' && M.presetOf('pv-openai-chatgpt').auth === 'oauth', 'the kinds: anthropic-subscription, google-subscription; the ChatGPT login = the Responses wire over oauth');
const acct = (o) => M.accountProviderId(o);
const projTable = [
  [{ id: 'sub-1', backend: 'claude', type: 'subscription' }, 'pv-anthropic-subscription'], [{ id: 'pool-1', backend: 'claude', type: 'pooled' }, 'pv-anthropic-subscription'],
  [{ id: 'acct-1', backend: 'claude', type: 'api' }, 'pv-anthropic-api'], [{ id: 'acct-legacy' }, 'pv-anthropic-api'],
  [{ id: 'cxs-1', backend: 'codex', type: 'subscription' }, 'pv-openai-chatgpt'], [{ id: 'pool-2', backend: 'codex', type: 'pooled' }, 'pv-openai-chatgpt'],
  [{ id: 'gms-1', backend: 'gemini', type: 'subscription' }, 'pv-google-subscription'], [{ backend: 'codex' }, 'pv-openai-chatgpt'], [{ backend: 'claude' }, 'pv-anthropic-subscription'],
  [{ id: 'pv-deadbeef01', backend: 'claude', type: 'provider' }, 'pv-deadbeef01'], [{ id: 'x', backend: 'opencode', type: 'api' }, null], [null, null],
];
ok(projTable.every(([a, want]) => acct(a) === want), 'every account names its provider: claude sub / pool / Console key / a legacy record (no backend, no type), codex sub / pool, gemini sub, the machine\'s own login, a projected pv- row (its own id), a harness with no account table ⇒ null', projTable.filter(([a, w]) => acct(a) !== w));
ok(Object.values(M.ACCOUNT_PRESETS).every((id) => !!M.presetOf(id)), 'every projection target is a built-in record');
ok(eq(M.PRESETS.map(M.listerOf), ['claude', 'gemini', 'claude', 'codex']) && M.listerOf(recordOf(M.kindOf('openrouter'))) === null, 'who lists each built-in: claude, gemini, claude, codex; a configured record has no lister');

// ── ③ the record shape ────────────────────────────────────────────────────────────────────────────────────
console.log('③ the record shape');
ok(eq(M.PROVIDER_FIELDS, ['id', 'kind', 'label', 'preset', 'baseUrl', 'auth', 'keyRef', 'models', 'defaultModel', 'aliases', 'modelsSource', 'listedBy', 'fetchedAt', 'lastTestAt']), 'PROVIDER_FIELDS = §1\'s record, field for field');
const planted = M.normalizeProvider({ ...recordOf(M.kindOf('openrouter')), key: 'sk-or-v1-planted', apiKey: 'x', token: 'y', models: [{ id: 'a/b', secret: 'z' }] });
ok(eq(Object.keys(planted), M.PROVIDER_FIELDS) && !JSON.stringify(planted).includes('planted') && eq(Object.keys(planted.models[0]), M.MODEL_FIELDS), 'normalizeProvider keeps EXACTLY the closed fields: a planted key / apiKey / token (and a row\'s extra field) never survive');
ok(eq(M.MODEL_FIELDS, ['id', 'label', 'context', 'caps']) && eq(M.normalizeModelRow({ id: 'gpt-5.5', label: ' ', context: '1M', caps: ['1m', 'tools', 'nope'] }), { id: 'gpt-5.5', label: 'gpt-5.5', context: 1000000, caps: ['tools', '1m'] }), 'a row = id · label (defaults to the id) · context (200k / 1M parsed) · caps (CAPS order, unknown dropped once valid)');
ok(eq(M.CAPS, ['tools', 'vision', 'reasoning', '1m']) && M.CAPS.every((c) => typeof M.CAP_WORDS[c] === 'string'), 'the four capabilities, each with its words');
ok(M.parseContext('200k') === 200000 && M.parseContext('1M') === 1000000 && M.parseContext(' 128000 ') === 128000 && Number.isNaN(M.parseContext('big')) && M.parseContext('') === null && M.formatContext(200000) === '200k' && M.formatContext(1000000) === '1M' && M.formatContext(163840) === '163840', 'context: 200k / 1M / a bare number in, 200k / 1M / the number out');

// ── ④ configured validation ───────────────────────────────────────────────────────────────────────────────
console.log('④ configured validation');
const vr = (k, row) => codes(M.validateModelRow(k, row));
ok(eq(vr('openai-chat', { id: 'gpt-5.5', label: 'GPT', context: '400k', caps: ['tools'] }), []), 'a good row: no error');
ok(eq(vr('openai-chat', { id: '' }), ['id-pattern']) && eq(vr('openai-chat', {}), ['id-pattern']) && eq(vr('openai-chat', { id: 'a'.repeat(129) }), ['id-long']) && eq(vr('google-api', { id: 'gpt-5' }), ['id-pattern']), 'the id: empty / missing ⇒ id-pattern, 129 chars ⇒ id-long, another family ⇒ id-pattern');
ok(eq(vr('openai-chat', { id: 'x', label: 'l'.repeat(61) }), ['label-long']) && eq(vr('openai-chat', { id: 'x', context: '0' }), ['context-range']) && eq(vr('openai-chat', { id: 'x', context: '10.5M' }), ['context-range']) && eq(vr('openai-chat', { id: 'x', context: 'big' }), ['context-range']) && eq(vr('openai-chat', { id: 'x', context: '10M' }), []) && eq(vr('openai-chat', { id: 'x', caps: ['tools', 'magic'] }), ['caps-unknown']) && eq(vr('nope', { id: 'x' }), ['kind-unknown']), 'label > 60, context 0 / > 10M / not a number, an unknown cap, an unknown kind — each by its code (10M itself is fine)');
const vm = M.validateModels('openai-chat', { models: [{ id: 'deepseek-chat' }, { id: 'deepseek-chat' }, { id: 'deepseek-reasoner', context: '64k' }], aliases: { opus: 'deepseek-reasoner', sonnet: 'deepseek-v9', 'bad name': 'deepseek-chat' }, defaultModel: 'deepseek-v9' });
ok(!vm.ok && vm.errors.some((e) => e.index === 1 && e.code === 'id-duplicate') && vm.errors.some((e) => e.alias === 'sonnet' && e.code === 'alias-dangling') && vm.errors.some((e) => e.alias === 'bad name' && e.code === 'alias-name') && vm.errors.some((e) => e.code === 'default-dangling') && eq(vm.value.aliases, { opus: 'deepseek-reasoner' }), 'the save: a duplicate (at its row), an alias to an id NOT IN THE TABLE, a bad alias name, a default not in the list — each named; the good alias kept', vm.errors);
ok(codes(M.validateModels('openai-chat', { models: Array.from({ length: 201 }, (_, i) => ({ id: 'm' + i })) }).errors).includes('too-many'), 'more than 200 rows ⇒ too-many');
const v2 = M.validateModels('openrouter', { models: [{ id: 'deepseek/deepseek-chat', label: '', context: '128k', caps: ['reasoning', 'tools'] }], aliases: { sonnet: 'deepseek/deepseek-chat' }, defaultModel: 'deepseek/deepseek-chat' });
ok(v2.ok && eq(v2.value.models, [{ id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat', context: 128000, caps: ['tools', 'reasoning'] }]), 'a good save: the rows as kept (label = id, context in tokens, caps in order)');
const rec = (o) => codes(M.validateProvider({ ...recordOf(M.kindOf('openrouter')), ...o }));
ok(eq(rec({ models: [], modelsSource: 'configured' }), ['configured-empty']) && eq(rec({ modelsSource: 'none' }), ['none-has-models']) && eq(rec({ modelsSource: 'listed', listedBy: null }), ['listed-by']) && rec({ keyRef: 'sk-or-v1-abcdef' }).includes('key-ref') && eq(rec({ keyRef: 'providers:pv-x#key' }), []) && eq(rec({ baseUrl: 'ftp://x' }), ['base-url']) && eq(rec({ baseUrl: 'https://openrouter.ai/api/v1' }), []) && eq(rec({ auth: 'oauth' }), ['auth-kind']) && eq(rec({ id: 'acct-1' }), ['provider-id']) && eq(rec({ label: '' }), ['label-long']), 'the record: configured with no row, none with rows, listed with no lister, a KEY VALUE where a vault entry belongs, a bad base URL, an auth the kind has not, a non-pv id, no label — each refused by its code');
ok(codes(M.validateProvider({ ...recordOf(M.kindOf('openrouter')), aliases: { opus: 'nope/none' } })).includes('alias-dangling'), 'the record\'s aliases land on its rows, or it is refused');

// ── ⑤ serves / resolve over the alias table ───────────────────────────────────────────────────────────────
console.log('⑤ servesModel / resolveModel over the alias table');
const ds = M.normalizeProvider({ id: 'pv-deepseek', kind: 'openai-chat', label: 'DeepSeek', modelsSource: 'configured', models: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }], aliases: { opus: 'deepseek-reasoner', sonnet: 'deepseek-chat', haiku: 'deepseek-chat' }, defaultModel: 'deepseek-chat' });
ok(M.validateProvider(ds).length === 0, 'the fixture record (DeepSeek-like: two rows, three claude-side aliases, a default) validates');
const R = (p, m) => M.resolveModel(p, m);
ok(R(ds, '') === 'deepseek-chat' && R(ds, null) === 'deepseek-chat' && R(ds, 'deepseek-reasoner') === 'deepseek-reasoner' && R(ds, 'opus') === 'deepseek-reasoner' && R(ds, 'sonnet') === 'deepseek-chat', 'resolve: \'\' = its default; an exact row; an alias → ITS row (opus → deepseek-reasoner, sonnet → deepseek-chat)');
ok(R(ds, 'gpt-5') === null && !M.servesModel(ds, 'gpt-5') && !M.servesModel(ds, 'claude-opus-5') && M.servesModel(ds, 'opus') && M.servesModel(ds, ''), 'servesModel: an id it has not ⇒ false (§2 rule 1: not a candidate); an alias it maps ⇒ true');
const dangling = { ...ds, aliases: { ...ds.aliases, opus: 'deepseek-v9' } };
const danglingRefused = (X) => X.resolveModel(dangling, 'opus') === null && !X.servesModel(dangling, 'opus');
ok(danglingRefused(M), 'a DANGLING alias (opus → an id not in the table, a record built past validation) resolves to NOTHING — never passed on to the harness');
ok(R({ ...ds, defaultModel: '' }, '') === 'deepseek-chat' && R({ ...ds, defaultModel: 'gone' }, '') === null, 'no default ⇒ the first row; a default not in the table ⇒ nothing');
const none = M.normalizeProvider({ id: 'pv-none', kind: 'self-hosted', label: 'Box', modelsSource: 'none' });
ok(M.validateProvider(none).length === 0 && R(none, '') === null && R(none, 'llama3.1:8b') === null && M.modelsOf(none).length === 0, '`none` serves nothing (never a silent empty menu: P0c says so)');
const claudeSub = M.withListed(M.presetOf('pv-anthropic-subscription'), FIX.harness.claude);
ok(claudeSub.models.length === FIX.harness.claude.length - 1 && !claudeSub.models.some((m) => m.id === '') && eq(claudeSub.models.find((m) => m.id === 'opus[1m]'), { id: 'opus[1m]', label: 'opus[1m] (latest, 1M context)', context: 1000000, caps: ['1m'] }), 'a harness-listed record filled from the FIXTURE catalog: the Default row dropped, `[1m]` ⇒ 1M + the cap', claudeSub.models.slice(0, 3));
ok(R(claudeSub, '') === '' && R(claudeSub, 'opus') === 'opus' && R(claudeSub, 'opus[1m]') === 'opus[1m]' && R(claudeSub, 'claude-opus-5-5') === 'claude-opus-5-5' && R(claudeSub, 'claude-haiku-4-5') === 'claude-haiku-4-5-20251001' && R(claudeSub, 'gpt-5') === null && R(claudeSub, 'deepseek-chat') === null, 'harness-listed: \'\' = the harness\'s own default; its aliases; ANY claude- id (the catalog is a menu, the CLI runs its vendor\'s ids); a dated snapshot found; another family ⇒ not served');
ok(eq(M.listedRows([{ id: '' }, { id: 'a' }, { id: 'a' }, { id: 'b c' }, null, { id: 'x'.repeat(129) }]).map((r) => r.id), ['a']), 'listedRows drops the empty, the repeated, the spaced, the null and the over-long');
const orApi = M.normalizeProvider({ id: 'pv-or', kind: 'openrouter', label: 'OpenRouter', modelsSource: 'listed', listedBy: 'provider-api', models: FIX.providerApi.openrouter, fetchedAt: 1792400000000 });
ok(M.validateProvider(orApi).length === 0 && R(orApi, 'anthropic/claude-sonnet-4.5') === 'anthropic/claude-sonnet-4.5' && R(orApi, 'qwen/qwen3-coder:free') === 'qwen/qwen3-coder:free' && R(orApi, 'anthropic/claude-sonnet-9') === null && M.listerOf(orApi) === null, 'a provider-API list (the fixture\'s OpenRouter rows) is CLOSED: its rows resolve, an unlisted id of the same shape does not');
ok(M.sameModel('opus[1m]', 'opus') && M.sameModel('Claude-Opus-5', 'opus-5') && M.sameModel('gpt-5.5-2026-01-20', 'gpt-5.5') && !M.sameModel('gpt-5-mini', 'gpt-5') && !M.sameModel('', 'x'), 'the same model spelled two ways: [1m], claude-, case, a dated snapshot — never a sibling (gpt-5-mini ≠ gpt-5)');
const src = M.sourceOf;
ok(eq(src(claudeSub), { key: 'Listed by {harness}', params: { harness: 'claude' } }) && src(orApi).key === 'Listed by the provider' && src(ds).key === 'Entered by you' && src(none).key === 'No models configured for this provider', 'the source in words: listed by its harness / by the provider, entered by you, none configured');

// ── ⑥ RED controls ────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ RED controls (patched in-memory copies)');
const m1 = mutant([['  openai: /^[a-z0-9][a-z0-9.-]*$/,', '  openai: /^[a-z0-9.-]*$/,']]);
ok(emptyRefused(M) && !emptyRefused(m1) && eq(codes(m1.validateModelRow('openai-chat', { id: '' })), []), 'MUTANT: the openai model-id regex with `*` lets the EMPTY id through ⇒ ① "every kind refuses the empty id" goes RED (the real one: green)');
const m2 = mutant([['    return rows.some((r) => r.id === to) ? to : null;', '    return to;']]);
ok(danglingRefused(M) && !danglingRefused(m2) && m2.resolveModel(dangling, 'opus') === 'deepseek-v9', 'MUTANT: resolveModel passing an alias on without the table ⇒ opus resolves to deepseek-v9, an id NOT IN THE TABLE ⇒ ⑤ goes RED (the real one: green)');
const m3 = mutant([["    if (!models.some((m) => m.id === target)) { errors.push({ alias: name, field: 'aliases', code: 'alias-dangling' }); continue; }\n", '']]);
const savesDangling = (X) => X.validateModels('openai-chat', { models: [{ id: 'deepseek-chat' }], aliases: { opus: 'deepseek-v9' } }).ok;
ok(!savesDangling(M) && savesDangling(m3), 'MUTANT: the save without the alias check accepts opus → deepseek-v9 ⇒ RED (the real one refuses it)');

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
const st1 = fs.statSync(store.file);
const disk1 = JSON.parse(fs.readFileSync(store.file, 'utf-8'));
ok(r1.ok && (st1.mode & 0o777) === 0o600 && disk1.v === 1 && disk1.providers.length === 1 && disk1.providers[0].models[0].context === 64000 && eq(Object.keys(disk1.providers[0]), M.PROVIDER_FIELDS), 'put: written whole (v 1, 0600), the closed fields, the row as kept', { mode: (st1.mode & 0o777).toString(8) });
const before = fs.readFileSync(store.file, 'utf-8');
const r2 = store.put({ id: 'pv-bad', kind: 'openai-chat', label: 'Bad', modelsSource: 'configured', models: [{ id: '' }] });
const r3 = store.put({ id: 'pv-anthropic-subscription', kind: 'anthropic-subscription', label: 'Mine' });
ok(!r2.ok && r2.errors.some((e) => e.code === 'id-pattern' && e.index === 0) && !r3.ok && r3.errors[0].code === 'built-in-id' && fs.readFileSync(store.file, 'utf-8') === before, 'put refuses WHOLE: an empty model id (by row), a built-in id — the file is unchanged');
ok(store.setModels('pv-anthropic-subscription', { models: [{ id: 'claude-x-1' }] }).code === 'listed' && store.setModels('pv-nope', { models: [] }).code === 'unknown', 'setModels on a built-in ⇒ listed (its harness owns the rows); an unknown id ⇒ unknown');
const r4 = store.setModels('pv-deepseek', { models: [{ id: 'deepseek-chat' }, { id: 'Deep Seek' }], aliases: {} });
ok(!r4.ok && r4.code === 'invalid' && eq(r4.errors, [{ index: 1, field: 'id', code: 'id-pattern' }]) && fs.readFileSync(store.file, 'utf-8') === before, 'setModels with a bad row ⇒ invalid, the error at row 1 / field id; nothing written', r4);
const r5 = store.setModels('pv-deepseek', { models: [{ id: 'deepseek-chat', label: 'V3' }, { id: 'deepseek-reasoner', caps: ['reasoning'] }], aliases: { opus: 'deepseek-reasoner' }, defaultModel: 'deepseek-chat' });
ok(r5.ok && r5.provider.modelsSource === 'configured' && r5.provider.models.length === 2 && eq(r5.provider.aliases, { opus: 'deepseek-reasoner' }) && store.editable('pv-deepseek') && !store.editable('pv-anthropic-subscription'), 'setModels: saved as configured; only a kept, unlisted record is editable');
store = PS.create({ dataDir: DATA, catalogOf, log: (m) => logs.push(m) });
ok(eq(store.get('pv-deepseek').models.map((m) => m.id), ['deepseek-chat', 'deepseek-reasoner']) && store.get('pv-deepseek').defaultModel === 'deepseek-chat', 'a new store over the same file reads the record back');
const r6 = store.setModels('pv-deepseek', { models: [] });
ok(r6.ok && r6.provider.modelsSource === 'none' && r6.provider.models.length === 0 && M.validateProvider(r6.provider).length === 0, 'zero rows ⇒ the record says none (never an empty configured)');
store.put({ id: 'pv-ds2', kind: 'openai-chat', label: 'DS2', modelsSource: 'configured', models: [{ id: 'deepseek-chat' }] });
const hand = JSON.parse(fs.readFileSync(store.file, 'utf-8'));
hand.providers.push({ id: 'pv-hand', kind: 'openrouter', label: 'Hand', modelsSource: 'configured', models: [{ id: '' }] }, { id: 'pv-anthropic-api', kind: 'anthropic-api', label: 'Shadow' });
fs.writeFileSync(store.file, JSON.stringify(hand));
logs.length = 0;
store = PS.create({ dataDir: DATA, catalogOf, log: (m) => logs.push(m) });
ok(store.get('pv-hand') === null && store.get('pv-ds2') !== null && store.get('pv-anthropic-api').label === 'Anthropic API (Console key)' && logs.some((l) => l.includes('"pv-hand"') && l.includes('id-pattern')) && logs.some((l) => l.includes('"pv-anthropic-api"') && l.includes('built-in-id')), 'load: a hand-edited bad record is SKIPPED BY NAME in the log (never half-read); a record shadowing a built-in is skipped; the good one stays', logs);

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
  ok(s1 === 200 && a1.account.id === sub && a1.account.backend === 'claude' && a1.provider.id === 'pv-anthropic-subscription' && a1.provider.models.some((m) => m.id === 'opus[1m]') && a1.editable === false, 'a claude subscription names Anthropic subscription, its rows = claude\'s catalog, not editable', { s1, p: a1.provider && a1.provider.id });
  const [, a2] = await get(cx);
  const [, a3] = await get(key);
  ok(a2.provider.id === 'pv-openai-chatgpt' && eq(a2.provider.models.map((m) => m.id), ['gpt-5.5', 'gpt-5.5-codex', 'gpt-5.5-mini']) && a3.provider.id === 'pv-anthropic-api' && a3.provider.models.length === 11 && !JSON.stringify(a3).includes('qqqq'), 'a ChatGPT login names its provider with codex\'s catalog; the Console key names Anthropic API (and the answer carries no key)');
  const [s4, a4] = await get('pv-ds2');
  ok(s4 === 200 && a4.account.type === 'provider' && a4.provider.kind === 'openai-chat' && a4.editable === true, 'a projected third-party row (pv-…): its record, editable');
  const [s5, a5] = await put('pv-ds2', { models: [{ id: 'deepseek-chat' }, { id: '' }] });
  ok(s5 === 400 && a5.code === 'invalid' && eq(a5.errors, [{ index: 1, field: 'id', code: 'id-pattern' }]), 'PUT a row with an empty id ⇒ 400, the refusal at row 1 / field id (the dialog marks it)', a5);
  const [s6, a6] = await put('pv-ds2', { models: [{ id: 'deepseek-chat', context: '64k', caps: ['tools'] }, { id: 'deepseek-reasoner' }], aliases: { opus: 'deepseek-reasoner' } });
  ok(s6 === 200 && a6.ok && a6.provider.models[0].context === 64000 && JSON.parse(fs.readFileSync(store.file, 'utf-8')).providers.find((p) => p.id === 'pv-ds2').models.length === 2, 'PUT good rows ⇒ 200, written to data/providers.json before the answer');
  const [s7, a7] = await put(sub, { models: [{ id: 'claude-x-1' }] });
  const [s8, a8] = await put('pv-ds2', { models: [{ id: 'deepseek-chat' }] }, { Authorization: 'Bearer vsst_planted' });
  const [s9] = await get('acct-nobody');
  ok(s7 === 409 && a7.code === 'listed' && s8 === 403 && a8.code === 'agent_forbidden' && s9 === 404, 'PUT on a listed account ⇒ 409 listed; an agent\'s bearer ⇒ 403 (the owner enters models); an unknown id ⇒ 404');
} finally { srv.close(); }

// ── ⑨ wiring pins ──────────────────────────────────────────────────────────────────────────────────────────
console.log('⑨ wiring pins');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf-8');
const aur = read('src/server/account-usage-routes.js');
ok(/require\('\.\/provider-store\.js'\)\.create\(\{ dataDir: path\.join\(rootDir, 'data'\), catalogOf:/.test(aur) && aur.includes("require('../routes/account-models.js').registerAccountModelRoutes(app, { accounts, providers });"), 'account-usage-routes makes the ONE store (data/providers.json, the harness catalogs) and registers the two routes');
ok(read('server.js').includes('getModels: () => AVAILABLE_MODELS,'), 'server.js hands the routes the live harness catalogs (AVAILABLE_MODELS)');
const ma = read('src/lib/manage-agents.js');
const items = ma.match(/items\.push\(\{ label: t\('Models…'\)[^\n]*openAccountModelsDialog\(\{ accountId: id, name: a\?\.name \|\| '', onTest: \(model\) => doTest\(model\) \}\) \}\);/g) || [];
ok(items.length === 2 && (ma.match(/const doTest = \(model = ''\) => \{/g) || []).length === 2 && (ma.match(/ephemeral: true, hostId: selectedHost \|\| undefined, \.\.\.\(model \? \{ model \} : \{\}\) \}\);/g) || []).length === 2, 'both rosters\' ⋯ carry 模型… (the dialog with the roster\'s own Test), and Test hands THE ROW\'S id to the session it opens');
const dlg = read('src/lib/account-models.js');
ok(/from '\.\.\/model-providers\.js'/.test(dlg) && dlg.includes('validateModels(st.provider.kind, input)') && dlg.includes("onTest(row.id.trim())") && !/disabled/.test(dlg), 'the dialog checks with the PURE rules before the save, tests with the row\'s id, greys nothing');

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
ok(eq(M.menuOf(M.presetOf('pv-openai-chatgpt'), [{ id: 'gpt-5.5', label: 'gpt-5.5', efforts: ['low', 'ultra'] }]).models, [{ id: '', label: 'Default' }, { id: 'gpt-5.5', label: 'gpt-5.5', efforts: ['low', 'ultra'] }]), 'a harness-listed menu keeps the harness\'s own rows WHOLE (codex\'s per-model efforts ride on) and leads with its Default');
// THE LAW: never a silent empty menu — on every menu, `empty` ⇔ no row (the surface draws the one line exactly then)
const law = (MP) => MENUS.every(([, p, cat]) => { const m = MP.menuOf(p, cat); return m.empty === (m.models.length === 0); });
ok(law(M), 'THE LAW on every menu above: empty ⇔ no row (the surface\'s one line is drawn exactly when nothing could be picked)');
ok(M.MENU_EMPTY === 'No models configured for this provider — set up', 'the one line\'s words: "No models configured for this provider — set up" (zh 此提供方未配置模型 — 去设置)');

console.log('⑪ RED control: an empty menu (a patched copy of menuOf that never says empty)');
const m4 = mutant([['  if (!rows.length) return { models: [], empty: true, open: false, defaultId: null };\n', '']]);
const silent = m4.menuOf(noneRec, CLAUDE);
ok(!law(m4) && silent.empty === false && silent.models.length === 0, 'CONTROL: the copy without the empty branch hands a `none` provider\'s menu out as {models: [], empty: false} — a SILENT EMPTY MENU — and the law above goes RED on it', silent);

console.log('⑫ a running conversation\'s pick, re-resolved against its provider');
ok(eq(M.resolvePick(cfg, 'fast'), { ok: true, model: 'deepseek-chat' }) && eq(M.resolvePick(cfg, 'DeepSeek-Chat'), { ok: true, model: 'deepseek-chat' }) && eq(M.resolvePick(cfg, 'deepseek-reasoner'), { ok: true, model: 'deepseek-reasoner' }), 'a configured provider: an alias lands on its row\'s id, another spelling on the row\'s own, a row as itself');
ok(eq(M.resolvePick(cfg, 'gpt-9'), { ok: false, code: 'not-served' }) && eq(M.resolvePick(noneRec, 'x'), { ok: false, code: 'not-served' }), 'an id the provider does not serve is refused (never sent); `none` serves nothing');
ok(eq(M.resolvePick(M.withListed(M.presetOf('pv-anthropic-subscription'), CLAUDE), 'opus'), { ok: true, model: 'opus' }) && eq(M.resolvePick(M.withListed(M.presetOf('pv-anthropic-subscription'), CLAUDE), 'opusplan'), { ok: true, model: 'opusplan' }) && eq(M.resolvePick(null, ' gpt-x '), { ok: true, model: 'gpt-x' }), 'a harness-listed provider passes what it cannot resolve to the harness (its own aliases — opusplan — are the CLI\'s to judge, as before); no provider ⇒ as typed');

console.log('⑬ the listed-provider refresh — its rules (the request itself: src/server/provider-models.js, test-provider-models)');
ok(eq(M.LISTABLE_KINDS, ['openrouter', 'openai-chat', 'openai-responses', 'self-hosted']) && M.modelsEndpointOf(orFresh) === 'https://openrouter.ai/api/v1/models' && M.modelsEndpointOf({ kind: 'openai-chat', baseUrl: 'http://127.0.0.1:9/v1/' }) === 'http://127.0.0.1:9/v1/models' && M.modelsEndpointOf({ kind: 'openai-chat' }) === null && M.modelsEndpointOf({ kind: 'anthropic-api', baseUrl: 'https://x.test/v1' }) === null && M.modelsEndpointOf({ kind: 'google-api', baseUrl: 'https://x.test' }) === null, 'the list\'s URL: an OpenAI-compatible kind\'s <base>/models (OpenRouter\'s own base when none is named); no base, or a kind that lists no such way ⇒ none');
ok(M.refreshable(orFresh) && !M.refreshable(cfg) && !M.refreshable(noneRec) && !M.refreshable(M.presetOf('pv-anthropic-subscription')), 'only a record its PROVIDER lists is refreshed (configured, none, a harness-listed built-in: never)');
const T0 = 1792494000000;
const V = (o) => M.refreshVerdict({ provider: orFresh, vault: 'unlocked', now: T0, ...o });
ok(eq(V({}), { ok: true, url: 'https://openrouter.ai/api/v1/models' }), 'unlocked, never asked ⇒ the press asks — at the record\'s list URL');
ok(V({ vault: 'locked' }).code === 'vault_locked' && V({ vault: 'not_set_up' }).code === 'vault_not_set_up' && V({ vault: undefined }).code === 'vault_locked', 'GATE the vault: locked (or unknown) ⇒ vault_locked; not set up ⇒ vault_not_set_up — before anything is read or sent');
ok(eq(V({ lastAt: T0 - 59000 }), { ok: false, code: 'cooldown', retryAfterMs: 1000 }) && V({ lastAt: T0 - 60000 }).ok && eq(M.refreshVerdict({ provider: { ...orFresh, fetchedAt: T0 - 30000 }, vault: 'unlocked', now: T0 }), { ok: false, code: 'cooldown', retryAfterMs: 30000 }), 'GATE once a minute per provider: an attempt 59 s ago ⇒ cooldown (1 s left); 60 s ⇒ asks; the KEPT fetchedAt counts too (a restart does not reopen it)');
ok(V({ inFlight: true }).code === 'in-flight' && M.refreshVerdict({ provider: cfg, vault: 'unlocked', now: T0 }).code === 'not-listed' && M.refreshVerdict({ provider: null, vault: 'unlocked', now: T0 }).code === 'unknown', 'one in flight; a record its provider does not list ⇒ not-listed; none ⇒ unknown');
ok(eq(M.authHeaders(orFresh, 'k1'), { authorization: 'Bearer k1' }) && eq(M.authHeaders({ auth: 'x-api-key' }, 'k2'), { 'x-api-key': 'k2' }) && eq(M.authHeaders(orFresh, null), {}), 'the credential header follows the record\'s auth (bearer · x-api-key); no key ⇒ none');
const pOR = M.parseListed(ANS.openrouter), pOA = M.parseListed(ANS.openai);
ok(pOR.ok && pOR.skipped === 3 && eq(pOR.rows.map((r) => r.id), ['deepseek/deepseek-chat-v3.1', 'anthropic/claude-sonnet-4.5', 'qwen/qwen3-coder:free']) && eq(pOR.rows[1], { id: 'anthropic/claude-sonnet-4.5', label: 'Anthropic: Claude Sonnet 4.5', context: 1000000, caps: ['tools', 'vision', 'reasoning', '1m'] }) && eq(pOR.rows[0].caps, ['tools']), 'an OpenRouter list: its name, context and caps (tools · image input · reasoning · 1M) per row; an empty id, a spaced id and a repeat skipped (counted)', pOR);
ok(pOA.ok && eq(pOA.rows, [{ id: 'gpt-5.5', label: 'gpt-5.5', context: null, caps: [] }, { id: 'gpt-5.5-mini', label: 'gpt-5.5-mini', context: null, caps: [] }]) && M.parseListed({ models: [] }).code === 'bad-answer' && M.parseListed(null).code === 'bad-answer', 'an OpenAI-compatible list: the ids as rows; an answer that is no list ⇒ bad-answer');
const many = { data: Array.from({ length: 1005 }, (_, i) => ({ id: `v/m-${i}` })) };
const pMany = M.parseListed(many);
ok(pMany.rows.length === M.REFRESH.maxRows && pMany.skipped === 5 && M.validateProvider({ ...orFresh, models: pMany.rows }).length === 0 && codes(M.validateProvider({ ...orFresh, models: [...pMany.rows, { id: 'v/x' }] })).includes('too-many') && codes(M.validateProvider({ ...cfg, models: pMany.rows.slice(0, 201) })).includes('too-many'), `a provider may list up to ${M.REFRESH.maxRows} rows (more are skipped, counted); an owner's configured table stays at ${M.MODELS_MAX}`);
ok(M.validateProvider(orFresh).length === 0 && codes(M.validateProvider({ ...orFresh, keyRef: 'sk-or-v1-abcdef' })).includes('key-ref'), 'a key named by its Vault reference — an Integrations row\'s `apiKey` field (integrations:openrouter#apiKey) — validates; a key VALUE still never does');
ok(M.accountProviderId({ id: 'acct-1', backend: 'claude', type: 'api', providerId: 'pv-ds' }) === 'pv-ds' && M.accountProviderId({ id: 'acct-1', backend: 'claude', type: 'api', providerId: 'evil/../x' }) === 'pv-anthropic-api', 'an account that NAMES its third-party provider (providerId — the pool\'s member lookup reads the same field) rides it; a malformed name is ignored');
ok(M.REFRESH.cooldownMs === 60000 && M.REFRESH.timeoutMs === 15000 && M.REFRESH.maxBytes === 1048576 && Object.keys(M.REFRESH_WORDS).length === 13, 'the door\'s numbers: once a minute, 15 s, 1 MB; every refusal has its words');

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
