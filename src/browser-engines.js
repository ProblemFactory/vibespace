'use strict';
/**
 * A BROWSER ENGINE PLUGIN — THE PURE HALF (lane engine-plugin, 2026-10-25; docs/design-custom-browser-plugin.zh.md §1, P0 of the
 * custom browser kernel). Imports nothing. The engine registry (src/server/browser-engines.js, ORCH) asks; this file JUDGES:
 *
 *   THE VERBS. An engine answers two verbs — `probe` (`GET /probe`: is its kernel here, runnable, which version, which
 *   protocol) and `launchOptions` (`POST /resolve-launch`: the program + arguments that start it for ONE profile). A manifest
 *   plugin answers them over the loader's IPC route ask (the plugin's code never enters this process — the loader law); a
 *   built-in plugin declares `provides: ['browser-engine']` and the same two verbs (src/plugins.js CAP_VERBS).
 *   THE ANSWERS (`engineAnswerVerdict`): a probe's `version: null` is a FACT (the kernel did not say), never an error;
 *   `protocol !== 1` or no `surfaces` feature ⇒ browser_engine_protocol; a launch answer's `env` keys outside
 *   ENGINE_ENV_KEYS (today: none) ⇒ browser_engine_env; an argument that opens a debugging endpoint or picks the profile's
 *   directory (both are VibeSpace's) ⇒ browser_engine_protocol; HTTP 409 `no_binary` ⇒ browser_engine_kernel_missing.
 *   THE CHOICE FRAGMENT (`engineChoiceVerdict`): `{kind:'plugin', id}` judged over the probe answer the CALLER hands in (a
 *   fact like a build list — PURE never asks): the engine is there · its kernel is installed and executable · the protocol.
 *   THE POLICY (`defaultEngineOf`): `browser.defaultEngine` — the user's own value › the fleet's (presets fleet.json
 *   `browserEngine`) › 'default'; read at a profile's CREATE and at a conversation's browser's first start, then WRITTEN on
 *   the record (a later flip changes new records only).
 */
/** Every refusal of an engine — a closed set merged into src/browser-builds.js BUILD_CODES (the routes' STATUS: 409). */
const ENGINE_CODES = Object.freeze(['browser_engine_missing', 'browser_engine_kernel_missing', 'browser_engine_not_executable', 'browser_engine_protocol', 'browser_engine_unanswered', 'browser_engine_env']);
/** The protocol this VibeSpace speaks (the kernel's `VibeSpace.getVersion` answers the same number). */
const PROTOCOL = 1;
/** The env keys an engine's launch answer may set on the browser's process — today NONE (a key outside ⇒ refused by name). */
const ENGINE_ENV_KEYS = Object.freeze([]);
/** The two verbs and the plugin route each rides (the IPC `route` message the /api/plugins/<id>/x/* proxy sends). */
const ENGINE_VERBS = Object.freeze({ probe: Object.freeze({ method: 'GET', path: '/probe' }), launchOptions: Object.freeze({ method: 'POST', path: '/resolve-launch' }) });
/** A plugin id — the SAME rule as src/plugin-manifest.js ID_RE (test-browser-builds pins the two equal); a built-in engine is
 *  addressed `builtin.<its id>`. */
const ID_RE = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
/** The kernel plugin VibeSpace knows by name (the setting's one non-default value). */
const CUSTOM_BROWSER_ID = 'vibespace.custom-browser';
/** `browser.defaultEngine`'s values (src/lib/settings-schema.js enumerates the same). */
const DEFAULT_ENGINE_VALUES = Object.freeze(['default', 'plugin:' + CUSTOM_BROWSER_ID]);
const ARGS_MAX = 64;
const ARG_MAX = 1024;
/** Arguments only VibeSpace / the browser CLI set: the debugging endpoint and the profile's directory. */
const OWN_ARG_RE = /^--(?:remote-debugging-(?:port|pipe|address)|user-data-dir)(?:=|$)/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const clip = (s, n = 160) => String(s == null ? '' : s).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, n);

/** The platform word an engine's verbs take (the kernel side's `linux | macos | windows`). */
function platformOf(nodePlatform) { return nodePlatform === 'darwin' ? 'macos' : nodePlatform === 'win32' ? 'windows' : 'linux'; }
/** An engine in a sentence: «the Custom Browser Kernel engine». */
function engineWords({ id = '', label = '' } = {}) { const n = clip(label, 80) || clip(id, 80) || 'browser'; return /\bengine$/i.test(n) ? `the ${n}` : `the ${n} engine`; }

/** THE ANSWER VERDICT of one verb. `reply` = the loader's route reply `{status, body}`. →
 *  probe: `{ok:true, fact:{id, installed, executable, binaryPath, version, protocol, kinds, features}}`;
 *  launchOptions: `{ok:true, launch:{executablePath, args, env}}`; else `{ok:false, code, error}`. */
function engineAnswerVerdict(verb, reply, { id = '', label = '' } = {}) {
  const who = engineWords({ id, label });
  const bad = (code, why) => ({ ok: false, code, error: `${who} ${why}` });
  const status = reply && Number(reply.status);
  const body = reply ? reply.body : null;
  if (verb === 'probe') {
    if (status !== 200 || !isObj(body)) return bad('browser_engine_protocol', `answered its probe with ${status === 200 ? 'no JSON object' : 'HTTP ' + (status || '?')} — it does not speak this VibeSpace's engine protocol`);
    if (typeof body.installed !== 'boolean' || typeof body.executable !== 'boolean' || !(body.version === null || typeof body.version === 'string') || !strList(body.kinds) || !strList(body.features) || !(body.binaryPath === undefined || typeof body.binaryPath === 'string')) return bad('browser_engine_protocol', 'answered a probe of another shape (installed, executable, version, protocol, kinds, features) — it does not speak this VibeSpace\'s engine protocol');
    if (body.protocol !== PROTOCOL) return bad('browser_engine_protocol', `speaks engine protocol ${clip(body.protocol, 20)}, this VibeSpace speaks ${PROTOCOL} — update the plugin or VibeSpace`);
    if (!body.features.includes('surfaces')) return bad('browser_engine_protocol', 'has no "surfaces" feature — its browser would draw prompts nobody here could answer');
    // lane engine-distribution (the kernel side's v0.1.1, settled 2026-10-25): two OPTIONAL facts — `declaredVersion` (its
    // kernel.json's, not measured) and `integrity` (its read of the receipt VibeSpace wrote at install) — judged when present
    const dv = body.declaredVersion, ig = body.integrity;
    if (!(dv === undefined || dv === null || typeof dv === 'string')) return bad('browser_engine_protocol', 'answered a declaredVersion of another shape (a string or null)');
    if (!(ig === undefined || ig === null || (isObj(ig) && typeof ig.verified === 'boolean' && (ig.sha256 == null || /^[0-9a-f]{64}$/.test(String(ig.sha256)))))) return bad('browser_engine_protocol', 'answered an integrity of another shape ({verified, sha256, verifiedAt})');
    return { ok: true, fact: { id: String(id), installed: body.installed, executable: body.executable, binaryPath: typeof body.binaryPath === 'string' ? body.binaryPath : null, version: body.version === null ? null : clip(body.version, 120), protocol: body.protocol, kinds: body.kinds.slice(0, 64).map((k) => clip(k, 40)), features: body.features.slice(0, 16).map((f) => clip(f, 40)),
      declaredVersion: typeof dv === 'string' && dv ? clip(dv, 64) : null, integrity: isObj(ig) ? { verified: ig.verified, sha256: ig.sha256 == null ? null : String(ig.sha256), verifiedAt: Number.isFinite(Number(ig.verifiedAt)) && ig.verifiedAt != null ? Number(ig.verifiedAt) : null } : null } };
  }
  if (verb === 'launchOptions') {
    if (status === 409 && isObj(body) && body.code === 'no_binary') return bad('browser_engine_kernel_missing', 'has no kernel installed on this computer (its launch answered no_binary)');
    if (status !== 200 || !isObj(body)) return bad('browser_engine_protocol', `answered its launch options with ${status === 200 ? 'no JSON object' : 'HTTP ' + (status || '?')}`);
    const exe = body.executablePath;
    if (typeof exe !== 'string' || !exe.startsWith('/') || exe.length > 4096 || /[\0\n\r]/.test(exe)) return bad('browser_engine_protocol', 'named no absolute program to start');
    const args = body.args === undefined ? [] : body.args;
    if (!strList(args) || args.length > ARGS_MAX || args.some((a) => !a || a.length > ARG_MAX || /[\0\n\r]/.test(a))) return bad('browser_engine_protocol', `named launch arguments of another shape (a list of at most ${ARGS_MAX} one-line strings)`);
    const own = args.filter((a) => OWN_ARG_RE.test(a));
    if (own.length) return bad('browser_engine_protocol', `asked for ${own.map((a) => clip(a.split('=')[0], 40)).join(', ')} — the debugging endpoint and the profile's directory are VibeSpace's to set`);
    const env = body.env === undefined || body.env === null ? {} : body.env;
    if (!isObj(env) || Object.values(env).some((v) => typeof v !== 'string')) return bad('browser_engine_protocol', 'named a launch env of another shape (string values)');
    const extra = Object.keys(env).filter((k) => !ENGINE_ENV_KEYS.includes(k));
    if (extra.length) return bad('browser_engine_env', `asked to set ${extra.slice(0, 8).map((k) => clip(k, 40)).join(', ')} on its browser's environment — an engine sets ${ENGINE_ENV_KEYS.length ? 'only ' + ENGINE_ENV_KEYS.join(', ') : 'no environment variable'} (the values were not read)`);
    return { ok: true, launch: { executablePath: exe, args: args.slice(), env: { ...env } } };
  }
  return bad('browser_engine_protocol', `was asked an unknown verb ${clip(verb, 40)}`);
}
/** The refusal of an ask the plugin never answered (the loader's IPC cap) / of an engine that is not in the table. */
function unansweredOf({ id = '', label = '', ms = null } = {}) { return { ok: false, code: 'browser_engine_unanswered', error: `${engineWords({ id, label })} did not answer${ms ? ' within ' + Math.round(ms / 1000) + ' s' : ''} — its plugin is running but busy or stuck; restart it in ⚙ → Plugins` }; }
function missingOf({ id = '', machine = 'this computer' } = {}) { return { ok: false, code: 'browser_engine_missing', error: `the browser engine plugin "${clip(id, 80)}" is not installed, enabled, trusted and running on ${machine} — open ⚙ → Plugins and enable it with "Enable (trusted)", or choose another build (Change build…)` }; }

/** A version string's major ("Chromium 150.0.7871.186 …" → 150), null when it names none. */
function majorOfVersion(v) { const m = /(\d{2,4})\.\d{1,6}\.\d{1,6}(?:\.\d{1,6})?/.exec(String(v || '')); return m ? Number(m[1]) : null; }
/**
 * THE CHOICE FRAGMENT of `{kind:'plugin', id}` (browser-builds browserChoiceVerdict asks it after the user · chromium rungs).
 * `engine` = the probe's fact the caller read (`{id, installed, executable, binaryPath, version, …}`) or a refusal `{code,
 * error}` (missing / unanswered / protocol); null = nobody asked ⇒ missing. → `{ok:true, executablePath, version, major,
 * versionKind}` — lane engine-distribution: the version is the one VibeSpace MEASURED (`measuredVersion`, the keeper's
 * `--version` once after the install) › the plugin's own (`version`) › the declared one (kernel.json, not measured).
 */
function engineChoiceVerdict({ choice = null, engine = null, machine = 'this computer' } = {}) {
  const id = choice && typeof choice.id === 'string' ? choice.id : '';
  if (!engine || typeof engine !== 'object') return missingOf({ id, machine });
  if (engine.code) return { ok: false, code: ENGINE_CODES.includes(engine.code) ? engine.code : 'browser_engine_protocol', error: String(engine.error || engine.code) };
  const who = engineWords({ id, label: engine.label });
  if (!engine.installed) return { ok: false, code: 'browser_engine_kernel_missing', error: `${who}'s kernel is not installed on ${machine} — install it again (its plugin's own steps), or choose another build (Change build…); VibeSpace never starts Chrome in its place` };
  if (!engine.executable || typeof engine.binaryPath !== 'string' || !engine.binaryPath.startsWith('/')) return { ok: false, code: 'browser_engine_not_executable', error: `${who}'s kernel on ${machine} cannot be run (its program is not executable)` };
  if (engine.protocol !== PROTOCOL || !Array.isArray(engine.features) || !engine.features.includes('surfaces')) return { ok: false, code: 'browser_engine_protocol', error: `${who} does not speak this VibeSpace's engine protocol ${PROTOCOL} with surfaces` };
  const vk = engine.measuredVersion ? 'measured' : engine.version ? 'reported' : engine.declaredVersion ? 'declared' : 'none';
  const ver = vk === 'measured' ? engine.measuredVersion : vk === 'reported' ? engine.version : vk === 'declared' ? engine.declaredVersion : null;
  return { ok: true, executablePath: engine.binaryPath, version: ver == null ? null : String(ver), major: majorOfVersion(ver), versionKind: vk };
}
/** An engine's launch answer as the browser CLI's env view: its arguments in AGENT_BROWSER_ARGS (newline separated when one
 *  holds a comma — the CLI takes either), its env (the ENGINE_ENV_KEYS it may set). `base` = the arguments the launch carries
 *  anyway (the keeper's mark, the automation flag) — an env list REPLACES the config's, so they ride it too. */
function engineLaunchEnv({ args = [], env = {} } = {}, { base = [] } = {}) {
  const all = [...(Array.isArray(base) ? base.map(String) : []), ...(Array.isArray(args) ? args.map(String) : [])];
  const out = {};
  if (Array.isArray(args) && args.length) out.AGENT_BROWSER_ARGS = all.join(all.some((a) => a.includes(',')) ? '\n' : ',');
  for (const k of Object.keys(env || {})) if (ENGINE_ENV_KEYS.includes(k)) out[k] = String(env[k]);
  return out;
}

/** `browser.defaultEngine`'s value → the choice it writes on a new record (null = the default, nothing written). */
function choiceOfDefault(value) {
  const v = String(value == null ? '' : value);
  if (!v.startsWith('plugin:')) return null;
  const id = v.slice('plugin:'.length);
  return ID_RE.test(id) ? { kind: 'plugin', id } : null;
}
/** THE POLICY: the user's own stored value › the fleet's (`fleet` = the presets' fleet.json `browserEngine`, parsed) ›
 *  'default'. A stored value outside DEFAULT_ENGINE_VALUES is no value. → `{value, source: 'user' | 'fleet' | 'default'}`. */
function defaultEngineOf({ own = undefined, fleet = null } = {}) {
  if (typeof own === 'string' && DEFAULT_ENGINE_VALUES.includes(own)) return { value: own, source: 'user' };
  if (isObj(fleet) && typeof fleet.plugin === 'string' && ID_RE.test(fleet.plugin)) {
    const value = fleet.default === true ? 'plugin:' + fleet.plugin : 'default';
    return { value: DEFAULT_ENGINE_VALUES.includes(value) ? value : 'default', source: 'fleet' };
  }
  return { value: 'default', source: 'default' };
}

module.exports = { ENGINE_CODES, PROTOCOL, ENGINE_ENV_KEYS, ENGINE_VERBS, ID_RE, CUSTOM_BROWSER_ID, DEFAULT_ENGINE_VALUES, OWN_ARG_RE,
  platformOf, engineWords, engineAnswerVerdict, unansweredOf, missingOf, majorOfVersion, engineChoiceVerdict, engineLaunchEnv, choiceOfDefault, defaultEngineOf };
