#!/usr/bin/env node
// test-agentd-hidden-start — lane win-device-boot-hidden (2026-10-19; after a reboot the owner found a black Windows Terminal
// window titled 「vibespace-device」 on the desktop — "这是啥 能关掉吗" — and closing it ended the agent until the next logon).
// THE DEVICE DAEMON ITSELF IS CONSOLE-LESS AT EVERY LAUNCH SITE: the installer's logon task ran `cmd.exe /c … node …` (a
// console program a task starts gets a console; Windows 11 hands it to Windows Terminal), while the first launch, the
// re-exec and the --stdio bridge were hidden already. FAST, in-process (no Windows here: the PowerShell texts were also
// measured in a real PowerShell engine by the lane — the twin, the -Command text bound by a stub Start-Process, the
// one-shots through -EncodedCommand; see the lane report).
//   §1 the PURE rules: needsConsoleLook · consoleOf (the exit-code channel) · selfHealVerdict (visible + not marked ⇒ re-exec;
//      marked ⇒ never again; not Windows ⇒ never) · consoleStep over fakes (one re-exec, the loop guard) · logonTaskName ·
//      psQuote (the four single quotes PowerShell reads).
//   §2 the installer's task action, a unit over the ps1 fragment: no cmd.exe, powershell.exe -WindowStyle Hidden →
//      Start-Process -WindowStyle Hidden, the node path a quoted literal, the script quoted for node, -Hidden settings;
//      THE TWIN: the ps1's own concatenation (evaluated here) == hidden-start's logonTaskArgs for four profile paths.
//      MUTANTS: the old cmd.exe action back in the ps1 ⇒ RED; logonTaskArgs back to cmd.exe ⇒ the twin RED.
//   §3 the re-register is idempotent: ensureLogonTask over a fake task store — the old action rewritten once, then nothing
//      written; absent ⇒ never created; foreign ⇒ left alone; a failed write / an unreadable read said. MUTANT: a verdict
//      that always rewrites ⇒ a second write ⇒ RED.
//   §4 THE LAUNCH-SITE CENSUS: every start of the DAEMON on win32 is hidden — agentd.js's `spawn(process.execPath, [__filename]
//      | reExecArgv(…))` sites (acorn AST: detached + stdio 'ignore' + windowsHide: true), the ps1's node starts (Start-Process
//      -WindowStyle Hidden; a task action that is powershell.exe -WindowStyle Hidden; no foreground `& $nodeExe` daemon), the
//      hub / POSIX sites as named rows with their reason (a dead row ⇒ RED). CONTROLS: planted unhidden sites ⇒ RED.
//   §5 the wiring in agentd.js: the console step before the singleton, the successor marked, the mark one hop (daemonEnv
//      drops it), the task step async on win32 only, both one-shots hidden + bounded.
// Run: node scripts/test-agentd-hidden-start.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const acorn = require('acorn');
const HS = require(path.join(REPO, 'src/agentd/hidden-start.js'));
const { daemonEnv, DAEMON_ENV_KEEP } = require(path.join(REPO, 'src/agent-env.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) : '')); } };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b });
const rd = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const AD = rd('src/agentd/agentd.js'), PS1 = rd('scripts/vibespace-agentd-install.ps1'), HS_SRC = rd('src/agentd/hidden-start.js');
// a module from patched text (a mutant), never from src/
const modOf = (text) => { const m = { exports: {} }; new Function('module', 'exports', 'require', 'Buffer', text)(m, m.exports, require, Buffer); return m.exports; };

// ── §1 ──
console.log('§1 the PURE rules');
eq([[true, false, true], [true, true, true], [true, false, false], [false, false, true]].map(([w, m, a]) => HS.needsConsoleLook({ platform: w ? 'win32' : 'linux', marked: m, attached: a })), [true, false, false, false], 'needsConsoleLook: only win32 + not marked + a console handle on a std stream');
eq([20, 21, 22, 23, 0, 1, null, undefined, 24].map(HS.consoleOf), ['visible', 'hidden', 'no-window', 'none', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown'], 'consoleOf: the exit-code channel (20 visible · 21 hidden · 22 no window · 23 none; anything else = could not tell)');
const V = (platform, marked, c) => HS.selfHealVerdict({ platform, marked, console: c }).act;
eq(['visible', 'hidden', 'no-window', 'none', 'unknown'].map((c) => V('win32', false, c)), ['re-exec', 'stay', 'stay', 'stay', 'stay'], 'selfHealVerdict: a console the person can SEE + not marked ⇒ re-exec; hidden / windowless / none / unknown ⇒ stay');
eq(['visible', 'hidden'].map((c) => V('win32', true, c)), ['stay', 'stay'], 'selfHealVerdict: MARKED ⇒ never again (the successor of a re-exec is born marked)');
eq(['linux', 'darwin', 'freebsd'].map((p) => V(p, false, 'visible')), ['stay', 'stay', 'stay'], 'selfHealVerdict: not Windows ⇒ never');
const stepWith = (o, code) => { const calls = { look: 0, reExec: 0, log: [] }; const v = HS.consoleStep({ platform: 'win32', marked: false, attached: true, ...o, look: () => { calls.look++; return code; }, reExec: () => { calls.reExec++; }, log: (l) => calls.log.push(l) }); return { v, ...calls }; };
const s1 = stepWith({}, 20);
ok(s1.v.act === 're-exec' && s1.look === 1 && s1.reExec === 1 && s1.log.length === 1 && /re-exec hidden, once/.test(s1.log[0]), 'consoleStep: a visible console ⇒ ONE look, ONE re-exec, one log line', s1);
const s2 = stepWith({ marked: true }, 20);
ok(s2.v.act === 'stay' && s2.look === 0 && s2.reExec === 0, 'consoleStep: THE LOOP GUARD — the marked successor never looks (even if its console read visible)', s2);
const s3 = stepWith({ attached: false }, 20), s4 = stepWith({ platform: 'linux' }, 20);
ok(s3.look === 0 && s3.reExec === 0 && s4.look === 0 && s4.reExec === 0, 'consoleStep: no console handle (a re-exec\'d daemon: stdio ignore) / not Windows ⇒ never looked at', { s3, s4 });
const s5 = stepWith({}, 21), s6 = stepWith({}, 1);
ok(s5.v.act === 'stay' && s5.reExec === 0 && s5.log.length === 0 && s6.v.act === 'stay' && s6.v.console === 'unknown' && s6.reExec === 0 && s6.log.length === 1 && /could not tell/.test(s6.log[0]), 'consoleStep: a hidden console ⇒ stay, silent (the installer\'s first launch); a look that failed ⇒ stay and SAID once', { s5, s6 });
eq(['C:\\Users\\ada\\.vibespace\\device@hub.example.ts.net', 'C:\\Users\\ada\\.vibespace\\device@10.0.0.7\\', '/home/u/.vibespace/agentd', 'C:\\Users\\ada\\.vibespace\\agentd', ''].map(HS.logonTaskName), ['VibeSpaceDevice-hub.example.ts.net', 'VibeSpaceDevice-10.0.0.7', null, null, null], 'logonTaskName: the installer\'s VibeSpaceDevice-<dialHost> from …\\device@<dialHost>; any other root has no task of ours');
eq([HS.psQuote("a'b"), HS.psQuote('c\u2019d'), HS.psQuote('e\u2018\u201A\u201Bf'), HS.psQuote('C:\\x y')], ["'a''b'", "'c\u2019\u2019d'", "'e\u2018\u2018\u201A\u201A\u201B\u201Bf'", "'C:\\x y'"], 'psQuote: every single quote PowerShell reads (\' ‘ ’ ‚ ‛) is doubled inside the literal');

// ── §2 ──
console.log('§2 the installer\'s task action (a unit over the ps1 fragment) + the twin');
const PERSIST_FROM = 'function Quote-Ps(', PERSIST_TO = '} catch { Write-Host "   (no scheduled task: $_)" }';
const persistOf = (ps1) => { const a = ps1.indexOf(PERSIST_FROM), b = ps1.indexOf(PERSIST_TO, a); return a >= 0 && b > a ? ps1.slice(a, b + PERSIST_TO.length) : ''; };
function taskUnit(ps1) {
  const blk = persistOf(ps1), bad = [];
  if (!blk) return ['no persistence block'];
  if (/cmd(\.exe)?\b/i.test(blk.replace(/^\s*#.*$/gm, ''))) bad.push('cmd.exe in the task block');
  const acts = [...blk.matchAll(/New-ScheduledTaskAction\s+-Execute\s+'([^']*)'/g)].map((m) => m[1]);
  if (acts.length !== 1 || acts[0] !== 'powershell.exe') bad.push('the action is not ONE powershell.exe: ' + JSON.stringify(acts));
  if (!/\$taskArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' \+ \$launch \+ '"'/.test(blk)) bad.push('the outer PowerShell is not -WindowStyle Hidden');
  if (!/'; Start-Process -WindowStyle Hidden -FilePath ' \+ \(Quote-Ps \$nodeExe\)/.test(blk)) bad.push('node is not started -WindowStyle Hidden with its path a quoted literal');
  if (!/' -ArgumentList \(\[char\]34\+' \+ \(Quote-Ps "\$current\\vibespace-device\.js"\) \+ '\+\[char\]34\)'/.test(blk)) bad.push('the script path is not quoted for node');
  if (!/New-ScheduledTaskSettingsSet -Hidden /.test(blk)) bad.push('the task definition is not -Hidden');
  if (!/Register-ScheduledTask -TaskName \$task -Action \$a -Trigger \(New-ScheduledTaskTrigger -AtLogOn\) -Settings \$s -Force/.test(blk)) bad.push('not the logon registration');
  return bad;
}
ok(taskUnit(PS1).length === 0, 'the ps1 task: no cmd.exe; Execute powershell.exe -WindowStyle Hidden → Start-Process -WindowStyle Hidden; node a quoted literal; the script quoted for node; -Hidden settings; AtLogOn -Force', taskUnit(PS1));
ok(PS1.includes(`function Quote-Ps([string]$s) { return "'" + ($s -replace '[''\\u2018\\u2019\\u201A\\u201B]', '$0$0') + "'" }`) && HS_SRC.includes(`const psQuote = (s) => "'" + String(s).replace(/['\\u2018\\u2019\\u201A\\u201B]/g, '$&$&') + "'";`), 'Quote-Ps (ps1) and psQuote (daemon) double the SAME four characters');
// the ps1's concatenation, evaluated: 'literal' ('' escape) · (Quote-Ps $v) · (Quote-Ps "…$v…") · $v, joined by +
function psConcat(rhs, vars) {
  let i = 0, out = '';
  const varOf = (n) => { if (!(n in vars)) throw new Error('unknown $' + n); return vars[n]; };
  const dq = () => { let s = ''; i++; while (rhs[i] !== '"') { if (rhs[i] === '`') throw new Error('backtick'); if (rhs[i] === '$') { const m = /^\$(\w+)/.exec(rhs.slice(i)); s += varOf(m[1]); i += m[0].length; } else s += rhs[i++]; } i++; return s; };
  while (i < rhs.length) {
    const c = rhs[i];
    if (/\s|\+/.test(c)) { i++; continue; }
    if (c === "'") { let s = ''; i++; for (;;) { if (rhs[i] === "'" && rhs[i + 1] === "'") { s += "'"; i += 2; } else if (rhs[i] === "'") { i++; break; } else s += rhs[i++]; } out += s; continue; }
    if (rhs.startsWith('(Quote-Ps ', i)) { i += 10; let v; if (rhs[i] === '"') v = dq(); else { const m = /^\$(\w+)/.exec(rhs.slice(i)); v = varOf(m[1]); i += m[0].length; } if (rhs[i] !== ')') throw new Error('at ' + i); i++; out += HS.psQuote(v); continue; }
    if (c === '$') { const m = /^\$(\w+)/.exec(rhs.slice(i)); out += varOf(m[1]); i += m[0].length; continue; }
    throw new Error('unsupported at ' + i + ': ' + rhs.slice(i, i + 30));
  }
  return out;
}
function twinOf(ps1, hs, c) {
  const blk = persistOf(ps1);
  const L = /\$launch = ([\s\S]*?)\n\s*\$taskArgs = (.*)\n/.exec(blk);
  if (!L) return { error: 'no $launch / $taskArgs' };
  const vars = { root: c.root, nodeExe: c.node, current: c.root + '\\current' };
  try { vars.launch = psConcat(L[1], vars); return { ps1: psConcat(L[2], vars), daemon: hs.logonTaskArgs({ root: c.root, nodeExe: c.node, script: c.root + '\\current\\vibespace-device.js' }) }; }
  catch (e) { return { error: e.message }; }
}
const CASES = [
  { root: 'C:\\Users\\ada\\.vibespace\\device@hub.example.ts.net', node: 'C:\\Users\\ada\\.vibespace\\device@hub.example.ts.net\\node\\node.exe' },
  { root: "C:\\Users\\Jo O'Brien\\.vibespace\\device@10.0.0.7", node: 'C:\\Program Files\\nodejs\\node.exe' },
  { root: 'C:\\Users\\张三 李\\.vibespace\\device@vs.local', node: 'C:\\Users\\张三 李\\AppData\\Local\\Programs\\nodejs\\node.exe' },
  { root: 'C:\\Users\\Ma\u2019ry\\.vibespace\\device@h', node: 'C:\\Program Files (x86)\\nodejs\\node.exe' },
];
for (const c of CASES) { const t = twinOf(PS1, HS, c); ok(!t.error && t.ps1 === t.daemon, `THE TWIN (${c.root}): the installer's task text == the daemon's logonTaskArgs`, t); }
const t0 = twinOf(PS1, HS, CASES[1]).daemon;
ok(/^-NoProfile -NonInteractive -WindowStyle Hidden -Command "[^"]*"$/.test(t0) && /Start-Process -WindowStyle Hidden -FilePath 'C:\\Program Files\\nodejs\\node\.exe' -ArgumentList \(\[char\]34\+'C:\\Users\\Jo O''Brien\\[^']*\\current\\vibespace-device\.js'\+\[char\]34\)/.test(t0) && !/cmd\.exe/i.test(t0), 'the text itself: hidden PowerShell, ONE double-quoted -Command (no " inside), node + script as literals, no cmd.exe', t0);
const OLD_ACTION = "  $taskArgs = \"/c set VIBESPACE_DEVICE_ROOT=$root&& set VIBESPACE_AGENTD_ROOT=$root&& `\"$nodeExe`\" `\"$current\\vibespace-device.js`\"\"\n  $a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $taskArgs\n";
const mPs1 = PS1.replace(/  \$launch = [\s\S]*?\n  \$a = New-ScheduledTaskAction -Execute 'powershell\.exe' -Argument \$taskArgs\n/, OLD_ACTION);
const mu = taskUnit(mPs1);
ok(mPs1 !== PS1 && mu.some((b) => /cmd\.exe in the task block/.test(b)) && mu.some((b) => /not ONE powershell/.test(b)), 'MUTANT: the old `cmd.exe /c set …&& node` action back in the ps1 ⇒ RED', mu);
const mHs = modOf(HS_SRC.replace("return `-NoProfile -NonInteractive -WindowStyle Hidden -Command \"${launch}\"`;", "return `/c set VIBESPACE_DEVICE_ROOT=${r}&& set VIBESPACE_AGENTD_ROOT=${r}&& \"${nodeExe}\" \"${script}\"`;"));
const mt = twinOf(PS1, mHs, CASES[0]);
ok(mt.ps1 !== mt.daemon && /^\/c set /.test(mt.daemon), 'MUTANT: logonTaskArgs back to the cmd.exe form ⇒ the twin RED', mt);
ok(/-ArgumentList @\("`"\$current\\vibespace-device\.js`""\) `\n\s*-RedirectStandardOutput \$out/.test(PS1) && /\$p = Start-Process -PassThru -WindowStyle Hidden \$nodeExe/.test(PS1), 'the FIRST launch: Start-Process -WindowStyle Hidden, the script path quoted for node (PS 5.1 joins -ArgumentList unquoted)');

// ── §3 ──
console.log('§3 the re-register is idempotent (a fake task store)');
const OLD = 'set VIBESPACE_DEVICE_ROOT=X&& set VIBESPACE_AGENTD_ROOT=X&& "C:\\n\\node.exe" "C:\\Users\\ada\\.vibespace\\device@hub.example.ts.net\\current\\vibespace-device.js"';
const unPs = (lit) => lit.slice(1, -1).replace(/(['\u2018\u2019\u201A\u201B])\1/g, '$1');
function fakePs(store, { writeCode = 0, readOut = null } = {}) {
  const calls = { read: 0, write: 0 };
  const b = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  const ps = async (script) => {
    if (/Register-ScheduledTask/.test(script)) {
      calls.write++;
      if (writeCode) return { code: writeCode, stdout: '' };
      const m = /-Execute 'powershell\.exe' -Argument ('(?:[^'\u2018\u2019\u201A\u201B]|['\u2018\u2019\u201A\u201B]{2})*')\n/.exec(script);
      store.task = { execute: 'powershell.exe', args: unPs(m[1]) };
      return { code: 0, stdout: 'vs-task written\r\n' };
    }
    if (/Get-ScheduledTask/.test(script)) { calls.read++; if (readOut !== null) return { code: 1, stdout: readOut }; return { code: 0, stdout: store.task ? `vs-task ${b(store.task.execute)} ${b(store.task.args)}\r\n` : 'vs-task none\r\n' }; }
    return { code: 1, stdout: '' };
  };
  return { ps, calls };
}
const ROOT = CASES[1].root, NODE = CASES[1].node, SCRIPT = ROOT + '\\current\\vibespace-device.js';
const lines = [];
const st = { task: { execute: 'cmd.exe', args: OLD } }, f1 = fakePs(st);
const r1 = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: f1.ps, log: (l) => lines.push(l) });
const r2 = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: f1.ps, log: (l) => lines.push(l) });
const r3 = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: f1.ps, log: (l) => lines.push(l) });
ok(r1.act === 'rewritten' && r2.act === 'same' && r3.act === 'same' && f1.calls.write === 1 && f1.calls.read === 3 && lines.length === 1 && /re-registered to start hidden/.test(lines[0]) && /cmd\.exe/.test(lines[0]), 'the old cmd.exe action: rewritten ONCE (one log line naming what it was), then read and left — nothing written again', { r1, r2, r3, calls: f1.calls, lines });
ok(st.task.execute === 'powershell.exe' && st.task.args === HS.logonTaskArgs({ root: ROOT, nodeExe: NODE, script: SCRIPT }) && r1.name === 'VibeSpaceDevice-10.0.0.7', 'what was written is the hidden action, exact (a quote in the profile path survives the write literal), under our name', st.task);
const fa = fakePs({ task: null }), la = [];
const ra = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: fa.ps, log: (l) => la.push(l) });
ok(ra.act === 'absent' && fa.calls.write === 0 && la.length === 0, 'no task ⇒ never CREATED (the person removed it, or the install made none)', { ra, calls: fa.calls });
const ff = fakePs({ task: { execute: 'C:\\tools\\my-launcher.exe', args: '--start something' } }), lf = [];
const rf = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: ff.ps, log: (l) => lf.push(l) });
ok(rf.act === 'foreign' && ff.calls.write === 0 && lf.length === 1 && /left as it is/.test(lf[0]), 'a task under our name that starts something else ⇒ left alone, said once', { rf, lf });
const fm = fakePs({ task: { execute: 'powershell.exe', args: HS.logonTaskArgs({ root: ROOT, nodeExe: 'C:\\old\\node.exe', script: SCRIPT }) } });
const rm = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: fm.ps });
ok(rm.act === 'rewritten' && fm.calls.write === 1, 'the hidden action with a moved node ⇒ rewritten to the node this daemon runs under', rm);
const fw = fakePs({ task: { execute: 'cmd.exe', args: OLD } }, { writeCode: 1 }), lw = [];
const rw = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: fw.ps, log: (l) => lw.push(l) });
const fu = fakePs({}, { readOut: 'Get-ScheduledTask : Access is denied.' }), lu = [];
const ru = await HS.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: fu.ps, log: (l) => lu.push(l) });
ok(rw.act === 'write-failed' && lw.length === 1 && /FAILED/.test(lw[0]) && ru.act === 'unreadable' && fu.calls.write === 0 && lu.length === 1, 'a failed write and an unreadable read are SAID (one line each); an unreadable task is never written', { rw, lw, ru, lu });
const rn = await HS.ensureLogonTask({ root: 'C:\\Users\\ada\\.vibespace\\agentd', nodeExe: NODE, script: SCRIPT, ps: async () => { throw new Error('must not run'); } });
ok(rn.act === 'no-task-name', 'a root that is not device@<host> has no task of ours ⇒ no PowerShell at all', rn);
const mV = modOf(HS_SRC.replace("if (exe === 'powershell.exe' && args.trim() === String(want).trim()) return 'same';", ''));
const sm = { task: { execute: 'cmd.exe', args: OLD } }, fmv = fakePs(sm);
await mV.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: fmv.ps }); await mV.ensureLogonTask({ root: ROOT, nodeExe: NODE, script: SCRIPT, ps: fmv.ps });
ok(fmv.calls.write === 2, 'MUTANT: a verdict without the `same` row rewrites at EVERY start ⇒ 2 writes ⇒ RED (the real rule: 1)', fmv.calls);

// ── §4 ──
console.log('§4 THE LAUNCH-SITE CENSUS — every start of the daemon on win32 is hidden');
function daemonSites(text, file) {
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true });
  const out = [];
  const isExecPath = (n) => n && n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'process' && n.property.name === 'execPath';
  const isDaemonArgs = (n) => n && ((n.type === 'ArrayExpression' && n.elements.length === 1 && n.elements[0].type === 'Identifier' && n.elements[0].name === '__filename') || (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'reExecArgv') || n.type === 'Identifier');   // a computed argv (startSuccessor's) counts — it must be hidden
  const prop = (o, k) => o && o.type === 'ObjectExpression' && o.properties.find((p) => p.type === 'Property' && (p.key.name === k || p.key.value === k));
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression') {
      const cal = n.callee, name = cal.type === 'Identifier' ? cal.name : cal.type === 'MemberExpression' ? cal.property.name : '';
      if (/^(spawn|execFile|fork)$/.test(name) && isExecPath(n.arguments[0]) && isDaemonArgs(n.arguments[1])) {
        const o = n.arguments[2], v = (k) => { const p = prop(o, k); return p && p.value.type === 'Literal' ? p.value.value : undefined; };
        out.push({ file, line: n.loc.start.line, text: text.slice(n.start, Math.min(n.end, n.start + 90)).replace(/\s+/g, ' '), hidden: v('windowsHide') === true && v('detached') === true && v('stdio') === 'ignore' });
      }
    }
    for (const k of Object.keys(n)) { const c = n[k]; if (Array.isArray(c)) c.forEach(walk); else if (c && typeof c.type === 'string') walk(c); }
  };
  walk(ast);
  return out;
}
const PS1_STARTS = (ps1) => {
  const rows = [], code = ps1.split('\n').map((l, i) => ({ l, n: i + 1 })).filter((x) => !/^\s*#/.test(x.l));
  for (const { l, n } of code) {
    if (/^\s*(\$\w+\s*=\s*)?Start-Process\b[^\n]*\$nodeExe/.test(l)) rows.push({ line: n, kind: 'first launch', hidden: /-WindowStyle Hidden/.test(l) });
    if (/New-ScheduledTaskAction\b/.test(l)) { const m = /-Execute '([^']*)'/.exec(l); rows.push({ line: n, kind: 'logon task', hidden: !!m && m[1] === 'powershell.exe' && taskUnit(ps1).length === 0 }); }
    // int316: device-allow-flags' `--write-policy` (the allow-list writer) is a one-shot like the dial check — it exits
    // before the daemon body (src/agentd/agentd.js), so it is never a daemon in the installer's console
    if (/&\s*\$nodeExe\b[^\n]*vibespace-device\.js/.test(l) && !/--dial-check|--write-policy/.test(l)) rows.push({ line: n, kind: 'foreground daemon', hidden: false });
  }
  return rows;
};
const HUB_ROWS = [
  { file: 'src/agentd/client.js', needle: "spawn(process.execPath, [path.join(this._root, 'current', 'agentd.js')]", why: 'the HUB\'s own local daemon (DeviceManager._spawnLocal) — the hub runs on Linux / macOS, never Windows' },
  { file: 'src/hosts.js', needle: 'installAgentd(id, bundlePath, version, hostToken) {', why: 'ssh hosts: a POSIX remote (tar + setsid over ssh) — no Windows console' },
  { file: 'scripts/vibespace-agentd-install.sh', needle: 'launchctl bootstrap', why: 'the macOS / Linux installer: launchd / systemd units, no console' },
];
function census({ ad = AD, ps1 = PS1, hubRows = HUB_ROWS } = {}) {
  const js = daemonSites(ad, 'src/agentd/agentd.js'), ps = PS1_STARTS(ps1);
  const red = [...js.filter((s) => !s.hidden).map((s) => `${s.file}:${s.line} ${s.text}`), ...ps.filter((s) => !s.hidden).map((s) => `ps1:${s.line} ${s.kind}`)];
  const dead = hubRows.filter((r) => !rd(r.file).includes(r.needle)).map((r) => r.file + ' ' + r.needle);
  return { js, ps, red, dead };
}
const C = census();
console.log(`    ${C.js.length} daemon starts in agentd.js, ${C.ps.length} in the ps1, ${HUB_ROWS.length} hub / POSIX rows`);
ok(C.red.length === 0 && C.dead.length === 0, 'every daemon start is hidden (agentd: detached + stdio ignore + windowsHide: true; ps1: -WindowStyle Hidden / the hidden task); no dead hub row', { red: C.red, dead: C.dead });
ok(C.js.length === 2 && C.js.some((s) => /cpB\.spawn\(process\.execPath, \[__filename\]/.test(s.text)) && C.js.some((s) => /spawn\(process\.execPath, argv, \{/.test(s.text)), 'agentd.js starts the daemon at exactly TWO sites: the --stdio bridge and startSuccessor (THE re-exec)', C.js);
ok((AD.match(/startSuccessor\(/g) || []).length === 3 && /startSuccessor\(reExecArgv\(path\.join\(dir, path\.basename\(process\.argv\[1\] \|\| 'agentd\.js'\)\)\), \{ VIBESPACE_AGENTD_VERSION: version \}\)/.test(AD) && /startSuccessor\(reExecArgv\(process\.argv\[1\] \|\| __filename\), \{ \[HS\.HIDDEN_MARK\]: '1' \}\)/.test(AD), 'startSuccessor: one definition, two callers — the self-upgrade (its version) and the console self-heal (the mark)');
eq(C.ps.map((s) => s.kind), ['first launch', 'logon task'], 'the ps1 starts the daemon at TWO sites: the first launch and the logon task (the dial check and the allow-list writer are one-shots, not daemons)');
const pj = census({ ad: AD + "\nfunction plantedStart() { require('child_process').spawn(process.execPath, [__filename], { detached: true, stdio: 'ignore' }).unref(); }\n" });
ok(pj.red.length === 1 && /plantedStart|spawn\(process\.execPath, \[__filename\]/.test(pj.red[0]), 'CONTROL: a planted daemon start without windowsHide ⇒ RED', pj.red);
const pp = census({ ps1: PS1.replace('$p = Start-Process -PassThru -WindowStyle Hidden $nodeExe', '$p = Start-Process -PassThru $nodeExe') });
ok(pp.red.length === 1 && /first launch/.test(pp.red[0]), 'CONTROL: the first launch without -WindowStyle Hidden ⇒ RED', pp.red);
const pc = census({ ps1: mPs1 });
ok(pc.red.length === 1 && /logon task/.test(pc.red[0]), 'CONTROL: the old cmd.exe task action ⇒ RED', pc.red);
const pf = census({ ps1: PS1.replace("Write-Host \"-> starting daemon with dial-out to $Dial\"", "Write-Host \"-> starting daemon with dial-out to $Dial\"\n& $nodeExe \"$current\\vibespace-device.js\"") });
ok(pf.red.some((r) => /foreground daemon/.test(r)), 'CONTROL: a foreground `& $nodeExe …vibespace-device.js` (the daemon in the installer\'s own console) ⇒ RED', pf.red);
const pd = census({ hubRows: [...HUB_ROWS, { file: 'src/hosts.js', needle: 'no-such-site(', why: 'dead' }] });
ok(pd.dead.length === 1, 'CONTROL: a hub row that names no site ⇒ RED (dead row)', pd.dead);

// ── §5 ──
console.log('§5 the wiring in agentd.js');
// the daemon body's guard: never --stdio / --dial-check (later one-shot modes may extend the same line)
const gm = /^if \(!process\.argv\.includes\('--stdio'\) && !process\.argv\.includes\('--dial-check'\)[^\n]*\) \{\n/m.exec(AD), gate = gm ? gm.index : -1, stepAt = AD.indexOf('HS.consoleStep({'), lockAt = AD.indexOf('if (!acquireSingleton()) {');
ok(gate > 0 && stepAt > gate && lockAt > stepAt && AD.indexOf('HS.consoleStep(') === stepAt && AD.lastIndexOf('HS.consoleStep(') === stepAt, 'the console step runs ONCE, inside the daemon body (never --stdio / --dial-check), BEFORE the singleton (the successor takes it)');
const step = AD.slice(stepAt, lockAt);
ok(/platform: process\.platform, marked: process\.env\.VIBESPACE_AGENTD_HIDDEN === '1',/.test(step) && /attached: \[0, 1, 2\]\.some\(\(fd\) => \{ try \{ return require\('tty'\)\.isatty\(fd\); \}/.test(step) && /look: \(\) => psOnceSync\(HS\.consoleProbeScript\(process\.pid\)\)\.code,/.test(step) && /reExec: \(\) => \{ startSuccessor\(reExecArgv\(process\.argv\[1\] \|\| __filename\), \{ \[HS\.HIDDEN_MARK\]: '1' \}\); exitDaemon\(0\); \}/.test(step), 'the step: the mark read, a console handle on 0/1/2 (tty.isatty — no stream built), the look = the hidden one-shot\'s exit code, the re-exec = the marked successor then exit 0 (cmd.exe ends, its window closes)', step);
ok(HS.HIDDEN_MARK === 'VIBESPACE_AGENTD_HIDDEN' && !DAEMON_ENV_KEEP.has(HS.HIDDEN_MARK) && !(HS.HIDDEN_MARK in daemonEnv({ [HS.HIDDEN_MARK]: '1', PATH: '/x' })), 'the mark is ONE hop: the successor is born with it, daemonEnv drops it (no session, no later re-exec inherits it)');
const tAt = AD.indexOf('HS.ensureLogonTask(');
const tBlk = AD.slice(AD.lastIndexOf("if (process.platform === 'win32') {", tAt), tAt + 400);
ok(tAt > lockAt && AD.indexOf('HS.ensureLogonTask(') === AD.lastIndexOf('HS.ensureLogonTask(') && /^if \(process\.platform === 'win32'\) \{\n  setTimeout\(\(\) => HS\.ensureLogonTask\(\{ root: ROOT, nodeExe: process\.execPath, script: path\.join\(ROOT, 'current', path\.basename\(process\.argv\[1\] \|\| 'vibespace-device\.js'\)\), ps: psOnce, log \}\)/.test(tBlk) && /\.catch\(/.test(tBlk), 'the task step: win32 only, after the singleton, async (a timer — the boot never waits), the `current` script this daemon runs under, the node it runs under', tBlk.slice(0, 300));
const one = (name) => { const a = AD.indexOf(`function ${name}(script) {`); return a < 0 ? '' : AD.slice(a, AD.indexOf('\n}\n', a)); };
ok(/execFileSync\('powershell\.exe', psOnceArgs\(script\), \{ windowsHide: true, timeout: 30000,/.test(one('psOnceSync')) && /execFile\('powershell\.exe', psOnceArgs\(script\), \{ windowsHide: true, timeout: 60000,/.test(one('psOnce')) && /const psOnceArgs = \(script\) => \['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', HS\.encodePs\(script\)\];/.test(AD), 'both one-shots: powershell.exe -EncodedCommand, windowsHide: true, bounded (30 s sync look, 60 s task)');
ok(Buffer.from(HS.encodePs('exit 20'), 'base64').toString('utf16le') === 'exit 20', 'encodePs = UTF-16LE base64 (what -EncodedCommand reads)');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
