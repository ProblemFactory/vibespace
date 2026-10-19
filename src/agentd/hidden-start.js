'use strict';
// THE DEVICE DAEMON ITSELF IS CONSOLE-LESS, AT EVERY LAUNCH (lane win-device-boot-hidden, 2026-10-19 — after a reboot the
// owner found a black Windows Terminal window titled 「vibespace-device」 on the desktop: "这是啥 能关掉吗"; closing it
// ended the agent until the next logon). The installer's AT-LOGON task ran `cmd.exe /c set …&& node vibespace-device.js`:
// a console program a task starts gets a console of its own, Windows 11 hands that console to Windows Terminal, and the
// daemon lived in that window. The other launch sites were hidden already (the installer's first launch
// `Start-Process -WindowStyle Hidden`, the re-exec `detached + windowsHide`, the --stdio bridge's spawn) — the task was the
// one launch site left, and .310's census looked at the daemon's CHILDREN only.
//   · THE TASK: `powershell.exe -WindowStyle Hidden -Command "… Start-Process -WindowStyle Hidden <node> …"` — the
//     installer's own first launch, at every logon (`logonTaskArgs`; the installer builds the same text, a twin pin).
//   · AN OLD INSTALL HEALS ITSELF: a daemon whose console window the person can SEE (a hidden powershell one-shot attaches
//     to it: GetConsoleWindow + IsWindowVisible, or its owner — Windows Terminal's window) re-execs ONCE through the
//     hidden road, its successor marked so it never loops (`selfHealVerdict`); and a daemon re-registers its own logon task
//     when the action is not the hidden one (`logonTaskVerdict` — our task by name; absent ⇒ never created; a task under
//     our name that starts something else ⇒ left alone).
// PURE: imports nothing. The PowerShell texts run through the daemon's own hidden one-shots (`ps` / `look` are handed in).

const HIDDEN_MARK = 'VIBESPACE_AGENTD_HIDDEN';
const TASK_PREFIX = 'VibeSpaceDevice-';

// a PowerShell single-quoted literal: the four curly single quotes PowerShell ALSO reads as quotes are doubled too
const psQuote = (s) => "'" + String(s).replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&') + "'";
// the one-shot's argv text: -EncodedCommand = UTF-16LE base64 (no quoting through a command line at all)
const encodePs = (script) => Buffer.from(String(script), 'utf16le').toString('base64');

/** Does THIS start need a look at its console? Only a Windows daemon not yet re-exec'd hidden, with a console handle on a
 *  std stream (a re-exec'd daemon has `stdio: 'ignore'` — NUL, no console: never looked at). */
function needsConsoleLook({ platform, marked, attached }) { return platform === 'win32' && !marked && !!attached; }

// the look's answer rides its EXIT CODE (attaching to another console can move the one-shot's std handles; a code cannot)
const CONSOLE_EXIT = Object.freeze({ visible: 20, hidden: 21, 'no-window': 22, none: 23 });
function consoleOf(code) {
  for (const [k, v] of Object.entries(CONSOLE_EXIT)) if (v === code) return k;
  return 'unknown';   // PowerShell missing, Add-Type refused, the bound hit — the daemon cannot tell
}

/** THE SELF-HEAL RULE. A console the person can see + not yet marked ⇒ re-exec hidden; marked ⇒ never again (the successor
 *  of a re-exec is born marked); not Windows ⇒ never; a hidden / windowless console, none, or a look that could not tell ⇒
 *  stay (the logon task is still checked). */
function selfHealVerdict({ platform, marked, console: seen }) {
  if (platform !== 'win32') return { act: 'stay', why: 'not-windows' };
  if (marked) return { act: 'stay', why: 'marked' };
  if (seen === 'visible') return { act: 're-exec', why: 'visible-console' };
  return { act: 'stay', why: seen || 'unknown' };
}

/** The console step at a daemon's start (sync — before the singleton, so the successor takes it). `look()` → the probe's
 *  exit code; `reExec()` starts the hidden successor (marked) and ends this process. Returns the verdict it acted on. */
function consoleStep({ platform, marked, attached, look, reExec, log = () => {} }) {
  if (!needsConsoleLook({ platform, marked, attached })) return { act: 'stay', why: platform !== 'win32' ? 'not-windows' : marked ? 'marked' : 'no-console', looked: false };
  const seen = consoleOf(look());
  const v = { ...selfHealVerdict({ platform, marked, console: seen }), looked: true, console: seen };
  if (v.act === 're-exec') {
    log('a visible console window holds this daemon (an old install\'s logon task) — re-exec hidden, once');
    reExec();
  } else if (seen === 'unknown') log('console look: could not tell whether this daemon\'s console is visible — staying; the logon task is still checked');
  return v;
}

/** The PowerShell one-shot that looks at process `pid`'s console: its own console first (Add-Type runs csc in it, hidden),
 *  then FreeConsole + AttachConsole(pid) + the window (visible itself, or its owner visible: Windows Terminal owns the
 *  pseudo-console window it shows), FreeConsole again; the answer is the exit code (CONSOLE_EXIT). ASCII only. */
function consoleProbeScript(pid) {
  const P = Number(pid) >>> 0;
  return [
    "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'",
    "Add-Type -Namespace VsHidden -Name Con -MemberDefinition '" + [
      '[DllImport("kernel32.dll")] public static extern bool FreeConsole();',
      '[DllImport("kernel32.dll")] public static extern bool AttachConsole(uint pid);',
      '[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();',
      '[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);',
      '[DllImport("user32.dll")] public static extern System.IntPtr GetWindow(System.IntPtr h, uint cmd);',
    ].join(' ') + "'",
    '[void][VsHidden.Con]::FreeConsole()',
    `if (-not [VsHidden.Con]::AttachConsole(${P})) { exit ${CONSOLE_EXIT.none} }`,
    '$h = [VsHidden.Con]::GetConsoleWindow()',
    '$v = $false',
    'if ($h -ne [IntPtr]::Zero) { $o = [VsHidden.Con]::GetWindow($h, 4); $v = [VsHidden.Con]::IsWindowVisible($h) -or (($o -ne [IntPtr]::Zero) -and [VsHidden.Con]::IsWindowVisible($o)) }',
    '[void][VsHidden.Con]::FreeConsole()',
    `if ($h -eq [IntPtr]::Zero) { exit ${CONSOLE_EXIT['no-window']} }`,
    `if ($v) { exit ${CONSOLE_EXIT.visible} }`,
    `exit ${CONSOLE_EXIT.hidden}`,
  ].join('\n');
}

/** The installer's task name for this root: `…\.vibespace\device@<dialHost>` ⇒ `VibeSpaceDevice-<dialHost>`; any other
 *  root (the hub's own daemon, a hand-made root) has no task of ours ⇒ null. */
function logonTaskName(root) {
  const base = String(root || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  const m = /^device@(.+)$/.exec(base || '');
  return m ? TASK_PREFIX + m[1] : null;
}

/** THE TASK'S ACTION ARGUMENTS (Execute = powershell.exe): a hidden PowerShell that sets the root and starts node HIDDEN
 *  with the installer's first-launch shape (the env reaches node by inheritance — Start-Process -Environment needs PS 7.3+;
 *  the script path is quoted for node by [char]34, so a profile path with a space survives and the text holds no `"`).
 *  scripts/vibespace-agentd-install.ps1 builds the SAME text (test-agentd-hidden-start: the twin). */
function logonTaskArgs({ root, nodeExe, script }) {
  const r = String(root);
  const launch = `$env:VIBESPACE_DEVICE_ROOT=${psQuote(r)}; $env:VIBESPACE_AGENTD_ROOT=${psQuote(r)}` +
    `; Start-Process -WindowStyle Hidden -FilePath ${psQuote(nodeExe)} -ArgumentList ([char]34+${psQuote(script)}+[char]34)` +
    ` -RedirectStandardOutput ${psQuote(r + '\\state\\agentd.out')} -RedirectStandardError ${psQuote(r + '\\state\\agentd.err')}`;
  return `-NoProfile -NonInteractive -WindowStyle Hidden -Command "${launch}"`;
}

/** The read one-shot: `vs-task none`, or `vs-task <b64 execute> <b64 arguments>` (UTF-8 in base64 — a Chinese profile path
 *  survives the console code page of the pipe). ASCII only. */
function taskReadScript(name) {
  return [
    "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'",
    `$t = Get-ScheduledTask -TaskName ${psQuote(name)} -ErrorAction SilentlyContinue`,
    "if (-not $t) { [Console]::Out.WriteLine('vs-task none'); exit 0 }",
    '$a = @($t.Actions)[0]',
    '$e = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$a.Execute))',
    '$g = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$a.Arguments))',
    "[Console]::Out.WriteLine('vs-task ' + $e + ' ' + $g)",
  ].join('\n');
}
function parseTaskRead(stdout) {
  const s = String(stdout || '');
  if (/^vs-task none\s*$/m.test(s)) return { found: false };
  const m = /^vs-task ([A-Za-z0-9+/=]*) ([A-Za-z0-9+/=]*)\s*$/m.exec(s);
  if (!m) return null;
  const d = (b) => Buffer.from(b, 'base64').toString('utf8');
  return { found: true, execute: d(m[1]), args: d(m[2]) };
}

/** IDEMPOTENT: absent ⇒ never created; the hidden action already (this text) ⇒ same (nothing written); an action under our
 *  name that does not start our daemon ⇒ foreign (never overwritten); anything else of ours (the old `cmd.exe /c …`, a
 *  moved node) ⇒ rewrite. */
function logonTaskVerdict(task, want) {
  if (!task || !task.found) return 'absent';
  const exe = String(task.execute || '').trim().replace(/^"|"$/g, '').split(/[\\/]/).pop().toLowerCase();
  const args = String(task.args || '');
  if (exe === 'powershell.exe' && args.trim() === String(want).trim()) return 'same';
  if (!/vibespace-device\.js|agentd\.js/i.test(args)) return 'foreign';
  return 'rewrite';
}

/** The write one-shot — the installer's own registration (same trigger, same settings + -Hidden, -Force). ASCII only. */
function taskWriteScript(name, args) {
  return [
    "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'",
    `$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(args)}`,
    '$s = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries',
    `Register-ScheduledTask -TaskName ${psQuote(name)} -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s -Force | Out-Null`,
    "[Console]::Out.WriteLine('vs-task written')",
  ].join('\n');
}

const said = (t) => (t.found ? `${t.execute} ${t.args}`.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160) : 'none');

/** THE LOGON TASK STEP (async, after the daemon listens — the boot never waits on PowerShell). `ps(script)` →
 *  Promise<{code, stdout}> (the daemon's hidden one-shot). One line in the log when it rewrites or fails; nothing when the
 *  task is already the hidden one. Returns {act, name}. */
async function ensureLogonTask({ root, nodeExe, script, ps, log = () => {} }) {
  const name = logonTaskName(root);
  if (!name) return { act: 'no-task-name', name: null };
  const want = logonTaskArgs({ root, nodeExe, script });
  const r = await ps(taskReadScript(name));
  const task = parseTaskRead(r && r.stdout);
  if (!task) { log(`logon task ${name}: could not read it (exit ${r && r.code}) — left as it is`); return { act: 'unreadable', name }; }
  const v = logonTaskVerdict(task, want);
  if (v === 'foreign') log(`logon task ${name}: starts something else (${said(task)}) — left as it is`);
  if (v !== 'rewrite') return { act: v, name };
  const w = await ps(taskWriteScript(name, want));
  if (!w || w.code !== 0 || !/^vs-task written\s*$/m.test(String(w.stdout || ''))) { log(`logon task ${name}: re-registering it hidden FAILED (exit ${w && w.code}) — the next logon starts it the old way`); return { act: 'write-failed', name }; }
  log(`logon task ${name}: was \`${said(task)}\` — re-registered to start hidden (powershell -WindowStyle Hidden → Start-Process -WindowStyle Hidden)`);
  return { act: 'rewritten', name };
}

module.exports = {
  HIDDEN_MARK, TASK_PREFIX, CONSOLE_EXIT, psQuote, encodePs, needsConsoleLook, consoleOf, selfHealVerdict, consoleStep,
  consoleProbeScript, logonTaskName, logonTaskArgs, taskReadScript, parseTaskRead, logonTaskVerdict, taskWriteScript, ensureLogonTask,
};
