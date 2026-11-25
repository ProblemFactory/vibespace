// lane setting-doors — THE CHROME-STORE CENSUS (主开发's GO 2026-11-16 02:38Z, after the night a LOCKED login keyring hung every
// heavy Chrome suite that reached it: 14 suites to their full budget twice, on any sha). A suite's Chrome must never reach a
// person's keyring, locked or not: every Chrome a suite launches carries scripts/scratch.mjs CHROME_STORE (Chrome's basic store
// flag + the mock keychain — the product's own src/browser-attach.js PROFILE_STORE, pinned equal), so it keeps its cookies in its
// own profile and never asks the session bus's Secret Service.
// A LAUNCH IS JUDGED BY WHAT IS LAUNCHED (主开发's check of d3d571afe, 03:13Z — a spawn imported under another name and a
// promisified execFile were not seen at all): ANY call whose PROGRAM is named like Chrome (CHROME, chromeBin, a …/chrome path),
// whatever the callee is called — or a call of a child-process spawner under ANY of its names (spawn / spawnSync / execFile /
// execFileSync, an `import { spawn as sp }`, a `const { spawn: sp } = require(…)`, a `promisify(execFile)`, a plain alias) whose
// argv holds a Chrome marker (the remote-debugging port or pipe, headless — one dash or two) inline, or as an array variable of
// the same file it names or spreads. A Chrome launch whose argv the census cannot read is UNREAD — red, never skipped.
// A MISS IS NEVER SILENT: a file of the scope whose TEXT holds a Chrome marker but no launch is UNCOVERED — red — unless it is a
// NAMED ROW (ROWS: a fixture, a string, a product argv, a fake — each read, with its reason); a row whose file no longer holds a
// marker, or now holds a launch, is STALE — red. The census and the lane's insertion script read THIS module.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const MARK = /^--?(remote-debugging-port|remote-debugging-pipe|headless)\b/;
// REACH (B-9dd0 r528): scripts/test-*.mjs and the scripts/ modules a suite imports by `from './x.mjs'` — not a dynamic import(), a
// require, a ./lib/ path, a second-level import or a .cjs file; a launch whose argv is no array literal is caught only when its file has
// no other launch (the TEXT_MARK coverage is per file). Today every other file with a Chrome marker is a dbg-* / measure-* / probes/* tool.
export const TEXT_MARK = /remote-debugging-(?:port|pipe)\b|--headless\b/;   // the coverage reading: the file's whole TEXT (a comment and a string included)
const SPAWNERS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);
const CHROMEISH = /chrom/i;
const strOf = (n) => (!n ? null : n.type === 'Literal' && typeof n.value === 'string' ? n.value : n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join('${}') : null);
const isArgv = (a) => !!a && a.type === 'ArrayExpression' && a.elements.some((e) => e && MARK.test(strOf(e) || ''));
/** the array carries the store: a spread of CHROME_STORE, or Chrome's basic store flag as a literal — THE TREE DOES BOTH (主开发 12:21Z):
 *  most launches spread scripts/scratch.mjs CHROME_STORE; some suites write the basic store flag alone (no mock keychain) — accepted
 *  here because that flag is what keeps Chrome off the session bus's Secret Service; «every launch carries the constant» is not true */
/** B-9dd0 unit 2: the array quiets Chrome's background network roads — a spread of scripts/scratch.mjs CHROME_QUIET, or the
 *  background-networking switch as a literal (the one that turns the most roads off) */
export const quiets = (a) => a.elements.some((e) => e && ((e.type === 'SpreadElement' && e.argument.type === 'Identifier' && e.argument.name === 'CHROME_QUIET') || /^--disable-background-networking$/.test(strOf(e) || '')));
// B-9dd0 unit 2 (主开发 r528, MUST 1): A WRAPPED LAUNCH — the spawned program is not Chrome (a shell, a limit wrapper, a display
// wrapper, nice, env) and Chrome's program is an ELEMENT of its argv: the switches count only AFTER that element (before it they are
// the wrapper's own options — /bin/sh refuses an unknown long option and Chrome never starts)
export const chromeAt = (a) => a.elements.findIndex((e) => !!e && ((e.type === 'Identifier' && /chrom/i.test(e.name)) || /\/(google-)?chrom(e|ium)(-stable|-browser)?$/i.test(strOf(e) || '')));
export const quietsAfter = (a, at) => quiets({ elements: a.elements.slice(at + 1) });
export const carries = (a) => a.elements.some((e) => e && ((e.type === 'SpreadElement' && e.argument.type === 'Identifier' && e.argument.name === 'CHROME_STORE') || /^--password-store=basic$/.test(strOf(e) || '')));
function walk(n, f, up = null) { if (!n || typeof n.type !== 'string') return; f(n, up); for (const k of Object.keys(n)) { if (k === 'start' || k === 'end' || k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, f, n); } else if (v && typeof v.type === 'string') walk(v, f, n); } }
const nameOf = (c) => (!c ? null : c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null);
const progName = (x) => (!x ? '' : x.type === 'Identifier' ? x.name : x.type === 'MemberExpression' ? (nameOf(x) || '') + ' ' + progName(x.object) : '');
const CHROME_PATH = /\/(google-)?chrom(e|ium)(-stable|-browser)?$/i;
// NOT A BROWSER (主开发's verdict 2026-11-17 12:21Z — the census put the store flags in front of NODE's own options in three fake-Chrome
// holders, and into a LibreOffice conversion): a spawn of the RUNTIME ITSELF (process.execPath, `node`) is never a Chrome launch, whatever
// its argv says (a holder that only LOOKS like Chrome to the code under test); a program named as a non-browser (an office suite) whose
// only mark is a bare headless flag is a conversion, not a Chrome.
const isRuntime = (p) => !!p && ((p.type === 'MemberExpression' && nameOf(p) === 'execPath' && p.object.type === 'Identifier' && p.object.name === 'process') || (p.type === 'Literal' && /^(node|nodejs)$/.test(String(p.value))));
const NOT_BROWSER = /office|soffice|libreoffice/i;
const onlyHeadless = (arr) => arr.elements.every((e) => !e || !MARK.test(strOf(e) || '') || /^--?headless\b/.test(strOf(e) || ''));

/** one file's source → { launches: [{ line, carried, open }], unread: [{ line, argv }], parsed } — `open` = just after the argv's `[` */
export function launchesOf(src, { acorn }) {
  const code = String(src).replace(/^#!.*/, (m) => ' '.repeat(m.length));
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowHashBang: true }); }
  catch (e) { return { launches: [], unread: [], parsed: false, error: e.message }; }
  const arrays = new Map();   // a variable → the array literal it is declared with (one file, by name)
  walk(ast, (n) => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'ArrayExpression') arrays.set(n.id.name, n.init); });
  // THE SPAWNER'S OTHER NAMES: an import alias, a require destructuring with a rename, a promisify(…) of a spawner, a plain alias
  const aliases = new Set();
  const isSp = (x) => !!x && ((x.type === 'Identifier' && (SPAWNERS.has(x.name) || aliases.has(x.name))) || (x.type === 'MemberExpression' && SPAWNERS.has(nameOf(x))));
  for (let pass = 0; pass < 3; pass++) walk(ast, (n) => {
    if (n.type === 'ImportSpecifier' && n.imported && SPAWNERS.has(n.imported.name || n.imported.value)) aliases.add(n.local.name);
    if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern') for (const pr of n.id.properties) if (pr.type === 'Property' && !pr.computed && SPAWNERS.has(pr.key.name || pr.key.value) && pr.value.type === 'Identifier') aliases.add(pr.value.name);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      const i = n.init;
      if (isSp(i)) aliases.add(n.id.name);
      if (i.type === 'CallExpression' && nameOf(i.callee) === 'promisify' && isSp(i.arguments[0])) aliases.add(n.id.name);
    }
  });
  const lineOf = (at) => code.slice(0, at).split('\n').length;
  const seen = new Set(), launches = [], unread = [];
  // `wrapped` (MUST 1): a launch whose program is not Chrome and whose argv holds Chrome's program — {at: its element, quietAt: where the
  // spread stands (-1: none)}; its `open` is right after Chrome's element (where the switches belong)
  const take = (arr, chromeProg = true) => {
    if (!arr || seen.has(arr.start)) return; seen.add(arr.start);
    const at = chromeProg ? -1 : chromeAt(arr), next = at >= 0 ? arr.elements[at + 1] : null;
    const quietAt = arr.elements.findIndex((e) => !!e && e.type === 'SpreadElement' && e.argument.type === 'Identifier' && e.argument.name === 'CHROME_QUIET');
    // B-9dd0 (主开发 r3727): `spread` — the launch spreads CHROME_QUIET itself (after Chrome's element when wrapped), so it carries
    // scratch.mjs's names rule (a literal background switch quiets, but brings no rule); `named` — its own list names the switch
    const spread = at >= 0 ? quietAt > at : quietAt >= 0, named = arr.elements.some((e) => !!e && NAMES_SWITCH.test(strOf(e) || ''));
    launches.push({ line: lineOf(arr.start), carried: carries(arr), quiet: at >= 0 ? quietsAfter(arr, at) : quiets(arr), spread, named, wrapped: at >= 0 ? { at, quietAt } : null, open: at >= 0 && next ? next.start : arr.start + 1 });
  };
  walk(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const p0 = n.arguments[0];
    const chromeProg = CHROMEISH.test(progName(p0)) || (!!p0 && p0.type === 'Literal' && typeof p0.value === 'string' && CHROME_PATH.test(p0.value));
    const sp = isSp(n.callee);
    if (!chromeProg && !sp) return;   // judged by WHAT is launched: a Chrome program under any callee, or a spawner under any name
    const a = n.arguments[1];
    const cand = !a ? [] : a.type === 'Identifier' ? [arrays.get(a.name)] : a.type === 'ArrayExpression' ? [a, ...a.elements.filter((e) => e && e.type === 'SpreadElement' && e.argument.type === 'Identifier').map((e) => arrays.get(e.argument.name))] : [];
    const argvs = cand.filter(isArgv);
    if (!chromeProg && isRuntime(p0)) return;   // the runtime itself: a holder, never a Chrome
    if (!chromeProg && argvs.length && NOT_BROWSER.test(`${progName(p0)} ${strOf(p0) || ''}`) && argvs.every(onlyHeadless)) return;   // an office conversion's bare --headless
    if (argvs.length) { for (const x of argvs) take(x, chromeProg); return; }
    if (!chromeProg) return;   // a spawner whose argv holds no marker: no Chrome
    const arr = a && a.type === 'ArrayExpression' ? a : a && a.type === 'Identifier' ? arrays.get(a.name) : null;
    if (arr) take(arr);   // a spawner under any name, or a suite's own wrapper, given a Chrome program and an argv array
    else if (sp) unread.push({ line: lineOf(n.start), argv: a ? { start: a.start, end: a.end } : null });   // a SPAWNER of a Chrome whose argv cannot be read — the lane's script wraps it [...CHROME_STORE, ...argv]
    // (a non-spawner given a Chrome program and no argv array — fs.existsSync(CHROME), path.join(chromeDir, …) — launches nothing)
  });
  return { launches, unread, parsed: true };
}

/** the scope: every scripts/test-*.mjs, and every scripts/ module a suite imports (a boot module launches Chrome for its suites) */
export function filesOf(repo) {
  const dir = path.join(repo, 'scripts'), tests = fs.readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f));
  const mods = new Set();
  for (const f of tests) for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\bfrom\s*'\.\/((?!test-)[\w.-]+\.mjs)'/g)) mods.add(m[1]);
  return [...tests, ...[...mods].filter((m) => fs.existsSync(path.join(dir, m)))].sort().map((f) => 'scripts/' + f);
}

/** B-9dd0 (主开发 r3727): THE NAMES RULE has ONE place — scripts/scratch.mjs chromeNames, carried by CHROME_QUIET (and chromeBelt): a
 *  file of the scope whose TEXT names the switch is red BY NAME unless it is a row here, each READ (a launch never builds a list of
 *  its own around the rule: Chrome keeps the LAST copy of a switch) */
export const NAMES_SWITCH = /--host-resolver-rules\b/;
export const NAMES_ROWS = Object.freeze({
  'scripts/scratch.mjs': 'THE ONE PLACE: chromeNames builds the names rule; CHROME_QUIET carries it, chromeBelt and a suite\'s own names (map / own) use it; DRIVER_NAMES is the agent browser driver\'s ONE comma-free rule (B-8695), driverArgs its builder',
  'scripts/test-tailnet-reach-chrome.mjs': 'a COMMENT naming the switch (the attach road\'s names); its driver line takes scratch.mjs DRIVER_NAMES (B-8695) and its own Chromes take chromeNames (RULES)',
  'scripts/test-architecture.mjs': 'the census\'s own controls (§47d): planted launch texts that name the switch',
});

/** B-8695 (主开发 r4364): THE AGENT BROWSER's DRIVER LINE — the real driver launches its own Chrome with ONE line of switches (a scratch
 *  HOME's ~/.agent-browser/config.json `args`, or AGENT_BROWSER_ARGS), cut at every comma and line break (scratch.mjs DRIVER_NAMES says
 *  where that is read). Every line of a file of the scope that names that config or hands that variable is BUILT by scratch.mjs
 *  driverArgs ON THAT LINE (so the line carries DRIVER_NAMES, the one rule), or it is counted in a row here, each READ: a fake driver's
 *  fixture, a path or a read, a launch-free leg (`n` = how many; a count that moves is red, as is a row's `pin` that no longer holds).
 *  And the quiet list joined by a comma is red WHEREVER it stands: the driver cuts its names rule into the catch-all alone (which takes
 *  127.0.0.1 too) and stray words — the 2.369.419 shape of three real-driver suites, cured by this unit. */
export const DRIVER_LINE = /['"]\.agent-browser['"]\s*,\s*['"]config\.json['"]|\bAGENT_BROWSER_ARGS['"]?\s*:/;
export const DRIVER_BUILT = /\bdriverArgs\(/;
export const QUIET_JOINED = /\bCHROME_QUIET\s*\.\s*join\s*\(/;
export const DRIVER_ROWS = Object.freeze({
  'scripts/test-browser-builds-keeper.mjs': { n: 1, why: 'a FAKE driver (FAKE_BIN): the egress home\'s config.json fixture (pac and ozone switches) the keeper reads and asserts — no Chrome starts' },
  'scripts/test-browser-display-chrome.mjs': { n: 1, why: 'the user config\'s PATH (UCFG); the file it writes holds OWNER_ARGS, built by driverArgs on its own line (the pin)', pin: /const OWNER_ARGS = driverArgs\(/ },
  'scripts/test-browser-display.mjs': { n: 3, why: 'in-process over a FAKE driver: a read inside the fake\'s source and two config PATHS the display reader is handed — no Chrome' },
  'scripts/test-browser-env.mjs': { n: 2, why: 'in-process: config.json fixtures for the environment builder under test — no driver runs' },
  'scripts/test-browser-ephemeral.mjs': { n: 1, why: 'FAKE Chromes (node) under a fake driver: a config PATH — no Chrome' },
  'scripts/test-browser-kept.mjs': { n: 5, why: 'a FAKE driver: kept-profile config.json fixtures the keeper reads — no Chrome' },
  'scripts/test-browser-mediation-chrome.mjs': { n: 2, why: 'r3\'s user config whose executablePath is a recording shell script (exit 1: no Chrome), and a decoy shell environment (AGENT_BROWSER_ARGS among the twins the mediation refuses) handed to the VibeSpace CLI under test — neither reaches a Chrome' },
  'scripts/test-browser-pin.mjs': { n: 2, why: 'a FAKE driver: pin config.json fixtures — no Chrome' },
  'scripts/test-browser-profiles.mjs': { n: 16, why: 'fifteen config.json FIXTURES for the profile readers under test, and one real-binary leg that is LAUNCH-FREE (session info --json; a tab list refused before any launch) — no Chrome starts' },
  'scripts/test-browser-share-model.mjs': { n: 1, why: 'a FAKE driver (the share model over a node stand-in): a config.json fixture — no Chrome' },
  'scripts/test-browser-stderr-pipe-real.mjs': { n: 1, why: 'quietLeg hands AGENT_BROWSER_ARGS its PARAMETER; both callers build it with driverArgs (the pin)', pin: /quietLeg\('bspd', driverArgs\([\s\S]*quietLeg\('bspc', BE\.withQuietLogging\(driverArgs\(/ },
  'scripts/test-browser-stop-verb.mjs': { n: 1, why: 'a FAKE driver: a config.json fixture — no Chrome' },
  'scripts/test-browser-verbs.mjs': { n: 3, why: 'the sanitizer under test: AGENT_BROWSER_ARGS among the twins it refuses, a config PATH, and a config whose executablePath is a recording script — judged as data, no Chrome' },
  'scripts/test-migrations.mjs': { n: 1, why: 'a PATH a migration\'s guard is asked about (absentOr), never written' },
  'scripts/test-tailnet-browsers.mjs': { n: 2, why: 'a FAKE driver: config.json fixtures for the tailnet switch\'s carrying — no Chrome' },
});
/** the driver line's census over a tree → { files, built, unbuilt: [{file, line}], moved: [{file, n, want, lines}], unpinned: [file],
 *  joined: [{file, line}], stale: [file] }. `patch` = a file's text replaced, `extra` = more files read as if in the scope (planted
 *  controls), `rows` = the counted rows */
export function driverCensus(repo, { patch = {}, extra = {}, rows = DRIVER_ROWS } = {}) {
  const out = { files: 0, built: 0, unbuilt: [], moved: [], unpinned: [], joined: [], stale: [] };
  for (const f of [...filesOf(repo), ...Object.keys(extra)]) {
    const src = f in extra ? extra[f] : f in patch ? patch[f] : fs.readFileSync(path.join(repo, f), 'utf8');
    const open = []; let named = false;
    src.split('\n').forEach((l, i) => {
      if (QUIET_JOINED.test(l)) out.joined.push({ file: f, line: i + 1 });
      if (!DRIVER_LINE.test(l)) return;
      named = true;
      if (DRIVER_BUILT.test(l)) out.built++; else open.push(i + 1);
    });
    if (named) out.files++;
    const row = rows[f];
    if (row) { if (open.length !== row.n) out.moved.push({ file: f, n: open.length, want: row.n, lines: open }); if (row.pin && !row.pin.test(src)) out.unpinned.push(f); }
    else for (const line of open) out.unbuilt.push({ file: f, line });
  }
  for (const f of Object.keys(rows)) if (!fs.existsSync(path.join(repo, f)) && !(f in extra)) out.stale.push(f);
  return out;
}

/** THE ONE EXEMPT ROW: a suite that brings its OWN Secret Service on a private bus — never the person's (its pin: the private address) */
export const EXEMPT = Object.freeze({
  'scripts/test-app-display-secrets-chrome.mjs': { why: 'it tests Chrome\'s OSCrypt key in a Secret Service — its OWN, started on the plan\'s private bus (DBUS_SESSION_BUS_ADDRESS = plan.address); never the session bus a lane inherits', pin: /DBUS_SESSION_BUS_ADDRESS: plan\.address/ },
});

/** THE NAMED ROWS — files whose text holds a Chrome marker and that launch no Chrome of their own, each READ (主开发 03:13Z) */
export const ROWS = Object.freeze({
  'scripts/test-browser-builds-keeper.mjs': 'a PRODUCT argv it asserts: the engine plugin\'s launch rows (splitLaunchArgs, the forbidden-switch census) — it launches no Chrome (B-7e49: the legs moved verbatim from test-browser-builds, its heavy twin)',
  'scripts/test-browser-display-chrome.mjs': 'its markers are COMMENTS; its Chrome is launched by the REAL agent-browser CLI it drives (the vendor\'s own launch, with the owner\'s config args) — not a launch of this suite',
  'scripts/test-browser-orphans.mjs': 'process-table FIXTURES: rows whose argv names a Chrome (pid, ppid, starttime) for the orphan judge — its children are /bin/sleep and node, never Chrome',
  'scripts/test-browser-profiles.mjs': 'a config FIXTURE: an agent-browser.json / config.json whose `args` STRING names the debugging port, written to disk for the reader under test',
  'scripts/test-browser-ephemeral.mjs': 'FAKE Chromes: node processes (process.execPath -e CHROME_SRC) that a test starts with Chrome-shaped argv (--user-data-dir, --headless=new) as a person\'s hand-started browser for the keeper to judge — node, never Chrome; the store flags are NOT node options (主开发 12:21Z: node answers «bad option» and exits 9)',
  'scripts/test-browser-share-model.mjs': 'a FAKE Chrome: a node process (process.execPath -e …) with a hand-launched CLI Chrome\'s argv (--remote-debugging-port=0, no mark) on a kept directory — node, never Chrome; the store flags are NOT node options',
  'scripts/test-remote-profile-start.mjs': 'lock-holder FACTS (B-e799): Chrome-shaped command-line STRINGS (--user-data-dir, the CLI\'s --remote-debugging-port=0, a launch mark) handed to the PURE stop outcome and the profile-lock verdict — it launches no Chrome',
  'scripts/test-browser-providers.mjs': 'an ERROR-TEXT assertion: a regex over the provider\'s cdp_unreachable message naming the debugging port',
  'scripts/test-browser-rejudge.mjs': 'a FAKE Chrome: a node process (process.execPath -e FAKE_CHROME_SRC) carrying Chrome-like argv inside a fake daemon\'s SOURCE STRING',
  'scripts/test-browser-switch.mjs': 'a fake engine plugin\'s SOURCE STRING (FAKE_FILE) whose launchArgs name the debugging port — a fixture, never run as Chrome',
  'scripts/test-browser-verbs.mjs': 'the sanitizer under test: sanitizeArgs / sanctionedConfig inputs that name the debugging port, judged as data',
  'scripts/test-ci-gate-reaper.mjs': 'process-table FIXTURES for the scratch reaper (mk / mk3 rows whose argv or raw command names a headless Chrome)',
  'scripts/test-ci-gate-tiers.mjs': 'a tier census\'s own REGEX table and a planted suite TEXT (a string) that holds the markers',
  'scripts/test-ci-gate.mjs': 'a sentence naming the headless switch, and markers BUILT by concatenation for the gate\'s own census controls',
  'scripts/test-memory-pressure.mjs': 'process-table FIXTURES (P rows: pid, ppid, rss, name, a command line naming a Chrome) for the pressure reader',
  // read by the lane beyond 主开发's list (they hold Chrome's basic store flag literally, or are scripts/ modules a suite imports)
  'scripts/test-browser-keeper.mjs': 'the PRODUCT\'s launch argv it asserts (WANT, argvVerdict, the sync census\'s planted literal) — never a real Chrome (B-7e49: its legs over the fake are in test-browser-keeper-launch)',
  'scripts/test-browser-keeper-launch.mjs': 'the product\'s spawnChrome and the keeper\'s attach road over a FAKE google-chrome in FAKE_BIN (a node stand-in) — never a real Chrome (B-7e49: test-browser-keeper\'s launching legs, moved verbatim)',
  'scripts/test-desktop-apps.mjs': 'the desktop-app rung\'s FORBIDDEN-switch list and its url verdicts — data the PURE verdicts judge, nothing launched',
  'scripts/ci.mjs': 'the gate runner (a module suites import): the tier rule\'s own text — a `chrome` key whose description and regex name the markers, and the suite rows\' words',
  'scripts/test-architecture.mjs': 'the census\'s own controls: §47b\'s planted sources (strings) naming the markers',
});

/** the census over a tree → { files, launches, rows, bad: [{ file, line }], unread: [{ file, line }], exempt: [{ file, pinned }],
 *  unparsed: [file], uncovered: [file] (a marker, no launch, no row), stale: [file] (a row whose file holds no marker, or a launch) }.
 *  `patch` = a file's text replaced, `extra` = more files read as if in the scope (planted controls), `rows` = the named rows */
export function census(repo, { acorn = null, patch = {}, extra = {}, rows = ROWS, names: names_ = NAMES_ROWS } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const out = { files: 0, launches: 0, rows: 0, bad: [], loud: [], wrapped: [], exempt: [], unparsed: [], unread: [], uncovered: [], stale: [], unnamed: [], named: [], namesText: [], namesStale: [] };
  for (const f of [...filesOf(repo), ...Object.keys(extra)]) {
    const src = f in extra ? extra[f] : f in patch ? patch[f] : fs.readFileSync(path.join(repo, f), 'utf8');
    const r = launchesOf(src, { acorn: A });
    if (!r.parsed) { out.unparsed.push(f); continue; }
    const marked = TEXT_MARK.test(src), launched = r.launches.length > 0 || r.unread.length > 0;
    { const names = NAMES_SWITCH.test(src); if (names_[f]) { if (!names) out.namesStale.push(f); } else if (names) out.namesText.push(f); }   // B-9dd0 r3727
    if (rows[f]) { out.rows++; if (!marked || launched) out.stale.push(f); }
    else if (marked && !launched && !EXEMPT[f]) out.uncovered.push(f);
    for (const u of r.unread) if (!EXEMPT[f]) out.unread.push({ file: f, line: u.line });
    if (!r.launches.length) continue;
    out.files++; out.launches += r.launches.length;
    // MUST 2 (主开发 r528): the exemption is about the STORE only — an exempt file's launches are still read for the quiet switches
    for (const l of r.launches) { if (!l.quiet) out.loud.push({ file: f, line: l.line, open: l.open }); if (l.wrapped) out.wrapped.push({ file: f, line: l.line, ...l.wrapped, quiet: l.quiet }); }
    for (const l of r.launches) { if (!l.spread) out.unnamed.push({ file: f, line: l.line }); if (l.named) out.named.push({ file: f, line: l.line }); }   // B-9dd0 r3727: no launch without the rule, none with its own
    if (EXEMPT[f]) { out.exempt.push({ file: f, pinned: EXEMPT[f].pin.test(src) }); continue; }
    for (const l of r.launches) { if (!l.carried) out.bad.push({ file: f, line: l.line }); }   // B-9dd0 unit 2: `loud` = a launch without CHROME_QUIET
  }
  for (const f of Object.keys(rows)) if (!fs.existsSync(path.join(repo, f)) && !(f in extra)) out.stale.push(f);
  return out;
}
