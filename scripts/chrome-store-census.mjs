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
  'scripts/test-tailnet-reach-chrome.mjs': 'a COMMENT naming the switch (the attach road\'s names); its driver line is built by scratch.mjs driverArgs (B-8695: DRIVER_NAMES last, its PAC switch whole) and its own Chromes take chromeNames (RULES)',
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
// B-8695 (主开发 r4617): THE --config ROAD — a driver config written as a FILE and handed by AGENT_BROWSER_CONFIG / --config is the
// driver's line too: in a file of the DRIVER DOOR (one that can run the real driver), every line that writes a JSON object with an
// `args` key is judged as a driver line (built, or counted in its row)
export const DOOR_FILE = /\bDRIVER\.skip\b|\bdriverDoor\(|\bVS_AGENT_BROWSER_BIN\b|\bDRIVER\.env\b/;
export const CONFIG_FILE_LINE = /writeFileSync\([^\n]*JSON\.stringify\(\{[^\n]*\bargs\s*:/;
export const QUIET_JOINED = /\bCHROME_QUIET\s*\.\s*join\s*\(/;
export const DRIVER_ROWS = Object.freeze({
  'scripts/test-browser-builds-keeper.mjs': { n: 1, why: 'a FAKE driver (FAKE_BIN): the egress home\'s config.json fixture (pac and ozone switches) the keeper reads and asserts — no Chrome starts' },
  'scripts/test-browser-display-chrome.mjs': { n: 2, why: 'the user config\'s PATH (UCFG) and its write: the file holds OWNER_ARGS, built by driverArgs on its own line (the pin)', pin: /const OWNER_ARGS = driverArgs\(/ },
  'scripts/test-browser-display.mjs': { n: 3, why: 'in-process over a FAKE driver: a read inside the fake\'s source and two config PATHS the display reader is handed — no Chrome' },
  'scripts/test-browser-env.mjs': { n: 2, why: 'in-process: config.json fixtures for the environment builder under test — no driver runs' },
  'scripts/test-browser-ephemeral.mjs': { n: 1, why: 'FAKE Chromes (node) under a fake driver: a config PATH — no Chrome' },
  'scripts/test-browser-kept.mjs': { n: 5, why: 'a FAKE driver: kept-profile config.json fixtures the keeper reads — no Chrome' },
  'scripts/test-browser-mediation-chrome.mjs': { n: 5, why: 'r3\'s user, project and named configs whose executablePath is a recording shell script (exit 1: no Chrome), an engine fixture\'s launch row (its own --vibespace-engine=fixture), and a decoy shell environment (AGENT_BROWSER_ARGS among the twins the mediation refuses) handed to the VibeSpace CLI under test — none reaches a real Chrome' },
  'scripts/test-browser-pin.mjs': { n: 2, why: 'a FAKE driver: pin config.json fixtures — no Chrome' },
  'scripts/test-browser-profiles.mjs': { n: 18, why: 'seventeen config FIXTURES (config.json and two --config files) for the profile readers under test, and one real-binary leg that is LAUNCH-FREE (session info --json; a tab list refused before any launch) — no Chrome starts' },
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
    const open = []; let named = false; const door = DOOR_FILE.test(src);
    src.split('\n').forEach((l, i) => {
      if (QUIET_JOINED.test(l)) out.joined.push({ file: f, line: i + 1 });
      if (!DRIVER_LINE.test(l) && !(door && CONFIG_FILE_LINE.test(l))) return;
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

/** B-8695 (主开发 r4612): THE ATTACH ROAD's CHROME — a world that wires a REAL display keeper (the desktop machine half: desktop-serve /
 *  desktop-display, handed to a keeper as its displaySessions) and a REAL Chrome lets the keeper start stock Chrome itself, with the
 *  product's argv and no driver line: such a file names scratch.mjs chromeNamesProgram (the harness's own Chrome program, first on its
 *  keeper env's PATH), or it is red by name. */
export const REAL_DISPLAY = /require\(['"]\.\.\/src\/(?:desktop-display|desktop-serve)\.js['"]\)/;
export const KEEPER_DISPLAY = /\bdisplaySessions\s*:/;
export const REAL_CHROME = /binOf\(['"]google-chrome['"]\)|\bchromeExecutable\(/;
export const NAMES_PROGRAM = /\bchromeNamesProgram\(/;
// 主开发 r4685 M1: a world is ALSO a file that drives the attach road through a SCRATCH HUB — read by what it asserts (a launch or a road
// judged to be the attach road), not by how it requires the product. It is programmed when its own text names the program or a local
// module it imports does (a boot module: scripts/xpra-window-boot.mjs); a world that starts no real Chrome is a counted row
export const ATTACH_ASSERT = /\.launch\s*[!=]==\s*'attach'|\bwhy\s*[!=]==\s*'attach'|on the ATTACH road/;
export const ATTACH_ROWS = Object.freeze({
  'scripts/test-browser-keeper-launch.mjs': 'the keeper\'s attach road over a FAKE google-chrome in FAKE_BIN (a node stand-in) — no real Chrome starts',
  'scripts/test-browser-keeper.mjs': 'the PURE launchRoad verdicts and the product\'s launch argv asserted as data — no Chrome starts',
  'scripts/test-browser-picture.mjs': 'a PURE picture verdict whose `why` is the attach road — no Chrome, no keeper starts one',
  'scripts/ci.mjs': 'the tier runner (a module suites import): a suite row\'s words name the attach road — it starts no Chrome',
});
/** → { worlds: [file], unprogrammed: [file] } over the scope (`patch` / `extra` as census's) */
export function attachCensus(repo, { patch = {}, extra = {}, rows = ATTACH_ROWS } = {}) {
  const out = { worlds: [], unprogrammed: [], rowed: [], stale: [] };
  const textOf = (f) => (f in extra ? extra[f] : f in patch ? patch[f] : (() => { try { return fs.readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } })());
  // a BOOT module that hands its hub the program (never scratch.mjs, whose text DEFINES it: every suite imports that one)
  const viaImport = (src) => [...src.matchAll(/\bfrom\s*'\.\/((?!test-)[\w.-]+\.mjs)'/g)].some((m) => m[1] !== 'scratch.mjs' && NAMES_PROGRAM.test(textOf('scripts/' + m[1])));
  for (const f of [...filesOf(repo), ...Object.keys(extra)]) {
    const src = textOf(f);
    if (!((REAL_DISPLAY.test(src) && KEEPER_DISPLAY.test(src) && REAL_CHROME.test(src)) || ATTACH_ASSERT.test(src))) continue;
    out.worlds.push(f);
    if (rows[f]) { out.rowed.push(f); continue; }
    if (!NAMES_PROGRAM.test(src) && !viaImport(src)) out.unprogrammed.push(f);
  }
  for (const f of Object.keys(rows)) if (!out.worlds.includes(f)) out.stale.push(f);
  return out;
}

/** B-8695's follow, DOOR (a) (主开发 r4974 (1)): A REAL-DRIVER RUN's HOME HOLDS THE DRIVER's LINE. In a file of the DRIVER DOOR
 *  (DOOR_FILE: one that can run the real driver), every home it HANDS — an object's `HOME:` (a child's environment) or `homeDir:`
 *  (a keeper's home), or an assignment of one (`env.HOME = …`, `process.env.HOME = …`) — is CONFIGURED when, resolved to its binding in its own scope (acorn; an alias, an object's field and a
 *  destructured name followed), that home gets `<home>/.agent-browser/config.json` written (the line itself is §47e's: built by
 *  driverArgs, or counted there) or is made by scratch.mjs driverHome; or when the SAME object names its config outright
 *  (AGENT_BROWSER_CONFIG or AGENT_BROWSER_ARGS, both §47e's too). The driver reads that file when no config is named, and the keeper builds
 *  every launch config FROM it with its args kept (src/server/browser-keeper.js machineConfigFile): a home without it lets the
 *  driver's own Chrome start with no names rule — the probe row 1024's three temporary-profile Chromes (test-browser-live ④'s F2
 *  leg). The process's own home (process.env.HOME, os.homedir()) is configured only by a driverHome of it in the same file. NOT A
 *  DRIVER's LAUNCH, said and counted apart (never a row): the environment of a call whose argv is ['--version'] (a version read), of a
 *  spawn whose program is a Chrome (the suite's own Chrome: §47's launch census judges it), or an attach — an object that names
 *  AGENT_BROWSER_CDP, or the env of a run whose argv begins with '--cdp' (the driver connects to a Chrome already there, starts none). Every other home handed is counted in HOME_ROWS, each READ (a fake driver, a pure keeper,
 *  a stand-in, a run that only attaches by --cdp; `pin` = the text a row's reason rests on). A row lists its open SITES BY THEIR LINE's
 *  TEXT (trimmed, at most 160 characters; 主开发 r5102): a site added, removed, or one home swapped for another with the count kept,
 *  is red by the texts that differ — as is a pin that no longer holds and a row whose file is gone. */
export const HOME_KEYS = Object.freeze(['HOME', 'homeDir']);
export const HOME_EXPLICIT = Object.freeze(['AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_ARGS']);
export const HOME_ROWS = Object.freeze({
  'scripts/scratch.mjs': { sites: [
    "const HANDED = Object.freeze({ HOME: HOME_COMPARED, PATH: process.env.PATH || '', EXEC: process.execPath,",
  ], why: 'HANDED: the record of what the process was handed (its home compared by the re-home), never handed to a driver' },
  'scripts/test-browser-ephemeral-life.mjs': { sites: [
    "const composer = (w) => BE.create({ dataDir: w.dataDir, serverSetting: w.setting, homeDir: w.KH, env: w.env, log: w.log, socketDirBase: path.join(w.D, 's'), fac",
    "const kk = K.create({ dataDir: w.dataDir, homeDir: w.KH, env: () => w.env, serverSetting: w.setting, liveKeys: () => LIVE, log: w.log, install: false,",
  ], why: 'the world\'s keeper home `w.KH` (a function\'s returned object, which the census does not follow): its config.json is written through driverArgs(...CHROME_QUIET) where the world is made (the pin)', pin: /fs\.writeFileSync\(path\.join\(KH, '\.agent-browser', 'config\.json'\), JSON\.stringify\(\{ args: driverArgs\(\.\.\.CHROME_QUIET\) \}\)/ },
  'scripts/test-browser-ephemeral-wired.mjs': { sites: [
    "const composer = (w) => BE.create({ dataDir: w.dataDir, serverSetting: w.setting, homeDir: w.KH, env: w.env, log: w.log, socketDirBase: path.join(w.D, 's'), fac",
  ], why: 'the world\'s keeper home `w.KH`: its config.json is written through driverArgs(...CHROME_QUIET) where the world is made (the pin)', pin: /fs\.writeFileSync\(path\.join\(KH, '\.agent-browser', 'config\.json'\), JSON\.stringify\(\{ args: driverArgs\(\.\.\.CHROME_QUIET\) \}\)/ },
  'scripts/test-browser-live.mjs': { sites: [
    "const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPAC",
    "const srv2 = spawn('node', ['server.js'], { cwd: wt2, env: { ...env2, ...VNC_ENV, PORT: String(PORT2), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PA",
  ], why: '③ and ③b: worktree servers over a FAKE agent-browser and a fake claude — no real driver runs there', pin: /fake claude \+ fake agent-browser/ },
  'scripts/test-browser-mediation-chrome.mjs': { sites: [
    "const shell4 = { ...BASE_ENV, HOME: H4, VIBESPACE_API: `http://127.0.0.1:${stub.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_stub' };",
    "const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };",
    "const kk = Kk.create({ dataDir: path.join(KR, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => new Set(), runtime: Ff.crea",
    "const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };",
    "const kk = Kk.create({ dataDir: path.join(KR, 'data'), homeDir: KH, env: () => kenv, serverSetting: (k) => (k === 'browser.defaultEngine' ? 'plugin:' + EID : un",
    "const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };",
    "const kk = Kk.create({ dataDir: path.join(KR, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => new Set([KEY9]), runtime: F",
    "const env9 = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${port9}`, VIBESPACE_SESSION_TOKEN: TOKEN9, VIBESPACE_SESSION_CWD: ",
    "const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };",
    "const kk = Kk.create({ dataDir: path.join(KR, 'data'), homeDir: KH, env: () => kenv, serverSetting: (k) => settings[k], liveKeys: () => new Set([KEYG]), runtime",
    "const envG = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${portG}`, VIBESPACE_SESSION_TOKEN: TOKENG, VIBESPACE_SESSION_CWD: ",
    "const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };",
    "const kk = Kk.create({ dataDir: path.join(KR, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => new Set([KEY10]), runtime: ",
    "const env10 = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${port10}`, VIBESPACE_SESSION_TOKEN: TOKEN10, VIBESPACE_SESSION_CW",
  ], why: '③ r4\'s shell, whose CLI the stub answers with config = NAVCFG (built by driverArgs: §47e), and ⑧ to ⑩\'s thirteen keeper homes, whose browser is the FAKE kernel (an engine fixture\'s executablePath) — no real Chrome there' },
  'scripts/test-browser-paired-scope.mjs': { sites: [
    "const withDeviceEnv = async (fn) => { const keep = { PATH: process.env.PATH, HOME: process.env.HOME }; process.env.PATH = `${path.dirname(REAL_AB)}:${keep.PATH ",
    "const withDeviceEnv = async (fn) => { const keep = { PATH: process.env.PATH, HOME: process.env.HOME }; process.env.PATH = `${path.dirname(REAL_AB)}:${keep.PATH ",
  ], why: 'the PATH and HOME saved before the device\'s first dial and put back after it — a copy of the environment and its restore, no run' },
  'scripts/test-browser-profiles.mjs': { sites: [
    "const r = spawnSync(argv[0], argv[1], { cwd, env: { PATH: process.env.PATH, HOME: home, ...extraEnv }, encoding: 'utf8', timeout: 20000 });",
    "const k = K.create({ dataDir: D, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, log: { log() { }, warn() { }, error() { } } });",
    "const k = K.create({ dataDir: D, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, log: { log() { }, warn() { }, error() { } } });",
  ], why: 'a shell fragment driven under sh (no driver), and a pure keeper whose admission is judged as data (no launch)' },
  'scripts/test-browser-profiles-ui.mjs': { sites: [
    "const srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...baseEnv, ...VNC_ENV, PATH: `${FAKE_BIN}:${baseEnv.PATH || '/usr/bin:/bin'}`, PORT: Strin",
    "const L = B.listBuilds({ homeDir: os.homedir() });",
    "const L = BBm.listBuilds({ homeDir: os.homedir() });",
    "const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))), HOME: RH, XDG_RUNTIME_DIR: XDG, PATH: `${path",
  ], why: '① to ④\'s FAKE driver home; the build list read from the process\'s home (a read); ⑦\'s keeper that reads the account\'s newest build and its run home, whose launches take the keeper\'s explicit config built from b5-home (written there)' },
  'scripts/test-browser-resources.mjs': { sites: [
    "const mkR = (home) => BE.create({ dataDir: path.join(ROOT, 'data-i-' + home.length), homeDir: home, env: {}, socketDirBase: base, log: { warn() { }, log() { } }",
    "const env = { PATH: process.env.PATH, HOME: home, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(B.DEFAULT_IDLE_TIMEOUT_MS) };",
    "const bare = tabList({ PATH: process.env.PATH, HOME: H39, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(B.DEFAULT_IDLE_TIMEOUT_MS) });",
    "closeAll({ PATH: process.env.PATH, HOME: H39 });",
  ], why: 'ⓘ\'s two homes of 38 and 39 bytes: their config.json is written through driverArgs in ONE loop over both (a loop name the census does not tie to them: the pin)', pin: /for \(const h of \[H38, H39\]\) \{ fs\.mkdirSync\(path\.join\(h, '\.agent-browser'\), \{ recursive: true \}\); fs\.writeFileSync\(path\.join\(h, '\.agent-browser', 'config\.json'\), JSON\.stringify\(\{ args: driverArgs\(/ },
  'scripts/test-browser-stderr-pipe-real.mjs': { sites: [
    "const e = { __bin: extra.__bin || AB, PATH: process.env.PATH, HOME, TMPDIR: path.join(S, 'tmp'), XDG_RUNTIME_DIR: XDG, LANG: 'C.UTF-8', AGENT_BROWSER_SESSION: n",
  ], why: 'the driver\'s line rides AGENT_BROWSER_ARGS built by driverArgs at each run (quietLeg) and an explicit config file: its home holds none on purpose (the pin)', pin: /quietLeg\('bspd', driverArgs\([\s\S]*quietLeg\('bspc', BE\.withQuietLogging\(driverArgs\(/ },
  'scripts/test-browser-x-picture.mjs': { sites: [
    "const ch = spawn(bin, [...CHROME_QUIET, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${ud}`, '--no-first-run', '--no-default-browser-check', ",
  ], why: 'the VIEWER Chrome the suite spawns itself (launchChrome(bin): §47\'s launch census judges it)' },
  'scripts/test-home-verdict.mjs': { sites: [
    "HOME: H, PATH: `/home/u/.local/bin:${NODE_DIR}:/run/user/1/fnm_multishells/9/bin:/usr/local/bin:/opt/tools/bin::rel/bin:/usr/bin:/bin`, CLAUDE_CONFIG_DIR: H + '",
    "const r = HV.rehomeEnv({ HOME: home, PATH: `${shims}:${inst}:/usr/bin:/bin` }, { oldHome: home, newHome: nh, platform: process.platform, resolve: SM.resolveFs }",
    "ok(JSON.stringify(SM.cliCandidatesOf('claude', { HOME: '/home/u', PATH: '/a::/b', VS_CLAUDE_BIN: '/x/claude' })) === JSON.stringify(['/x/claude', '/a/claude', '",
    "const handed = { HOME: STANDIN, CLAUDE_CONFIG_DIR: `${STANDIN}/.claude-${SECRETISH}`, PATH: `${STANDIN}/.local/bin:${NODE_BIN}:/usr/bin:/bin`, XDG_DATA_HOME: '/",
    "const env = { PATH: `${home}/.local/bin:${home}/.nvm/bin:/opt/vs-hv-nowhere/bin:/usr/bin:/bin`, HOME: path.join(seam, 'homelink'), LANG: 'C.UTF-8', [SM.NOT_TEMP",
    "lane: start(path.join(DIR, 'test-hv-lane.mjs'), { HOME: LANE, PATH: `${NODE_BIN}:/usr/bin:/bin` }, PROBE),",
    "emptyHome: start(path.join(DIR, 'test-hv-emptyhome.mjs'), { HOME: '', PATH: '/usr/bin:/bin' }, A1_PROBE(SCRATCH_URL), { clean: true }),",
    ": k === 'm14' ? start(m.probe, { HOME: '', PATH: '/usr/bin:/bin' }, A1_PROBE(m.url), { clean: true })",
    "const STARTED = { PATH: '/usr/bin:/bin', HOME: '/home/u', LANG: 'C.UTF-8', CI: 'true' };",
    "const ruled = HV.unruledNames({ ...STARTED, HOME: '/tmp/vs-lane-1/home', XDG_RUNTIME_DIR: '/tmp/r', VIBESPACE_CI_RUN: 'ci-fast-pid1@2', VIBESPACE_SUITE_BUDGET_M",
    "const WAS = { HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1/bus', VIBESPACE_CI_RUN: 'ci-outer', VIBESPACE_SU",
    "const today = HV.unruledNames({ ...WAS, HOME: '/tmp/l/home', XDG_RUNTIME_DIR: '/tmp/l/run', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/l/run/bus', VIBESPACE_CI_R",
    "const LA_PATH = `${LA_BIN}:/usr/bin:/bin`, laEnv = (extra = {}) => ({ HOME: LA_HOME, PATH: LA_PATH, LANG: 'C.UTF-8', ...extra });",
    "const brEnv = (h, extra = {}) => ({ HOME: h, PATH: LA_PATH, LANG: 'C.UTF-8', ...extra });",
  ], why: 'stand-in programs only: the homes of its scenes and probes — the real driver never runs there' },
});
const SCOPES = new Set(['Program', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'BlockStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'CatchClause', 'StaticBlock']);
const keyOf = (p) => (p && !p.computed && p.key ? (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null) : null);
const calleeName = (c) => (c && c.type === 'Identifier' ? c.name : c && c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null);
/** → { files, sites, configured, versionReads, chromeSpawns, attaches, open: [{file, line, key, what, text}], moved: [{file, n, want, extra, missing, lines}],
 *  unpinned: [file], stale: [file], unparsed: [file] } */
// ONE analysis per file text (a census is called with a file patched or planted: only that file is read again)
const HOME_SITES = new Map();
function homeSitesOf(f, src, acorn) {
  const key = `${f}\0${src}`;
  if (HOME_SITES.has(key)) return HOME_SITES.get(key);
  const cnt = { configured: 0, attaches: 0, versionReads: 0, chromeSpawns: 0 };
  const LINES = src.split('\n'), lineText = (n) => (LINES[n - 1] || '').trim().slice(0, 160);
  const r = (() => {
      let ast = null;
      for (const sourceType of ['module', 'script']) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true }); break; } catch { } }
      if (!ast) return { unparsed: true };
      // pass 1: every binding, in the scope that declares it, with the ancestors it was declared under (its init is resolved there)
      const decls = new Map(), bindOf = (scope) => { if (!decls.has(scope)) decls.set(scope, new Map()); return decls.get(scope); };
      const nearest = (stack) => { for (let i = stack.length - 1; i >= 0; i--) if (SCOPES.has(stack[i].type)) return stack[i]; return ast; };
      const visit = (n, stack, fn) => {
        if (!n || typeof n.type !== 'string') return;
        fn(n, stack); stack.push(n);
        for (const k of Object.keys(n)) { if (k === 'start' || k === 'end' || k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) for (const x of v) visit(x, stack, fn); else if (v && typeof v.type === 'string') visit(v, stack, fn); }
        stack.pop();
      };
      visit(ast, [], (n, stack) => {
        if (n.type === 'VariableDeclarator') {
          const sc = nearest(stack), at = stack.slice();
          if (n.id.type === 'Identifier') bindOf(sc).set(n.id.name, { init: n.init, at, configured: false });
          else if (n.id.type === 'ObjectPattern') for (const p of n.id.properties) if (p.type === 'Property' && p.value.type === 'Identifier') bindOf(sc).set(p.value.name, { init: n.init ? { type: 'VsField', object: n.init, name: keyOf(p) } : null, at, configured: false });
        } else if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression')) {
          for (const p of n.params) if (p.type === 'Identifier') bindOf(n).set(p.name, { init: null, at: stack.concat([n]), configured: false });
        }
      });
      const lookup = (name, stack) => { for (let i = stack.length - 1; i >= 0; i--) { const m = decls.get(stack[i]); if (m && m.has(name)) return m.get(name); } const m = decls.get(ast); return (m && m.get(name)) || null; };
      let processHome = false;
      const isProcessHome = (n) => !!n && ((n.type === 'MemberExpression' && !n.computed && n.property.name === 'HOME' && n.object.type === 'MemberExpression' && !n.object.computed && n.object.object.type === 'Identifier' && n.object.object.name === 'process' && n.object.property.name === 'env')
        || (n.type === 'CallExpression' && calleeName(n.callee) === 'homedir' && n.arguments.length === 0));
      // the home a path.join of <home>, «.agent-browser» and «config.json» names (or an identifier bound to one)
      const configHome = (n, stack, d = 0) => {
        if (!n || d > 4) return null;
        if (n.type === 'Identifier') { const b = lookup(n.name, stack); return b && b.init ? configHome(b.init, b.at, d + 1) : null; }
        if (n.type !== 'CallExpression' || calleeName(n.callee) !== 'join' || n.arguments.length < 2) return null;
        const rest = n.arguments.slice(1).map((a) => (a.type === 'Literal' ? String(a.value) : null));
        if (rest.some((x) => x === null) || rest.join('/').replace(/\/+/g, '/') !== '.agent-browser/config.json') return null;
        return { node: n.arguments[0], stack };
      };
      const mark = (n, stack, d = 0) => {   // a home node made configured
        if (!n || d > 4) return;
        if (isProcessHome(n)) { processHome = true; return; }
        if (n.type === 'Identifier') { const b = lookup(n.name, stack); if (b) b.configured = true; }
      };
      // pass 2: the writes of a home's config, and every driverHome(<home>)
      visit(ast, [], (n, stack) => {
        if (n.type !== 'CallExpression') return;
        const c = calleeName(n.callee);
        if ((c === 'writeFileSync' || c === 'writeFile') && n.arguments[0]) { const h = configHome(n.arguments[0], stack); if (h) mark(h.node, h.stack); }
        else if (c === 'driverHome' && n.arguments[0]) mark(n.arguments[0], stack);
      });
      // a home value → configured?
      const homeOk = (n, stack, d = 0) => {
        if (!n || d > 5) return false;
        if (n.type === 'CallExpression' && calleeName(n.callee) === 'driverHome') return true;
        if (isProcessHome(n)) return processHome;
        if (n.type === 'Identifier') { const b = lookup(n.name, stack); if (!b) return false; if (b.configured) return true; return b.init ? homeOk(b.init, b.at, d + 1) : false; }
        if (n.type === 'VsField' || (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier')) {
          const obj = n.type === 'VsField' ? n.object : n.object, name = n.type === 'VsField' ? n.name : n.property.name;
          let o = obj, st = stack;
          for (let i = 0; i < 4 && o && o.type === 'Identifier'; i++) { const b = lookup(o.name, st); if (!b || !b.init) return false; o = b.init; st = b.at; }
          if (!o || o.type !== 'ObjectExpression') return false;
          const p = o.properties.find((x) => x.type === 'Property' && keyOf(x) === name);
          return p ? homeOk(p.value, st, d + 1) : false;
        }
        return false;
      };
      // pass 3: the sites — every `HOME:` / `homeDir:` handed in an object literal, and every assignment of one
      let sites = 0; const open = [];
      visit(ast, [], (n, stack) => {
        if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.type === 'Identifier' && HOME_KEYS.includes(n.left.property.name)) {
          sites++;
          if (homeOk(n.right, stack.concat([n]))) cnt.configured++; else open.push({ file: f, line: n.loc.start.line, key: n.left.property.name, what: src.slice(n.right.start, n.right.end).slice(0, 60), text: lineText(n.loc.start.line) });
          return;
        }
        if (n.type !== 'ObjectExpression') return;
        const explicit = n.properties.some((p) => p.type === 'Property' && HOME_EXPLICIT.includes(keyOf(p)));
        // not a driver's launch: an attach by a CDP grant; the env of a version read; the env of a spawn of a Chrome
        const up = stack[stack.length - 1], opts = stack[stack.length - 2], call = stack[stack.length - 3];
        const asEnvOf = up && up.type === 'Property' && keyOf(up) === 'env' && opts && opts.type === 'ObjectExpression' && call && (call.type === 'CallExpression' || call.type === 'NewExpression') && call.arguments.includes(opts) ? call : null;
        const attach = n.properties.some((p) => p.type === 'Property' && keyOf(p) === 'AGENT_BROWSER_CDP')
          || (!!asEnvOf && asEnvOf.arguments.some((a) => a.type === 'ArrayExpression' && a.elements[0] && a.elements[0].type === 'Literal' && a.elements[0].value === '--cdp'));
        const version = !!asEnvOf && asEnvOf.arguments.some((a) => a.type === 'ArrayExpression' && a.elements.length === 1 && a.elements[0] && a.elements[0].type === 'Literal' && a.elements[0].value === '--version');
        const a0 = asEnvOf && asEnvOf.arguments[0], chromeSpawn = !!a0 && ((a0.type === 'Identifier' && CHROMEISH.test(a0.name)) || (a0.type === 'Literal' && CHROME_PATH.test(String(a0.value))));
        for (const p of n.properties) {
          if (p.type !== 'Property' || !HOME_KEYS.includes(keyOf(p))) continue;
          sites++;
          if (attach) { cnt.attaches++; continue; }
          if (version) { cnt.versionReads++; continue; }
          if (chromeSpawn) { cnt.chromeSpawns++; continue; }
          if (explicit || homeOk(p.value, stack.concat([n]))) { cnt.configured++; continue; }
          open.push({ file: f, line: p.loc.start.line, key: keyOf(p), what: src.slice(p.value.start, p.value.end).slice(0, 60), text: lineText(p.loc.start.line) });
        }
      });
      return { unparsed: false, sites, open };
  })();
  const res = Object.freeze({ ...cnt, ...r });
  HOME_SITES.set(key, res);
  return res;
}
export function homeCensus(repo, { acorn, patch = {}, extra = {}, rows = HOME_ROWS } = {}) {
  const out = { files: 0, sites: 0, configured: 0, versionReads: 0, chromeSpawns: 0, attaches: 0, open: [], moved: [], unpinned: [], stale: [], unparsed: [] };
  for (const f of [...filesOf(repo), ...Object.keys(extra)]) {
    const src = f in extra ? extra[f] : f in patch ? patch[f] : fs.readFileSync(path.join(repo, f), 'utf8');
    if (!DOOR_FILE.test(src)) continue;
    const r = homeSitesOf(f, src, acorn);
    if (r.unparsed) { out.unparsed.push(f); continue; }
    const { sites, open } = r;
    for (const k of ['configured', 'attaches', 'versionReads', 'chromeSpawns']) out[k] += r[k];
    if (sites) out.files++;
    out.sites += sites;
    const row = rows[f];
    if (row) {
      const want = [...(row.sites || [])].sort(), got = open.map((o) => o.text).sort();
      if (JSON.stringify(want) !== JSON.stringify(got)) {
        const left = [...want], extra = [];
        for (const t of got) { const i = left.indexOf(t); if (i >= 0) left.splice(i, 1); else extra.push(t); }
        out.moved.push({ file: f, n: got.length, want: want.length, extra, missing: left, lines: open.map((o) => o.line) });
      }
      if (row.pin && !row.pin.test(src)) out.unpinned.push(f);
    }
    else out.open.push(...open);
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
