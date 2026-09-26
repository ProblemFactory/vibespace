'use strict';
/**
 * THE ONE BROWSER CLI'S VERB MODEL — PURE (imports nothing; CJS so the shipped
 * `vibespace-browser`, the server's browser facts, the agentd bundle and the
 * browser bundle all carry ONE table). docs/design-browser-takeover.zh.md §3
 * (T1) + §4 (T2), owner 2026-09-24: "vibespace 完全接管浏览器工具，不要再给
 * agent 留 agent-browser 单独的入口".
 *
 * WHAT IS DECIDED HERE:
 *   · `classify(argv, {ours})` — what one `vibespace-browser …` command IS:
 *       ours     a VibeSpace verb (profiles new providers use detach status pin
 *                watch backend blocked new-child help) — ours always wins;
 *       page     a verb that acts on a page of THIS conversation's browser —
 *                it runs through `/api/agent/browser/resolve` (the lease, the
 *                one-time `profile_changed`, `browser_paused`, the audit);
 *       refused  refused LOCALLY, before any server call, with a typed code
 *                and a remedy (raw CDP, identity/launch flags, verbs that are
 *                the user's, verbs this build does not know);
 *       escape   `-- <verb …>` for a verb newer than this table — judged by the
 *                same flag rules, then passed through.
 *     Order: ① `--profile <h>` stripped wherever it sits (ours: a HANDLE) ② the
 *     first word ③ OURS ④ `--` ⇒ escape mode for what follows ⑤ the flag rules
 *     (§3.3) ⑥ the verb table (§3.2). `batch` is judged line by line: ONE
 *     refused line refuses the whole batch before anything runs — its stdin
 *     form too, which the binary reads ONLY as a JSON array of string arrays
 *     (`parseBatchStdin`, r4). ⑦ r4: a verb that NAVIGATES is refused a URL
 *     whose scheme is not the web (`localSchemeOf`).
 *   · `resolveRealBinary({PATH, shimDirs, exists, isShim})` — where the real
 *     browser CLI lives, skipping the directories that hold our SHIM (the
 *     session PATH puts it first on purpose) and any file carrying the shim's
 *     marker. Absent ⇒ the typed `binary_absent`.
 *
 * THE NAME. The real binary's name is spelled ONCE, here (`REAL_BINARY`): the
 * agent-facing surfaces (the CLI's strings, the teaching lines, the manuals)
 * never say it — test-architecture §52 counts it.
 */

const REAL_BINARY = 'agent-browser';
/** The line the shim carries so a resolver can tell it from the real binary
 *  by CONTENT (a scratch server may run with somebody else's data/bin on
 *  PATH — a directory list cannot know every checkout). */
const SHIM_MARKER = 'VIBESPACE-AGENT-BROWSER-SHIM';

/** VibeSpace's own verbs — they always win. */
const OURS = Object.freeze(['profiles', 'new', 'providers', 'use', 'detach', 'status', 'pin', 'watch', 'backend', 'blocked', 'new-child', 'help']);

/** Page verbs (the browser CLI 0.32.0's `--help` + `skills get core --full`
 *  census, design §3.2 rows 1–2 + `close` + D4/D5's pass-throughs). `profiles`
 *  is here for the `--` form only (ours wins at the top level). 0.32.0 reads
 *  global flags ANYWHERE in the argv (`get --json cdp-url` answers like
 *  `get cdp-url --json`), so a verb's noun is `nounAt`, never argv[verb+1]. */
const PAGE_VERBS = Object.freeze([
  'open', 'read', 'click', 'dblclick', 'type', 'fill', 'press', 'keyboard', 'keydown', 'keyup', 'hover', 'focus',
  'check', 'uncheck', 'select', 'drag', 'upload', 'download', 'scroll', 'scrollintoview', 'wait', 'screenshot', 'pdf',
  'snapshot', 'eval', 'back', 'forward', 'reload', 'pushstate', 'highlight', 'clipboard', 'frame', 'dialog', 'window', 'tab',
  'get', 'is', 'find', 'mouse', 'set', 'network', 'cookies', 'storage', 'state', 'diff', 'console', 'errors', 'vitals',
  'react', 'trace', 'profiler', 'record', 'addinitscript', 'removeinitscript', 'batch', 'close', 'profiles',
  // 0.38.1 (lane H re-measure): `a11y [url]` — an axe-core audit of the page (or of a url it NAVIGATES to first: a NAV verb)
  'a11y',
]);

const R = (code, error, remedy) => Object.freeze({ code, error, remedy });
const RAW_CDP = R('raw_cdp_refused',
  'a raw CDP endpoint (`connect`, `get cdp-url`, `--cdp`, `--auto-connect`) gives authority over the WHOLE browser and goes around VibeSpace\'s mediation',
  'every command you run already acts on your own browser — run the verb directly: `vibespace-browser snapshot`, `vibespace-browser click @ref`');
const NOT_OFFERED = (why, remedy) => R('verb_not_offered', why, remedy);
/** Verbs refused by NAME (design §3.2), each with its reason and way out. */
const REFUSED_VERBS = Object.freeze({
  connect: RAW_CDP,
  session: NOT_OFFERED('the browser session list is not offered here — the session your commands land on is decided by your lease', '`vibespace-browser status` answers which browser this conversation drives'),
  stream: NOT_OFFERED('the stream port belongs to the user\'s live view, and VibeSpace owns it', 'nothing to do — the user opens the live view from your session card; `vibespace-browser watch` explains it'),
  confirm: R('confirmation_is_human', 'a pending confirmation is answered by the USER (the live view or their "For you" inbox), never by the agent that asked', 'tell the user which action waits for them and stop'),
  deny: R('confirmation_is_human', 'a pending confirmation is answered by the USER (the live view or their "For you" inbox), never by the agent that asked', 'tell the user which action waits for them and stop'),
  inspect: NOT_OFFERED('DevTools opens a window on a display, and that window is the user\'s', 'read the page with `vibespace-browser snapshot` / `get text @ref` / `eval`'),
  auth: NOT_OFFERED('the credential vault puts a password on the command line (secrets never ride argv)', 'log in inside the page (`vibespace-browser fill @ref …`) or hand the login to the user'),
  plugin: NOT_OFFERED('plugins change this machine\'s browser setup, which is the user\'s', 'ask the user'),
  install: NOT_OFFERED('installing browsers is the user\'s act', '`vibespace-browser providers` says what this machine has'),
  upgrade: NOT_OFFERED('upgrading the browser CLI is the user\'s act', '`vibespace-browser providers` says what this machine has'),
  doctor: NOT_OFFERED('repairing the browser install is the user\'s act', '`vibespace-browser status` shows your browser; tell the user what failed'),
  mcp: NOT_OFFERED('a second entry point to the browser (an MCP server) is not offered — this CLI is the one road', 'run the verb through `vibespace-browser <verb>`'),
  dashboard: NOT_OFFERED('the dashboard is a server on a port, not a page verb', 'the user watches you through the live view'),
  chat: NOT_OFFERED('`chat` is a vendor model call, not a page verb', 'drive the page yourself: `vibespace-browser snapshot`, then act on @refs'),
  skills: NOT_OFFERED('the browser CLI\'s own skill texts teach a road this session does not have', 'the manual is `vibespace-docs browser`'),
  // 0.38.1 (lane H re-measure): WebMCP (experimental) invokes tools the PAGE declares — a channel this CLI neither
  // mediates nor records in the action trace the user reviews, so it is not offered until it can be both
  webmcp: NOT_OFFERED('WebMCP runs tools the PAGE declares — an experimental channel VibeSpace neither mediates nor records in the action trace the user reviews', 'drive the page through its own UI: `vibespace-browser snapshot`, then `click` / `fill` its @refs'),
});

/** Flags that decide WHICH browser a command lands on — the lease decides. */
// 0.38.1 (lane H re-measure): `--no-pin-tab` is a GLOBAL boolean that drops the session's sticky tab binding —
// on a shared profile the next command would then fall back to ANOTHER session's tab, so which tab a command lands on
// stays the lease's decision (`--pin-tab` itself only tightens it and passes)
const IDENTITY_FLAGS = Object.freeze(['--session', '--namespace', '--session-name', '--config', '--state', '--restore', '--restore-save', '--restore-check-url', '--restore-check-text', '--restore-check-fn', '--no-pin-tab']);
const RAW_CDP_FLAGS = Object.freeze(['--cdp', '--auto-connect']);
/** Flags that describe how the browser is LAUNCHED — VibeSpace launches it. */
// 0.38.1 (lane H re-measure): `--ca-cert <path>` / `--no-ca-cert` change which certificate authorities the browser
// TRUSTS (an interception proxy's CA — a launch decision, and a trust decision that is the user's), `--no-webmcp`
// how locally launched Chrome starts; all three are VibeSpace's to launch with, never a command's
const LAUNCH_FLAGS = Object.freeze(['--executable-path', '--provider', '-p', '--engine', '--extension', '--args', '--user-agent', '--proxy', '--proxy-bypass', '--headed', '--webgpu', '--allowed-domains', '--action-policy', '--confirm-actions', '--confirm-interactive', '--init-script', '--enable', '--ignore-https-errors', '--allow-file-access', '--color-scheme', '--download-path', '--no-auto-dialog', '--hide-scrollbars', '--idle-timeout', '--ca-cert', '--no-ca-cert', '--no-webmcp']);
/** Per-PAGE launch-looking flags that pass beside `open` (D12). */
const OPEN_FLAGS = Object.freeze(['--enable', '--init-script']);
/** Output/format flags that pass through (documentation; an unknown flag also
 *  passes — subcommands own many: --clear, --bail, --baseline, --url …). */
const PASS_FLAGS = Object.freeze(['--json', '--annotate', '--screenshot-dir', '--screenshot-quality', '--screenshot-format', '--content-boundaries', '--max-output', '--debug', '-i', '-c', '-d', '-s', '--full', '--load', '--text', '--url', '--fn', '--stdin', '-b', '--pin-tab', '--interactive', '--compact', '--depth', '--selector', '--input-mode', '--tags']);
/** THE BINARY'S OWN GLOBAL FLAGS, BY ARITY — MEASURED, never read off its
 *  --help (r3). 0.32.0 strips a global flag ANYWHERE in the argv, so every
 *  decision below that names "the verb" or "the noun" is only as good as this
 *  table: a value flag missing from VALUE_FLAGS is read as a boolean and its
 *  VALUE becomes the noun (`get --idle-timeout 5m cdp-url` printed the raw
 *  endpoint — `--idle-timeout` is documented only as an ENVIRONMENT variable,
 *  so the r2 census over the help's option sections never saw it). The table
 *  is the launch-free measurement in scripts/fixtures/browser-verbs/global-
 *  flags-<TABLE_VERSION>.json (`<flag> zzq9 session list` for every flag-shaped string
 *  in the binary: a value flag swallows zzq9, a boolean leaves it as the
 *  unknown command, a non-global flag is itself the unknown command); the fast
 *  gate holds these two sets EQUAL to it and the heavy gate re-measures the
 *  installed binary. `--config` answers "config file not found" for zzq9 (a
 *  value flag whose value is checked first); `--help`/`-h`/`--version`/`-V`
 *  print and exit. */
// 0.38.1 (lane H re-measure, scripts/fixtures/browser-verbs/global-flags-0.38.1.json): + `--ca-cert`, `--input-mode`
const VALUE_FLAGS = new Set(['--action-policy', '--allowed-domains', '--args', '--ca-cert', '--cdp', '--color-scheme', '--config', '--confirm-actions', '--device', '--download-path', '--enable', '--engine', '--executable-path', '--extension', '--headers', '--idle-timeout', '--init-script', '--input-mode', '--max-output', '--model', '--namespace', '--profile', '--provider', '--proxy', '--proxy-bypass', '--restore', '--restore-check-fn', '--restore-check-text', '--restore-check-url', '--restore-save', '--screenshot-dir', '--screenshot-format', '--screenshot-quality', '--session', '--session-name', '--state', '--user-agent', '-p']);
/** …and the global BOOLEANS (each takes an optional `true`/`false`). */
/**  0.38.1: + `--no-ca-cert`, `--no-pin-tab`, `--no-webmcp`, `--pin-tab` (a per-command flag on 0.32.0, global now). */
const BOOL_FLAGS = new Set(['--allow-file-access', '--annotate', '--auto-connect', '--confirm-interactive', '--content-boundaries', '--debug', '--fix', '--headed', '--hide-scrollbars', '--ignore-https-errors', '--json', '--no-auto-dialog', '--no-ca-cert', '--no-pin-tab', '--no-webmcp', '--offline', '--pin-tab', '--quick', '--quiet', '--verbose', '--webgpu', '-q', '-v']);
/** r4 — THE VERSION THE TABLES ABOVE WERE MEASURED ON (the fixture's). The
 *  heavy gate re-measures only where it runs; a user's box may carry another
 *  build, whose flags may have changed ARITY. So the CLI reads the version off
 *  the binary it is about to run (`--version`, launch-free, ~2 ms measured)
 *  and, when it is not this one, judges EVERY flag under both readings
 *  (`classify(…, {drift})`) and says so once — the table stops being trusted
 *  exactly where it was never measured. */
const TABLE_VERSION = '0.38.1'; // lane H (2026-09-25): re-measured on 0.38.1 — was 0.32.0 (its fixtures stay as the r3 evidence)
/** → the installed version when it is not the table's (`'unknown'` when the
 *  probe could not read one), else null. */
function versionDrift(installed) {
  const v = typeof installed === 'string' ? ((installed.match(/(\d+\.\d+\.\d+)/) || [])[1] || '') : '';
  if (v === TABLE_VERSION) return null;
  return v || 'unknown';
}
/** The nouns `get` READS (the --help's `Get Info` row, `cdp-url` excepted).
 *  A CLOSED set (r3): any other noun is refused, so an endpoint-shaped noun a
 *  later build adds — or a value mistaken for the noun — never passes as a
 *  read. The fast gate holds it equal to the help census. */
const GET_NOUNS = Object.freeze(['text', 'html', 'value', 'attr', 'title', 'url', 'count', 'box', 'styles']);
const GET_NOUN_SET = new Set(GET_NOUNS);
/** Refusal codes the binary itself would answer with an error anyway (an
 *  unknown verb / noun): under an ALTERNATE reading of a flag of unknown
 *  arity they are harmless, so only the other codes refuse there. */
const SOFT_CODES = new Set(['unknown_verb']);

const OURS_SET = new Set(OURS);
const PAGE_SET = new Set(PAGE_VERBS);
const IDENTITY_SET = new Set(IDENTITY_FLAGS);
const RAW_CDP_SET = new Set(RAW_CDP_FLAGS);
const LAUNCH_SET = new Set(LAUNCH_FLAGS);
const OPEN_SET = new Set(OPEN_FLAGS);

const isFlag = (t) => typeof t === 'string' && t.length > 1 && t[0] === '-';
const flagName = (t) => { const i = t.indexOf('='); return i > 0 ? t.slice(0, i) : t; };

/** Split one batch line into words: '…', "…" and backslash escapes, the way a
 *  POSIX shell would read the line the CLI receives. */
function splitWords(line) {
  const out = []; let cur = ''; let has = false; let q = null;
  const s = String(line);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q === "'") { if (ch === "'") q = null; else cur += ch; continue; }
    if (q === '"') { if (ch === '"') q = null; else if (ch === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) cur += s[++i]; else cur += ch; continue; }
    if (ch === "'" || ch === '"') { q = ch; has = true; continue; }
    if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; has = true; continue; }
    if (/\s/.test(ch)) { if (has || cur) { out.push(cur); cur = ''; has = false; } continue; }
    cur += ch; has = true;
  }
  if (has || cur) out.push(cur);
  return out;
}

// ── r4: a navigation is a navigation to the WEB ────────────────────────────
/** The verbs that take a URL and NAVIGATE the page to it (0.32.0's --help +
 *  `skills get core --full`; `goto` / `navigate` are the binary's own aliases
 *  of `open`, measured): `open <url>`, `tab new [url]`, `window new [url]`,
 *  `pushstate <url>`, `diff url <u1> <u2>`, `read [url]`, `vitals [url]`,
 *  `record start <path> [url]`. Every positional word after such a verb is
 *  judged by `localSchemeOf` — and so is every word of an escape (`-- <verb>`
 *  newer than this table may navigate too). */
const NAV_VERBS = Object.freeze(['open', 'goto', 'navigate', 'tab', 'window', 'pushstate', 'diff', 'read', 'vitals', 'record', 'a11y']); // 0.38.1: + `a11y [url]`
const NAV_SET = new Set(NAV_VERBS);
/** Schemes whose pages are the browser's own or this machine's — never the
 *  web. Measured on 0.32.0 + Chrome 153: `open chrome://version` shows the
 *  browser's command line and profile directory, `open file://<that dir>/
 *  DevToolsActivePort` its random debugging port and browser GUID — together
 *  exactly what `get cdp-url` is refused for (every launch carries
 *  `--remote-debugging-port=0`, whatever the config says); `FILE:` / `file:/x`
 *  / `file:x` / `about:version` all navigate too; `devtools://` would host a
 *  DevTools front end on the browser's own endpoint. */
const LOCAL_SCHEME_RE = /^(?:file|about|javascript|blob|filesystem|view-source|devtools|chrome(?:-[a-z0-9+.-]*)?|edge|brave|opera|vivaldi|isolated-app)$/;
/**
 * r4 (takeover finding 1): is `word` a URL the binary would navigate to that
 * is not a page of the web? → `{scheme, url}` | null. The rule, measured on
 * 0.32.0's `open` (`get url` after each): a word with no scheme is made
 * `https://…` by the binary (`localhost:3000`, `example.com`, even
 * `mailto:x@y` and `myhost:abc`), so it passes; `http:` / `https:` / `data:`
 * and `about:blank` (with `/`, `?` or `#` after it) are the web; a scheme of
 * the browser's own or of this machine (LOCAL_SCHEME_RE, case-insensitive —
 * the binary lower-cases `FILE:`) is refused in ANY spelling; and an
 * authority-form URL (`x://…`) of any other scheme is refused too, because
 * only http(s) pages are the web in that form (a Chromium build's own
 * `edge://` / `brave://` pages, `ws://`, `ftp://` …). Leading blanks and every
 * tab / CR / LF are dropped first (the URL parser drops them), so a spelling
 * cannot hide its scheme — this only ever over-refuses.
 */
function localSchemeOf(word) {
  const s = String(word == null ? '' : word).replace(/^[\u0000-\u0020]+/, '').replace(/[\t\n\r]/g, '');
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):([\s\S]*)$/.exec(s);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const rest = m[2];
  if (scheme === 'http' || scheme === 'https' || scheme === 'data') return null;
  if (scheme === 'about' && /^blank(?:[/?#][\s\S]*)?$/i.test(rest)) return null;
  if (LOCAL_SCHEME_RE.test(scheme) || rest.startsWith('//')) return { scheme, url: String(word) };
  return null;
}
const clip = (t, n = 120) => { const x = String(t); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
const LOCAL_SCHEME = (hit) => R('local_scheme_refused',
  `\`${clip(hit.url)}\` is a ${hit.scheme}: address, not a page of the web — the browser's own pages and this machine's files show what the lease keeps from you (the browser's command line, its profile directory, its debugging port)`,
  'open an http(s) page (or `data:…` / `about:blank`); read a file of yours with your shell, or serve its directory over http (`python3 -m http.server`) and open http://127.0.0.1:<port>/…');

/** r4: `state load <file>` NAVIGATES the page to every origin its file lists
 *  (measured on 0.32.0: a state file naming `chrome://version` / `file:///etc`
 *  / `about:version` as an origin with localStorage left the page ON that
 *  origin). The judge cannot read a file, so it names the file(s) a command
 *  loads (`stateFiles`) and the CLI reads each and asks `stateFileVerdict`. */
function stateFileVerdict(json) {
  const seen = new Set();
  const walk = (v, depth) => {
    if (depth > 12 || v == null || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    for (const [k, x] of Object.entries(v)) {
      if (k === 'origin' && typeof x === 'string') { const hit = localSchemeOf(x); if (hit) return hit; }
      const r = walk(x, depth + 1);
      if (r) return r;
    }
    return null;
  };
  const hit = walk(json, 0);
  return hit ? LOCAL_SCHEME(hit) : null;
}

/** r4 (takeover finding 3): what the binary reads from a `batch` with no line
 *  arguments — ONLY a JSON array of string arrays (measured: plain lines are
 *  `Invalid JSON input … Expected an array of string arrays`, `[["get url"]]`
 *  is one word). → `{ ok:true, commands, json, form }`: a JSON stdin is judged
 *  element by element and handed to the binary VERBATIM; plain lines (the
 *  friendlier spelling, blank and `#` lines skipped) are split like a shell
 *  and handed over as the JSON of exactly the words that were judged. */
function parseBatchStdin(text) {
  const t = String(text == null ? '' : text);
  const bad = (why) => ({ ok: false, code: 'batch_stdin_refused', error: `the batch on stdin ${why} — nothing in the batch ran`, remedy: 'pipe one command per line (`printf \'open https://x\\nsnapshot -i\\n\' | vibespace-browser batch`), or a JSON array of string arrays (`[["open","https://x"],["snapshot","-i"]]`), or pass the commands as arguments' });
  if (/^\s*\[/.test(t)) {
    let v;
    try { v = JSON.parse(t); } catch (e) { return bad(`starts like JSON and does not parse (${e.message})`); }
    if (!Array.isArray(v) || !v.every((c) => Array.isArray(c) && c.every((w) => typeof w === 'string'))) return bad('is JSON but not an array of string arrays');
    return { ok: true, form: 'json', commands: v.map((c) => c.slice()), json: t, numbers: v.map((_, i) => i + 1) };
  }
  const commands = []; const numbers = [];
  t.split(/\r?\n/).forEach((raw, i) => { const line = raw.trim(); if (!line || line.startsWith('#')) return; commands.push(splitWords(line)); numbers.push(i + 1); });
  if (!commands.length) return bad('is empty');
  return { ok: true, form: 'lines', commands, json: JSON.stringify(commands), numbers };
}

function refused(base, r, extra = {}) {
  return { kind: 'refused', verb: base.verb ?? null, sub: base.sub ?? null, argv: base.argv, profile: base.profile ?? null, code: r.code, error: r.error, remedy: r.remedy, ...extra };
}

/** The index past the flag at `i` — the way 0.32.0 reads its GLOBAL flags,
 *  measured r2: a value flag (`VALUE_FLAGS`) takes the next word; every other
 *  flag takes an optional `true` / `false` right after it (the help's "Boolean
 *  flags accept an optional true/false value": `get --json true cdp-url` is
 *  the raw endpoint, `get --json TRUE cdp-url` is `Unknown subcommand`); an
 *  `=` form is one word. A non-global flag between a verb and its noun is the
 *  binary's `Unknown subcommand`, so skipping it too can only over-refuse.
 *  This is the PRIMARY reading; `flagEnds` gives every reading (r3). */
function flagEnd(body, i) {
  const t = body[i];
  if (t.includes('=')) return i + 1;
  if (VALUE_FLAGS.has(t)) return i + 2;
  return body[i + 1] === 'true' || body[i + 1] === 'false' ? i + 2 : i + 1;
}
/** A flag whose arity the measured table does not know (r3): neither a global
 *  value flag nor a global boolean — a verb's own option (`snapshot -i`), a
 *  typo, or a global flag a newer build added. r4: under a version DRIFT (the
 *  binary is not the one the table was measured on) every flag is. */
const unknownArity = (t, drift = null) => isFlag(t) && t !== '--' && !t.includes('=') && (!!drift || (!VALUE_FLAGS.has(t) && !BOOL_FLAGS.has(t)));
/** Every index past the flag at `i` under EVERY reading (r3): a known flag has
 *  one; a flag of unknown arity is read both as a boolean and as a value flag
 *  (r4: the table's own reading is always among them). */
function flagEnds(body, i, drift = null) {
  const t = body[i];
  const tf = body[i + 1] === 'true' || body[i + 1] === 'false';
  if (!unknownArity(t, drift)) return [flagEnd(body, i)];
  return [...new Set([flagEnd(body, i), ...(tf ? [i + 2] : [i + 1, i + 2])])];
}
/** Every index the first non-flag word from `i` may sit at, under every
 *  reading (`body.length` = none). The verb search stops AT `--` (it is judged
 *  as a word, like `verbAt`); the noun search steps over it (like `nounAt`). */
function positionsFrom(body, i, { verb = false, drift = null } = {}) {
  const out = new Set(); const seen = new Set(); const todo = [i];
  while (todo.length) {
    const j = todo.pop();
    if (seen.has(j)) continue;
    seen.add(j);
    if (j >= body.length) { out.add(body.length); continue; }
    const t = body[j];
    if (t === '--') { if (verb) out.add(j); else todo.push(j + 1); continue; }
    if (!isFlag(t)) { out.add(j); continue; }
    for (const n of flagEnds(body, j, drift)) todo.push(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Find the verb word (skipping global flags and their values). */
function verbAt(body) {
  let i = 0;
  while (i < body.length) {
    const t = body[i];
    if (isFlag(t) && t !== '--') { i = flagEnd(body, i); continue; }
    break;
  }
  return i;
}

/** The first NON-flag word from `i` on (a flag skips what `flagEnd` says it
 *  takes) — a verb's noun (`get --json cdp-url`, `get --json true cdp-url` ⇒
 *  `cdp-url`). */
function nounAt(body, i) {
  while (i < body.length) {
    const t = body[i];
    if (t === '--') { i++; continue; }
    if (isFlag(t)) { i = flagEnd(body, i); continue; }
    return t;
  }
  return null;
}

// ── lane L r4: a WRITE names its output path ───────────────────────────────
/** The verbs that WRITE a file to a path the caller chooses (measured on the
 *  0.32.0/0.38.1 `--help` + `skills get core --full`): where the path stands is
 *  the ONLY difference. A `positional` writer's path is a positional after the
 *  verb (`download <sel> <path>`, `pdf <path>`, `screenshot [sel] [path]`); a
 *  `subs` writer's after a writing sub (`state save <path>`, `record
 *  start|restart <path> [url]`, `trace stop [path]`, `profiler stop [path]`);
 *  `har` is `network har stop [path]`; a `flags` writer's path is the value of
 *  ITS OWN option (r6, verify r4 F-A: `wait --download [path]` — "Wait for a
 *  download to complete (optionally save to path)", 0.38.1 — was judged nowhere
 *  and handed relative). EVERY writer is here — the census (test-browser-verbs)
 *  holds this table against the help's `<path>` / `[path]` command signatures
 *  AND, since r6, against every OPTION line of every verb's own `--help`
 *  (scripts/fixtures/agent-browser-0.38.1/<verb>.txt): a path-shaped option is a
 *  write slot here, a read slot (`READ_FLAGS`), refused wholesale, or on
 *  `PATH_OPTION_ALLOW` with its reason — so a writer a newer build adds, as a
 *  command or as an option, cannot pass unclassified. */
const WRITE_VERBS = Object.freeze({
  download: { positional: true }, pdf: { positional: true }, screenshot: { positional: true },
  state: { subs: ['save'] }, record: { subs: ['start', 'restart'] },
  trace: { subs: ['stop'] }, profiler: { subs: ['stop'] }, network: { har: ['stop'] },
  wait: { flags: ['--download'] },
});
/** An OWN property of a table, never an inherited one (`constructor`, `toString`
 *  are words an agent can type). */
const own = (o, k) => (k != null && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null);
/** Value flags whose value is a write target, wherever they sit (`diff
 *  screenshot -o/--output <file>`, `--screenshot-dir <dir>` for `screenshot`).
 *  `--download-path` is already a refused LAUNCH flag; it never reaches here. */
const WRITE_FLAGS = Object.freeze(['-o', '--output', '--screenshot-dir']);
const WRITE_FLAG_SET = new Set(WRITE_FLAGS);
const firstNonFlagFrom = (body, i) => { while (i < body.length) { if (body[i] === '--') { i++; continue; } if (!isFlag(body[i])) return i; i++; } return -1; };
/** Every word of `body` that is (or may be) a write target of the verb at `vi`:
 *  the positionals of a whole-verb writer / after a writing sub, and the value
 *  of a write-target flag anywhere. Over-naming is safe — a selector or a URL
 *  resolves inside the project and passes the containment check, and a word that
 *  is not a writer's target is never named. */
function writeTargetsAt(body, vi) {
  const out = [];
  const verb = vi >= 0 && vi < body.length ? body[vi] : null;
  const spec = own(WRITE_VERBS, verb);
  const verbFlags = new Set(spec && spec.flags ? spec.flags : []);
  const pushPos = (from) => { for (let i = from; i < body.length; i++) { const t = body[i]; if (t === '--' || isFlag(t)) continue; out.push(t); } };
  if (spec) {
    if (spec.positional) pushPos(vi + 1);
    else if (spec.subs) { const si = firstNonFlagFrom(body, vi + 1); if (si >= 0 && spec.subs.includes(body[si])) pushPos(si + 1); }
    else if (spec.har) { const hi = body.indexOf('har', vi + 1); if (hi >= 0) { const oi = firstNonFlagFrom(body, hi + 1); if (oi >= 0 && spec.har.includes(body[oi])) pushPos(oi + 1); } }
  }
  for (let i = 0; i < body.length; i++) {
    const t = body[i]; if (typeof t !== 'string' || !isFlag(t)) continue;
    const eq = t.indexOf('=');
    const name = eq > 0 ? t.slice(0, eq) : t;
    if (!WRITE_FLAG_SET.has(name) && !verbFlags.has(name)) continue;
    if (eq > 0) out.push(t.slice(eq + 1));
    else if (i + 1 < body.length && !isFlag(body[i + 1])) out.push(body[i + 1]);
  }
  return [...new Set(out)];
}

/**
 * Judge a page-side argv (no `--profile` of ours left in it): the flag rules
 * first, then the verb table. `escape` = it came after `--` (an unknown verb
 * passes as `escape`); `inBatch` = one line of a batch (`--profile` there is
 * the browser CLI's own directory flag ⇒ an identity flag; no escape; no
 * nested batch).
 */
function judge(body, opts = {}) {
  const r = judgeReadings(body, opts);
  if (r.kind === 'refused') return r;
  const extra = {};
  // lane L r2 — AN UPLOAD NAMES ITS FILES. `upload <sel> <files…>` hands every
  // file to a page, so the CLI checks each against the credential stores
  // (`uploadPathVerdict`) before anything runs. Reading-independent: when the
  // word `upload` stands anywhere in the argv (a flag of unknown arity may move
  // the verb onto it), EVERY positional word after it is named — the selector
  // and a flag's value too; a word that is not a path under a store never
  // refuses, so this only ever over-names.
  const at = body.indexOf('upload');
  if (at >= 0) {
    const files = body.slice(at + 1).filter((t) => !isFlag(t));
    if (files.length) extra.uploadFiles = [...(r.uploadFiles || []), ...files];
  }
  // lane L r4 — A WRITE NAMES ITS OUTPUT PATH. Every verb that writes a file to
  // a chosen path (`WRITE_VERBS`, `WRITE_FLAGS`) names it, and the CLI confines
  // the write to the project / temp / ~/Downloads (`writePathVerdict`) before
  // /resolve and before the binary — the write-direction twin of the upload
  // guard. A batch collects them from every line (below), like `stateFiles`.
  const wf = writeTargetsAt(body, verbAt(body));
  if (wf.length) extra.writeFiles = [...(r.writeFiles || []), ...wf];
  return Object.keys(extra).length ? { ...r, ...extra } : r;
}
function judgeReadings(body, opts = {}) {
  const drift = opts.drift || null;
  const primary = judgeAt(body, verbAt(body), null, opts);
  // r3: a flag of UNKNOWN arity makes the parse ambiguous — the binary may
  // read it as taking the next word, which moves the verb or the noun. Every
  // reading is judged; a refusal the binary would not answer with an error of
  // its own (anything but an unknown verb / noun) under ANY reading refuses
  // the command. No unknown flag ⇒ one reading, exactly the primary. r4: under
  // a version drift every flag is of unknown arity (`unknownArity(t, drift)`).
  const ua = (t) => unknownArity(t, drift);
  if (!body.some(ua)) return primary;
  if (primary.kind === 'refused' && !SOFT_CODES.has(primary.code)) return primary;
  for (const vi of positionsFrom(body, 0, { verb: true, drift })) {
    for (const ni of positionsFrom(body, vi + 1, { drift })) {
      const r = judgeAt(body, vi, ni, opts);
      if (r.kind === 'refused' && !SOFT_CODES.has(r.code)) {
        const flags = [...new Set(body.filter(ua))].join(' ');
        const cmd = `\`${[body[vi], ni < body.length ? body[ni] : ''].filter(Boolean).join(' ')}\``;
        const reading = drift
          ? `the browser CLI here is ${drift} and this table was measured on ${TABLE_VERSION}, so any of \`${flags}\` may take a value there or none — read the other way the command is ${cmd}`
          : `\`${flags}\` is not a flag this table knows the arity of, and read as taking a value the command is ${cmd}`;
        return { ...r, error: `${r.error} (${reading})`, reading };
      }
    }
  }
  return primary;
}

/** ONE reading: the verb at `vi`, the noun at `ni` (`null` = the primary
 *  reading's noun, `nounAt`). */
function judgeAt(body, vi, ni, { escape = false, profile = null, inBatch = false, stdin, drift = null } = {}) {
  const verb = body[vi] ?? null;
  const sub = ni == null ? nounAt(body, vi + 1) : (body[ni] ?? null);
  const base = { verb, sub, argv: body, profile };
  // ⑤ the flag rules (§3.3) — everywhere in the argv, before or after the verb
  for (const tok of body) {
    if (!isFlag(tok) || tok === '--') continue;
    const name = flagName(tok);
    if (RAW_CDP_SET.has(name)) return refused(base, RAW_CDP, { flag: name });
    if (IDENTITY_SET.has(name) || (inBatch && name === '--profile')) {
      return refused(base, R('identity_flag_refused', `\`${name}\` decides WHICH browser the command lands on — that is your lease's decision, not a flag's`,
        'drop the flag; `--profile <handle>` (outside a batch) names one of your attachments — `vibespace-browser status` lists them'), { flag: name });
    }
    if (LAUNCH_SET.has(name)) {
      if (OPEN_SET.has(name) && verb === 'open') continue;
      return refused(base, R('launch_flag_refused', `\`${name}\` is a property of how the browser is LAUNCHED, and VibeSpace launches it`,
        'a proxy or launch setting belongs to a named profile (`vibespace-browser new <label> --proxy <url>`) or to the user\'s Settings → Agent browser'), { flag: name });
    }
  }
  // ⑥ the verb table (§3.2)
  if (!verb) return refused(base, R('unknown_verb', escape ? 'nothing to run after `--`' : 'no verb given', '`vibespace-browser help` lists the verbs'));
  if (REFUSED_VERBS[verb]) return refused(base, REFUSED_VERBS[verb]);
  // r1: the real 0.32.0 binary reads its GLOBAL flags anywhere — `get --json cdp-url` and `get cdp-url
  // --json` both answer the raw endpoint — so the noun is `nounAt` (flags skipped, a global value flag's
  // value with it, a boolean one its optional `true`/`false`). r2: the NOUN decides, never any later
  // word: `get attr @e cdp-url` reads an attribute NAMED cdp-url and `get text cdp-url` the text of an
  // element of that name (measured on 0.32.0: 'zzz' / the text, no endpoint). Sound because every global value flag
  // is in VALUE_FLAGS — r3: MEASURED off the binary, not read off its --help (the r2 census read the
  // help's option sections and never saw `--idle-timeout`, documented only as an environment variable, so
  // `get --idle-timeout 5m cdp-url` printed the endpoint); a boolean one's `true`/`false` is skipped
  // (`flagEnd`); a flag the table does not know is read BOTH ways (`judge`); and a NON-global flag there
  // is the binary's `Unknown subcommand` — it never reaches the endpoint (test-browser-mediation-chrome ③
  // runs every spelling through the real binary and holds the router to its answer).
  // r3: the rule is an ALLOW-LIST — `get` passes only with a noun it READS
  // (GET_NOUNS); `cdp-url` is the raw endpoint, any other noun is not a read
  // this table knows (a value mistaken for the noun lands here, never on a pass).
  if (verb === 'get' && sub === 'cdp-url') return refused(base, RAW_CDP);
  if (verb === 'get' && !GET_NOUN_SET.has(sub)) {
    return refused(base, R('unknown_verb', `\`get ${sub == null ? '' : sub}\` is not a read this VibeSpace knows — \`get\` reads ${GET_NOUNS.join(' / ')}`,
      '`vibespace-browser get text @ref` (or html / value / attr <name> / title / url / count / box / styles); a flag between `get` and its noun must be one the browser CLI knows'));
  }
  // ⑦ r4 (takeover finding 1): a verb that NAVIGATES goes to the web only. Every positional word after it
  // (and after an escape's unknown verb) is judged; `state load <file>` names the file the CLI must read
  if (NAV_SET.has(verb) || (escape && !PAGE_SET.has(verb))) {
    for (const w of body.slice(vi + 1)) {
      if (isFlag(w)) continue;
      const hit = localSchemeOf(w);
      if (hit) return refused(base, LOCAL_SCHEME(hit), { url: hit.url, scheme: hit.scheme });
    }
  }
  if (verb === 'batch') {
    if (inBatch) return refused(base, R('unknown_verb', 'a batch inside a batch is not offered', 'flatten it into one batch'));
    // the ARGUMENT form: each argument is one command line, split by the binary like a shell
    const lines = body.slice(vi + 1).filter((t) => !isFlag(t));
    let cmds; let nums; let stdinJson = null; let label = 'line';
    if (lines.length) { cmds = lines.map((l) => String(l).trim()); nums = cmds.map((_, i) => i + 1); }
    else if (typeof stdin === 'string') {
      // r4 (takeover finding 3): the STDIN form — the binary reads only a JSON array of string arrays
      const p = parseBatchStdin(stdin);
      if (!p.ok) return refused(base, R(p.code, p.error, p.remedy));
      cmds = p.commands; nums = p.numbers; stdinJson = p.json; label = p.form === 'json' ? 'command' : 'line';
    } else return { kind: 'page', verb, sub: null, argv: body, profile, escape, needsStdin: true };
    const stateFiles = [];
    const uploadFiles = [];
    const writeFiles = [];
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      if (typeof c === 'string' && (!c || c.startsWith('#'))) continue;
      const words = Array.isArray(c) ? c : splitWords(c);
      const r = judge(words, { inBatch: true, drift });
      const shown = Array.isArray(c) ? JSON.stringify(c) : c;
      if (r.kind !== 'page') {
        return refused(base, R('batch_line_refused', `batch ${label} ${nums[i]} (${JSON.stringify(clip(shown))}) is refused: ${r.error} [${r.code}] — nothing in the batch ran`,
          r.remedy || 'fix or drop that line'), { line: nums[i], lineCode: r.code });
      }
      if (r.stateFiles) stateFiles.push(...r.stateFiles);
      if (r.uploadFiles) uploadFiles.push(...r.uploadFiles);
      if (r.writeFiles) writeFiles.push(...r.writeFiles);
    }
    return { kind: 'page', verb, sub: null, argv: body, profile, escape, lines: cmds.length, ...(stdinJson != null ? { stdinJson } : {}), ...(stateFiles.length ? { stateFiles } : {}), ...(uploadFiles.length ? { uploadFiles } : {}), ...(writeFiles.length ? { writeFiles } : {}) };
  }
  if (verb === 'state' && sub === 'load') {
    // the file is a positional word after `load` (the binary reads it relative to the cwd) — every one is
    // named, so a flag's value in between can never hide which one the binary takes
    const li = body.indexOf('load', vi + 1);
    const files = li >= 0 ? body.slice(li + 1).filter((t) => !isFlag(t)) : [];
    return { kind: 'page', verb, sub, argv: body, profile, escape, ...(files.length ? { stateFiles: files } : {}) };
  }
  if (PAGE_SET.has(verb)) return { kind: 'page', verb, sub, argv: body, profile, escape };
  if (escape && !inBatch) return { kind: 'escape', verb, sub, argv: body, profile, escape: true };
  return refused(base, R('unknown_verb', `"${verb}" is not a browser verb this VibeSpace knows`,
    '`vibespace-browser help` lists the verbs; a verb newer than that list runs as `vibespace-browser -- <verb> …` (the same flag rules apply)'));
}

// ── lane L r2: an UPLOAD never takes a credential store ────────────────────
/** The directories an upload is refused from, BY NAME (lane L r2 — the
 *  verifier's upload finding): with `claude.allowAgentTools` on, a page verb
 *  runs with no permission card, so `upload @ref ~/.ssh/id_rsa` would hand a
 *  private key to any site. Typing what the agent can read into a page stays
 *  the accepted trade-off (documented); a FILE from the stores below never
 *  goes: claude's config + credentials, ssh keys, VibeSpace's own per-machine
 *  store, codex's login, and the account stores in VibeSpace's data dir. */
const SECRET_HOME_DIRS = Object.freeze(['.claude', '.ssh', '.vibespace', '.codex']);
const SECRET_DATA_DIRS = Object.freeze(['subs', 'codex-subs']);
/** → `[{dir, shown}]` for every home (the account's passwd home AND $HOME —
 *  both are refused) and the data dir; `shown` is how a refusal names it. */
function secretUploadRoots({ homes = [], dataDir = null } = {}) {
  const out = []; const seen = new Set();
  const add = (dir, shown) => { const d = normDir(dir); if (d && d !== '/' && !seen.has(d)) { seen.add(d); out.push({ dir: d, shown }); } };
  for (const h of homes) { if (!h || h[0] !== '/') continue; for (const n of SECRET_HOME_DIRS) add(`${h}/${n}`, `~/${n}`); }
  if (dataDir && dataDir[0] === '/') for (const n of SECRET_DATA_DIRS) add(`${dataDir}/${n}`, `<VibeSpace data>/${n}`);
  return out;
}
/** `candidates` = `[{file, paths:[absolute spellings: as resolved, and its
 *  realpath when it exists]}]`; `roots` = `secretUploadRoots(…)` (each root
 *  also in its realpath spelling, the caller's job). → the refusal for the
 *  first file under a root, or null. */
function uploadPathVerdict(candidates, roots) {
  const under = (p, d) => p === d || p.startsWith(d === '/' ? '/' : d + '/');
  for (const c of Array.isArray(candidates) ? candidates : []) {
    for (const p of c.paths || []) {
      const n = normDir(p);
      const hit = (roots || []).find((r) => under(n, r.dir));
      if (hit) {
        return R('upload_secret_refused',
          `\`${clip(c.file)}\` is under ${hit.shown} — an upload hands the file to the page, and VibeSpace never uploads from ${[...SECRET_HOME_DIRS.map((d) => '~/' + d), 'its account stores'].join(', ')} (logins, keys, credentials); nothing ran`,
          'upload a file of the task (copy what the page needs out of it yourself, never a key or a login); if the user wants that very file sent, they upload it themselves');
      }
    }
  }
  return null;
}

// ── lane L r4: a WRITE stays inside the project (or /tmp, ~/Downloads) ──────
/** An allow rule on `vibespace-browser` is a grant on EVERY path its writing
 *  verbs can write, so `download`/`pdf`/`screenshot`/`state save`/`record`/… —
 *  which the CLI's own Write tool would ASK to write out of cwd — could
 *  silently overwrite `~/.ssh/authorized_keys` or `~/.claude/settings.json`
 *  (measured on the real 0.38.1: an `open data:text/html,<a download>` page +
 *  `download` wrote an arbitrary abs path verbatim, `pdf` a %PDF). CONTAINMENT,
 *  not a name list: every write target is resolved PHYSICALLY (`physicalPath`,
 *  r5) and ALLOWED only under the SESSION's project directory (`sessionRoot` —
 *  the wrapper-exported VIBESPACE_SESSION_CWD, never the invoking shell's cwd;
 *  r5 F3), the OS temp dir or ~/Downloads (`allow`); anything else is
 *  `write_path_refused`. Unconditionally, and whatever the root:
 *    · a NAMED store as any component — `.ssh` / `.claude` / `.codex` /
 *      `.vibespace` (keys, logins, and the settings whose hooks run commands —
 *      a PROJECT's `.claude/settings.json` too) and `.git` (the hooks git runs)
 *      (r5; r4 knew them only directly under a home);
 *    · VibeSpace's own data dir (`dataDir`: its account stores `subs` /
 *      `codex-subs`, its tools in `bin` that run in every session, its logins —
 *      r5, the F1 impact list: `data/bin/vibespace-hook.mjs` is RCE);
 *    · any dot-entry directly under a home (`~/.bashrc`, `~/.config`, ANY
 *      `~/.x`) — EXCEPT (r5 F6) inside the session root when that root itself
 *      sits in the dot-entry (a project in `~/.config/nvim` writes under
 *      `~/.config/nvim`, never beside it); the named stores above still refuse.
 *  `candidates` = `[{file, paths:[…]}]` (the lexical spelling and the physical
 *  one); the store rules run on every spelling, the allow-list on the LAST
 *  (the physical path — the one handed to the binary). */
const SECRET_COMPONENTS = Object.freeze(['.ssh', '.claude', '.codex', '.vibespace', '.git']);
function writePathVerdict(candidates, { allow = [], homes = [], dataDir = null, sessionRoot = null } = {}) {
  const under = (p, d) => p === d || p.startsWith(d === '/' ? '/' : d + '/');
  const root = typeof sessionRoot === 'string' && sessionRoot[0] === '/' && normDir(sessionRoot) !== '/' ? normDir(sessionRoot) : null;
  const allowRoots = [...(Array.isArray(allow) ? allow : []), ...(root ? [root] : [])].map(normDir).filter((d) => d && d[0] === '/');
  const homeRoots = (Array.isArray(homes) ? homes : []).map(normDir).filter((d) => d && d[0] === '/' && d !== '/');
  // `dataDir`: one directory or several spellings of it (as installed, and its realpath)
  const dataRoots = (Array.isArray(dataDir) ? dataDir : [dataDir]).filter((d) => typeof d === 'string' && d[0] === '/' && normDir(d) !== '/')
    .flatMap((d) => [...SECRET_DATA_DIRS.map((n) => ({ dir: normDir(`${d}/${n}`), shown: `<VibeSpace data>/${n}` })), { dir: normDir(d), shown: '<VibeSpace data>' }]);
  const storeHit = (p) => {
    for (const r of dataRoots) if (under(p, r.dir)) return r.shown;
    for (const h of homeRoots) {
      if (p === h || !under(p, h)) continue;
      const seg = p.slice(h.length + 1).split('/')[0];
      if (!seg || seg[0] !== '.') continue;
      if (SECRET_COMPONENTS.includes(seg)) return `~/${seg}`;
      // F6: the session root wins for its own subtree when the root itself sits inside this dot-entry
      if (root && under(root, `${h}/${seg}`) && under(p, root)) continue;
      return `~/${seg}`;
    }
    const named = p.split('/').find((c) => SECRET_COMPONENTS.includes(c));
    return named ? `a ${named} directory` : null;
  };
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const paths = (c.paths || []).map(normDir).filter(Boolean);
    // the physical spelling (the last) first — the refusal names where the write would really land
    for (const p of paths.slice().reverse()) { const s = storeHit(p); if (s) return R('write_path_refused', `\`${clip(c.file)}\` is under ${s} — a browser command never writes into your logins, keys, credentials, config or VibeSpace's own data; nothing ran`, 'save under the project, /tmp or ~/Downloads'); }
    const resolved = paths.length ? paths[paths.length - 1] : null;
    if (resolved != null && !allowRoots.some((d) => under(resolved, d))) {
      return R('write_path_refused', root
        ? `\`${clip(c.file)}\` is outside the places a browser command may write — the project directory (${clip(root, 80)}), /tmp or ~/Downloads; nothing ran`
        : `\`${clip(c.file)}\` is outside the places a browser command may write — no session directory is known here (VIBESPACE_SESSION_CWD is not set: a shell outside a VibeSpace session, or a session started before this VibeSpace version), so only /tmp or ~/Downloads; nothing ran`,
      root ? 'save under the project, /tmp or ~/Downloads' : 'save under /tmp or ~/Downloads; a session started before this version writes into its project again once it is restarted');
    }
  }
  return null;
}

// ── lane L r5: a path is judged and WRITTEN in the SAME frame ───────────────
/** THE FRAME RULE (verify r3 F1, CRITICAL). The binary hands a relative path to
 *  its DAEMON, which resolves it against ITS OWN cwd — the cwd of whatever
 *  launched it (measured on 0.38.1: daemon started in A, `pdf ./out.pdf` from B
 *  wrote A/out.pdf; the keeper launched every managed daemon from the SERVER's
 *  cwd = the repo checkout, so `pdf ./data/bin/vibespace-hook.mjs` overwrote a
 *  hook that runs in every session). So the CLI never hands the binary a path it
 *  judged in another frame: every path WORD the binary will read or write is
 *  resolved here (`physicalPath`) and handed over ABSOLUTE (`pathSlots` names
 *  exactly those words). Judging still OVER-names (`writeTargetsAt`); rewriting
 *  is EXACT — rewriting a selector or a URL would change what the command does.
 *
 *  `pathSlots(words)` → `[{i, kind:'write'|'read', prefix, word}]` for ONE
 *  command, MEASURED on the real 0.38.1 (daemon in A, CLI in B):
 *    download <sel> <path>      the words after the selector (a 3rd word is
 *                               ignored by the binary: `download #k d1 d2`
 *                               saved d1 — every one is handed absolute)
 *    screenshot [sel] [path]    two words ⇒ the second (and any after it); ONE
 *                               word is a PATH only when it ends .png/.jpg/.jpeg/
 *                               .webp, or holds a `/` and does not start like a
 *                               selector (`loneShotIsPath`: `x.png`, `./noext`,
 *                               `sub/noext`, `[href="/login"]` wrote files;
 *                               `noext`, `.btn`, `a.b`, `x.gif`, `x.pdf`, and —
 *                               r6, verify r4 F-B — `.x[href="/login"]`, `.x/y`,
 *                               `@e1/x`, `#d/y` were SELECTORS; image extensions
 *                               case-insensitive here, a superset)
 *    pdf <path>                 every word (pdf never creates a directory)
 *    state save|load <path>     the words after the sub (load: a READ)
 *    record start|restart <path> [url]   the FIRST word after the sub only
 *    trace|profiler stop [path] · network har stop [path]   the words after
 *    upload <sel> <files…>      the words after the selector (READS)
 *    wait --download [path]     its value (WRITE, r6; the value is optional)
 *    -o/--output, --screenshot-dir  their value (WRITE, any verb, like r4);
 *    open --init-script, cookies --curl, diff -b/--baseline  their value (READ)
 *  A verb's own value flags (`screenshot --threshold <n>`, `record --fps <n>`,
 *  `--contact-sheet-threshold <n>`, diff's `-b`/`-o`/`--threshold`) and the
 *  measured global value flags take the next word, never a slot. */
const IMAGE_PATH_RE = /\.(?:png|jpe?g|webp)$/i;
const VERB_VALUE_FLAGS = Object.freeze({ screenshot: ['--threshold'], record: ['--fps', '--contact-sheet-threshold'], diff: ['-b', '--baseline', '-o', '--output', '--threshold'] });
const READ_FLAGS = Object.freeze({ open: ['--init-script'], goto: ['--init-script'], navigate: ['--init-script'], cookies: ['--curl'], diff: ['-b', '--baseline'] });
/** (2.369.182 integration: `--ca-cert <path>` is no row here — lane H's measured 0.38.1 table refuses it as a
 *  LAUNCH flag (which CAs the browser trusts is VibeSpace's launch decision), so the census counts it `refused`.)
 *  r6 — the OPTIONS the help census (test-browser-verbs) reads as path-shaped
 *  (a `<path>`/`<file>`/`<dir>` placeholder, or save/write/path/file/dir/output
 *  in the description) that are NOT a file slot this table must judge, each with
 *  its reason. Keyed `<verb> <flag>`; `*` = a global option (any verb). A row
 *  the help does not document fails the census (no dead rows). */
const PATH_OPTION_ALLOW = Object.freeze({
  '* --json': 'stdout format ("Output as JSON") — writes no file',
  '* --content-boundaries': 'wraps what is printed on stdout in boundary markers — writes no file',
  '* --max-output': 'truncates what is printed on stdout to N characters — writes no file',
  '* --debug': 'debug lines on the terminal ("Debug output") — writes no file',
  '* --verbose': 'the verbosity of `chat` (refused by name) — writes no file',
  '* --profile': 'VibeSpace\'s own handle flag: stripped before the binary outside a batch, refused as an identity flag inside one — the binary never sees it',
  'cookies --path': 'a cookie\'s URL path (`--path /api`), never a file',
  'mouse --seed': 'a number seeding the pointer\'s movement path, never a file',
  'screenshot --if-changed': 'a boolean ("skip unchanged images to save tokens") — the image goes where the screenshot\'s own path slot says',
  'record --contact-sheet': 'a boolean: the PNGs are written BESIDE the video, whose path is the judged, absolute slot of `record start|restart`',
  'webmcp --params': 'a READ of `@file` resolved in the daemon\'s private cwd (verify r4 Low) — `webmcp` is not in the page table, reachable only through `--`',
});
/** r6 (verify r4 F-B) — ONE screenshot word is a path when it ends in an image
 *  extension, or holds a `/` and does not start like a selector: `#`, `@`, or
 *  `.` not followed by `/` / `../` (measured on 0.38.1: the binary reads
 *  `.x[href="/login"]`, `.x/y`, `@e1/x`, `#d/y` as selectors, `[href="/login"]`,
 *  `a[href="/login"]`, `./c.png`, `sub/noext` as paths; `.shots/a.png` it reads
 *  as a selector and saves to its temp dir — handed absolute it lands where the
 *  agent named it). */
function loneShotIsPath(w) {
  if (IMAGE_PATH_RE.test(w)) return true;
  if (!w.includes('/')) return false;
  if (w[0] === '#' || w[0] === '@') return false;
  return !(w[0] === '.' && !w.startsWith('./') && !w.startsWith('../'));
}
function positionalsFrom(body, from, local = []) {
  const lv = new Set(local); const out = [];
  for (let i = from; i < body.length; i++) {
    const t = body[i];
    if (t === '--') continue;
    if (isFlag(t)) { if (!t.includes('=') && lv.has(t)) { i++; continue; } i = flagEnd(body, i) - 1; continue; }
    out.push(i);
  }
  return out;
}
function pathSlots(words) {
  const body = (Array.isArray(words) ? words : []).map(String);
  const vi = verbAt(body);
  const verb = vi < body.length ? body[vi] : null;
  const slots = [];
  const add = (i, kind, prefix = '') => { if (i >= 0 && i < body.length && !slots.some((x) => x.i === i)) slots.push({ i, kind, prefix, word: prefix ? body[i].slice(prefix.length) : body[i] }); };
  if (verb != null) {
    const pos = positionalsFrom(body, vi + 1, own(VERB_VALUE_FLAGS, verb) || []);
    const w = (k) => (k < pos.length ? body[pos[k]] : null);
    const all = (from, kind) => pos.slice(from).forEach((i) => add(i, kind));
    if (verb === 'download') all(1, 'write');
    else if (verb === 'pdf') all(0, 'write');
    else if (verb === 'screenshot') { if (pos.length >= 2) all(1, 'write'); else if (pos.length === 1 && loneShotIsPath(w(0))) add(pos[0], 'write'); }
    else if (verb === 'upload') all(1, 'read');
    else if (verb === 'state') { if (w(0) === 'save') all(1, 'write'); else if (w(0) === 'load') all(1, 'read'); }
    else if (verb === 'record') { if ((w(0) === 'start' || w(0) === 'restart') && pos.length > 1) add(pos[1], 'write'); }
    else if (verb === 'trace' || verb === 'profiler') { if (w(0) === 'stop') all(1, 'write'); }
    else if (verb === 'network') { if (w(0) === 'har' && w(1) === 'stop') all(2, 'write'); }
  }
  const readFlags = new Set(own(READ_FLAGS, verb) || []);
  const verbWrites = new Set((own(WRITE_VERBS, verb) || {}).flags || []);
  for (let i = 0; i < body.length; i++) {
    const t = body[i];
    if (!isFlag(t) || t === '--') continue;
    const name = flagName(t);
    const kind = WRITE_FLAG_SET.has(name) || verbWrites.has(name) ? 'write' : (readFlags.has(name) ? 'read' : null);
    if (!kind) continue;
    if (t.includes('=')) add(i, kind, name + '=');
    else if (i + 1 < body.length && !isFlag(body[i + 1])) { add(i + 1, kind); i++; }
  }
  return slots.sort((a, b) => a.i - b.i);
}
/** → a copy of `words` with every slot's word replaced by `abs(slot)` (the
 *  prefix of a `--flag=value` form kept). `abs` returns the absolute path. */
function rewriteSlots(words, slots, abs) {
  const out = (Array.isArray(words) ? words : []).map(String);
  for (const s of slots || []) out[s.i] = (s.prefix || '') + abs(s);
  return out;
}

/** r5 F2 (verify r3 MAJOR): THE PHYSICAL PATH — `..` after a symlink steps up
 *  from where the LINK POINTS, never from its spelling. r4 collapsed `..`
 *  lexically (`path.resolve`) and then realpath'd the existing ancestor, so
 *  with `l -> ~/.ssh`, `l/../.ssh/authorized_keys` was judged `<cwd>/.ssh/…`
 *  while the kernel wrote `~/.ssh/authorized_keys` (measured: a 6603-byte %PDF).
 *  Here every component is walked in order: an existing symlink is replaced by
 *  its target (relative to the link's directory; ≤ `maxLinks` hops, then an
 *  error), `..` pops the path RESOLVED SO FAR, a component that does not exist
 *  is kept as spelled. A literal `~` / `~/…` is the home (the binary does NOT
 *  expand it — measured: `pdf '~/x.pdf'` looked for a directory named `~`);
 *  `~user` stays literal (so does the binary). The result is the absolute path
 *  whose existing components are all real directories — the one judged AND the
 *  one handed to the binary. `lstat` / `readlink` are injected (this file
 *  imports nothing). → `{ok:true, path}` | `{ok:false, error}`. */
function physicalPath(word, { base = '/', home = '', lstat, readlink, maxLinks = 40 } = {}) {
  const s = String(word == null ? '' : word);
  if (s.includes('\0')) return { ok: false, error: 'the path holds a NUL byte' };
  let spelled = s;
  if (typeof home === 'string' && home[0] === '/' && (s === '~' || s.startsWith('~/'))) spelled = home + s.slice(1);
  let cur = spelled.startsWith('/') ? '/' : normDir(base);
  if (!cur || cur[0] !== '/') return { ok: false, error: 'no absolute directory to resolve a relative path against' };
  const parent = (d) => { const k = d.lastIndexOf('/'); return k <= 0 ? '/' : d.slice(0, k); };
  const todo = spelled.split('/');
  let hops = 0;
  while (todo.length) {
    const c = todo.shift();
    if (c === '' || c === '.') continue;
    if (c === '..') { cur = parent(cur); continue; }
    const next = cur === '/' ? '/' + c : cur + '/' + c;
    let st = null;
    try { st = lstat(next); } catch { st = null; }
    if (st && typeof st.isSymbolicLink === 'function' && st.isSymbolicLink()) {
      if (++hops > maxLinks) return { ok: false, error: 'too many levels of symbolic links' };
      let t;
      try { t = String(readlink(next)); } catch (e) { return { ok: false, error: `a symbolic link could not be read (${e && e.code || e})` }; }
      if (t.startsWith('/')) cur = '/';
      todo.unshift(...t.split('/'));
      continue;
    }
    cur = next;
  }
  return { ok: true, path: cur };
}

/** r5 F1 (b) — DEFENSE IN DEPTH: THE DIRECTORY A BROWSER DAEMON RUNS IN. A
 *  daemon resolves every relative path it is handed against its own cwd, which
 *  it inherits from whatever launched it; the keeper launched from the SERVER's
 *  cwd (the checkout). So every launch — the keeper's runtime, the paired
 *  machine's, the CLI's own spawn (which starts the daemon when none runs) —
 *  names a private, EMPTY directory: `<tmp>/vibespace-browser-cwd-<uid>` (0700,
 *  a real directory this uid owns, never a symlink), and `daemonCwdVerdict`
 *  refuses a directory that is the checkout, inside it, an ancestor of it (from
 *  `/tmp` a `./<checkout>/data/bin/…` reaches a checkout that lives under /tmp),
 *  or the server's own cwd. `fs` is injected (this file imports nothing). */
const DAEMON_CWD_PREFIX = 'vibespace-browser-cwd-';
function daemonCwdVerdict(dir, { checkout = null, serverCwd = null } = {}) {
  const under = (p, d) => p === d || p.startsWith(d === '/' ? '/' : d + '/');
  const d = normDir(dir);
  const refuse = (why) => R('daemon_cwd_refused', `a browser daemon would run in ${d || '(nothing)'}, ${why} — it resolves every relative path it is handed from there, so nothing was launched`, 'tell the user (the OS temp directory must be a directory outside the VibeSpace checkout)');
  if (!d || d[0] !== '/' || d === '/') return refuse('which is not a private directory');
  const co = checkout ? normDir(checkout) : null;
  if (co && co[0] === '/' && under(d, co)) return refuse(`inside the VibeSpace checkout ${co}`);
  if (co && co[0] === '/' && under(co, d)) return refuse(`an ancestor of the VibeSpace checkout ${co}`);
  if (serverCwd && normDir(serverCwd) === d) return refuse('the server\'s own working directory');
  return null;
}
/** → `{ok:true, dir}` (the realpath) | `{ok:false, code, error, remedy}`: the
 *  first of `tmpdirs` whose `<tmp>/vibespace-browser-cwd-<uid>` can be made or
 *  reused as a private directory and passes `daemonCwdVerdict`. */
function ensureDaemonCwd({ fs, tmpdirs = [], uid = null, checkout = null, serverCwd = null } = {}) {
  let last = null;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  const co = checkout ? (real(checkout) || checkout) : null;
  for (const t of [...new Set((Array.isArray(tmpdirs) ? tmpdirs : []).filter((x) => typeof x === 'string' && x[0] === '/'))]) {
    const base = real(t);
    if (!base) continue;
    const dir = `${normDir(base)}/${DAEMON_CWD_PREFIX}${Number.isInteger(uid) ? uid : 'u'}`;
    try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) { if (!e || e.code !== 'EEXIST') continue; }
    let st = null;
    try { st = fs.lstatSync(dir); } catch { st = null; }
    if (!st || st.isSymbolicLink() || !st.isDirectory() || (Number.isInteger(uid) && st.uid !== uid)) continue;
    if ((st.mode & 0o077) !== 0) { try { fs.chmodSync(dir, 0o700); } catch { continue; } }
    const v = daemonCwdVerdict(dir, { checkout: co, serverCwd });
    if (v) { last = v; continue; }
    return { ok: true, dir };
  }
  return { ok: false, ...(last || R('daemon_cwd_unavailable', 'no private directory could be made for the browser daemon to run in (the OS temp directory is missing, not writable, or somebody else owns the name) — nothing was launched', 'tell the user')) };
}

/**
 * What one `vibespace-browser …` command is. `ours:false` judges a bare page
 * argv (no VibeSpace verbs). `stdin`: the text the caller read from stdin when
 * a batch carried no command as an argument (the first answer says
 * `needsStdin`); the answer then carries `stdinJson`, the ONLY thing to hand
 * the binary (r4). `drift`: the installed binary's version when it is not
 * `TABLE_VERSION` (`versionDrift`) — every flag is then read both ways (r4).
 * A page answer may name `stateFiles` the caller must check before running.
 */
function classify(argv, { ours = true, stdin, drift = null } = {}) {
  const a = (Array.isArray(argv) ? argv : []).map(String);
  // ① `--profile <handle>` is OURS, anywhere (before or after `--`): the
  // browser CLI must never see a handle it would read as a directory
  let profile = null;
  const rest = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--profile') { profile = a[i + 1] ?? ''; i++; continue; }
    if (a[i].startsWith('--profile=')) { profile = a[i].slice('--profile='.length); continue; }
    rest.push(a[i]);
  }
  if (ours) {
    // ② ③
    if (!rest.length || rest[0] === '--help' || rest[0] === '-h') return { kind: 'ours', verb: 'help', sub: null, argv: rest, profile };
    if (OURS_SET.has(rest[0])) return { kind: 'ours', verb: rest[0], sub: rest[1] ?? null, argv: rest, profile };
    // ④
    if (rest[0] === '--') return judge(rest.slice(1), { escape: true, profile, stdin, drift });
  }
  return judge(rest, { escape: false, profile, stdin, drift });
}

/** The census helper the gate uses: which words of a listing collide with ours. */
function collisions(words) { return [...new Set(words)].filter((w) => OURS_SET.has(w)).sort(); }
/** Is this word classified by the table (page or refused by name)? */
function known(word) { return PAGE_SET.has(word) || Object.prototype.hasOwnProperty.call(REFUSED_VERBS, word); }

const normDir = (d) => { let s = String(d || '').replace(/\/{2,}/g, '/'); while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1); return s; };

/**
 * Where the REAL browser CLI lives. Walks PATH in order, skipping empty
 * entries (a relative lookup is never a binary we run), every `shimDirs`
 * entry, and any candidate `isShim(path)` recognizes by content.
 * → `{ok:true, path}` | `{ok:false, code:'binary_absent', error, remedy}`.
 */
function resolveRealBinary({ PATH = '', shimDirs = [], exists = () => false, isShim = () => false, name = REAL_BINARY } = {}) {
  const skip = new Set(shimDirs.filter(Boolean).map(normDir));
  for (const raw of String(PATH || '').split(':')) {
    if (!raw || raw[0] !== '/') continue;
    const dir = normDir(raw);
    if (skip.has(dir)) continue;
    const p = (dir === '/' ? '' : dir) + '/' + name;
    let hit = false;
    try { hit = !!exists(p); } catch { hit = false; }
    if (!hit) continue;
    let shim = false;
    try { shim = !!isShim(p); } catch { shim = false; }
    if (shim) continue;
    return { ok: true, path: p };
  }
  return { ok: false, code: 'binary_absent', error: 'the browser CLI VibeSpace drives is not installed on this machine', remedy: 'ask the user to install it; `vibespace-browser providers` lists what this machine has' };
}

// ── the CONFIG FILE (r3, takeover finding 2) ─────────────────────────────
/** The binary's THIRD precedence tier is a config FILE (config < env < flags):
 *  without AGENT_BROWSER_CONFIG it SEARCHES `~/.agent-browser/config.json`
 *  and then `./agent-browser.json` in whatever directory the command runs
 *  from — measured on 0.32.0: a later `get title` from a directory holding
 *  `{"args":"--remote-debugging-port=41777"}` RELAUNCHED the running browser
 *  with that port open (the launch keys ride every command), so the file was
 *  a twin of every refused launch flag, and a raw CDP road. So the config a
 *  sanctioned command runs with is NAMED, never searched: the server names
 *  the keeper's own file (`config` in the /resolve answer, set on the child
 *  LAST — the file the keeper launched that browser with), and where it names
 *  none (a remote session, an older server) the CLI composes one from this
 *  machine's two files with THIS rule and names it itself.
 *
 *  THE RULE. The user file (the machine's own configuration — the owner's
 *  `args`, `proxy`, `executablePath`, extensions, fence) is carried, minus the
 *  keys that are a raw CDP road (`cdp`, `autoConnect`) and minus the Chrome
 *  switches in `args` that open a debugging endpoint or pick the user-data-dir
 *  (`RAW_ARG_RE`) — whoever wrote them, no FIXED debugging port rides a
 *  file into a browser VibeSpace hands an agent. (r4, measured: 0.32.0 launches
 *  every browser with `--remote-debugging-port=0` whatever the config says, so
 *  a random port always exists; what I3 holds against a same-uid agent is that
 *  the SANCTIONED road never prints it — `get cdp-url` / `connect` refused,
 *  `localSchemeOf` refusing the `chrome://version` + `file://…/DevToolsActive
 *  Port` pages that would — while `ss -ltnp` or that file read by its shell is
 *  §9's trust level.) The PROJECT file lives where
 *  the agent works (a repo it cloned, a file it wrote), so it only NARROWS:
 *  exactly `PROJECT_CONFIG_KEYS` (the fence, the action policy, the
 *  confirmation list, output bounds), and only where the machine's file sets
 *  none — never a launch key, never a replacement of the owner's own value. */
const CONFIG_KEY = 'AGENT_BROWSER_CONFIG';
const PROJECT_CONFIG_KEYS = Object.freeze(['allowedDomains', 'actionPolicy', 'confirmActions', 'confirmInteractive', 'contentBoundaries', 'maxOutput']);
const RAW_CONFIG_KEYS = Object.freeze(['cdp', 'autoConnect']);
/** LANE H VERIFY r4 (MAJOR 2): THE KEEPER'S LAUNCH MARK — a harmless unknown Chrome switch the keeper adds to the `args`
 *  of the config every browser IT launches runs with (`--vibespace-keeper=<profile id | the ephemeral's browser key>`).
 *  Measured on the real 0.38.1: the config's `args` reach the Chrome's (title-rewritten) command line and Chrome runs
 *  normally with it; the environment does not (the binary scrubs its Chrome's). It is how a process is proven the
 *  keeper's own — never the directory it sits in (a human may open that) — so no user or project file may carry it:
 *  it is in RAW_ARG_RE (dropped from both, said like every raw switch) and only the keeper writes it. */
const KEEPER_MARK = '--vibespace-keeper';
const RAW_ARG_RE = /^--(?:remote-debugging-[a-z-]+|remote-allow-origins|user-data-dir|profile-directory|vibespace-keeper)(?:=|$)/;
/** `args` as the binary reads it (a string, comma or newline separated — or a
 *  list), minus the raw-debugging / user-data-dir switches. Untouched (the
 *  same value, byte for byte) when nothing is dropped. */
function sanitizeArgs(v) {
  if (Array.isArray(v)) {
    const dropped = v.filter((x) => RAW_ARG_RE.test(String(x).trim()));
    return { value: dropped.length ? v.filter((x) => !RAW_ARG_RE.test(String(x).trim())) : v, dropped: dropped.map((x) => String(x).trim()) };
  }
  if (typeof v !== 'string') return { value: v, dropped: [] };
  const parts = v.split(/[,\n]/);
  const dropped = parts.map((x) => x.trim()).filter((x) => RAW_ARG_RE.test(x));
  if (!dropped.length) return { value: v, dropped: [] };
  return { value: parts.map((x) => x.trim()).filter((x) => x && !RAW_ARG_RE.test(x)).join(','), dropped };
}
/**
 * → `{ config, dropped: { project: [keys], keys: [keys], args: [switches] } }`.
 * `user` = the machine's file (an object, or null when absent), `project` =
 * the directory's file (null when absent), `deny` = further user keys the
 * caller drops by name (the ephemeral set — browser-profiles' EPHEMERAL_DENY).
 * A narrowing key both files carry keeps the MACHINE's value (the binary's
 * own rule lets the project value win, which could widen a fence) — the
 * project file only ADDS a restriction the machine's file does not set.
 */
function sanctionedConfig({ user = null, project = null, deny = [] } = {}) {
  const u = user && typeof user === 'object' && !Array.isArray(user) ? user : {};
  const p = project && typeof project === 'object' && !Array.isArray(project) ? project : null;
  const out = {};
  const droppedKeys = [];
  const denySet = new Set([...RAW_CONFIG_KEYS, ...(Array.isArray(deny) ? deny : [])]);
  for (const [k, v] of Object.entries(u)) { if (denySet.has(k)) { droppedKeys.push(k); continue; } out[k] = v; }
  const droppedProject = [];
  // a narrowing key the machine's own file already sets is NOT replaced (the binary would let the project
  // value win — a project `allowedDomains: ["*"]` would widen the owner's fence): the project only ADDS
  if (p) for (const [k, v] of Object.entries(p)) { if (PROJECT_CONFIG_KEYS.includes(k) && !Object.prototype.hasOwnProperty.call(u, k)) out[k] = v; else droppedProject.push(k); }
  let droppedArgs = [];
  if ('args' in out) { const a = sanitizeArgs(out.args); out.args = a.value; droppedArgs = a.dropped; }
  return { config: out, dropped: { project: droppedProject, keys: droppedKeys, args: droppedArgs } };
}

// ── the child environment (r1, finding 2; r2: the socket root) ───────────
/** Every refused flag has an ENV TWIN the real binary honours (the 0.32.0
 *  binary's own table: AGENT_BROWSER_CDP / _AUTO_CONNECT / _PROVIDER /
 *  _EXECUTABLE_PATH / _ARGS / _PROXY / _HEADED / _STATE / _PROFILE / _SESSION /
 *  _CONFIG / _RESTORE_* …), and `{ ...process.env }` carried every one the
 *  agent typed into its shell. So the child env is BUILT, never inherited:
 *    ① process.env minus EVERY `AGENT_BROWSER_*` key (agentEnv() strips them
 *      all at spawn, so what is left in a session's shell is either a pair
 *      VibeSpace set or one the agent added — and the server knows which);
 *    ② the keys an agent may set because they only shape OUTPUT (`ENV_PASS`);
 *    ③ rung H only: the scratch user-data-dir the host's prelude exported for
 *      THIS conversation (`hostProfile` names it; any other value is not kept)
 *      and the short socket directory the prelude exports on a long home
 *      (`hostSocketBase` names its base; only `<base>/vs-ab-<this uid>`);
 *    ④ `spawnEnv` — the session's OWN spawn pairs as the server recorded them
 *      (`_browserEnv`), so every kind keeps exactly what it ran with before;
 *    ⑤ the answer's pairs VERBATIM (the lease's decision), then its `unset`;
 *    ⑥ r2 — THE SOCKET ROOT IS IDENTITY, not output: the root decides which
 *      DAEMON a command talks to (`<root>/namespaces/<ns>/run/<session>.sock`;
 *      the binary's precedence is AGENT_BROWSER_SOCKET_DIR > $XDG_RUNTIME_DIR/
 *      agent-browser > $HOME/.agent-browser). r1 kept the shell's SOCKET_DIR
 *      and XDG_RUNTIME_DIR, so `export AGENT_BROWSER_SOCKET_DIR=/tmp/mine`
 *      drove a daemon the keeper never launched, streams, traces or counts —
 *      or one the agent pre-started with any flag it liked. A local answer
 *      names the root the KEEPER's runtime uses for that browser
 *      (`socketDir`, set as AGENT_BROWSER_SOCKET_DIR) and the runtime dir it
 *      runs with (`runtimeDir`, XDG_RUNTIME_DIR set or removed), applied LAST
 *      so no pair or `unset` moves it.
 *  An answer from an older server (no `spawnEnv`) keeps the identity pairs as
 *  the shell has them (`ENV_LEGACY_KEEP`, the pre-r1 behaviour for exactly
 *  these — r4: never AGENT_BROWSER_CONFIG, which `needsConfig` composes); every
 *  launch / CDP / state twin still goes. */
const ENV_PREFIX = 'AGENT_BROWSER_';
// lane L r5 (verify r3 F5): AGENT_BROWSER_SCREENSHOT_DIR is NOT output shape — it is a WRITE TARGET (the directory a
// path-less `screenshot` writes into), the env twin of `--screenshot-dir`, which the write guard judges and hands over
// absolute. An env value would reach the binary unjudged and relative to the daemon's frame, so it is dropped like every
// other twin (said by name); `--screenshot-dir <dir>` on the command is the road
const ENV_PASS = Object.freeze(['AGENT_BROWSER_JSON', 'AGENT_BROWSER_DEBUG', 'AGENT_BROWSER_COLOR', 'AGENT_BROWSER_ANNOTATE', 'AGENT_BROWSER_MAX_OUTPUT', 'AGENT_BROWSER_CONTENT_BOUNDARIES', 'AGENT_BROWSER_SCREENSHOT_FORMAT', 'AGENT_BROWSER_SCREENSHOT_QUALITY', 'AGENT_BROWSER_DEFAULT_TIMEOUT']);
const SOCKET_KEY = 'AGENT_BROWSER_SOCKET_DIR';
const RUNTIME_KEY = 'XDG_RUNTIME_DIR';
// r4 (takeover finding 4): AGENT_BROWSER_CONFIG is NOT kept on the legacy path either — the r3 rule is that
// the config is never the shell's, so an answer naming neither spawn pairs nor a config composes one
const ENV_LEGACY_KEEP = Object.freeze(['AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_IDLE_TIMEOUT_MS', SOCKET_KEY]);
const ENV_PASS_SET = new Set(ENV_PASS);
const ENV_LEGACY_SET = new Set(ENV_LEGACY_KEEP);
/** Rung H: `$HOME/.vibespace/browser-profiles/<name>` (browser-profiles'
 *  REMOTE_SCRATCH_DIR_SH + the conversation's session name). */
const hostProfilePath = (home, name) => `${String(home || '').replace(/\/+$/, '')}/.vibespace/browser-profiles/${name}`;
/** Rung H: the short per-uid socket directory the remote prelude exports on a
 *  long home — `<base>/vs-ab-<uid>`, the same spelling as browser-profiles'
 *  `socketDirDecision().dir` (test-browser-verbs pins the two agree). */
const hostSocketDirPath = (base, uid) => `${String(base || '').replace(/\/+$/, '')}/vs-ab-${uid}`;
const pairsMap = (pairs) => {
  const m = {};
  for (const kv of Array.isArray(pairs) ? pairs : []) { const s = String(kv); const i = s.indexOf('='); if (i > 0) m[s.slice(0, i)] = s.slice(i + 1); }
  return m;
};
const absPath = (v) => typeof v === 'string' && v.length > 1 && v[0] === '/' && !v.includes('\0');
/**
 * → `{ env, dropped }`: `dropped` = the AGENT_BROWSER_* keys of `base` the
 * agent ADDED (not the session's own spawn pairs) whose value does not reach
 * the child, and XDG_RUNTIME_DIR when the answer replaced or removed the
 * shell's — the CLI says them once on stderr, names only, never values.
 */
function childEnv(base, answer = {}, { home = '', uid = null, ownDir = null } = {}) {
  const a = answer || {};
  const src = base || {};
  const known = Array.isArray(a.spawnEnv);
  const own = pairsMap(a.spawnEnv);
  const hostSock = typeof a.hostSocketBase === 'string' && absPath(a.hostSocketBase) && Number.isInteger(uid) && uid >= 0 ? hostSocketDirPath(a.hostSocketBase, uid) : null;
  const env = {};
  for (const [k, v] of Object.entries(src)) {
    if (!k.startsWith(ENV_PREFIX)) { env[k] = v; continue; }
    if (ENV_PASS_SET.has(k)) { env[k] = v; continue; }
    if (k === 'AGENT_BROWSER_PROFILE' && a.hostProfile && home && v === hostProfilePath(home, a.hostProfile)) { env[k] = v; continue; }
    // r3: the prelude exported it only after `[ -d ] && [ ! -L ] && [ -O ]` — the keep asks the same
    // (`ownDir`, injected: a real directory, not a symlink, this uid's), so a pre-planted link is dropped
    if (k === SOCKET_KEY && hostSock && v === hostSock && (typeof ownDir !== 'function' || ownDir(v))) { env[k] = v; continue; }
    if (!known && ENV_LEGACY_SET.has(k)) { env[k] = v; continue; }
  }
  Object.assign(env, own, pairsMap(a.env));
  for (const k of Array.isArray(a.unset) ? a.unset : []) delete env[k];
  // ⑥ the keeper's socket root — last, so nothing above can move it
  if (absPath(a.socketDir)) {
    env[SOCKET_KEY] = a.socketDir;
    if (Object.prototype.hasOwnProperty.call(a, 'runtimeDir')) {
      if (absPath(a.runtimeDir)) env[RUNTIME_KEY] = a.runtimeDir;
      else delete env[RUNTIME_KEY];
    }
  }
  // ⑦ r3 — THE CONFIG IS NAMED: the keeper's file for this browser, last; with
  // none named and none among the server's pairs the caller must compose one
  // (`needsConfig`) — the child never searches ./agent-browser.json
  if (absPath(a.config)) env[CONFIG_KEY] = a.config;
  const dropped = Object.keys(src).filter((k) => k.startsWith(ENV_PREFIX) && env[k] !== src[k]
    && !(known ? own[k] === src[k] : (ENV_LEGACY_SET.has(k) && k !== SOCKET_KEY)));
  if (Object.prototype.hasOwnProperty.call(src, RUNTIME_KEY) && env[RUNTIME_KEY] !== src[RUNTIME_KEY]) dropped.push(RUNTIME_KEY);
  return { env, dropped: dropped.sort(), needsConfig: !absPath(env[CONFIG_KEY]) };
}

module.exports = {
  REAL_BINARY, SHIM_MARKER, OURS, PAGE_VERBS, REFUSED_VERBS, IDENTITY_FLAGS, RAW_CDP_FLAGS, LAUNCH_FLAGS, OPEN_FLAGS, PASS_FLAGS,
  ENV_PASS, ENV_LEGACY_KEEP, SOCKET_KEY, VALUE_FLAGS: Object.freeze([...VALUE_FLAGS]), BOOL_FLAGS: Object.freeze([...BOOL_FLAGS]), GET_NOUNS,
  classify, splitWords, collisions, known, resolveRealBinary, childEnv, hostProfilePath, hostSocketDirPath,
  CONFIG_KEY, PROJECT_CONFIG_KEYS, RAW_CONFIG_KEYS, RAW_ARG_RE, sanitizeArgs, sanctionedConfig,
  KEEPER_MARK, // lane H verify r4: the keeper's launch mark (only the keeper writes it)
  // r4
  TABLE_VERSION, versionDrift, NAV_VERBS, localSchemeOf, stateFileVerdict, parseBatchStdin,
  // lane L r2
  SECRET_HOME_DIRS, SECRET_DATA_DIRS, secretUploadRoots, uploadPathVerdict,
  // lane L r4
  WRITE_VERBS, WRITE_FLAGS, READ_FLAGS, PATH_OPTION_ALLOW, writeTargetsAt, writePathVerdict,
  // lane L r5: the frame rule (exact path slots, the physical path, the daemon's directory)
  SECRET_COMPONENTS, IMAGE_PATH_RE, pathSlots, rewriteSlots, physicalPath, DAEMON_CWD_PREFIX, daemonCwdVerdict, ensureDaemonCwd, verbAt,
};
