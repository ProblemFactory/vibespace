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
});

/** Flags that decide WHICH browser a command lands on — the lease decides. */
const IDENTITY_FLAGS = Object.freeze(['--session', '--namespace', '--session-name', '--config', '--state', '--restore', '--restore-save', '--restore-check-url', '--restore-check-text', '--restore-check-fn']);
const RAW_CDP_FLAGS = Object.freeze(['--cdp', '--auto-connect']);
/** Flags that describe how the browser is LAUNCHED — VibeSpace launches it. */
const LAUNCH_FLAGS = Object.freeze(['--executable-path', '--provider', '-p', '--engine', '--extension', '--args', '--user-agent', '--proxy', '--proxy-bypass', '--headed', '--webgpu', '--allowed-domains', '--action-policy', '--confirm-actions', '--confirm-interactive', '--init-script', '--enable', '--ignore-https-errors', '--allow-file-access', '--color-scheme', '--download-path', '--no-auto-dialog', '--hide-scrollbars', '--idle-timeout']);
/** Per-PAGE launch-looking flags that pass beside `open` (D12). */
const OPEN_FLAGS = Object.freeze(['--enable', '--init-script']);
/** Output/format flags that pass through (documentation; an unknown flag also
 *  passes — subcommands own many: --clear, --bail, --baseline, --url …). */
const PASS_FLAGS = Object.freeze(['--json', '--annotate', '--screenshot-dir', '--screenshot-quality', '--screenshot-format', '--content-boundaries', '--max-output', '--debug', '-i', '-c', '-d', '-s', '--full', '--load', '--text', '--url', '--fn', '--stdin', '-b', '--pin-tab', '--interactive', '--compact', '--depth', '--selector']);
/** THE BINARY'S OWN GLOBAL FLAGS, BY ARITY — MEASURED, never read off its
 *  --help (r3). 0.32.0 strips a global flag ANYWHERE in the argv, so every
 *  decision below that names "the verb" or "the noun" is only as good as this
 *  table: a value flag missing from VALUE_FLAGS is read as a boolean and its
 *  VALUE becomes the noun (`get --idle-timeout 5m cdp-url` printed the raw
 *  endpoint — `--idle-timeout` is documented only as an ENVIRONMENT variable,
 *  so the r2 census over the help's option sections never saw it). The table
 *  is the launch-free measurement in scripts/fixtures/browser-verbs/global-
 *  flags-0.32.0.json (`<flag> zzq9 session list` for every flag-shaped string
 *  in the binary: a value flag swallows zzq9, a boolean leaves it as the
 *  unknown command, a non-global flag is itself the unknown command); the fast
 *  gate holds these two sets EQUAL to it and the heavy gate re-measures the
 *  installed binary. `--config` answers "config file not found" for zzq9 (a
 *  value flag whose value is checked first); `--help`/`-h`/`--version`/`-V`
 *  print and exit. */
const VALUE_FLAGS = new Set(['--action-policy', '--allowed-domains', '--args', '--cdp', '--color-scheme', '--config', '--confirm-actions', '--device', '--download-path', '--enable', '--engine', '--executable-path', '--extension', '--headers', '--idle-timeout', '--init-script', '--max-output', '--model', '--namespace', '--profile', '--provider', '--proxy', '--proxy-bypass', '--restore', '--restore-check-fn', '--restore-check-text', '--restore-check-url', '--restore-save', '--screenshot-dir', '--screenshot-format', '--screenshot-quality', '--session', '--session-name', '--state', '--user-agent', '-p']);
/** …and the global BOOLEANS (each takes an optional `true`/`false`). */
const BOOL_FLAGS = new Set(['--allow-file-access', '--annotate', '--auto-connect', '--confirm-interactive', '--content-boundaries', '--debug', '--fix', '--headed', '--hide-scrollbars', '--ignore-https-errors', '--json', '--no-auto-dialog', '--offline', '--quick', '--quiet', '--verbose', '--webgpu', '-q', '-v']);
/** r4 — THE VERSION THE TABLES ABOVE WERE MEASURED ON (the fixture's). The
 *  heavy gate re-measures only where it runs; a user's box may carry another
 *  build, whose flags may have changed ARITY. So the CLI reads the version off
 *  the binary it is about to run (`--version`, launch-free, ~2 ms measured)
 *  and, when it is not this one, judges EVERY flag under both readings
 *  (`classify(…, {drift})`) and says so once — the table stops being trusted
 *  exactly where it was never measured. */
const TABLE_VERSION = '0.32.0';
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
const NAV_VERBS = Object.freeze(['open', 'goto', 'navigate', 'tab', 'window', 'pushstate', 'diff', 'read', 'vitals', 'record']);
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

/**
 * Judge a page-side argv (no `--profile` of ours left in it): the flag rules
 * first, then the verb table. `escape` = it came after `--` (an unknown verb
 * passes as `escape`); `inBatch` = one line of a batch (`--profile` there is
 * the browser CLI's own directory flag ⇒ an identity flag; no escape; no
 * nested batch).
 */
function judge(body, opts = {}) {
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
    }
    return { kind: 'page', verb, sub: null, argv: body, profile, escape, lines: cmds.length, ...(stdinJson != null ? { stdinJson } : {}), ...(stateFiles.length ? { stateFiles } : {}) };
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
const RAW_ARG_RE = /^--(?:remote-debugging-[a-z-]+|remote-allow-origins|user-data-dir|profile-directory)(?:=|$)/;
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
const ENV_PASS = Object.freeze(['AGENT_BROWSER_JSON', 'AGENT_BROWSER_DEBUG', 'AGENT_BROWSER_COLOR', 'AGENT_BROWSER_ANNOTATE', 'AGENT_BROWSER_MAX_OUTPUT', 'AGENT_BROWSER_CONTENT_BOUNDARIES', 'AGENT_BROWSER_SCREENSHOT_DIR', 'AGENT_BROWSER_SCREENSHOT_FORMAT', 'AGENT_BROWSER_SCREENSHOT_QUALITY', 'AGENT_BROWSER_DEFAULT_TIMEOUT']);
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
  // r4
  TABLE_VERSION, versionDrift, NAV_VERBS, localSchemeOf, stateFileVerdict, parseBatchStdin,
};
