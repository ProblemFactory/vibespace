'use strict';
// PURE — B-d578 P1-a (lane lg-providers; the coordinator's ruling r1126, 2026-11-21): THE ONE FILE a third-party provider's
// OpenCode conversation reads, built ONLY from OpenCode's PUBLISHED pages (read 2026-11-21 — never a package's text on the
// box). Every field below is a documented one, its page named:
//   https://opencode.ai/docs/providers/ — «Add a provider when its API is not already in the catalog»: `providers.<id>` with
//     `name`, `env` («Ordered environment variable names that can provide the credential»), `package` (the runtimes
//     «@opencode/ai/providers/openai-compatible» and «@opencode/ai/providers/anthropic-compatible»), `settings.baseURL`,
//     `models` («Models to add or override, keyed by the OpenCode model ID»); «The `providers` object is keyed by the
//     provider ID used in model references, such as `acme/qwen3-coder`».
//   https://opencode.ai/docs/config/ — the global file `~/.config/opencode/opencode.json(c)`; `model`: «Set the default model
//     in `provider/model` format»; a model's `limit` (`context`, `output`); `$schema` https://opencode.ai/config.json.
//   https://opencode.ai/docs/acp/ — «`session/set_config_option` takes string values»: configId `model` = «Enabled models as
//     `provider/model`» (the ACP wrapper's own initial-model road, ACP_WEBUI_MODEL).
// THE KEY: the file names the VARIABLE (`env`), never its value; the value rides the spawn's environment (the secret channel
// codex's plan uses, the same name) — never a file, never an argv.
// UNPROVEN, by name (no OpenCode on this box — the probe is the owner's to allow): see UNPROVEN below. Until the probe the road
// is NOT OFFERED: model-providers SPAWN_HARNESSES has no `opencode`; the one switch is src/server/provider-spawn.js create's
// `probeRoads`, which no product file hands — no probe exists yet, today only test-harness-spawn's «P1-a OpenCode» leg does.
// THE OTHER HOMES (r1159): the plan sets HOME and, beside it, the XDG config / data / state / cache folders under the same
// provider home — a program that follows XDG would otherwise leave it; whether the real program reads either is UNREAD.
const { kindOf } = require('./model-providers.js'); // PURE → PURE: a record's kind (its wire)

const PAGES = Object.freeze({ providers: 'https://opencode.ai/docs/providers/', config: 'https://opencode.ai/docs/config/', acp: 'https://opencode.ai/docs/acp/' });
const KEY_VAR = 'VIBESPACE_PROVIDER_KEY';   // the name codex's provider plan gives the same value (src/harnesses/codex.js)
const SCHEMA = 'https://opencode.ai/config.json';
// the runtime by the interface the record speaks — only the two the providers page names; any other wire is refused by name
const PACKAGES = Object.freeze({ 'anthropic-messages': '@opencode/ai/providers/anthropic-compatible', 'openai-chat': '@opencode/ai/providers/openai-compatible' });
const CONFIG_REL = '.config/opencode/opencode.json';   // the documented global file, under the spawn's HOME (UNPROVEN: that `~` follows HOME)
const XDG = Object.freeze({ XDG_CONFIG_HOME: '.config', XDG_DATA_HOME: '.local/share', XDG_STATE_HOME: '.local/state', XDG_CACHE_HOME: '.cache' });   // under the provider home, the folders' own conventional names
const UNPROVEN = Object.freeze([
  'that the INSTALLED OpenCode build accepts this shape (`providers` / `package` / `settings` — the pages of 2026-11-21; an older build read another one): the probe\'s first fact',
  'that `opencode` (acp and the TUI) resolves `~/.config/opencode/opencode.json` from the HOME the spawn sets',
  'that nothing of the person\'s own ~/.config/opencode is read under that HOME',
  'that its requests go to settings.baseURL with the `env` variable\'s value as the credential',
  'that `session/set_config_option` model = «<provider id>/<model>» runs the provider\'s model',
  'where it writes its database and logs under that HOME (the history stays the provider home\'s own — r1126 (b) (1))',
  'whether it follows HOME or the XDG folders the plan sets beside it (XDG_CONFIG_HOME / XDG_DATA_HOME / XDG_STATE_HOME / XDG_CACHE_HOME under the same home) — its use of either is unread',
]);

/** the interface a record speaks — a self-hosted record's own `wire`, else its kind's */
function wireOf(p) {
  if (!p) return null;
  if (p.kind === 'self-hosted' && typeof p.wire === 'string') return p.wire;
  const k = kindOf(p.kind);
  return (k && k.wire) || null;
}

/** «<provider id>/<model>» — the model reference the config's `model` and ACP's `model` option take */
const modelRefOf = (p, model) => `${String((p && p.id) || '')}/${String(model || '')}`;

/** THE FILE's document from a provider record → { ok: true, doc, defaultModel } | { ok: false, code, message } */
function configOf(p) {
  if (!p || typeof p.id !== 'string' || !/^pv-[a-z0-9][a-z0-9-]{0,63}$/.test(p.id)) return { ok: false, code: 'provider-unknown', message: 'not a third-party provider record' };
  const wire = wireOf(p);
  const pkg = PACKAGES[wire];
  if (!pkg) return { ok: false, code: 'wire-undocumented', message: `${p.label || p.id} speaks ${wire || 'an unknown interface'} — OpenCode's published pages name a runtime for Anthropic-compatible and OpenAI-compatible (Chat Completions) providers only` };
  if (!p.baseUrl) return { ok: false, code: 'provider-no-address', message: `${p.label || p.id} has no address — set it in Manage agents` };
  const rows = (Array.isArray(p.models) ? p.models : []).filter((r) => r && typeof r.id === 'string' && r.id);
  const def = String(p.defaultModel || (rows[0] && rows[0].id) || '');
  if (!def) return { ok: false, code: 'model-none', message: `${p.label || p.id} has no model yet — pick one in Manage agents (its Models…)` };
  const models = {};
  for (const r of rows) models[r.id] = { name: String(r.label || r.id), ...(Number(r.context) > 0 ? { limit: { context: Number(r.context) } } : {}) };
  if (!models[def]) models[def] = { name: def };
  const doc = {
    $schema: SCHEMA,
    providers: { [p.id]: { name: String(p.label || p.id), env: [KEY_VAR], package: pkg, settings: { baseURL: String(p.baseUrl) }, models } },
    model: modelRefOf(p, def),
  };
  return { ok: true, doc, defaultModel: def };
}

/** THE PLAN (the shape of the descriptors' creds.providerSpawn: { localEnv, argv, secret, plainEnv }) + `files` the spawn road
 *  writes under the provider's home (0600, no value in them) + `modelRef` for the conversation's model. Throws by name. */
function opencodeProviderSpawn({ provider, key, home }) {
  const c = configOf(provider);
  if (!c.ok) throw Object.assign(new Error(c.message), { code: c.code });
  const env = { [KEY_VAR]: String(key || '') };
  const plain = {};
  if (home) { plain.HOME = home; for (const [k, rel] of Object.entries(XDG)) plain[k] = `${home}/${rel}`; }
  Object.assign(env, plain);
  return {
    localEnv: env, argv: [], secret: { var: KEY_VAR, value: String(key || '') }, plainEnv: plain,
    files: [{ rel: CONFIG_REL, text: JSON.stringify(c.doc, null, 2) + '\n' }],
    modelRef: (model) => modelRefOf(provider, model || c.defaultModel),
  };
}

module.exports = { PAGES, KEY_VAR, SCHEMA, PACKAGES, CONFIG_REL, XDG, UNPROVEN, wireOf, modelRefOf, configOf, opencodeProviderSpawn };
