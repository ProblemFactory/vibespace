#!/usr/bin/env node
// test-agentd-spawn-hide — lane win-run-hide-console (2026-10-19; the owner: 143 Windows Terminal windows on the owner's desktop,
// one per `vibespace-exit run`, a failed one left open). A WINDOWS DEVICE'S CHILD NEVER OPENS A CONSOLE WINDOW: the daemon
// runs console-less (its self-upgrade re-exec is detached + windowsHide), so every console program it starts WITHOUT
// `windowsHide: true` gets a NEW console — Windows 11 hands it to Windows Terminal: a visible window per child.
// ONE source census (acorn's TOKENS of the text, so a quote or a paren inside a string / a regex literal never moves a
// bracket; the options object is read whole across lines). FAST, in-process.
//   §1 the scope = THE DAEMON: src/agentd/*.js + every src module its entry (src/agentd/agentd.js) requires, transitively
//      (derived here from the require calls). Every child-process call site in it — execFile / execFileSync / spawn /
//      spawnSync / exec / execSync / fork, bare or `require('child_process').x(` / `<cp alias>.x(`, a destructured rename
//      (`{ spawn: sp }`), a default-parameter alias (`spawnImpl = spawn`) — is HIDDEN (`windowsHide: true` in an options
//      object it is handed), or starts a POSIX-only tool BY LITERAL NAME (ps / mkfifo / … — Windows ships none: ENOENT, no
//      process, no console), or is on the NAMED exception list with its reason (node-pty's ConPTY; whole files that never
//      run on a Windows device). Any other site is RED by file:line; an exception row that names no site is RED.
//   §2 the sites the owner hit, by name: run-cmd, the code-page probe (PURE XS.codePageAsker — agentd keeps no probe of its
//      own), both discovery-snapshot children, the usage-scan child, the stdio-bridge daemon spawn, the streaming exec,
//      the detached session spawn, `claude --version`, the OpenCode serve + its `git init`, codex app-server; the
//      self-upgrade re-exec keeps `detached: true, stdio: 'ignore', windowsHide: true`.
//   §3 CONTROLS (patched copies of the text in memory, never src/): run-cmd without windowsHide ⇒ RED; the re-exec without
//      it ⇒ RED; the asker's probe without it ⇒ RED; a planted unhidden `require('child_process').execFile(` ⇒ RED; a
//      planted multi-line `{ spawn: sp2 }` call ⇒ RED, and green once its own line says windowsHide; a module the entry
//      newly requires with an unhidden spawn ⇒ RED (the closure is derived); a dead exception row ⇒ RED; a literal POSIX
//      tool and a regex's `.exec(` need nothing; a local VALUE named like a call (`const execFile = '…'`) hides no site.
// Run: node scripts/test-agentd-spawn-hide.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const acorn = require('acorn');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) : '')); } };

const AGENTD = 'src/agentd', ENTRY = 'src/agentd/agentd.js';
const CALLS = new Set(['execFile', 'execFileSync', 'spawn', 'spawnSync', 'exec', 'execSync', 'fork']);
// a literal program Windows ships none of: the spawn fails ENOENT before any process (or console) exists
const POSIX_TOOLS = new Set(['ps', 'pgrep', 'lsof', 'fuser', 'mkfifo', 'stty', 'df', 'sysctl', 'vm_stat', 'security']);
// WHOLE FILES of the scope that never run on a Windows device, each with its reason
const FILE_EXEMPT = [
  { file: 'src/agentd/client.js', why: 'hub side: the DeviceManager runs in the hub\'s process (Linux / macOS) — it starts the hub\'s own local daemon and ssh, never anything on a device' },
  { file: 'src/agentd/attach-cli.js', why: 'terminal side: `attach` runs in the user\'s own terminal — ssh / stty inherit THAT console (stdio inherit); a hidden console would cut the session off' },
  { file: 'src/agentd/stream-mac.js', why: 'darwin only (the ScreenCaptureKit helper, /usr/bin/open) — never loaded on Windows' },
  { file: 'src/desktop-display.js', why: 'the X display\'s machine half (Xvfb / xpra / xrdb …): runs only where an X server runs — a Windows device has no app display' },
  { file: 'src/app-serve.js', why: 'app displays (xpra on Linux): the apps a rebuilt Linux machine serves — no Windows branch' },
  { file: 'src/app-secrets.js', why: 'an app display\'s Secret Service (python3 + GDBus, Linux) — no Windows branch' },
];
// SITES that need no windowsHide, each named by a needle of its call text, with the reason
const SITE_EXEMPT = [
  { file: 'src/agentd/agentd.js', needle: 'pty().spawn(', why: 'node-pty\'s ConPTY: a pseudo console, never a window (node-pty takes no windowsHide)' },
  { file: 'src/session-store.js', needle: "execFile(cmd, args, { encoding: 'utf-8', ...opts }", why: 'execFileP: its two callers name `tmux` and `ps` — POSIX tools, ENOENT on Windows' },
];

// ── the tokens ──
function tokensOf(text) {
  const out = [];
  for (const t of acorn.tokenizer(text, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })) out.push(t);
  return out;
}
const lab = (t) => (t ? t.type.label : '');
const OPEN = new Set(['(', '[', '{', '${']), CLOSE = new Set([')', ']', '}']);
const isCp = (t) => !!t && lab(t) === 'string' && /^(node:)?child_process$/.test(t.value);
/** the index of the bracket matching the opener at `i` (forward) */
function closeOf(toks, i) { let d = 0; for (let j = i; j < toks.length; j++) { if (OPEN.has(lab(toks[j]))) d++; else if (CLOSE.has(lab(toks[j]))) { d--; if (d === 0) return j; } } return -1; }
/** the index of the opener matching the closer at `i` (backward) */
function openOf(toks, i) { let d = 0; for (let j = i; j >= 0; j--) { if (CLOSE.has(lab(toks[j]))) d++; else if (OPEN.has(lab(toks[j]))) { d--; if (d === 0) return j; } } return -1; }
/** `require ( 'child_process' )` ending at index `i` (the `)`) */
const isCpRequireAt = (toks, i) => lab(toks[i]) === ')' && isCp(toks[i - 1]) && lab(toks[i - 2]) === '(' && lab(toks[i - 3]) === 'name' && toks[i - 3].value === 'require';

/** Every child-process call site of ONE file → [{line, callee, text, first, hidden, pty}] */
function sitesOf(rel, text) {
  const toks = tokensOf(text);
  const names = new Set(CALLS), recv = new Set(), own = new Set();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    // `const { spawn: sp, execFile } = require('child_process')` — a rename is a call name of this file
    if (lab(t) === '}' && lab(toks[i + 1]) === '=' && toks[i + 2] && toks[i + 2].value === 'require' && isCp(toks[i + 4])) {
      const o = openOf(toks, i);
      for (let j = o + 1; j < i; j++) if (lab(toks[j]) === ':' && lab(toks[j + 1]) === 'name' && CALLS.has(toks[j - 1].value)) names.add(toks[j + 1].value);
    }
    // `const cp = require('child_process')` — a receiver
    if (lab(t) === 'name' && lab(toks[i + 1]) === '=' && toks[i + 2] && toks[i + 2].value === 'require' && isCp(toks[i + 4])) recv.add(t.value);
    // `spawnImpl = spawn` (a default parameter / an assignment, not a call) — an alias
    if (lab(t) === 'name' && lab(toks[i + 1]) === '=' && lab(toks[i + 2]) === 'name' && CALLS.has(toks[i + 2].value) && !['(', '.'].includes(lab(toks[i + 3]))) names.add(t.value);
    // `const exec = (…) =>` / `function exec(` — the file's OWN FUNCTION of that name (a wrapper: its body's call is the
    // site): its calls are not child-process calls. Only a FUNCTION value counts — agentd's `const spawn = JSON.stringify(…)`
    // (a string in one block) once hid every bare `spawn(` of the file, the re-exec's among them (§3 control (i))
    const fnValue = (k) => ['(', 'function'].includes(lab(toks[k])) || (lab(toks[k]) === 'name' && toks[k].value === 'async') || (lab(toks[k]) === 'name' && lab(toks[k + 1]) === '=>');
    if (lab(t) === 'name' && CALLS.has(t.value) && ((['const', 'let', 'var'].includes(lab(toks[i - 1])) && lab(toks[i + 1]) === '=' && fnValue(i + 2)) || lab(toks[i - 1]) === 'function')) own.add(t.value);
  }
  for (const n of own) names.delete(n);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (lab(t) !== 'name' || lab(toks[i + 1]) !== '(') continue;
    const prev = toks[i - 1];
    let pty = false, start = i;
    if (lab(prev) === '.') {
      if (!CALLS.has(t.value)) continue;
      const r = toks[i - 2];
      if (lab(r) === 'name' && recv.has(r.value)) start = i - 2;
      else if (isCpRequireAt(toks, i - 2)) start = i - 5;
      else if (lab(r) === ')' && lab(toks[i - 3]) === '(' && lab(toks[i - 4]) === 'name' && toks[i - 4].value === 'pty' && t.value === 'spawn') { pty = true; start = i - 4; }
      else continue;   // a regex's .exec, a client's .fork — not a child process
    } else {
      if (!names.has(t.value) || lab(prev) === 'function') continue;
      const c0 = closeOf(toks, i + 1);
      if (lab(toks[c0 + 1]) === '{') continue;   // `fork(id, …) {` — a method's definition, not a call
    }
    const open = i + 1, close = closeOf(toks, open);
    if (close < 0) continue;
    // HIDDEN: `windowsHide: true` directly inside an object literal that is one of the call's own arguments
    const stack = [];
    let hidden = false;
    for (let j = open + 1; j < close; j++) {
      const L = lab(toks[j]);
      if (OPEN.has(L)) { stack.push(L); continue; }
      if (CLOSE.has(L)) { stack.pop(); continue; }
      if (stack.length === 1 && stack[0] === '{' && (L === 'name' || L === 'string') && toks[j].value === 'windowsHide' && lab(toks[j - 1]) !== '.' && lab(toks[j + 1]) === ':' && lab(toks[j + 2]) === 'true') hidden = true;
    }
    const first = toks[open + 1] && lab(toks[open + 1]) === 'string' && [',', ')'].includes(lab(toks[open + 2])) ? toks[open + 1].value : null;
    out.push({ file: rel, line: t.loc.start.line, callee: t.value, text: text.slice(toks[start].start, toks[close].end).replace(/\s+/g, ' '), first, hidden, pty });
  }
  return out;
}

/** The scope: src/agentd/*.js + the entry's require closure (followed from the entry only — client.js / attach-cli.js are
 *  scanned, their requires are not the daemon's). `read(rel)` → text | null (an overlay for the controls). */
function scopeOf(read, list) {
  const seen = new Set([ENTRY]), q = [ENTRY];
  while (q.length) {
    const f = q.shift();
    const text = read(f);
    if (text == null) continue;
    let toks = [];
    try { toks = tokensOf(text); } catch { continue; }
    for (let i = 0; i + 3 < toks.length; i++) {
      if (lab(toks[i]) !== 'name' || toks[i].value !== 'require' || lab(toks[i + 1]) !== '(' || lab(toks[i + 2]) !== 'string' || lab(toks[i + 3]) !== ')' || !/^\.\.?\//.test(toks[i + 2].value)) continue;
      let p = path.posix.normalize(path.posix.join(path.posix.dirname(f), toks[i + 2].value));
      if (!/\.(js|json|node)$/.test(p)) p += '.js';
      if (p.endsWith('.js') && !seen.has(p) && read(p) != null) { seen.add(p); q.push(p); }
    }
  }
  return [...new Set([...list(AGENTD), ...[...seen].sort()])].filter((f) => read(f) != null);
}
function census({ read, list, fileExempt = FILE_EXEMPT, siteExempt = SITE_EXEMPT }) {
  const files = scopeOf(read, list);
  const rows = [], red = [], errors = [];
  for (const f of files) {
    let s;
    try { s = sitesOf(f, read(f)); } catch (e) { errors.push(`${f}: not tokenized (${e.message})`); continue; }
    const fx = fileExempt.find((x) => x.file === f);
    for (const site of s) {
      const sx = siteExempt.find((x) => x.file === f && site.text.includes(x.needle));
      const kind = fx ? 'file-exempt' : sx ? 'exempt' : site.hidden ? 'hidden' : site.first && POSIX_TOOLS.has(site.first) ? 'posix-tool' : 'RED';
      const row = { ...site, kind, why: fx ? fx.why : sx ? sx.why : kind === 'posix-tool' ? `${site.first}: a POSIX tool — ENOENT on Windows` : '' };
      rows.push(row);
      if (kind === 'RED') red.push(`${f}:${site.line} ${site.text.slice(0, 140)}`);
    }
  }
  const dead = [...siteExempt.filter((x) => !rows.some((r) => r.file === x.file && r.kind === 'exempt' && r.text.includes(x.needle))).map((x) => `${x.file} «${x.needle}»`),
    ...fileExempt.filter((x) => !rows.some((r) => r.file === x.file)).map((x) => `${x.file} (whole file)`)];
  return { files, rows, red, dead, errors };
}
const realRead = (rel) => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { return null; } };
const realList = (dir) => fs.readdirSync(path.join(REPO, dir)).filter((f) => f.endsWith('.js')).sort().map((f) => `${dir}/${f}`);
const overlay = (patch) => (rel) => (Object.prototype.hasOwnProperty.call(patch, rel) ? patch[rel] : realRead(rel));

// ── §1 ──
console.log('§1 every child-process call site of the daemon is hidden, a POSIX tool by name, or a named exception');
const C = census({ read: realRead, list: realList });
const byKind = (k) => C.rows.filter((r) => r.kind === k);
console.log(`    scope: ${C.files.length} files (src/agentd/*.js + the entry's require closure) · ${C.rows.length} call sites — hidden ${byKind('hidden').length} · posix-tool ${byKind('posix-tool').length} · exempt ${byKind('exempt').length} · file-exempt ${byKind('file-exempt').length}`);
for (const r of C.rows) console.log(`      ${r.kind.padEnd(11)} ${r.file}:${r.line}  ${r.text.slice(0, 96)}${r.why ? '  — ' + r.why.slice(0, 80) : ''}`);
ok(C.errors.length === 0, 'every file of the scope tokenizes', C.errors);
ok(C.files.includes(ENTRY) && C.files.includes('src/exit-shell.js') && C.files.includes('src/machine-probes.js') && C.files.includes('src/opencode-serve.js') && C.files.length > 40, `the scope is the daemon's whole closure (${C.files.length} files: the entry, exit-shell, machine-probes, opencode-serve …)`);
ok(C.red.length === 0, `no call site starts a child unhidden (${C.red.length} RED)`, C.red);
ok(C.dead.length === 0, 'every exception row names a live site / a file with sites (no dead row)', C.dead);
ok(byKind('hidden').length >= 20, `${byKind('hidden').length} hidden sites (a census that found nothing proves nothing)`);

// ── §2 ──
console.log('§2 the sites the owner hit, by name');
const site = (file, needle) => C.rows.filter((r) => r.file === file && r.text.includes(needle));
const NAMED = [
  ['run-cmd', ENTRY, 'execFile(plan.file, plan.args, {', 1],
  ['both discovery-snapshot children', ENTRY, "'--discovery-snapshot-child']", 2],
  ['the usage-scan child', ENTRY, "'--usage-scan-child'", 1],
  ['the stdio-bridge daemon spawn (cpB.spawn)', ENTRY, 'cpB.spawn(process.execPath, [__filename]', 1],
  ['the streaming exec (`{ spawn: sp }`)', ENTRY, 'sp(String(cmd)', 1],
  ['the detached session spawn', ENTRY, "require('child_process').spawn(cmd, args || [], {", 1],
  ['the self-upgrade re-exec', ENTRY, 'spawn(process.execPath, reExecArgv(', 1],
  ['the console code-page probe (XS.codePageAsker)', 'src/exit-shell.js', 'execFile(p.file, p.args, {', 1],
  ['`claude --version` (machine-probes)', 'src/machine-probes.js', 'execFile(cmd, args, {', 1],
  ['the OpenCode serve', 'src/opencode-serve.js', "spawnImpl(cmd, ['serve'", 1],
  ['the OpenCode serve cwd\'s git init', 'src/opencode-serve.js', "execImpl('git', ['init'", 1],
  ['codex app-server', 'src/codex-thread-read.js', '_cfg.extraArgs)], { stdio:', 1],   // (never the quoted subcommand here: §50b reads a suite's spawn lines)
];
for (const [name, file, needle, n] of NAMED) { const s = site(file, needle); ok(s.length === n && s.every((r) => r.kind === 'hidden'), `${name}: ${n} site(s), windowsHide: true`, s.map((r) => `${r.file}:${r.line} ${r.kind}`)); }
const AD = realRead(ENTRY);
const reexec = site(ENTRY, 'spawn(process.execPath, reExecArgv(')[0];
ok(!!reexec && /detached: true, stdio: 'ignore', windowsHide: true/.test(reexec.text), 'the re-exec keeps `detached: true, stdio: \'ignore\', windowsHide: true` (the daemon itself is console-less)', reexec && reexec.text);
ok(/XS\.codePageAsker\(\{ execFile: require\('child_process'\)\.execFile/.test(AD) && !/CODEPAGE_PROBES/.test(AD), 'agentd asks the code page through the PURE asker only (no probe of its own)');
ok(site(ENTRY, 'pty().spawn(').length === 1 && site(ENTRY, 'pty().spawn(')[0].kind === 'exempt', 'node-pty\'s ConPTY spawn is the one named exception in agentd.js');

// ── §3 controls ──
console.log('§3 controls (patched copies of the text, in memory)');
const redOf = (patch, opts = {}) => census({ read: overlay(patch), list: realList, ...opts });
const swap = (rel, from, to) => { const s = realRead(rel); const t = s.replace(from, to); return { applies: t !== s, text: t }; };
const ca = swap(ENTRY, 'windowsHide: true, timeout: Math.min(Number(msg.timeoutMs)', 'timeout: Math.min(Number(msg.timeoutMs)');
const ra = redOf({ [ENTRY]: ca.text });
ok(ca.applies && ra.red.length === 1 && /execFile\(plan\.file, plan\.args/.test(ra.red[0]), 'CONTROL (a): run-cmd without windowsHide ⇒ RED at its line', ra.red);
const cb = swap(ENTRY, "so must the re-exec\n              detached: true, stdio: 'ignore', windowsHide: true,", "so must the re-exec\n              detached: true, stdio: 'ignore',");
const rb = redOf({ [ENTRY]: cb.text });
ok(cb.applies && rb.red.length === 1 && /reExecArgv/.test(rb.red[0]), 'CONTROL (b): the re-exec without windowsHide ⇒ RED', rb.red);
const cc = swap('src/exit-shell.js', "env: envOf(), windowsHide: true, windowsVerbatimArguments: true", "env: envOf(), windowsVerbatimArguments: true");
const rc = redOf({ 'src/exit-shell.js': cc.text });
ok(cc.applies && rc.red.length === 1 && /p\.file, p\.args/.test(rc.red[0]), 'CONTROL (c): the code-page probe without windowsHide ⇒ RED', rc.red);
const rd = redOf({ [ENTRY]: AD + "\nfunction plantedRun() { require('child_process').execFile('cmd.exe', ['/d', '/c', 'ver'], { timeout: 1000 }, () => { }); }\n" });
ok(rd.red.length === 1 && /require\('child_process'\)\.execFile\('cmd\.exe'/.test(rd.red[0]), 'CONTROL (d): a planted `require(\'child_process\').execFile(` without windowsHide ⇒ RED', rd.red);
const ML = "\nfunction plantedStream() {\n  const { spawn: sp2 } = require('child_process');\n  return sp2('node.exe', ['-e', '1'], {\n    env: process.env,\n    stdio: ['ignore', 'pipe', 'pipe'],%HIDE%\n  });\n}\n";
const re1 = redOf({ [ENTRY]: AD + ML.replace('%HIDE%', '') }), re2 = redOf({ [ENTRY]: AD + ML.replace('%HIDE%', '\n    windowsHide: true,') });
ok(re1.red.length === 1 && /sp2\('node\.exe'/.test(re1.red[0]) && re2.red.length === 0, 'CONTROL (e): a planted multi-line `{ spawn: sp2 }` call ⇒ RED; with `windowsHide: true` on a line of its own ⇒ green (the options object is read whole)', { re1: re1.red, re2: re2.red });
const rf = redOf({ [ENTRY]: AD + "\nconst plantedMod = require('./../zz-planted-spawn.js');\n", 'src/zz-planted-spawn.js': "'use strict';\nconst { spawn } = require('child_process');\nmodule.exports = () => spawn('powershell.exe', ['-NoProfile'], { stdio: 'ignore' });\n" });
ok(rf.files.includes('src/zz-planted-spawn.js') && rf.red.length === 1 && /powershell\.exe/.test(rf.red[0]), 'CONTROL (f): a module the entry newly requires, with an unhidden spawn ⇒ RED (the closure is derived, not listed)', rf.red);
const rg = redOf({}, { siteExempt: [...SITE_EXEMPT, { file: ENTRY, needle: 'execFile(\'no-such-site\'', why: 'dead' }] });
ok(rg.dead.length === 1 && /no-such-site/.test(rg.dead[0]), 'CONTROL (g): an exception row that names no site ⇒ RED (dead row)', rg.dead);
const rh = redOf({ [ENTRY]: AD + "\nfunction plantedPs(pid) { return require('child_process').execFileSync('ps', ['-p', String(pid)]); }\nfunction plantedRe(s) { return /x/.exec(s); }\n" });
ok(rh.red.length === 0 && rh.rows.some((r) => r.kind === 'posix-tool' && /plantedPs|execFileSync\('ps'/.test(r.text)), 'CONTROL (h): a literal POSIX tool (`ps`) needs no windowsHide; a regex\'s `.exec(` is not a site', rh.red);

const ri = redOf({ [ENTRY]: AD + "\nfunction plantedShadow() { const execFile = 'a string, not a function'; return execFile.length; }\n" });
ok(ri.red.length === 0 && ri.rows.filter((r) => r.file === ENTRY && r.kind === 'hidden').length === C.rows.filter((r) => r.file === ENTRY && r.kind === 'hidden').length, 'CONTROL (i): a local `const execFile = \'…\'` (a value, not a function) hides none of the file\'s sites (the shape that once hid the re-exec)', ri.rows.filter((r) => r.file === ENTRY).length);

console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${Date.now() - T0} ms` : `\nALL PASS (${pass}) · ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
