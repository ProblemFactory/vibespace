#!/usr/bin/env node
// lane mac-window-list-helper (owner 2026-10-18 22:28Z — macOS asked «"node" is requesting to bypass the system private window
// picker and directly access your screen and audio»; tccd at 15:28:32 PDT: responsible=node, binary_path=/usr/bin/osascript —
// the display-facts JXA, spawned by the agent the moment a Mac's desktop window opened): THE CENSUS OF SCREEN READS ON A MAC.
// Law (kb-design-lessons): on a Mac every screen/window read runs in the screen helper, disclaimed — never osascript /
// CGWindowList / screencapture under node. FAST, PURE (reads files only):
//   §1 every src/ file's CODE (comments dropped by acorn; strings kept — a JXA script IS a string) is scanned for the screen
//      tokens; each hit file is THE helper's source or an ALLOW row whose reason is not a screen read — else RED; an allow row
//      whose file no longer hits (or hits a token it does not name) is RED too. The census is PRINTED.
//   §2 the reads live in the helper (its source names CGWindowList, CGDisplay, NSScreen, SCShareableContent) — moved, not lost
//   §3 MUTANTS (in-memory overrides of the same census): a CGWindowList read added under src/agentd ⇒ RED; the old JXA look
//      put back in src/machine-window.js ⇒ RED; a NEW src/ file running screencapture ⇒ RED (the walk is the tree, not git's
//      list); a comment that names osascript is no site (control)
//   §4 the wiring: the agent hands the window look + the screen table THE helper (`mac: macWindowLook`, its facts =
//      streamScreenOf().look); a Mac's look / table have no argv under node; the pin is LaunchServices (`open -b`)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const acorn = require(path.join(REPO, 'node_modules/acorn'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 900) : '')); } };

/** What reads a Mac's screen or its windows (a WindowServer / ScreenCaptureKit client): the token → its pattern. */
const TOKENS = Object.freeze([
  ['osascript', /\bosascript\b/g], ['screencapture', /\bscreencapture\b/g], ['CGWindowList', /\bCGWindowList\w*/g], ['kCGWindow', /\bkCGWindow\w*/g],
  ['CGDisplay', /\bCGDisplay\w*/g], ['CGGetDisplayList', /\bCGGet\w*DisplayList\b/g], ['ScreenCaptureAccess', /\bCG(?:Preflight|Request)ScreenCaptureAccess\b/g],
  ['ScreenCaptureKit', /\bSC(?:ShareableContent|Stream\w*|ScreenshotManager|ContentFilter|ContentSharingPicker)\b/g], ['NSScreen', /\bNSScreen\b/g],
  ['JXA', /\bObjC\.import\b/g], ['pyobjc', /\bQuartz\b/g],
]);
/** THE helper's source (the generated JS text of tools/vibespace-screen/vibespace-screen.swift — it runs IN the helper, disclaimed). */
const HELPER = 'src/agentd/mac-helper-source.js';
/** A hit that is not a screen read — its reason. A row names the tokens it may hit, nothing else. */
const ALLOW = Object.freeze({
  'src/routes/files.js': { tokens: ['osascript'], why: 'the HUB puts an image on its OWN clipboard (AppleScript `set the clipboard`) when the server itself runs on a Mac — a pasteboard write, never a screen or window read; the agent never runs it' },
  'src/mic-install.js': { tokens: ['osascript'], why: 'lane stream-mic-road: a Mac\'s virtual-microphone install / removal plan — the person\'s administrator password dialog (`do shell script … with administrator privileges`), run on that Mac by the hub\'s install door through run-stream: an elevation prompt, never a screen or window read; the agent never bundles this file' },
});
const EXT = /\.(?:js|mjs|cjs)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out); else if (EXT.test(e.name)) out.push(rel);
  }
  return out;
}
/** The file's code with every comment blanked (offsets and newlines kept) — null when acorn cannot read it. */
function codeOf(text) {
  const spans = [];
  const opts = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, onComment: (block, t, s, e) => spans.push([s, e]) };
  try { acorn.parse(text, { ...opts, sourceType: 'module' }); } catch { spans.length = 0; try { acorn.parse(text, { ...opts, sourceType: 'script' }); } catch { return null; } }
  let s = text;
  for (const [a, b] of spans) s = s.slice(0, a) + s.slice(a, b).replace(/[^\n]/g, ' ') + s.slice(b);
  return s;
}
const anyToken = new RegExp(TOKENS.map(([, re]) => re.source).join('|'));
/** THE CENSUS over src/ (+ `overrides`: rel → text, a text of null removes the file). → { rows, problems } */
function census(overrides = {}) {
  const files = [...new Set([...walk('src'), ...Object.keys(overrides)])].sort();
  const rows = [], problems = [];
  for (const rel of files) {
    const text = Object.prototype.hasOwnProperty.call(overrides, rel) ? overrides[rel] : fs.readFileSync(path.join(REPO, rel), 'utf8');
    if (text == null || !anyToken.test(text)) continue; // the prefilter: most files name none of them, even in a comment
    const code = codeOf(text);
    if (code == null) { problems.push(`${rel}: acorn cannot read it — the census cannot see its code`); continue; }
    const sites = [];
    for (const [name, re] of TOKENS) for (const m of code.matchAll(re)) sites.push({ name, line: code.slice(0, m.index).split('\n').length, text: m[0] });
    if (!sites.length) continue;
    const names = [...new Set(sites.map((x) => x.name))];
    const allow = ALLOW[rel];
    const kind = rel === HELPER ? 'helper' : allow && names.every((n) => allow.tokens.includes(n)) ? 'allowed' : 'RED';
    rows.push({ rel, kind, names, sites });
    if (kind === 'RED') problems.push(`${rel}: ${sites.slice(0, 4).map((x) => `${x.text} @${x.line}`).join(', ')}${sites.length > 4 ? ` … (${sites.length})` : ''} — a screen read under node (route it through the screen helper: src/agentd/stream-mac.js look), or an ALLOW row whose reason is not a screen read`);
  }
  for (const rel of Object.keys(ALLOW)) if (!rows.some((r) => r.rel === rel && r.kind === 'allowed')) problems.push(`${rel}: an ALLOW row with nothing (or something else) to allow — drop or fix the row`);
  return { rows, problems };
}

console.log('§1 THE CENSUS: every screen read in src/ is the helper\'s, or allowed with a reason that is not a screen read');
const base = census();
for (const r of base.rows) console.log(`      ${r.kind.padEnd(7)} ${r.rel}: ${r.names.join(', ')} (${r.sites.length} site${r.sites.length === 1 ? '' : 's'})${r.kind === 'allowed' ? ` — ${ALLOW[r.rel].why}` : ''}`);
ok(base.problems.length === 0, 'no screen read under node: every hit is the helper\'s source or an allowed non-read', base.problems);
ok(base.rows.some((r) => r.rel === HELPER && r.kind === 'helper') && base.rows.filter((r) => r.kind === 'allowed').length === Object.keys(ALLOW).length, 'the census saw the helper\'s source and every ALLOW row (it is not vacuous)', base.rows.map((r) => r.rel));
ok(!base.rows.some((r) => r.rel === 'src/machine-window.js' || r.rel.startsWith('src/agentd/') && r.rel !== HELPER), 'src/machine-window.js and the agent\'s own files read no screen (the window look, the screen table, the pin)', base.rows.map((r) => r.rel));

console.log('§2 the reads live in the helper — moved, not lost');
const helperText = fs.readFileSync(path.join(REPO, HELPER), 'utf8');
const swift = fs.readFileSync(path.join(REPO, 'tools/vibespace-screen/vibespace-screen.swift'), 'utf8');
ok(['CGWindowListCopyWindowInfo', 'CGDisplayBounds', 'NSScreen', 'SCShareableContent'].every((t) => helperText.includes(t) && swift.includes(t)), 'the helper (source + its bundled text) reads the window list, the displays and the shareable content');

console.log('§3 MUTANTS — the census goes RED');
const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
const mw = fs.readFileSync(path.join(REPO, 'src/machine-window.js'), 'utf8');
const m1 = census({ 'src/agentd/agentd.js': agentd + "\nconst peek = () => require('child_process').execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', \"ObjC.import('CoreGraphics'); $.CGWindowListCopyWindowInfo(1, 0)\"]);\n" });
ok(m1.problems.some((p) => p.startsWith('src/agentd/agentd.js:') && /CGWindowListCopyWindowInfo/.test(p)), 'a CGWindowList read added under src/agentd ⇒ RED (named, with its line)', m1.problems);
const m2 = census({ 'src/machine-window.js': mw + "\nconst MAC_TRACK_JXA = [\"ObjC.import('Cocoa');\", 'const scr = $.NSScreen.mainScreen;'].join('\\n');\n" });
ok(m2.problems.some((p) => p.startsWith('src/machine-window.js:') && /NSScreen/.test(p)), 'the old JXA look put back in src/machine-window.js ⇒ RED', m2.problems);
const m3 = census({ 'src/agentd/window-peek.js': "'use strict';\nmodule.exports = (execFile) => execFile('/usr/sbin/screencapture', ['-x', 'shot.png']);\n" });
ok(m3.problems.some((p) => p.startsWith('src/agentd/window-peek.js:') && /screencapture/.test(p)), 'a NEW src/ file running screencapture ⇒ RED (the walk is the tree — an uncommitted file is seen)', m3.problems);
const m4 = census({ 'src/routes/files.js': fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8') + "\nconst grab = 'screencapture -x';\n" });
ok(m4.problems.some((p) => p.startsWith('src/routes/files.js:')), 'an ALLOW row allows only its own tokens: screencapture beside the clipboard\'s osascript ⇒ RED', m4.problems);
const m5 = census({ 'src/routes/files.js': null });
ok(m5.problems.some((p) => /an ALLOW row with nothing/.test(p)), 'an ALLOW row whose file no longer hits ⇒ RED (a stale row)', m5.problems);
const c1 = census({ 'src/machine-window.js': mw + '\n// a Mac once ran osascript here to read CGWindowListCopyWindowInfo (lane mac-window-list-helper moved it)\n' });
ok(c1.problems.length === 0, 'CONTROL: a comment naming osascript / CGWindowList is no site', c1.problems);

console.log('§4 the wiring: the agent hands THE helper to the look and the table; the pin is LaunchServices');
const MW = require(path.join(REPO, 'src/machine-window.js'));
ok((agentd.match(/mac: macWindowLook\b/g) || []).length === 2 && /const macWindowLook = \{ facts: \(\) => streamScreenOf\(\)\.look\(\), displays: \(\) => streamScreenOf\(\)\.look\(\{ force: false, windows: false \}\), starts: \(pids\) => streamScreenOf\(\)\.starts\(pids\) \}/.test(agentd), 'agentd: window-track and display-facts both get `mac: macWindowLook` — the helper\'s facts (look), its table (no grant needed), the process starts');
ok(MW.trackArgv('darwin', {}).argv === null && MW.displaysArgv('darwin').argv === null && MW.pinArgv('darwin', { pid: 9, bundle: 'com.example.app', on: true }).argv.join(' ') === '/usr/bin/open -b com.example.app', 'a Mac\'s look and table have no argv under node; its pin is `open -b <bundle>`');

console.log(`\n${fail ? '✗' : '✓'} test-mac-screen-reads: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
