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
//   ⑭ THE THIRD-PARTY ROAD (lane lg-providers, B-d578 U1): the SHIPPED presets (each draft a valid record, words without a
//      technical word), fits (the kind decides: claude / codex / opencode-later), the key rules (an Anthropic subscription
//      login refused by name), the store over a REAL vault on a scratch dir (sealed FIRST, the file never holds the key,
//      locked ⇒ nothing written, rekey / patch / remove / keyOf), the doors (a person's only, 201 / 400 / 423 / 404), the
//      refresh's key resolver; RED controls: a fits without the wire rule lets DeepSeek into codex; a key rule without
//      the subscription refusal takes a Claude login; a store that skips the seal writes a record while the vault is locked
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
console.log('① the nine kinds × the schema');
// the design's eight + `anthropic-compatible` (lane lg-providers U1: a third party under its own ids at an Anthropic-compatible address)
const WANT_KINDS = ['anthropic-subscription', 'anthropic-api', 'anthropic-compatible', 'openai-responses', 'openai-chat', 'google-subscription', 'google-api', 'openrouter', 'self-hosted'];
ok(eq(M.KIND_IDS, WANT_KINDS) && M.KINDS.length === 9, `exactly the nine kinds, in order (${M.KIND_IDS.join(' · ')})`);
const kindRowOk = (k) => typeof k.label === 'string' && k.label && ['anthropic', 'openai', 'google', 'openrouter', 'any'].includes(k.family)
  && typeof k.wire === 'string' && Array.isArray(k.harnesses) && k.harnesses.length > 0 && Array.isArray(k.auths) && k.auths.length > 0
  && k.auths.every((a) => M.AUTHS.includes(a)) && typeof k.subscription === 'boolean' && typeof k.keyed === 'boolean'
  && M.MODELS_SOURCES.includes(k.modelsSource) && (k.modelsSource === 'listed' ? M.LISTED_BY.includes(k.listedBy) : k.listedBy === null)
  && k.idPattern instanceof RegExp && typeof k.idHint === 'string' && Object.isFrozen(k);
ok(M.KINDS.every(kindRowOk), 'every kind row carries the schema (label, family, wire, harnesses, auths ⊂ AUTHS, subscription, keyed, modelsSource / listedBy, idPattern, idHint; frozen)', M.KINDS.filter((k) => !kindRowOk(k)).map((k) => k.id));
ok(eq(M.KINDS.filter((k) => k.subscription).map((k) => k.id), ['anthropic-subscription', 'google-subscription']) && M.KINDS.filter((k) => k.subscription).every((k) => !k.keyed && eq(k.auths, ['oauth'])), 'the two subscription kinds are the first-party ones: no key of ours, the CLI\'s own login (oauth)');
ok(eq(M.KINDS.map((k) => k.harnesses[0]), ['claude', 'claude', 'claude', 'codex', 'opencode', 'gemini', 'gemini', 'codex', 'opencode']), 'the projection by interface shape: claude ↔ anthropic-*, codex ↔ openai-responses / openrouter, gemini ↔ google-*, opencode ↔ the rest (q-045 §2.2)');
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
ok(eq(M.PROVIDER_FIELDS, ['id', 'kind', 'label', 'preset', 'baseUrl', 'auth', 'keyRef', 'models', 'defaultModel', 'aliases', 'modelsSource', 'listedBy', 'fetchedAt', 'lastTestAt', 'tail', 'createdAt', 'wire']), 'PROVIDER_FIELDS = §1\'s record, field for field (+ tail, createdAt and a self-hosted one\'s wire, lane lg-providers U1)');
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

// ── ⑭ THE THIRD-PARTY ROAD (lane lg-providers, B-d578 U1) ──────────────────────────────────────────────────
console.log('⑭ the third-party road: shipped presets, fits, the key, the store over a real vault, the doors');
const TECH = /https?:|ANTHROPIC_|OPENAI_|base[_ ]?url|\bapi\b|\benv\b|token|\bwire\b|responses/i;   // the wizard's first screen says none of these
ok(eq(M.SHIPPED.map((p) => p.id), ['deepseek', 'kimi', 'glm', 'minimax', 'openrouter', 'other']) && /^\d{4}-\d{2}-\d{2}$/.test(M.SHIPPED_AT), `the shipped presets (dated ${M.SHIPPED_AT}): DeepSeek · Kimi · GLM · MiniMax · OpenRouter · other / self-hosted`);
const shipBad = M.SHIPPED.filter((p) => { const d = M.draftOf(p.id, { baseUrl: p.baseRequired ? 'http://127.0.0.1:9/v1' : null, model: p.models.length || p.listed ? null : 'my-model' }); return !d || codes(M.validateProvider({ ...d, id: 'pv-census', keyRef: M.keyRefOf('pv-census') })).length || !M.kindOf(p.kind) || !M.kindOf(p.kind).keyed || !M.kindOf(p.kind).auths.includes(p.auth) || p.bases.some((b) => !/^https:\/\/[^\s/]+\//.test(b.url) || !M.REGIONS.includes(b.region)) || (p.bases[0] && p.bases[0].region !== 'global') || TECH.test(p.blurb) || (p.models.length && !p.models.some((m) => m.id === p.defaultModel)); });
ok(shipBad.length === 0, 'every preset: a keyed kind with its auth, https addresses per region (global first), a default that is one of its rows, a blurb with no technical word — and its draft (with the person\'s choices) is a valid record', shipBad.map((p) => p.id));
const dk = M.draftOf('kimi', { region: 'cn' }), dOther = M.draftOf('other', { baseUrl: ' http://10.0.0.5:8000/v1 ', model: 'Qwen/Qwen3-32B', label: 'Lab' }), dOr = M.draftOf('openrouter');
ok(dk.baseUrl === 'https://api.moonshot.cn/anthropic' && M.draftOf('kimi').baseUrl === 'https://api.moonshot.ai/anthropic' && dOther.baseUrl === 'http://10.0.0.5:8000/v1' && dOther.label === 'Lab' && eq(dOther.models.map((m) => m.id), ['Qwen/Qwen3-32B']) && dOther.defaultModel === 'Qwen/Qwen3-32B' && dOther.modelsSource === 'configured' && dOr.modelsSource === 'listed' && dOr.listedBy === 'provider-api' && M.draftOf('nope') === null, 'a draft: the region picks the address; a typed address and an «Other…» model are kept (the model becomes the default row); OpenRouter is listed by its own /models (Train 1\'s refresh); an unknown preset ⇒ null');
const F = (kind, wire) => { const f = M.fits({ kind, wire }); const w = (h) => (f[h].ok ? '✓' : f[h].code); return `${w('claude')} ${w('codex')} ${w('opencode')}`; };
ok(F('anthropic-compatible') === '✓ wire later' && F('openrouter') === 'wire ✓ later' && F('anthropic-api') === '✓ wire later' && F('openai-chat') === 'wire wire later' && F('nope') === 'kind-unknown kind-unknown kind-unknown', 'fits — the kind decides (claude · codex · opencode): an Anthropic-compatible third party ✓ / not Codex / OpenCode later; OpenRouter Codex only; Chat-only none yet; an unknown kind none');
ok(F('self-hosted') === 'wire wire later' && F('self-hosted', 'anthropic-messages') === '✓ wire later' && F('self-hosted', 'openai-responses') === 'wire ✓ later' && F('self-hosted', 'openai-chat') === 'wire wire later' && eq(M.WIRES, ['anthropic-messages', 'openai-responses', 'openai-chat']), 'a SELF-HOSTED one fits by the interface the person says it speaks: none said ⇒ none (a vLLM / Ollama /v1 is Chat Completions); Anthropic Messages ⇒ Claude Code; Responses ⇒ Codex (adversarial read r1)');
ok(M.FIT_HARNESSES.slice().sort().join() === 'claude,codex,gemini,opencode' && M.fits({ kind: 'google-api' }).gemini.code === 'later' && M.fitsHarness({ kind: 'anthropic-compatible' }, 'claude') && !M.fitsHarness({ kind: 'anthropic-compatible' }, 'codex') && Object.keys(M.FIT_WORDS).every((c) => typeof M.FIT_WORDS[c] === 'string'), 'fitsHarness answers one harness; every code has its words');
const OAT = ['sk-ant-', 'oat01-', 'q'.repeat(40)].join('');   // built at runtime (never a token-shaped literal)
const vk = (k) => codes(M.validateKey(k));
const CONSOLE = ['sk-ant-', 'api03-', 'z'.repeat(40)].join('');
ok(eq(vk(`"${OAT}"`), ['key-subscription']) && eq(vk(`ANTHROPIC_AUTH_TOKEN=${OAT}`), ['key-subscription']) && eq(vk(JSON.stringify({ claudeAiOauth: { accessToken: OAT } })), ['key-subscription']) && eq(vk(['sk-ant-', 'sid01-', 'w'.repeat(30)].join('')), ['key-subscription']) && eq(vk(CONSOLE), ['key-anthropic']) && eq(vk('"sk-provider-1234"'), ['key-shape']) && eq(vk('MY_KEY=sk-provider-1234'), ['key-shape']) && eq(vk('sk-or-v1-abc.def_ghi-123'), []), 'an Anthropic credential ANYWHERE in the paste: quoted, after NAME=, inside a JSON blob, a claude.ai session key ⇒ key-subscription; a Console key ⇒ key-anthropic (it belongs on an Anthropic API account); quotes or a NAME= around another key ⇒ key-shape (adversarial read r1)');
ok(eq(vk(''), ['key-empty']) && eq(vk('   '), ['key-empty']) && eq(vk('abc def ghij'), ['key-space']) && eq(vk('short'), ['key-short']) && eq(vk('k'.repeat(513)), ['key-long']) && eq(vk(OAT), ['key-subscription']) && eq(vk(' sk-provider-key-1234 '), []) && Object.keys(M.KEY_ERRORS).length === 14, 'the key: empty, a space inside, too short, too long ⇒ by code; an ANTHROPIC SUBSCRIPTION LOGIN ⇒ key-subscription (never sent to a third party); a good key (trimmed) passes');
const recA = (o) => ({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1', model: 'm1' }), id: 'pv-c3', keyRef: M.keyRefOf('pv-c3'), ...o });
ok(codes(M.validateProvider(recA({ baseUrl: 'http://203.0.113.7/v1' }))).includes('base-url-plain') && codes(M.validateProvider(recA({ baseUrl: 'http://llm.example.test/v1' }))).includes('base-url-plain') && ['http://127.0.0.1/v1', 'http://192.168.1.20/v1', 'http://10.1.2.3/v1', 'http://172.20.0.4/v1', 'http://gpu-box:8000/v1', 'http://lab.local/v1', 'http://[::1]:9/v1'].every((u) => codes(M.validateProvider(recA({ baseUrl: u }))).length === 0) && codes(M.validateProvider(recA({ baseUrl: 'http://203.0.113.7/v1', keyRef: null }))).length === 0, 'a record that names a key: plain http only on the person\'s own network (loopback, private ranges, .local, a dotless name) — a public host must be https (a record with no key is not judged)');
ok(eq(codes(M.validateProvider(recA({ keyRef: M.keyRefOf('pv-other1') }))), ['key-ref-foreign']) && eq(codes(M.validateProvider(recA({ kind: 'openrouter', wire: 'openai-chat', models: [{ id: 'a/b' }], defaultModel: 'a/b' }))), ['wire-kind']), 'a record naming ANOTHER provider\'s sealed key is refused (key-ref-foreign — it would hand that key to this address); only a self-hosted one carries a wire');
ok(codes(M.validateProvider({ ...M.draftOf('other', { baseUrl: 'https://user:pw@llm.example.test/v1', model: 'm1' }), id: 'pv-c1' })).includes('base-url-credentials') && codes(M.validateProvider({ ...M.draftOf('other', { baseUrl: 'https://llm.example.test/v1?k=@x', model: 'm1' }), id: 'pv-c2' })).length === 0, 'an address carrying user:password@ is refused (it would ride codex\'s command line and every log — U2); an @ after the host is not one');
ok(M.keyEntryOf('pv-a1') === 'provider:pv-a1' && M.keyRefOf('pv-a1') === 'secrets:provider:pv-a1#key' && M.providerOfKeyRef(M.keyRefOf('pv-a1')) === 'pv-a1' && M.providerOfKeyRef('integrations:openrouter#apiKey') === null && M.providerOfKeyRef('secrets:provider:pv-a1#value') === null && M.tailOf(' sk-provider-key-1234 ') === '1234' && M.tailOf('abc') === null, 'the key\'s vault entry provider:<id>, its reference secrets:provider:<id>#key (round trip; another store\'s or field\'s is not one), the tail = the last four characters');

const VE = require(path.join(ROOT, 'src/server/vault-engine.js'));
const PDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-'));
const vault = VE.create({ dataDir: PDIR, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
const PW = 'correct horse battery staple';
await vault.setup(PW, {});
const KEY = ['sk-', 'prov', 'ider-', 'planted-', '7f3a9c'].join('');
let pstore = PS.create({ dataDir: PDIR, catalogOf, vault: () => vault, now: () => 1792500000000, log: () => {} });
const a1 = pstore.add({ preset: 'deepseek', key: ` ${KEY} `, label: '' });
const disk = () => (fs.existsSync(pstore.file) ? fs.readFileSync(pstore.file, 'utf-8') : '');
const pid = a1.ok ? a1.provider.id : null;
const box = vault.secretGet(M.keyEntryOf(pid));
ok(a1.ok && /^pv-[0-9a-f]{12}$/.test(pid) && a1.provider.keyRef === M.keyRefOf(pid) && a1.provider.tail === KEY.slice(-4) && a1.provider.label === 'DeepSeek' && a1.provider.createdAt === 1792500000000 && box.ok && box.value.toString('utf8') === KEY, 'add: the key sealed in the VAULT under provider:<id> (trimmed), the record names it by reference + its last four characters', { a1, box: box && box.ok });
ok(!disk().includes(KEY) && !disk().includes(KEY.slice(3, -4)) && JSON.parse(disk()).providers[0].tail === KEY.slice(-4), 'data/providers.json never holds the key (nor its middle) — only the tail');
ok(eq(pstore.keyOf(pid), { ok: true, value: KEY }) && pstore.keyOf('pv-anthropic-api').code === 'unknown' && pstore.keyOf('pv-nobody').code === 'unknown', 'keyOf: the ONE reader answers the value for a kept record; a built-in or unknown id ⇒ unknown');
const before2 = disk();
const bad = [pstore.add({ preset: 'deepseek', key: OAT }), pstore.add({ preset: 'other', key: KEY }), pstore.add({ preset: 'zzz', key: KEY }), pstore.add({ preset: 'deepseek', key: 'x' })];
ok(eq(bad.map((r) => r.ok ? 'ok' : r.errors.map((e) => e.field + ':' + e.code).join('+')), ['key:key-subscription', 'baseUrl:base-url', 'preset:preset-unknown', 'key:key-short']) && disk() === before2 && vault.secretNames().filter((n) => n.name.startsWith('provider:')).length === 1, 'add refuses WHOLE by field (a Claude login, a self-hosted one with no address, an unknown preset, a short key) — nothing written, nothing sealed', bad.map((r) => r.errors));
vault.lock('door');
const lockedAdd = pstore.add({ preset: 'glm', key: KEY });
ok(lockedAdd.code === 'vault_locked' && disk() === before2 && pstore.keyOf(pid).code === 'vault_locked' && pstore.rekey(pid, KEY + 'x').code === 'vault_locked', 'a LOCKED vault: add ⇒ vault_locked, nothing written; keyOf and rekey ⇒ vault_locked by name');
await vault.unlock(PW, {});
const rk = pstore.rekey(pid, 'sk-provider-second-key-0042');
ok(rk.ok && rk.provider.tail === '0042' && pstore.keyOf(pid).value === 'sk-provider-second-key-0042' && !disk().includes('second-key'), 'rekey: the new key sealed over the old, the tail rewritten, still nothing of it in the file');
const pt = pstore.patch(pid, { label: 'My DeepSeek', defaultModel: 'deepseek-reasoner' });
const ptBad = pstore.patch(pid, { defaultModel: 'gpt-9' });
ok(pt.ok && pt.provider.label === 'My DeepSeek' && pt.provider.defaultModel === 'deepseek-reasoner' && !ptBad.ok && codes(ptBad.errors).includes('default-dangling') && pstore.patch('pv-anthropic-api', { label: 'x' }).code === 'built-in', 'patch: rename + default (validated whole: a default not in the table refused); a built-in ⇒ built-in');
pstore = PS.create({ dataDir: PDIR, catalogOf, vault: () => vault, log: () => {} });
ok(pstore.get(pid).label === 'My DeepSeek' && pstore.thirdParty().length === 1 && PS.forDir(PDIR) === pstore, 'a new store over the same file reads it back (and is THE store of its data dir — the Vault row names its key by it)');
ok(eq(pstore.patch(pid, { baseUrl: 'https://elsewhere.example.test/anthropic', key: KEY }).errors.map((e) => e.code), ['base-url-fixed']) && pstore.get(pid).baseUrl === 'https://api.deepseek.com/anthropic', 'a PRESET\'s address is VibeSpace\'s: a new one is refused (base-url-fixed) — the sealed key never moves to a host the preset does not name (adversarial read r1)');
const own = pstore.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', model: 'qwen3', wire: 'anthropic-messages' });
const mv1 = own.ok ? pstore.patch(own.provider.id, { baseUrl: 'https://gpu.example.test/v1' }) : null;
const afterMv1 = own.ok ? pstore.get(own.provider.id).baseUrl : null;   // read BEFORE the second patch moves it
const mv2 = own.ok ? pstore.patch(own.provider.id, { baseUrl: 'https://gpu.example.test/v1', key: 'sk-new-key-for-gpu-7777' }) : null;
ok(own.ok && own.provider.wire === 'anthropic-messages' && M.fitsHarness(own.provider, 'claude') && !mv1.ok && codes(mv1.errors).includes('key-empty') && afterMv1 === 'http://127.0.0.1:9/v1' && mv2.ok && mv2.provider.baseUrl === 'https://gpu.example.test/v1' && mv2.provider.tail === '7777' && pstore.keyOf(own.provider.id).value === 'sk-new-key-for-gpu-7777', 'a SELF-HOSTED one (the person said Anthropic Messages ⇒ Claude Code fits): a new address only WITH the key pasted again (without ⇒ refused, nothing moved; with ⇒ moved, the new key sealed, its tail)');
pstore.remove(own.provider.id);
vault.secretPut(M.keyEntryOf('pv-orphan1'), 'sk-orphan-key-0001');
const orph = pstore.remove('pv-orphan1');
ok(orph.ok && orph.orphan === true && vault.secretGet(M.keyEntryOf('pv-orphan1')).value === null && pstore.remove('pv-never1').code === 'unknown', 'an ORPHANED key (its record gone) is still removed by the provider\'s own door — the Vault row\'s Remove never answers 404 for a key that is there; an id with neither ⇒ unknown');
const VIu = require(path.join(ROOT, 'src/vault-inventory.js'));
const vrow = VIu.secretRowOf(vault.secretNames().find((n) => n.name === M.keyEntryOf(pid)), { providerName: (id) => pstore.get(id).label });
ok(vrow && vrow.field === 'key' && vrow.kind === 'api-key' && vrow.label === 'Model provider key · My DeepSeek' && !JSON.stringify(vrow).includes('0042') && eq(VIu.doorsOf({ store: 'secrets', entry: M.keyEntryOf(pid), field: 'key' }).delete, { method: 'DELETE', path: `/api/providers/${pid}`, confirm: 'provider' }), 'the Vault window\'s row: «Model provider key · <its name>», no character of the key; its Remove = the provider\'s own DELETE (confirm words «provider»)', vrow);
const PMk = require(path.join(ROOT, 'src/server/provider-models.js'));
const keyOfRef = PMk.vaultKeyOf({ getIntegrations: () => null, providers: pstore });
ok(eq(keyOfRef(M.keyRefOf(pid)), { ok: true, value: 'sk-provider-second-key-0042' }) && eq(keyOfRef(M.keyRefOf(pid), pid), { ok: true, value: 'sk-provider-second-key-0042' }) && keyOfRef(M.keyRefOf(pid), 'pv-someone-else').code === 'key-unreadable' && keyOfRef(M.keyRefOf('pv-gone')).code === 'key-unreadable' && keyOfRef('integrations:openrouter#apiKey').code === 'key-unreadable', 'the listed-model refresh reads a provider\'s OWN key through the store (an unknown one / an Integrations row with no store ⇒ key-unreadable)');

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
  const [g1, l1] = await call('GET', '/api/providers', null, {});
  const [g2, l2] = await call('GET', '/api/providers', null, { Authorization: 'Bearer vsst_planted' });
  ok(g1 === 200 && l1.shipped.length === 6 && l1.shipped[0].fits.claude.ok && !l1.shipped[0].fits.codex.ok && l1.providers.length === 1 && l1.providers[0].id === pid && l1.providers[0].fits.claude.ok && l1.providers[0].hasKey === true && !('keyRef' in l1.providers[0]) && !JSON.stringify(l1).includes('second-key') && !JSON.stringify(l1).includes('secrets:provider'), 'GET: the shipped presets with what each fits, the kept records with theirs — no key, and not where the vault keeps it (hasKey only)');
  ok(g2 === 403 && l2.code === 'human_only', 'GET by an agent\'s bearer ⇒ 403 human_only (the address and the tail are a page\'s to read)');
  const [b1, x1] = await call('POST', '/api/providers', { preset: 'glm', key: KEY }, { ...SAME, Authorization: 'Bearer vsst_planted' });
  const [b2, x2] = await call('POST', '/api/providers', { preset: 'glm', key: KEY }, { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' });
  const [b3] = await call('DELETE', `/api/providers/${pid}`, null, { Authorization: 'Bearer jbt_planted' });
  ok(b1 === 403 && x1.code === 'human_only' && b2 === 403 && x2.code === 'cross_site' && b3 === 403 && pstore.thirdParty().length === 1 && changes.length === 0, 'EVERY WRITE IS A PERSON\'S: an agent\'s bearer ⇒ 403 human_only, another site ⇒ 403 cross_site, a job token cannot remove — nothing changed, nothing announced');
  const [c1, y1] = await call('POST', '/api/providers', { preset: 'glm', region: 'cn', key: KEY });
  const [c2, y2] = await call('POST', '/api/providers', { preset: 'glm', key: OAT });
  vault.lock('door');
  const [c3, y3] = await call('POST', '/api/providers', { preset: 'glm', key: KEY });
  await vault.unlock(PW, {});
  ok(c1 === 201 && y1.provider.baseUrl === 'https://open.bigmodel.cn/api/anthropic' && y1.provider.fits.claude.ok && c2 === 400 && y2.errors[0].code === 'key-subscription' && c3 === 423 && y3.code === 'vault_locked' && changes.length === 1 && changes[0].what === 'add', 'POST: 201 with the record (the region\'s address); a Claude login ⇒ 400 by field; a locked vault ⇒ 423 vault_locked; only the kept one is announced', { y1: y1.provider && y1.provider.baseUrl, y2, y3 });
  const gid = y1.provider.id;
  const [d1, z1] = await call('POST', `/api/providers/${gid}/key`, { key: 'sk-provider-third-9999' });
  const [d2, z2] = await call('PATCH', `/api/providers/${gid}`, { label: 'GLM (work)' });
  const [d3, z3] = await call('DELETE', `/api/providers/${gid}`);
  const [d4] = await call('DELETE', `/api/providers/${gid}`);
  ok(d1 === 200 && z1.provider.tail === '9999' && d2 === 200 && z2.provider.label === 'GLM (work)' && d3 === 200 && z3.keyDropped === true && d4 === 404 && pstore.get(gid) === null && vault.secretGet(M.keyEntryOf(gid)).value === null && eq(changes.map((c) => c.what), ['add', 'rekey', 'patch', 'remove']), 'new key · rename · remove (the record AND its vault entry; a second remove ⇒ 404), each announced once');
} finally { psrv.close(); }

console.log('⑭ RED controls');
const mFits = mutant([["    else if (!k.harnesses.includes(h)) out[h] = { ok: false, code: 'wire' };\n", '']]);
ok(!M.fitsHarness({ kind: 'anthropic-compatible' }, 'codex') && mFits.fitsHarness({ kind: 'anthropic-compatible' }, 'codex'), 'CONTROL: fits without the wire rule puts DeepSeek (an Anthropic-compatible address) under Codex ⇒ RED (the real one says it does not offer what Codex needs)');
const mKey = mutant([["  if (/sk-ant-(?:oat|ort|sid)/i.test(k)) return [{ field: 'key', code: 'key-subscription' }];\n  if (/sk-ant-/i.test(k)) return [{ field: 'key', code: 'key-anthropic' }];\n", '']]);
ok(M.validateKey(OAT).length === 1 && mKey.validateKey(OAT).length === 0, 'CONTROL: the key rule without the subscription refusal takes a Claude login as a provider key ⇒ RED');
const mAnchored = mutant([["  if (/sk-ant-(?:oat|ort|sid)/i.test(k)) return", "  if (/^sk-ant-(?:oat|ort|sid)/.test(k)) return"], ["  if (/sk-ant-/i.test(k)) return", "  if (/^sk-ant-/.test(k)) return"]]);
ok(codes(M.validateKey(`"${OAT}"`)).join() === 'key-subscription' && codes(mAnchored.validateKey(`"${OAT}"`)).join() === 'key-shape' && codes(mAnchored.validateKey(`ANTHROPIC_AUTH_TOKEN=${OAT}`)).join() === 'key-shape' && codes(mAnchored.validateKey(JSON.stringify({ t: OAT }))).join() === 'key-shape', 'CONTROL: the rule ANCHORED at the start (the first cut) no longer names a quoted / NAME= / JSON-wrapped subscription login for what it is ⇒ the anywhere leg above goes RED');
const mFitKind = mutant([["const fitKindOf = (p) => (p && p.kind === 'self-hosted' ? WIRE_KIND[p.wire] || 'openai-chat' : p && p.kind);", "const fitKindOf = (p) => p && p.kind;"]]);
ok(!M.fitsHarness({ kind: 'self-hosted' }, 'claude') && mFitKind.fitsHarness({ kind: 'self-hosted' }, 'claude') && mFitKind.fitsHarness({ kind: 'self-hosted' }, 'codex'), 'CONTROL: fits by the kind\'s list alone (the first cut) tells a person with a Chat-only vLLM server that Claude Code AND Codex fit ⇒ RED');
const SSRC = path.join(ROOT, 'src/server/provider-store.js');
const storeMutant = (pairs) => { let t = fs.readFileSync(SSRC, 'utf-8'); for (const [from, to] of pairs) { if (!t.includes(from)) throw new Error('mutant anchor missing: ' + from.slice(0, 80)); t = t.replace(from, to); } const m = new Module(SSRC); m.filename = SSRC; m.paths = Module._nodeModulePaths(path.dirname(SSRC)); m._compile(t, SSRC); return m.exports; };
const PSm = storeMutant([['      const sealed = seal(id, i.key);\n', '      const sealed = { ok: true };\n']]);
const MDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvkey-m-'));
vault.lock('door');
const mstore = PSm.create({ dataDir: MDIR, catalogOf, vault: () => vault, log: () => {} });
const ma1 = mstore.add({ preset: 'glm', key: KEY });
ok(ma1.ok && fs.existsSync(mstore.file) && mstore.keyOf(ma1.provider.id).code === 'vault_locked', 'CONTROL: a store that skips the seal WRITES a record while the vault is locked (a provider whose key was never kept) ⇒ RED (the real one refuses vault_locked with the file untouched)');
fs.rmSync(PDIR, { recursive: true, force: true }); fs.rmSync(MDIR, { recursive: true, force: true });

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
