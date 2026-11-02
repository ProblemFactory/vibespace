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
 *   `protocol !== 1` ⇒ browser_engine_protocol; a launch answer's `env` keys outside ENGINE_ENV_KEYS (today: none) ⇒
 *   browser_engine_env; an argument that opens a debugging endpoint, picks the profile's directory or names a PROXY (all
 *   VibeSpace's) ⇒ browser_engine_protocol; HTTP 409 `no_binary` ⇒ browser_engine_kernel_missing.
 *   THE FEATURES (lane engine-spi-egress, design-desk cloak-plugin §1): a CLOSED set of words (ENGINE_FEATURES — a word
 *   outside it means nothing here and is dropped from the fact). `surfaces` is OPTIONAL: an engine without it takes Chrome's
 *   dialog road (the dialog watch asks each browser's own `VibeSpace.getVersion`). `egress-allowlist` ⇒ the keeper wraps
 *   the browser in ITS allowlisting proxy (the plugin gives the list, never the proxy, and cannot turn it off): the list is
 *   the RESERVED settings row `plugin.<id>.egressAllowlist`, which the plugin's manifest must declare as a string
 *   (`contributes.settings`, the caller hands the manifest's rows in) — missing ⇒ browser_engine_protocol by name.
 *   THE CHOICE FRAGMENT (`engineChoiceVerdict`): `{kind:'plugin', id}` judged over the probe answer the CALLER hands in (a
 *   fact like a build list — PURE never asks): the engine is there · its kernel is installed and executable · the protocol.
 *   THE POLICY (`defaultEngineOf`): `browser.defaultEngine` — the user's own value › the fleet's (presets fleet.json
 *   `browserEngine`) › 'default'; read at a profile's CREATE and at a conversation's browser's first start, then WRITTEN on
 *   the record (a later flip changes new records only).
 */
const V = require('./browser-verbs.js'); // lane engine-args-string: the driver's `args` — its ONE writer + the keeper ∪ engine merge (PURE → PURE)
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
/** The probe's `features` words this VibeSpace READS — a closed set (lane engine-spi-egress: `surfaces` optional,
 *  `egress-allowlist` new). A word outside it is dropped from the fact. */
const ENGINE_FEATURES = Object.freeze(['surfaces', 'webauthn', 'credentials', 'egress-allowlist']);
/** THE EGRESS FEATURE and its RESERVED settings row (`contributes.settings` `{key: 'egressAllowlist', type: 'string'}` →
 *  `plugin.<id>.egressAllowlist`): the sites the engine's browser may reach, read by the keeper's proxy per request. The row's
 *  rule is THIS file's (`egressRowOf` — ONE parser: src/plugin-manifest.js hashes the same row into consent). */
const EGRESS_FEATURE = 'egress-allowlist';
const EGRESS_ROW_KEY = 'egressAllowlist';
const ARGS_MAX = 64;
const ARG_MAX = 1024;
/** Arguments only VibeSpace / the browser CLI set: the debugging endpoint, the profile's directory — and (lane
 *  engine-spi-egress) the browser's PROXY: the boundary an engine stays inside is VibeSpace's to set, never a plugin's
 *  (`--no-proxy-server` / `--proxy-auto-detect` would undo it). A POSIX Chromium also reads a single-dash switch. */
const OWN_ARG_RE = /^--?(?:remote-debugging-(?:port|pipe|address)|user-data-dir|proxy-server|proxy-bypass-list|proxy-pac-url|winhttp-proxy-resolver|no-proxy-server|proxy-auto-detect)(?:=|$)/;
/** lane engine-spi-egress L1b r3: THE LAUNCHER SWITCHES — Chromium switches that make the browser start ANOTHER PROGRAM (a child's
 *  executable, a command prefixed to a child's line) or load NATIVE CODE the switch names (a library run inside a child) — the
 *  program VibeSpace judged would then hand its work to one the plugin chose. A CLOSED census: each row says why it is in; adding
 *  one is a deliberate edit with its test (test-browser-builds ⑦c pins the exact set). Read off Chromium's switch list and this
 *  machine's Chrome 154 binary (the five current ones are in it; the Pepper / NaCl rows are for older builds an owner may install).
 *  Refused BY NAME in a launch answer (engineAnswerVerdict — both sources, every road), and again where an engine's arguments
 *  become an argv (engineWrapperText; browser-attach's census). NOT an allowlist: every other switch is the plugin's to send. */
const LAUNCHER_SWITCHES = Object.freeze([
  { name: 'browser-subprocess-path', kind: 'program', why: 'the executable every child process (renderer, GPU, utility, network service) is started from' },
  { name: 'renderer-cmd-prefix', kind: 'program', why: 'a command put before every renderer\'s command line: it runs, the renderer becomes its argument' },
  { name: 'utility-cmd-prefix', kind: 'program', why: 'a command put before every utility process\'s command line (the network service among them)' },
  { name: 'gpu-launcher', kind: 'program', why: 'a command put before the GPU process\'s command line' },
  { name: 'zygote-cmd-prefix', kind: 'program', why: 'a command put before the zygote\'s command line — every renderer forks from it (Linux)' },
  { name: 'plugin-launcher', kind: 'program', why: 'the command a plugin process is started with (builds with NPAPI plugins)' },
  { name: 'ppapi-plugin-launcher', kind: 'program', why: 'the command a Pepper plugin process is started with (builds with Pepper)' },
  { name: 'nacl-loader-cmd-prefix', kind: 'program', why: 'a command put before the Native Client loader\'s command line (builds with NaCl)' },
  { name: 'nacl-gdb', kind: 'program', why: 'a debugger program started beside the Native Client loader (builds with NaCl)' },
  { name: 'ppapi-flash-path', kind: 'library', why: 'a native library loaded as the Pepper Flash plugin (builds with Pepper)' },
  { name: 'register-pepper-plugins', kind: 'library', why: 'native libraries loaded as Pepper plugins (builds with Pepper)' },
  { name: 'screen-ai-binary', kind: 'library', why: 'the native ScreenAI library a utility process loads (Linux / ChromeOS)' },
  { name: 'translate-kit-binary-path', kind: 'library', why: 'the native TranslateKit library the on-device translation process loads' },
]);
/** A launcher switch in every spelling Chromium reads as one: `--x` / `--x=v`, a single dash (POSIX Chromium reads `-x` as a switch),
 *  any case (Windows Chromium lowercases switch names). A value is never a switch: Chromium splits each argument at its FIRST `=`
 *  (`--fingerprint=--gpu-launcher=x` is the switch `fingerprint`), and no road re-splits an engine's argument (the keeper's wrapper
 *  hands each as one shell word, the attach argv as one element). `--gpu-launcherx` is another switch. */
const LAUNCHER_ARG_RE = new RegExp(`^--?(?:${LAUNCHER_SWITCHES.map((r) => r.name).join('|')})(?:=|$)`, 'i');
/** The launcher switches among an engine's arguments → their names as written (before any `=`), once each. */
function launcherArgsOf(list) { return [...new Set((Array.isArray(list) ? list.map(String) : []).filter((a) => LAUNCHER_ARG_RE.test(a)).map((a) => clip(a.split('=')[0], 40)))]; }
/** The proxy half of OWN_ARG_RE (refused in its own words; dropped from the keeper's own list on a wrapped launch). */
const PROXY_ARG_RE = /^--?(?:proxy-server|proxy-bypass-list|proxy-pac-url|winhttp-proxy-resolver|no-proxy-server|proxy-auto-detect)(?:=|$)/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const clip = (s, n = 160) => String(s == null ? '' : s).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, n);

/** lane engine-spi-egress: the manifest's RESERVED row among its `contributes.settings` (a string row keyed egressAllowlist)
 *  → `{default}` | null; its settings path; the keeper's OWN proxy arguments for a browser it wraps (`<-loopback>`: Chromium
 *  bypasses a proxy for loopback by default — removed, so the proxy, which never admits loopback, answers those too). */
function egressRowOf(settings) {
  const r = (Array.isArray(settings) ? settings : []).find((s) => isObj(s) && s.key === EGRESS_ROW_KEY && s.type === 'string');
  return r ? { default: typeof r.default === 'string' ? r.default : '' } : null;
}
function egressRowPath(id) { return `plugin.${String(id || '')}.${EGRESS_ROW_KEY}`; }
function egressArgs(url) { return url ? [`--proxy-server=${String(url)}`, '--proxy-bypass-list=<-loopback>'] : []; }
/** An engine's launch switches as the KERNEL receives them after the driver's own (the keeper's wrapper on both driver roads, the
 *  attach argv): the plugin's — its part of the split (browser-verbs splitLaunchArgs: one per name, never a control / display /
 *  proxy switch) — then, when the launch is WRAPPED (`egress` = the keeper's proxy url), the keeper's own proxy switches LAST
 *  (Chromium reads a switch's last value: nothing the driver adds before them can undo them). */
function engineArgs({ args = [], egress = null } = {}) { return [...V.splitLaunchArgs([], Array.isArray(args) ? args.map(String) : []).engine, ...egressArgs(egress)]; }
/** The keeper's OWN list for a wrapped launch (the config's switches it carries onto an engine's env list — L2's F4) without any
 *  proxy switch: Chromium ranks `--no-proxy-server` / `--proxy-pac-url` / `--proxy-auto-detect` ABOVE `--proxy-server`, so a
 *  user's own proxy switch would undo the boundary. */
// ── lane engine-spi-egress L1b (design-desk cloak-plugin-addendum §0/§1 — the owner 2026-11-02: «用更系统的方式支持“自定义内核”，只是其中一个
// 选项是用户自行安装cloakbrowser»): ONE engine interface, TWO kernel sources. `download` = the package's kernel.json (the receipt
// road); `user` = the manifest's RESERVED row `executablePath` (a string) — the program the OWNER names in the plugin's settings
// (`plugin.<id>.executablePath`, read live; written by the owner's cookie only). The plugin never names it: its process cannot even
// read a path outside its package + state dir (node --permission), so VibeSpace JUDGES the file and its word on installed /
// executable is not read. A program is VibeSpace's fact — downloaded with a receipt, or named by the owner and judged here.
const BINARY_ROW_KEY = 'executablePath';
/** The manifest's RESERVED program row (a string row keyed executablePath) → `{key}` | null — PRESENCE only (L1b r2): the row carries
 *  no default VibeSpace reads (plugin-manifest refuses one by name), so nothing of the manifest can name the program it runs. */
function binaryRowOf(settings) {
  const r = (Array.isArray(settings) ? settings : []).find((s) => isObj(s) && s.key === BINARY_ROW_KEY && s.type === 'string');
  return r ? { key: BINARY_ROW_KEY } : null;
}
function binaryRowPath(id) { return `plugin.${String(id || '')}.${BINARY_ROW_KEY}`; }
/** An engine plugin's settings keys only the OWNER writes (a bearer — an agent, a job, an automation key — is refused at the settings
 *  door): the program it runs, the sites its browser may reach. */
const ENGINE_OWNER_ROW_RE = /^plugin\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.(?:executablePath|egressAllowlist)$/;
/** THE SOURCE of an engine's kernel: the program row ⇒ 'user', else 'download' (kernel.json — its absence is the download road's own
 *  refusal, as today); BOTH ⇒ browser_engine_protocol by name. → `{ok:true, source}` | `{ok:false, code, error}`. */
function engineSourceOf({ row = null, kernelJson = false, id = '', label = '' } = {}) {
  if (row && kernelJson) return { ok: false, code: 'browser_engine_protocol', error: `${engineWords({ id, label })} names both a kernel.json and an executablePath row — an engine has one source` };
  return { ok: true, source: row ? 'user' : 'download' };
}
/** The magic a program of `platform` starts with: ELF (linux), Mach-O 32 / 64 either order or fat (macos), MZ (windows). */
function programMagicOk(magic, platform = 'linux') {
  const b = magic ? Array.from(magic).slice(0, 4) : [];
  const hex = b.map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  if (platform === 'macos') return ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(hex);
  if (platform === 'windows') return hex.startsWith('4d5a');
  return hex === '7f454c46';
}
/** THE FILE VERDICT of the owner's program (the CORE's — never the plugin's): `path` = the row's value; `fact` = browser-builds
 *  fileFact over it (`{usable, why}`); `magic` = its first 4 bytes (null = they could not be READ — an execute-only file, L1b r2:
 *  `unreadable`, never «another platform's build»). → `{ok:true}` | `{ok:false, code, why, error}` — the error names the row, never
 *  the path. */
function userBinaryVerdict({ path = '', fact = null, magic = null, platform = 'linux', id = '', label = '' } = {}) {
  const who = engineWords({ id, label }), name = clip(label, 80) || clip(id, 80) || 'its plugin';
  const p = String(path == null ? '' : path);
  if (!p) return { ok: false, code: 'browser_engine_kernel_missing', why: 'unset', error: `${who} has no program set — open ⚙ → Plugins → ${name} → Program file` };
  if (!p.startsWith('/') || p.length > 4096 || /[\0\n\r]/.test(p)) return { ok: false, code: 'browser_engine_not_executable', why: 'shape', error: `${who}'s Program file is not one absolute path` };
  const why = fact && fact.usable ? null : (fact && fact.why) || 'missing';
  const words = { missing: 'it is not there', 'not-a-file': 'it is not a file', 'not-executable': 'it is not executable', blocked: 'it is on a storage mount that is not answering', unreadable: "VibeSpace can't read the file to check it — give it read permission" };
  if (why) return { ok: false, code: 'browser_engine_not_executable', why, error: `the program you named for ${who} can't be run (${words[why] || why}) — check ⚙ → Plugins → ${name} → Program file` };
  if (magic == null) return { ok: false, code: 'browser_engine_not_executable', why: 'unreadable', error: `the program you named for ${who} can't be run (${words.unreadable}) — check ⚙ → Plugins → ${name} → Program file` };
  const b = Array.from(magic);
  if (b[0] === 0x23 && b[1] === 0x21) return { ok: false, code: 'browser_engine_not_executable', why: 'script', error: `the program you named for ${who} is a script — VibeSpace runs a browser program itself (its own launch wrapper carries the plugin's switches)` };
  if (!programMagicOk(b, platform)) return { ok: false, code: 'browser_engine_not_executable', why: 'platform', error: `the program you named for ${who} is not a program this machine runs (a script or another platform's build)` };
  return { ok: true };
}
function withoutProxyArgs(list) { return (Array.isArray(list) ? list.map(String) : []).filter((a) => !PROXY_ARG_RE.test(a.trim())); }
/** The platform word an engine's verbs take (the kernel side's `linux | macos | windows`). */
function platformOf(nodePlatform) { return nodePlatform === 'darwin' ? 'macos' : nodePlatform === 'win32' ? 'windows' : 'linux'; }
/** An engine in a sentence: «the Custom Browser Kernel engine». */
function engineWords({ id = '', label = '' } = {}) { const n = clip(label, 80) || clip(id, 80) || 'browser'; return /\bengine$/i.test(n) ? `the ${n}` : `the ${n} engine`; }

/** THE ANSWER VERDICT of one verb. `reply` = the loader's route reply `{status, body}`; `settings` = the plugin's manifest
 *  `contributes.settings` (where the egress row is looked for). →
 *  probe: `{ok:true, fact:{id, installed, executable, binaryPath, version, protocol, kinds, features, egress}}` (`egress` =
 *  `{setting, default}` when it declares egress-allowlist, else null); launchOptions: `{ok:true, launch:{executablePath,
 *  args, env}}`; else `{ok:false, code, error}`. */
function engineAnswerVerdict(verb, reply, { id = '', label = '', settings = null } = {}) {
  const who = engineWords({ id, label });
  const bad = (code, why) => ({ ok: false, code, error: `${who} ${why}` });
  const status = reply && Number(reply.status);
  const body = reply ? reply.body : null;
  if (verb === 'probe') {
    if (status !== 200 || !isObj(body)) return bad('browser_engine_protocol', `answered its probe with ${status === 200 ? 'no JSON object' : 'HTTP ' + (status || '?')} — it does not speak this VibeSpace's engine protocol`);
    if (typeof body.installed !== 'boolean' || typeof body.executable !== 'boolean' || !(body.version === null || typeof body.version === 'string') || !strList(body.kinds) || !strList(body.features) || !(body.binaryPath === undefined || typeof body.binaryPath === 'string')) return bad('browser_engine_protocol', 'answered a probe of another shape (installed, executable, version, protocol, kinds, features) — it does not speak this VibeSpace\'s engine protocol');
    if (body.protocol !== PROTOCOL) return bad('browser_engine_protocol', `speaks engine protocol ${clip(body.protocol, 20)}, this VibeSpace speaks ${PROTOCOL} — update the plugin or VibeSpace`);
    const features = [...new Set(body.features.slice(0, 16).map((f) => clip(f, 40)))].filter((f) => ENGINE_FEATURES.includes(f));
    const egress = features.includes(EGRESS_FEATURE) ? egressRowOf(settings) : null;
    if (features.includes(EGRESS_FEATURE) && !egress) return bad('browser_engine_protocol', `declares the "${EGRESS_FEATURE}" feature but its manifest has no "${EGRESS_ROW_KEY}" settings row of type string — the sites its browser may reach have no place to be listed`);
    // L2's acceptance (A), the owner's «a plugin cannot turn the proxy off»: the row its trust covers (consent hashes it) without the
    // word is a downgrade — refused by name, never run unwrapped (a version that drops the row too loses its trust: re-enable it)
    if (!features.includes(EGRESS_FEATURE) && egressRowOf(settings)) return bad('browser_engine_protocol', `no longer declares the site list it was trusted with (its manifest keeps the "${EGRESS_ROW_KEY}" row, its probe dropped "${EGRESS_FEATURE}") — VibeSpace never runs it outside its proxy; update the plugin, or remove it`);
    // lane engine-distribution (the kernel side's v0.1.1, settled 2026-10-25): two OPTIONAL facts — `declaredVersion` (its
    // kernel.json's, not measured) and `integrity` (its read of the receipt VibeSpace wrote at install) — judged when present
    const dv = body.declaredVersion, ig = body.integrity;
    if (!(dv === undefined || dv === null || typeof dv === 'string')) return bad('browser_engine_protocol', 'answered a declaredVersion of another shape (a string or null)');
    if (!(ig === undefined || ig === null || (isObj(ig) && typeof ig.verified === 'boolean' && (ig.sha256 == null || /^[0-9a-f]{64}$/.test(String(ig.sha256)))))) return bad('browser_engine_protocol', 'answered an integrity of another shape ({verified, sha256, verifiedAt})');
    return { ok: true, fact: { id: String(id), installed: body.installed, executable: body.executable, binaryPath: typeof body.binaryPath === 'string' ? body.binaryPath : null, version: body.version === null ? null : clip(body.version, 120), protocol: body.protocol, kinds: body.kinds.slice(0, 64).map((k) => clip(k, 40)), features, egress: egress ? { setting: egressRowPath(id), default: egress.default } : null,
      declaredVersion: typeof dv === 'string' && dv ? clip(dv, 64) : null, integrity: isObj(ig) ? { verified: ig.verified, sha256: ig.sha256 == null ? null : String(ig.sha256), verifiedAt: Number.isFinite(Number(ig.verifiedAt)) && ig.verifiedAt != null ? Number(ig.verifiedAt) : null } : null } };
  }
  if (verb === 'launchOptions') {
    if (status === 409 && isObj(body) && body.code === 'no_binary') return bad('browser_engine_kernel_missing', 'has no kernel installed on this computer (its launch answered no_binary)');
    if (status !== 200 || !isObj(body)) return bad('browser_engine_protocol', `answered its launch options with ${status === 200 ? 'no JSON object' : 'HTTP ' + (status || '?')}`);
    const exe = body.executablePath;
    if (typeof exe !== 'string' || !exe.startsWith('/') || exe.length > 4096 || /[\0\n\r]/.test(exe)) return bad('browser_engine_protocol', 'named no absolute program to start');
    const args = body.args === undefined ? [] : body.args;
    // lane engine-args-string: an argument is refused only for what no road carries whole — a NUL byte (no argv holds one), a
    // line break (the protocol's one-line rule), nothing, > ARG_MAX; a comma, a space, a quote ride the keeper's wrapper whole
    if (!strList(args) || args.length > ARGS_MAX || args.some((a) => !a || a.length > ARG_MAX || /[\0\n\r]/.test(a))) return bad('browser_engine_protocol', `named launch arguments of another shape (a list of at most ${ARGS_MAX} one-line strings)`);
    // lane engine-spi-egress L1b r3: a launch that names ANOTHER program through a launcher switch — refused by name, both sources
    const launchers = launcherArgsOf(args);
    if (launchers.length) return { ok: false, code: 'browser_engine_protocol', launcher: launchers[0], error: `${who}'s launch names another program through ${launchers.join(', ')}; a plugin never names the program it runs` };
    const proxied = args.filter((a) => PROXY_ARG_RE.test(a)); // lane engine-spi-egress: the boundary an engine stays inside is VibeSpace's
    if (proxied.length) return bad('browser_engine_protocol', `asked for ${proxied.map((a) => clip(a.split('=')[0], 40)).join(', ')} — the browser's proxy is VibeSpace's to set: an engine that must reach only some sites declares "${EGRESS_FEATURE}", and VibeSpace wraps it in its own allowlisting proxy`);
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
  // lane engine-spi-egress L1b: the OWNER's program, judged by the core (the fact carries the verdict) — said by its own words
  if (engine.source === 'user' && isObj(engine.userBinary)) return { ok: false, code: ENGINE_CODES.includes(engine.userBinary.code) ? engine.userBinary.code : 'browser_engine_not_executable', error: String(engine.userBinary.error || engine.userBinary.code) };
  if (!engine.installed) return { ok: false, code: 'browser_engine_kernel_missing', error: `${who}'s kernel is not installed on ${machine} — install it again (its plugin's own steps), or choose another build (Change build…); VibeSpace never starts Chrome in its place` };
  if (!engine.executable || typeof engine.binaryPath !== 'string' || !engine.binaryPath.startsWith('/')) return { ok: false, code: 'browser_engine_not_executable', error: `${who}'s kernel on ${machine} cannot be run (its program is not executable)` };
  if (engine.protocol !== PROTOCOL || !Array.isArray(engine.features)) return { ok: false, code: 'browser_engine_protocol', error: `${who} does not speak this VibeSpace's engine protocol ${PROTOCOL}` };
  // lane engine-spi-egress: an engine that must stay inside a list is never started without the list's place (the probe's row)
  if (engine.features.includes(EGRESS_FEATURE) && !(isObj(engine.egress) && engine.egress.setting === egressRowPath(id))) return { ok: false, code: 'browser_engine_protocol', error: `${who} declares the "${EGRESS_FEATURE}" feature without its "${EGRESS_ROW_KEY}" settings row — VibeSpace never starts it unwrapped` };
  // L1b r2: the OWNER's program is judged by VibeSpace's measurement of THAT file only (the record's stamp = the file now) — never the
  // plugin's word: not measured yet ⇒ no version, so the ladder asks instead of judging
  const vk = engine.measuredVersion ? 'measured' : engine.source === 'user' ? 'none' : engine.version ? 'reported' : engine.declaredVersion ? 'declared' : 'none';
  const ver = vk === 'measured' ? engine.measuredVersion : vk === 'reported' ? engine.version : vk === 'declared' ? engine.declaredVersion : null;
  return { ok: true, executablePath: engine.binaryPath, version: ver == null ? null : String(ver), major: majorOfVersion(ver), versionKind: vk };
}
/** An engine's launch as the browser CLI's env view (lane engine-args-string, r2 — THE WRAPPER ROAD): the CLI starts the keeper's
 *  wrapper (engineWrapperText — AGENT_BROWSER_EXECUTABLE_PATH, the caller's) and AGENT_BROWSER_ARGS carries ONLY the keeper's
 *  part of the split (browser-verbs splitLaunchArgs: `base` = the arguments the launch carries anyway — the mark, the automation
 *  flag, the quiet switches; an env list REPLACES the config's, so they ride it — minus every name the engine gives) as the
 *  driver's ONE comma-separated line (driverArgsText; measured on 0.38.2 the CLI cuts at every comma AND newline). The engine's
 *  own switches and env ride the wrapper, never the CLI (its env never reached the browser either: the CLI scrubs it). No
 *  engine argument ⇒ no list (the config's stays). A keeper switch the line cannot carry throws by name (a bug: the keeper's
 *  switches are comma-free by construction). */
function engineLaunchEnv({ args = [] } = {}, { base = [], always = false } = {}) {
  const out = {};
  if ((Array.isArray(args) && args.length) || always) { // lane engine-spi-egress: `always` = a WRAPPED launch — its proxy switches are in no config
    const line = V.driverArgsText(V.splitLaunchArgs(Array.isArray(base) ? base : [], args).keeper);
    if (!line.ok) throw Object.assign(new Error(line.error), { code: line.code });
    out.AGENT_BROWSER_ARGS = line.args;
  }
  return out;
}
/** One POSIX shell word: single-quoted, a `'` inside as `'\''` — every byte but NUL rides it verbatim. */
const shellWord = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** THE ENGINE'S WRAPPER (lane engine-args-string r2 — the owner's custom kernel names `--window-size=1920,1080`,
 *  `--accept-lang=en-US,en`, `--window-position=24,36`, `--disable-features=A,B,…`; the driver cuts its text at every comma, so
 *  an engine's switches never cross it): the program the driver starts on an engine launch — POSIX sh, the engine's env as
 *  `export` lines, then `exec '<kernel>' "$@" '<switch>'…` (the driver's own switches — the keeper's line + its defaults —
 *  first, the engine's after: Chromium reads a switch's last value, so the engine's win; exec keeps the pid the driver
 *  watches). `args` = splitLaunchArgs's engine part; each one shell word, whole. Refused by name: a program not absolute, a
 *  NUL anywhere (no argv / env holds one), an env name that is no shell name. → `{ok:true, text}` | `{ok:false, code, error}`. PURE. */
function engineWrapperText({ program = '', args = [], env = {} } = {}) {
  const no = (error) => ({ ok: false, code: 'browser_engine_wrapper', error: `the engine's launch wrapper cannot be written: ${error}` });
  if (typeof program !== 'string' || !program.startsWith('/') || program.includes('\0')) return no('its program is not an absolute path');
  const list = Array.isArray(args) ? args.map(String) : [];
  const nul = list.filter((a) => a.includes('\0'));
  if (nul.length) return no(`${nul.length} argument(s) hold a NUL byte`);
  const launchers = launcherArgsOf(list); // L1b r3: the second wall (the launch verdict refused them first)
  if (launchers.length) return no(`its arguments name another program through ${launchers.join(', ')}; a plugin never names the program it runs`);
  const vars = Object.entries(isObj(env) ? env : {}).map(([k, v]) => [k, String(v)]);
  const badEnv = vars.filter(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || v.includes('\0')).map(([k]) => clip(k, 40));
  if (badEnv.length) return no(`the environment name(s) ${badEnv.join(', ')} are not shell names, or a value holds a NUL byte`);
  const text = ['#!/bin/sh',
    '# VibeSpace: a browser ENGINE\'s launch (written by the keeper; lane engine-args-string). The browser driver starts this as',
    '# the browser: its own switches arrive as "$@", the engine\'s are appended whole here — never through the driver\'s text.',
    ...vars.map(([k, v]) => `export ${k}=${shellWord(v)}`),
    `exec ${shellWord(program)} "$@"${list.map((a) => ' ' + shellWord(a)).join('')}`, ''].join('\n');
  return { ok: true, text };
}

/** `browser.defaultEngine`'s value shape — 'default' or 'plugin:<id>' (ID_RE). Lane engine-spi-egress: ids are DERIVED,
 *  never named here; an engine that is not in the table is a FACT (the Settings row's fact line says so), never a refusal. */
function isDefaultEngineValue(v) { return v === 'default' || (typeof v === 'string' && v.startsWith('plugin:') && ID_RE.test(v.slice('plugin:'.length))); }
/** `browser.defaultEngine`'s value → the choice it writes on a new record (null = the default, nothing written). */
function choiceOfDefault(value) {
  const v = String(value == null ? '' : value);
  if (!v.startsWith('plugin:')) return null;
  const id = v.slice('plugin:'.length);
  return ID_RE.test(id) ? { kind: 'plugin', id } : null;
}
/** THE POLICY: the user's own stored value › the fleet's (`fleet` = the presets' fleet.json `browserEngine`, parsed) ›
 *  'default'. A stored value of another shape is no value. → `{value, source: 'user' | 'fleet' | 'default'}`. */
function defaultEngineOf({ own = undefined, fleet = null } = {}) {
  if (isDefaultEngineValue(own)) return { value: own, source: 'user' };
  if (isObj(fleet) && typeof fleet.plugin === 'string' && ID_RE.test(fleet.plugin)) return { value: fleet.default === true ? 'plugin:' + fleet.plugin : 'default', source: 'fleet' };
  return { value: 'default', source: 'default' };
}

module.exports = { ENGINE_CODES, PROTOCOL, ENGINE_ENV_KEYS, ENGINE_VERBS, ID_RE, OWN_ARG_RE, ENGINE_FEATURES, EGRESS_FEATURE, EGRESS_ROW_KEY,
  platformOf, engineWords, engineAnswerVerdict, unansweredOf, missingOf, majorOfVersion, engineChoiceVerdict, engineArgs, engineLaunchEnv, engineWrapperText, choiceOfDefault, isDefaultEngineValue, defaultEngineOf,
  egressRowOf, egressRowPath, egressArgs, PROXY_ARG_RE, withoutProxyArgs,
  BINARY_ROW_KEY, binaryRowOf, binaryRowPath, ENGINE_OWNER_ROW_RE, engineSourceOf, programMagicOk, userBinaryVerdict, // lane engine-spi-egress L1b
  LAUNCHER_SWITCHES, LAUNCHER_ARG_RE, launcherArgsOf }; // lane engine-spi-egress L1b r3
