'use strict';
// THE MODEL PROVIDER RECORD (design q-053 r1 §1 + the record half of §3, lane provider-record = Train 1 row P0a; it revises
// q-045 §2.1). PURE: imports nothing — the hub's store (src/server/provider-store.js), its routes (src/routes/account-models.js),
// the account dialog's model section (src/lib/account-models.js) and the suites read ONE spelling. A provider is WHO SERVES
// the models an account may use: one of eight kinds (the first-party subscriptions included), its model rows
// { id, label, context, caps }, aliases (a name the harness or the conversation uses → a row OF THE TABLE), and where the rows
// come from — `listed` (by the harness's own catalog, or the provider's API: P0c's refresh door) · `configured` (entered by the
// owner on the account) · `none` (said so; never a silent empty menu). EVERY account names one: today's logins map onto the
// built-in records below (accountProviderId); a third-party record lives in data/providers.json — added from a SHIPPED preset
// (SHIPPED below, q-045 D1: a list in the release, never fetched) with its key SEALED in the vault (`provider:<id>`, a hub
// secret; the record keeps only the reference and the last four characters — lane lg-providers, B-d578 U1).
const i18nKey = (s) => s; // marks a dictionary key declared here (the client translates it)

// ── the model id, per kind (§3: the harness must accept it) — the regex is THE gate, an empty id included ──
const ID_PATTERNS = Object.freeze({
  anthropic: /^claude-[a-z0-9][a-z0-9.-]*$/,
  openai: /^[a-z0-9][a-z0-9.-]*$/,
  google: /^gemini-[a-z0-9][a-z0-9.-]*$/,
  openrouter: /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._:-]*$/,
  any: /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/,
});
const ID_HINTS = Object.freeze({
  anthropic: i18nKey('An Anthropic model id starts with claude- (e.g. claude-sonnet-5-5)'),
  openai: i18nKey('Lower-case letters, digits, dots and dashes (e.g. gpt-5.5)'),
  google: i18nKey('A Gemini model id starts with gemini- (e.g. gemini-3-pro-preview)'),
  openrouter: i18nKey('The vendor, a slash, then the model (e.g. deepseek/deepseek-chat)'),
  any: i18nKey('Letters, digits and . _ : / @ - (e.g. Qwen/Qwen3-32B or llama3.1:8b)'),
});
const ID_MAX = 128;
const LABEL_MAX = 60;
const CONTEXT_MAX = 10000000;
const MODELS_MAX = 200;

// ── THE EIGHT KINDS (§1). wire = the interface the provider speaks; harnesses = who can run an account of it (q-045 §2.2's
// projection by interface shape: claude ↔ anthropic-*, codex ↔ openai-responses / openrouter, gemini ↔ google-*, opencode ↔
// any — the FIRST is the one whose catalog lists a `harness-cache` provider); auths = how a key reaches it (`oauth` = the
// CLI's own login, no key of ours); keyed = a third-party record names a vault entry (keyRef). ──
const kind = (id, label, family, wire, harnesses, auths, extra = {}) => Object.freeze({
  id, label, family, wire, harnesses: Object.freeze(harnesses), auths: Object.freeze(auths),
  subscription: false, keyed: true, modelsSource: 'configured', listedBy: null,
  idPattern: ID_PATTERNS[family], idHint: ID_HINTS[family], ...extra,
});
const KINDS = Object.freeze([
  kind('anthropic-subscription', i18nKey('Anthropic subscription'), 'anthropic', 'anthropic-messages', ['claude'], ['oauth'], { subscription: true, keyed: false, modelsSource: 'listed', listedBy: 'harness-cache' }),
  kind('anthropic-api', i18nKey('Anthropic API'), 'anthropic', 'anthropic-messages', ['claude', 'opencode'], ['x-api-key', 'bearer'], { modelsSource: 'listed', listedBy: 'harness-cache' }),
  // a THIRD PARTY that speaks Anthropic's Messages interface under its own model ids (DeepSeek, Kimi, GLM, MiniMax at their
  // `/anthropic` address — lane lg-providers U1): Claude Code runs it (ANTHROPIC_BASE_URL), Codex cannot (it needs Responses)
  kind('anthropic-compatible', i18nKey('Anthropic-compatible'), 'any', 'anthropic-messages', ['claude', 'opencode'], ['bearer', 'x-api-key']),
  kind('openai-responses', i18nKey('OpenAI · Responses API'), 'openai', 'openai-responses', ['codex', 'opencode'], ['bearer', 'oauth']),
  kind('openai-chat', i18nKey('OpenAI-compatible · Chat Completions'), 'openai', 'openai-chat', ['opencode'], ['bearer']),
  kind('google-subscription', i18nKey('Google AI subscription'), 'google', 'google', ['gemini'], ['oauth'], { subscription: true, keyed: false, modelsSource: 'listed', listedBy: 'harness-cache' }),
  kind('google-api', i18nKey('Google Gemini API'), 'google', 'google', ['gemini', 'opencode'], ['env']),
  kind('openrouter', i18nKey('OpenRouter'), 'openrouter', 'openai-chat', ['codex', 'opencode'], ['bearer']),
  kind('self-hosted', i18nKey('Self-hosted or other'), 'any', 'openai-chat', ['opencode', 'claude', 'codex'], ['bearer', 'x-api-key', 'env']),
]);
const KIND_IDS = Object.freeze(KINDS.map((k) => k.id));
const kindOf = (id) => KINDS.find((k) => k.id === id) || null;
const AUTHS = Object.freeze(['bearer', 'x-api-key', 'oauth', 'env']);
const MODELS_SOURCES = Object.freeze(['listed', 'configured', 'none']);
const LISTED_BY = Object.freeze(['harness-cache', 'provider-api']);
const CAPS = Object.freeze(['tools', 'vision', 'reasoning', '1m']);
const CAP_WORDS = Object.freeze({ tools: i18nKey('Tools'), vision: i18nKey('Image input'), reasoning: i18nKey('Reasoning'), '1m': i18nKey('1M context') });

// ── THE RECORD (§1) — closed fields; nothing else is kept ──
// `tail` = the key's last four characters (the roster's ••••1234, as an API-key account shows it); `createdAt` = when it was added
// `wire` = the interface a SELF-HOSTED one speaks, as the person said (null for every other kind: its kind says it)
// `tested` (lane lg-providers U4) = the last Test's verdict per harness { <harness>: { verdict, at } }
const PROVIDER_FIELDS = Object.freeze(['id', 'kind', 'label', 'preset', 'baseUrl', 'auth', 'keyRef', 'models', 'defaultModel', 'aliases', 'modelsSource', 'listedBy', 'fetchedAt', 'lastTestAt', 'tail', 'createdAt', 'wire', 'tested']);
const MODEL_FIELDS = Object.freeze(['id', 'label', 'context', 'caps']);

// ── THE BUILT-IN RECORDS: the two first-party subscription presets §1 names (anthropic-subscription = claude's OAuth,
// google-subscription = gemini's oauth-personal) + the two first-party logins today's roster already holds (the Console key =
// anthropic-api; codex's ChatGPT login = the Responses wire over oauth) — so every account row names a provider. keyRef null
// = the account's OWN credential (a CLI login, or the key the account row holds); models [] here: the harness's own catalog
// fills them at read time (withListed — claude's alias table + CLAUDE_KNOWN_MODELS, codex's models cache, gemini's static
// table in its descriptor), so no second table drifts from the harness's. ──
const preset = (id, kindId, label, auth) => Object.freeze({
  id: `pv-${id}`, kind: kindId, label, preset: id, baseUrl: null, auth, keyRef: null, models: Object.freeze([]), defaultModel: '',
  aliases: Object.freeze({}), modelsSource: 'listed', listedBy: 'harness-cache', fetchedAt: null, lastTestAt: null,
});
const PRESETS = Object.freeze([
  preset('anthropic-subscription', 'anthropic-subscription', i18nKey('Anthropic subscription'), 'oauth'),
  preset('google-subscription', 'google-subscription', i18nKey('Google AI subscription'), 'oauth'),
  preset('anthropic-api', 'anthropic-api', i18nKey('Anthropic API (Console key)'), 'x-api-key'),
  preset('openai-chatgpt', 'openai-responses', i18nKey('ChatGPT subscription'), 'oauth'),
]);
const presetOf = (id) => PRESETS.find((p) => p.id === id) || null;
// an account (accounts.js list() row or record: backend + type; no backend = claude, no type = api — accounts.js's own
// legacy rule) → the built-in record it rides; a projected third-party row's id IS its record's (q-045 §2.2: `pv-…`);
// no id = the machine's own CLI login of that harness. A harness with no account table answers null.
const ACCOUNT_PRESETS = Object.freeze({
  'claude:subscription': 'pv-anthropic-subscription', 'claude:pooled': 'pv-anthropic-subscription', 'claude:api': 'pv-anthropic-api',
  'codex:subscription': 'pv-openai-chatgpt', 'codex:pooled': 'pv-openai-chatgpt',
  'gemini:subscription': 'pv-google-subscription', 'gemini:pooled': 'pv-google-subscription',
});
function accountProviderId(a) {
  if (!a || typeof a !== 'object') return null;
  if (/^pv-/.test(String(a.id || ''))) return String(a.id);
  // an account record that NAMES its third-party provider (`providerId`, the field the pool's member lookup reads — q-053 P0b)
  if (typeof a.providerId === 'string' && /^pv-[a-z0-9][a-z0-9-]{0,63}$/.test(a.providerId)) return a.providerId;
  const type = a.id ? (a.type || 'api') : 'subscription';
  return ACCOUNT_PRESETS[`${a.backend || 'claude'}:${type}`] || null;
}
/** The harness whose own catalog lists a `harness-cache` provider (null for any other source). */
function listerOf(p) {
  const k = p && kindOf(p.kind);
  return k && p.modelsSource === 'listed' && p.listedBy === 'harness-cache' ? k.harnesses[0] : null;
}

// ── a model row: context in tokens (`200k` / `1M` accepted), caps from CAPS ──
function parseContext(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kKmM]?)\s*$/.exec(String(v));
  if (!m) return NaN;
  const n = Number(m[1]) * (/k/i.test(m[2]) ? 1000 : /m/i.test(m[2]) ? 1000000 : 1);
  return Math.round(n);
}
function formatContext(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1000000 && n % 100000 === 0) return `${n / 1000000}M`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}
/** The owner's row as written (no repair): every error by field. The id's regex is the ONLY empty-id gate. */
function validateModelRow(kindId, row) {
  const k = kindOf(kindId);
  if (!k) return [{ field: 'kind', code: 'kind-unknown' }];
  const r = row && typeof row === 'object' ? row : {};
  const errors = [];
  const id = typeof r.id === 'string' ? r.id : '';
  if (id.length > ID_MAX) errors.push({ field: 'id', code: 'id-long' });
  else if (!k.idPattern.test(id)) errors.push({ field: 'id', code: 'id-pattern' });
  if (String(r.label == null ? '' : r.label).trim().length > LABEL_MAX) errors.push({ field: 'label', code: 'label-long' });
  const ctx = parseContext(r.context);
  if (ctx !== null && !(Number.isInteger(ctx) && ctx >= 1 && ctx <= CONTEXT_MAX)) errors.push({ field: 'context', code: 'context-range' });
  if (r.caps !== undefined && !(Array.isArray(r.caps) && r.caps.every((c) => CAPS.includes(c)))) errors.push({ field: 'caps', code: 'caps-unknown' });
  return errors;
}
/** A row as kept (after it validated): label defaults to the id, caps in CAPS order. */
function normalizeModelRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  const id = String(r.id == null ? '' : r.id);
  const ctx = parseContext(r.context);
  return {
    id, label: String(r.label == null ? '' : r.label).trim().slice(0, LABEL_MAX) || id,
    context: Number.isInteger(ctx) && ctx >= 1 && ctx <= CONTEXT_MAX ? ctx : null,
    caps: CAPS.filter((c) => Array.isArray(r.caps) && r.caps.includes(c)),
  };
}
const ALIAS_NAME = /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,63}$/;
/** The account dialog's save (configured rows) — { ok, errors: [{ index?, alias?, field, code }], value }: the rows, then
 *  duplicates, then every alias must land ON A ROW OF THE TABLE, then the default. */
function validateModels(kindId, input) {
  const src = input && typeof input === 'object' ? input : {};
  const rows = Array.isArray(src.models) ? src.models : [];
  const errors = [];
  if (!kindOf(kindId)) errors.push({ field: 'kind', code: 'kind-unknown' });
  if (rows.length > MODELS_MAX) errors.push({ field: 'models', code: 'too-many' });
  const seen = new Set();
  rows.forEach((row, index) => {
    for (const e of (kindOf(kindId) ? validateModelRow(kindId, row) : [])) errors.push({ index, ...e });
    const id = row && typeof row.id === 'string' ? row.id : '';
    if (id && seen.has(id)) errors.push({ index, field: 'id', code: 'id-duplicate' });
    seen.add(id);
  });
  const models = rows.map(normalizeModelRow);
  const aliases = {};
  const rawAliases = src.aliases && typeof src.aliases === 'object' && !Array.isArray(src.aliases) ? src.aliases : {};
  for (const [name, target] of Object.entries(rawAliases)) {
    if (!ALIAS_NAME.test(name)) { errors.push({ alias: name, field: 'aliases', code: 'alias-name' }); continue; }
    if (!models.some((m) => m.id === target)) { errors.push({ alias: name, field: 'aliases', code: 'alias-dangling' }); continue; }
    aliases[name] = String(target);
  }
  const defaultModel = typeof src.defaultModel === 'string' ? src.defaultModel : '';
  if (defaultModel && !models.some((m) => m.id === defaultModel)) errors.push({ field: 'defaultModel', code: 'default-dangling' });
  return { ok: !errors.length, errors, value: { models, aliases, defaultModel } };
}
const KEY_REF = /^[a-z][a-z0-9-]*:[^#\s]{1,240}#[\w.:-]{1,160}$/; // a vault entry `store:entry#field` (the Vault inventory's spelling — src/vault-inventory.js parseRef: an Integrations row's field is `apiKey`)
/** A record from anywhere (the store's file, a route body) → the closed shape, defaults from its kind. */
function normalizeProvider(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const k = kindOf(r.kind);
  const src = MODELS_SOURCES.includes(r.modelsSource) ? r.modelsSource : (k ? k.modelsSource : 'none');
  const when = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    id: String(r.id || ''), kind: String(r.kind || ''), label: String(r.label == null ? '' : r.label).trim(),
    preset: typeof r.preset === 'string' && r.preset ? r.preset : null,
    baseUrl: typeof r.baseUrl === 'string' && r.baseUrl ? r.baseUrl : null,
    auth: typeof r.auth === 'string' && r.auth ? r.auth : (k ? k.auths[0] : null),
    keyRef: typeof r.keyRef === 'string' && r.keyRef ? r.keyRef : null,
    models: (Array.isArray(r.models) ? r.models : []).map(normalizeModelRow),
    defaultModel: typeof r.defaultModel === 'string' ? r.defaultModel : '',
    aliases: r.aliases && typeof r.aliases === 'object' && !Array.isArray(r.aliases) ? { ...r.aliases } : {},
    modelsSource: src,
    listedBy: src === 'listed' ? (LISTED_BY.includes(r.listedBy) ? r.listedBy : (k ? k.listedBy : null)) : null,
    fetchedAt: when(r.fetchedAt), lastTestAt: when(r.lastTestAt),
    tail: typeof r.tail === 'string' && TAIL_RE.test(r.tail) ? r.tail : null, createdAt: when(r.createdAt),
    wire: WIRES.includes(r.wire) ? r.wire : null,
    tested: testedOf(r.tested),
  };
}
/** the kept Test verdicts: harness id → { verdict, at } — a verdict word, an instant; anything else dropped */
function testedOf(t) {
  const out = {};
  if (!t || typeof t !== 'object' || Array.isArray(t)) return out;
  for (const [h, v] of Object.entries(t)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(h) || !v || typeof v !== 'object') continue;
    const at = Number(v.at);
    if (/^[a-z][a-z-]{1,23}$/.test(String(v.verdict || '')) && Number.isFinite(at) && at > 0) out[h] = { verdict: String(v.verdict), at };
  }
  return out;
}
/** the interfaces a provider may speak — a self-hosted one's `wire` is one of them (lane lg-providers U1) */
const WIRES = Object.freeze(['anthropic-messages', 'openai-responses', 'openai-chat']);
/** plain http carries the key in clear: only to the person's OWN network (loopback, a private range, a .local / .lan / .internal
 *  name, a name with no dot); anything else must be https */
function ownNetworkHost(host) {
  const raw = String(host || '').toLowerCase();
  const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(raw);   // a bracketed IPv6 host, with or without its port
  const h = v6 ? v6[1] : raw.replace(/:\d+$/, '');
  if (!h) return false;
  if (h === 'localhost' || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/\.(local|lan|internal|home\.arpa)$/.test(h)) return true;
  return !h.includes('.') && !h.includes(':');
}
const hostOf = (url) => { const m = /^https?:\/\/([^/?#]+)/i.exec(String(url || '')); return m ? m[1].replace(/^[^@]*@/, '') : ''; };
const TAIL_RE = /^[\x21-\x7e]{1,4}$/;
/** Every error of a whole record (normalized first) — the store refuses a record with any. */
function validateProvider(raw) {
  const p = normalizeProvider(raw);
  const errors = [];
  const k = kindOf(p.kind);
  if (!/^pv-[a-z0-9][a-z0-9-]{0,63}$/.test(p.id)) errors.push({ field: 'id', code: 'provider-id' });
  if (!k) errors.push({ field: 'kind', code: 'kind-unknown' });
  if (!p.label || p.label.length > LABEL_MAX) errors.push({ field: 'label', code: 'label-long' });
  if (k && !k.auths.includes(p.auth)) errors.push({ field: 'auth', code: 'auth-kind' });
  if (p.keyRef !== null && !KEY_REF.test(p.keyRef)) errors.push({ field: 'keyRef', code: 'key-ref' });
  if (p.baseUrl !== null && (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(p.baseUrl) || /[\\%]/.test(p.baseUrl) || /[^\x21-\x7e]/.test(p.baseUrl))) errors.push({ field: 'baseUrl', code: 'base-url' });   // `\` / `%` / non-ASCII: a host the CLIs' URL parser reads otherwise (lane lg-providers U4 r1)
  // a user:password@ in the address would ride the command line (codex's -c table) and every log — the key has its own place
  else if (p.baseUrl !== null && /^https?:\/\/[^/]*@/.test(p.baseUrl)) errors.push({ field: 'baseUrl', code: 'base-url-credentials' });   // lane lg-providers U2
  // …nor a query or a fragment on a keyed record's address (a `?api-key=` would ride the command line too — r1)
  else if (p.baseUrl !== null && p.keyRef !== null && /[?#]/.test(p.baseUrl)) errors.push({ field: 'baseUrl', code: 'base-url-credentials' });
  // a record that names a KEY never sends it in clear past the person's own network (lane lg-providers U1)
  else if (p.baseUrl !== null && p.keyRef !== null && /^http:\/\//i.test(p.baseUrl) && !ownNetworkHost(hostOf(p.baseUrl))) errors.push({ field: 'baseUrl', code: 'base-url-plain' });
  // a provider's own sealed key is ITS OWN: a reference to another record's entry would hand that key to this address
  if (p.keyRef !== null && /^secrets:provider:/.test(p.keyRef) && providerOfKeyRef(p.keyRef) !== p.id) errors.push({ field: 'keyRef', code: 'key-ref-foreign' });
  if (p.wire !== null && p.kind !== 'self-hosted') errors.push({ field: 'wire', code: 'wire-kind' });
  if (p.modelsSource === 'listed' && !p.listedBy) errors.push({ field: 'listedBy', code: 'listed-by' });
  if (p.modelsSource === 'none' && p.models.length) errors.push({ field: 'models', code: 'none-has-models' });
  if (p.modelsSource === 'configured' && !p.models.length) errors.push({ field: 'models', code: 'configured-empty' });
  if (k) {
    const v = validateModels(p.kind, { models: (raw && Array.isArray(raw.models)) ? raw.models : [], aliases: p.aliases, defaultModel: p.defaultModel });
    // a LISTED table is the lister's (its ids are the harness's own spellings — `opus[1m]`); its rows still may not
    // repeat, and its aliases still land on a row of it
    // (a provider's own /models may list more than an owner would type: REFRESH.maxRows, not MODELS_MAX — lane models-at-session)
    for (const e of v.errors) if (p.modelsSource !== 'listed' || e.code === 'id-duplicate' || (e.field !== 'id' && e.code !== 'too-many')) errors.push(e);
    if (p.modelsSource === 'listed' && p.models.length > REFRESH.maxRows) errors.push({ field: 'models', code: 'too-many' });
  }
  return errors;
}

// ── A HARNESS'S OWN CATALOG as listed rows (AVAILABLE_MODELS[harness]: `{ id, label }`; the empty Default row dropped —
// "the harness's default" is the empty request, below) ──
function listedRows(catalog) {
  const out = [];
  const seen = new Set();
  for (const m of Array.isArray(catalog) ? catalog : []) {
    const id = String((m && m.id) || '').trim();
    if (!id || seen.has(id) || id.length > ID_MAX || /\s/.test(id)) continue;
    seen.add(id);
    const oneM = /\[1m\]$/i.test(id) || /\b1M\b/.test(String((m && m.label) || ''));
    const own = m && Number.isInteger(m.context) && m.context >= 1 && m.context <= CONTEXT_MAX ? m.context : null; // the harness's own size (claude: its binary's catalog)
    out.push({ id, label: String((m && m.label) || id).slice(0, LABEL_MAX), context: own || (oneM ? 1000000 : null), caps: oneM || (own && own >= 1000000) ? ['1m'] : [] });
  }
  return out;
}
/** A `harness-cache` record with its rows filled from the harness's catalog (any other record is returned as is). */
function withListed(p, catalog, at = null) {
  if (!p || p.modelsSource !== 'listed' || p.listedBy !== 'harness-cache') return p;
  return { ...p, models: listedRows(catalog), fetchedAt: at || p.fetchedAt || null };
}

// ── SERVES / RESOLVE (§2 rule 1 + rule 3; §3): a requested model → the id this provider runs, or null (not served) ──
const DATED = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;
const core = (m) => String(m).toLowerCase().replace(/^claude-/, '').replace(/\s*\[1m\]$/, '').trim();
/** The same model in two spellings: the `claude-` prefix, a `[1m]` suffix, case, or a dated snapshot of the other. */
function sameModel(a, b) {
  const x = core(a), y = core(b);
  if (!x || !y) return false;
  return x === y || x.replace(DATED, '') === y || y.replace(DATED, '') === x;
}
/** THE DOOR for a model a frame names (lane fable-52-cli-321 r5–r6 — a set-model, a create / resume): a string, trimmed, at most
 *  MODEL_NAME_MAX characters, id-shaped (an alias, a full id, a provider path, a `[1m]` mark). → the trimmed id, or null. */
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]*(\[[A-Za-z0-9]+\])?$/;
const MODEL_NAME_MAX = 128;
function namedModel(x) {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  return t && t.length <= MODEL_NAME_MAX && MODEL_NAME.test(t) ? t : null;
}
/** '' = the provider's default (its defaultModel; a harness-listed one leaves it to the harness → ''); an exact row; an
 *  ALIAS — which lands on a row of the table or NOWHERE (a dangling alias is never passed on); the same model spelled
 *  differently; and for a harness-listed provider any id of its family (that catalog is a menu, not a fence: the CLI runs
 *  any id of its vendor). `none` serves nothing. */
function resolveModel(p, model) {
  if (!p || p.modelsSource === 'none') return null;
  const rows = Array.isArray(p.models) ? p.models : [];
  const open = p.modelsSource === 'listed' && p.listedBy === 'harness-cache';
  if (!rows.length && !open) return null;
  const want = String(model == null ? '' : model).trim();
  if (!want) {
    const d = String(p.defaultModel || '');
    if (d) return rows.some((r) => r.id === d) ? d : null;
    return open ? '' : rows[0].id;
  }
  if (rows.some((r) => r.id === want)) return want;
  if (p.aliases && Object.prototype.hasOwnProperty.call(p.aliases, want)) {
    const to = String(p.aliases[want]);
    return rows.some((r) => r.id === to) ? to : null;
  }
  const hit = rows.find((r) => sameModel(r.id, want));
  if (hit) return hit.id;
  const k = kindOf(p.kind);
  // …and its 1M form: the harness runs `<id>[1m]` itself (claude: the context-1m road; lane cli-update-needs-nothing R4)
  return open && k && k.idPattern.test(want.replace(/\[1m\]$/i, '')) ? want : null;
}
const servesModel = (p, model) => resolveModel(p, model) !== null;
const modelsOf = (p) => (p && Array.isArray(p.models) ? p.models : []);

// ── THE WORDS a surface says of a record's source and of a refused row ──
/** → { key, params } — the harness's NAME is the caller's (its own descriptor label). */
function sourceOf(p) {
  if (!p || p.modelsSource === 'none') return { key: i18nKey('No models configured for this provider'), params: {} };
  if (p.modelsSource === 'configured') return { key: i18nKey('Entered by you'), params: {} };
  if (p.listedBy === 'harness-cache') return { key: i18nKey('Listed by {harness}'), params: { harness: listerOf(p) } };
  return { key: i18nKey('Listed by the provider'), params: {} };
}
// ── THE MENU (§3, lane models-at-session = Train 1 row P0c): a new conversation's model menu and a running one's badge list
// are the ACCOUNT'S PROVIDER'S rows — never the harness's global table, never a silent empty menu ──
const MENU_EMPTY = i18nKey('No models configured for this provider — set up');
/** The menu of a provider. `catalog` = the running harness's own list (AVAILABLE_MODELS[backend], its rows as the harness
 *  serves them — efforts and all). → { models, empty, open, defaultId }:
 *   · no provider (a harness with no account table) or a harness-listed one → that list as it is, its Default row ('' = the
 *     harness's own default) first; OPEN: Custom… stays (the harness judges its own spellings, as before)
 *   · configured / listed by the provider → EXACTLY the record's rows, `defaultId` = the row its default resolves to (an
 *     explicit id is what a new conversation sends — never '' to a harness whose own default is another vendor's); CLOSED
 *   · none, or no rows → { models: [], empty: true } — the surface draws ONE line that says so (MENU_EMPTY) with the door */
function menuOf(p, catalog) {
  if (!p || listerOf(p)) {
    const list = (Array.isArray(catalog) ? catalog : []).filter((m) => m && typeof m === 'object' && typeof m.id === 'string');
    return { models: list.some((m) => m.id === '') ? list : [{ id: '', label: 'Default' }, ...list], empty: false, open: true, defaultId: '' };
  }
  const rows = p.modelsSource === 'none' ? [] : modelsOf(p);
  if (!rows.length) return { models: [], empty: true, open: false, defaultId: null };
  return { models: rows.map((m) => ({ id: m.id, label: m.label || m.id, context: m.context, caps: m.caps })), empty: false, open: false, defaultId: resolveModel(p, '') };
}
/** A RUNNING conversation's pick (a badge row or Custom…) RE-RESOLVED against its provider → { ok, model } (the id to send:
 *  an alias lands on its row, another spelling on the row's own) | { ok: false, code: 'not-served' }. An open provider
 *  passes what it cannot resolve to the harness (its own aliases — `opusplan` — are the CLI's to judge); no provider = as typed. */
function resolvePick(p, want) {
  const w = String(want == null ? '' : want).trim();
  if (!p) return { ok: true, model: w };
  const r = resolveModel(p, w);
  if (r !== null) return { ok: true, model: r };
  return listerOf(p) ? { ok: true, model: w } : { ok: false, code: 'not-served' };
}

// ── THE LISTED-PROVIDER REFRESH (§3): the provider's own /models — ONE person's press, the vault open, once a minute per
// provider at most, never a timer; the answer CACHED on the record (models + fetchedAt) and every menu reads the cache.
// The request itself lives in ONE file (src/server/provider-models.js — test-vendor-whitelist row PROVIDER_MODELS) ──
const REFRESH = Object.freeze({ cooldownMs: 60000, timeoutMs: 15000, maxBytes: 1024 * 1024, maxRows: 1000 });
const MODELS_BASE = Object.freeze({ openrouter: 'https://openrouter.ai/api/v1' });   // a kind's own base when the record names none
const LISTABLE_KINDS = Object.freeze(['openrouter', 'openai-chat', 'openai-responses', 'self-hosted']);   // the /models shape (OpenAI-compatible)
/** The list's URL (`<base>/models`), or null — a kind with no OpenAI-compatible list, or no base. */
function modelsEndpointOf(p) {
  if (!p || !LISTABLE_KINDS.includes(p.kind)) return null;
  const base = p.baseUrl || MODELS_BASE[p.kind] || null;
  return base && /^https?:\/\/[^\s/]+(\/\S*)?$/.test(base) ? `${base.replace(/\/+$/, '')}/models` : null;
}
/** A record whose rows its provider lists (and that has a list to ask) — the only one the door refreshes. */
const refreshable = (p) => !!p && p.modelsSource === 'listed' && p.listedBy === 'provider-api' && !!modelsEndpointOf(p);
/** May this press ask now? `vault` = the vault's state; `lastAt` = this provider's last attempt (a failed one counts). */
function refreshVerdict({ provider, vault, now, lastAt = 0, inFlight = false } = {}) {
  if (!provider) return { ok: false, code: 'unknown' };
  if (!refreshable(provider)) return { ok: false, code: 'not-listed' };
  if (vault !== 'unlocked') return { ok: false, code: vault === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked' };
  if (inFlight) return { ok: false, code: 'in-flight' };
  const since = Math.max(Number(lastAt) || 0, Number(provider.fetchedAt) || 0);
  const wait = since + REFRESH.cooldownMs - Number(now);
  if (wait > 0) return { ok: false, code: 'cooldown', retryAfterMs: wait };
  return { ok: true, url: modelsEndpointOf(provider) };
}
/** The request's credential header for a record's `auth` (a key the vault handed; none ⇒ none). */
function authHeaders(p, key) {
  if (!key) return {};
  if (p && p.auth === 'x-api-key') return { 'x-api-key': String(key) };
  return { authorization: `Bearer ${String(key)}` };
}
/** A provider's /models answer (OpenAI `{ data: [{ id }] }`; OpenRouter adds name · context_length ·
 *  architecture.input_modalities · supported_parameters) → { ok, rows, skipped } | { ok: false, code: 'bad-answer' }. */
function parseListed(body) {
  const data = body && typeof body === 'object' && Array.isArray(body.data) ? body.data : null;
  if (!data) return { ok: false, code: 'bad-answer' };
  const rows = [];
  const seen = new Set();
  let skipped = 0;
  for (const m of data) {
    const id = String((m && m.id) || '').trim();
    if (!id || id.length > ID_MAX || /\s/.test(id) || seen.has(id) || rows.length >= REFRESH.maxRows) { skipped++; continue; }
    seen.add(id);
    const n = Number(m.context_length != null ? m.context_length : m.context_window);
    const context = Number.isInteger(n) && n >= 1 && n <= CONTEXT_MAX ? n : null;
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    const inputs = m.architecture && Array.isArray(m.architecture.input_modalities) ? m.architecture.input_modalities : [];
    const has = { tools: params.includes('tools'), vision: inputs.includes('image'), reasoning: params.includes('reasoning') || params.includes('include_reasoning'), '1m': context !== null && context >= 1000000 };
    rows.push({ id, label: String(m.name || id).trim().slice(0, LABEL_MAX) || id, context, caps: CAPS.filter((c) => has[c]) });
  }
  return { ok: true, rows, skipped };
}
const REFRESH_WORDS = Object.freeze({
  unknown: i18nKey('Unknown provider'),
  'not-listed': i18nKey('This provider does not list its models — enter them instead'),
  vault_locked: i18nKey('Unlock the vault first — the provider’s key is kept there'),
  vault_not_set_up: i18nKey('Set up the vault first — the provider’s key is kept there'),
  'in-flight': i18nKey('This provider’s list is being refreshed already'),
  cooldown: i18nKey('Refreshed a moment ago — try again in {s} s'),
  'key-unreadable': i18nKey('The provider’s key could not be read from the vault'),
  unreachable: i18nKey('The provider did not answer'),
  http: i18nKey('The provider answered {status}'),
  'too-large': i18nKey('The provider’s list is larger than 1 MB — nothing was kept'),
  'bad-answer': i18nKey('The provider’s answer is not a model list'),
  human_only: i18nKey('Only a person on this page can refresh the list'),
  cross_site: i18nKey('Only a person on this page can refresh the list'),
});

// ── THE SHIPPED PRESETS (q-045 D1 + §2.4, lane lg-providers U1): the third parties a person picks from, a PURE list in the
// release (never fetched — a list fetched from anywhere is a vendor call). Each = its kind (which harnesses it can serve: the
// wire decides, `fits` below), its address per region (global first), how the key goes (`auth`), where to get a key, a
// starting model table DATED by when it was written (the account dialog's 模型… edits it; the wizard's 测试 proves it), and
// ONE sentence without a technical word (the wizard's first screen). The addresses are the vendors' own documented ones
// for Claude Code (their `/anthropic` address); the model ids are a STARTING table only — written from what this lane knew
// (late 2025 ids), dated SHIPPED_AT = when written, not «current as of»: a moved address or a retired id is said by the Test
// («unreachable» / «not served»), and the account dialog's 模型… edits the table. ──
const SHIPPED_AT = '2026-11-17';
const ship = (o) => Object.freeze({ ...o, ...(o.wires ? { wires: Object.freeze([...o.wires]) } : {}), bases: Object.freeze(o.bases.map((b) => Object.freeze({ ...b }))), models: Object.freeze(o.models.map((m) => Object.freeze({ caps: [], context: null, ...m, caps: Object.freeze(m.caps || []) }))) });
const SHIPPED = Object.freeze([
  ship({ id: 'deepseek', label: 'DeepSeek', kind: 'anthropic-compatible', auth: 'bearer', blurb: i18nKey('DeepSeek’s models, paid by use with your own key'),
    console: 'https://platform.deepseek.com', bases: [{ region: 'global', url: 'https://api.deepseek.com/anthropic' }],
    models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat', context: 128000, caps: ['tools'] }, { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', context: 128000, caps: ['tools', 'reasoning'] }], defaultModel: 'deepseek-chat' }),   // ui-words: the vendors' own product names (never translated)
  ship({ id: 'kimi', label: 'Kimi', kind: 'anthropic-compatible', auth: 'bearer', blurb: i18nKey('Moonshot’s Kimi models, paid by use with your own key'),   // ui-words: the vendor's own product name (never translated)
    console: 'https://platform.moonshot.ai', bases: [{ region: 'global', url: 'https://api.moonshot.ai/anthropic' }, { region: 'cn', url: 'https://api.moonshot.cn/anthropic' }],
    models: [{ id: 'kimi-k2-0905-preview', label: 'Kimi K2', context: 256000, caps: ['tools'] }, { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo', context: 256000, caps: ['tools'] }], defaultModel: 'kimi-k2-0905-preview' }),
  ship({ id: 'glm', label: 'GLM', kind: 'anthropic-compatible', auth: 'bearer', blurb: i18nKey('Zhipu’s GLM models, paid by use with your own key'),
    console: 'https://z.ai/model-api', bases: [{ region: 'global', url: 'https://api.z.ai/api/anthropic' }, { region: 'cn', url: 'https://open.bigmodel.cn/api/anthropic' }],
    models: [{ id: 'glm-4.6', label: 'GLM-4.6', context: 200000, caps: ['tools', 'reasoning'] }, { id: 'glm-4.5-air', label: 'GLM-4.5-Air', context: 128000, caps: ['tools'] }], defaultModel: 'glm-4.6' }),
  ship({ id: 'minimax', label: 'MiniMax', kind: 'anthropic-compatible', auth: 'bearer', blurb: i18nKey('MiniMax’s models, paid by use with your own key'),
    console: 'https://platform.minimax.io', bases: [{ region: 'global', url: 'https://api.minimax.io/anthropic' }, { region: 'cn', url: 'https://api.minimaxi.com/anthropic' }],
    models: [{ id: 'MiniMax-M2', label: 'MiniMax-M2', context: 204800, caps: ['tools', 'reasoning'] }], defaultModel: 'MiniMax-M2' }),
  ship({ id: 'openrouter', label: 'OpenRouter', kind: 'openrouter', auth: 'bearer', blurb: i18nKey('Many vendors’ models behind one key, paid by use'), listed: true,
    console: 'https://openrouter.ai/keys', bases: [{ region: 'global', url: 'https://openrouter.ai/api/v1' }], models: [], defaultModel: '' }),
  ship({ id: 'other', label: i18nKey('Other or self-hosted'), kind: 'self-hosted', auth: 'bearer', blurb: i18nKey('A service you run yourself, or one not listed here'), baseRequired: true, wires: WIRES,
    console: null, bases: [], models: [], defaultModel: '' }),
]);
const shippedOf = (id) => SHIPPED.find((s) => s.id === id) || null;
const REGIONS = Object.freeze(['global', 'cn']);
const REGION_WORDS = Object.freeze({ global: i18nKey('Outside mainland China'), cn: i18nKey('Mainland China') });

// ── WHICH HARNESSES A PROVIDER SERVES (q-045 §2.6 law 2: the interface decides, never a tick box) — the kind's own harness
// list, and only a harness whose spawn road carries a third party (SPAWN_HARNESSES: claude + codex in this train; opencode is
// P1-a). → { claude: { ok, code }, codex: …, opencode: … }; code 'wire' = the provider does not speak what the harness needs,
// 'later' = the harness does not take a third party yet, 'kind-unknown'. ──
const FIT_HARNESSES = Object.freeze([...new Set(KINDS.flatMap((k) => k.harnesses))]);   // every harness some kind serves (derived — no list of harnesses typed here)
const SPAWN_HARNESSES = Object.freeze(['claude', 'codex']);
/** a SELF-HOSTED record's kind for fitting = the kind of the interface the person said it speaks (none said ⇒ its kind's
 *  own, Chat Completions — which no harness of this train runs): «self-hosted» alone claims nothing (adversarial read r1) */
const WIRE_KIND = Object.freeze({ 'anthropic-messages': 'anthropic-compatible', 'openai-responses': 'openai-responses', 'openai-chat': 'openai-chat' });
const fitKindOf = (p) => (p && p.kind === 'self-hosted' ? WIRE_KIND[p.wire] || 'openai-chat' : p && p.kind);
function fits(p) {
  const k = p && kindOf(fitKindOf(p));
  const out = {};
  for (const h of FIT_HARNESSES) {
    if (!k) out[h] = { ok: false, code: 'kind-unknown' };
    else if (!k.harnesses.includes(h)) out[h] = { ok: false, code: 'wire' };
    else if (!SPAWN_HARNESSES.includes(h)) out[h] = { ok: false, code: 'later' };
    else out[h] = { ok: true, code: null };
  }
  return out;
}
const fitsHarness = (p, harness) => !!(fits(p)[harness] || {}).ok;
const FIT_WORDS = Object.freeze({
  wire: i18nKey('This provider does not offer what {harness} needs'),
  later: i18nKey('{harness} cannot use a third-party provider yet'),
  'kind-unknown': i18nKey('Unknown provider kind'),
});

// ── THE KEY (q-043 「用途，不给值」): a vault entry of the hub's own secrets, `provider:<record id>` — the record names it by
// the inventory's reference (`secrets:provider:<id>#key`) and keeps its last four characters; the value is read only by the
// spawn road and the Test, never answered to anyone. ──
const keyEntryOf = (id) => `provider:${String(id || '')}`;
const keyRefOf = (id) => `secrets:${keyEntryOf(id)}#key`;
/** The record id a key reference names (`secrets:provider:<id>#key`), or null — any other reference is another store's. */
function providerOfKeyRef(ref) {
  const m = /^secrets:provider:(pv-[a-z0-9][a-z0-9-]{0,63})#key$/.exec(String(ref || ''));
  return m ? m[1] : null;
}
const KEY_MIN = 8;
const KEY_MAX = 512;
/** A pasted key → its errors (field 'key'). An ANTHROPIC SUBSCRIPTION token is refused by name: §ban-safety — a subscription
 *  login is never sent to a third party (its own account rows carry it). */
function validateKey(key) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return [{ field: 'key', code: 'key-empty' }];
  if (/[\s\u0000-\u001f\u007f]/.test(k)) return [{ field: 'key', code: 'key-space' }];
  if (k.length < KEY_MIN) return [{ field: 'key', code: 'key-short' }];
  if (k.length > KEY_MAX) return [{ field: 'key', code: 'key-long' }];
  // an ANTHROPIC credential ANYWHERE in what was pasted (quoted, after NAME=, inside a JSON blob — adversarial read r1):
  // a subscription login (oat / ort / a claude.ai session) by name; a Console key belongs on an Anthropic API account
  if (/sk-ant-(?:oat|ort|sid)/i.test(k)) return [{ field: 'key', code: 'key-subscription' }];
  if (/sk-ant-/i.test(k)) return [{ field: 'key', code: 'key-anthropic' }];
  // a key is one token: quotes, braces, a backslash, a backtick or a leading NAME= are what was AROUND it
  if (/["'`{}<>\\]/.test(k) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(k)) return [{ field: 'key', code: 'key-shape' }];
  return [];
}
const tailOf = (key) => { const k = String(key == null ? '' : key).trim(); return k.length >= KEY_MIN ? k.slice(-4) : null; };
/** A new record from a shipped preset and the person's choices (no id, no key: the store gives both) — the wizard's draft. */
function draftOf(presetId, { region = null, baseUrl = null, label = null, model = null, wire = null } = {}) {
  const s = shippedOf(presetId);
  if (!s) return null;
  const base = s.bases.find((b) => b.region === region) || s.bases[0] || null;
  const url = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : (base ? base.url : null);
  const rows = s.models.map((m) => ({ id: m.id, label: m.label, context: m.context, caps: [...m.caps] }));
  const want = typeof model === 'string' ? model.trim() : '';
  if (want && !rows.some((m) => m.id === want)) rows.push({ id: want, label: want, context: null, caps: [] });   // «Other…» typed on screen 3
  const listed = !!s.listed && !rows.length;
  return {
    kind: s.kind, label: String(label == null ? '' : label).trim() || s.label, preset: s.id, baseUrl: url, auth: s.auth,
    models: rows, defaultModel: want || s.defaultModel || '', aliases: {},
    modelsSource: listed ? 'listed' : rows.length ? 'configured' : 'none', listedBy: listed ? 'provider-api' : null,
    wire: s.wires && s.wires.includes(wire) ? wire : null,
  };
}
// ── THE ROSTER ROWS (lane lg-providers U5, q-045 §2.2): a third-party record PROJECTED as an account row on every harness
// it fits — { id: the record's own (pv-…), name, type: 'provider', backend, tail, model, … } — carried BESIDE the accounts
// (list().providerRows), never inside them: the hub's account readers keep seeing only accounts.json's records; the page
// merges both into its own cache (agent-meta accountRowsOf). ONE record, one row per harness it fits. ──
function rosterRowsOf(records, { usable = true } = {}) {   // usable = the key can be read now (the vault open)
  const out = [];
  for (const p of Array.isArray(records) ? records : []) {
    if (!p || presetOf(p.id) || !/^pv-/.test(String(p.id || ''))) continue;
    const f = fits(p);
    for (const h of FIT_HARNESSES) {
      if (!f[h] || !f[h].ok) continue;
      out.push({ id: p.id, name: p.label, type: 'provider', backend: h, provenance: 'third-party', loggedIn: !!usable, localOnly: true, tail: p.tail || null,
        model: resolveModel(p, '') || '', preset: p.preset || null, kind: p.kind, providerId: p.id, tested: (p.tested && p.tested[h]) || null, lastTestAt: p.lastTestAt || null, createdAt: p.createdAt || null });
    }
  }
  return out;
}

const KEY_ERRORS = Object.freeze({
  'key-empty': i18nKey('Paste the key'),
  'key-space': i18nKey('A key has no spaces or line breaks'),
  'key-short': i18nKey('This is too short to be a key'),
  'key-long': i18nKey('At most 512 characters'),
  'key-subscription': i18nKey('This is a Claude subscription login, not a provider’s key — it is never sent to a third party'),
  'key-anthropic': i18nKey('This is an Anthropic key — add it as an Anthropic API account, not a third party'),
  'key-shape': i18nKey('Paste the key alone — without quotes or the name in front of it'),
  'base-url-plain': i18nKey('Outside your own network the address must start with https://'),
  'base-url-fixed': i18nKey('This provider’s address is set by VibeSpace'),
  'key-ref-foreign': i18nKey('This provider names another provider’s key'),
  'wire-kind': i18nKey('Only a self-hosted provider says which interface it speaks'),
  'base-url': i18nKey('An address starts with https:// (or http:// on your own network)'),
  'base-url-credentials': i18nKey('Put the key in the key field — not in the address'),
  'preset-unknown': i18nKey('Unknown provider'),
});

const MODEL_ERRORS = Object.freeze({
  'kind-unknown': i18nKey('Unknown provider kind'),
  'id-pattern': i18nKey('Not a model id this provider accepts'),
  'id-long': i18nKey('At most 128 characters'),
  'id-duplicate': i18nKey('This id is already in the list'),
  'label-long': i18nKey('At most 60 characters'),
  'context-range': i18nKey('A token count from 1 to 10M (e.g. 200k)'),
  'caps-unknown': i18nKey('Unknown capability'),
  'alias-name': i18nKey('Not a usable alias name'),
  'alias-dangling': i18nKey('An alias points at a model that is not in the list'),
  'default-dangling': i18nKey('The default model is not in the list'),
  'too-many': i18nKey('At most 200 models'),
});

module.exports = {
  KINDS, KIND_IDS, AUTHS, MODELS_SOURCES, LISTED_BY, CAPS, CAP_WORDS, PROVIDER_FIELDS, MODEL_FIELDS, PRESETS, ACCOUNT_PRESETS,
  ID_PATTERNS, ID_MAX, LABEL_MAX, CONTEXT_MAX, MODELS_MAX, MODEL_ERRORS,
  kindOf, presetOf, accountProviderId, listerOf, parseContext, formatContext, validateModelRow, normalizeModelRow, validateModels,
  normalizeProvider, validateProvider, listedRows, withListed, sameModel, namedModel, MODEL_NAME_MAX, resolveModel, servesModel, modelsOf, sourceOf,
  MENU_EMPTY, menuOf, resolvePick, REFRESH, LISTABLE_KINDS, REFRESH_WORDS, modelsEndpointOf, refreshable, refreshVerdict, authHeaders, parseListed,
  SHIPPED, SHIPPED_AT, shippedOf, REGIONS, REGION_WORDS, FIT_HARNESSES, fits, fitsHarness, FIT_WORDS, WIRES,
  keyEntryOf, keyRefOf, providerOfKeyRef, validateKey, tailOf, draftOf, KEY_ERRORS, rosterRowsOf,
};
