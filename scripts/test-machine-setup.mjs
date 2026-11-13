#!/usr/bin/env node
// THE PAIRING DOES IT (lane machine-needs-at-pairing pick 3 — 主开发's law 3 and Q1–Q4; the owner 2026-11-13: «需要 ffmpeg 之类的事情
// 不能在安装的时候自动解决吗？») — fast: read + in-process + a real bash:
//   ① THE SHEET'S STEP ② (src/lib/sidebar-mounts.js): «what this device will be used for» sits between the system and the command;
//      the defaults (Windows' desktop set and a Mac's screen set ticked; a Mac's Screen Sharing — it listens on the local network —
//      and Linux's xpra unticked); the tick IS the command's flag (-Setup / --setup); the rows' facts come from the PURE rows
//   ② THE AGENT'S SETUP MODES (src/agentd/setup-mode.js through agentd.js, run on this box): an unknown word exits 2; a plan this machine cannot run is
//      refused by name; a need not met exits 4 with its ✗ line — said, never the pairing's end
//   ③ THE MAC / LINUX INSTALLER (scripts/vibespace-agentd-install.sh): its setup block run in a real bash under `set -euo pipefail`
//      with a stand-in agent — a need not met is SAID in the last lines and the script goes on (law 3); the xpra plan runs under
//      sudo; RED CONTROL: the block without its `|| true` guards ends the script at the first unmet need
//   ④ THE WINDOWS INSTALLER (scripts/vibespace-agentd-install.ps1 — read; no PowerShell here): -Setup; the setup after the agent
//      runs; ffmpeg through the agent; TightVNC in the agent's ONE administrator window (visible then, a child of it — its exit is
//      never the task's), inline when already administrator, alone with -NoElevate (Q2); its result read off port 5900; the
//      summary LAST
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('① THE SHEET\'S STEP ②');
const sm = read('src/lib/sidebar-mounts.js');
const at = (re) => { const m = re.exec(sm); return m ? m.index : -1; };
const iOs = at(/const s1 = step\('os'/), iNeeds = at(/const sN = step\('needs', tr\('What this device will be used for'\)\)/), iCopy = at(/const s2 = step\('copy'/);
ok(iOs > 0 && iOs < iNeeds && iNeeds < iCopy, '«What this device will be used for» is step ② — after the system, before the command (the tick changes it)', { iOs, iNeeds, iCopy });
ok(/const setupOn = \{ win: \{ desktop: true \}, mac: \{ mac: true, sharing: false \}, linux: \{ xpra: false \} \};/.test(sm), 'the defaults (主开发 Q1 / Q4): Windows\' desktop set and a Mac\'s screen set ticked; a Mac\'s Screen Sharing and Linux\'s xpra unticked');
ok(/\+ setupArg\(k\);/.test(sm) && /-Setup ' \+ on\.join\(','\)/.test(sm) && /--setup ' \+ on\.join\(','\)/.test(sm) && /cb\.onchange = \(\) => \{ setupOn\[k\]\[n\.key\] = cb\.checked; setOs\(k\); \};/.test(sm), 'the tick IS the command: -Setup / --setup appended by the ONE builder, re-drawn by the ONE switch');
ok(/FFI\.FFMPEG\.label, publisher: FFI\.FFMPEG\.publisher, mb: Math\.round\(MB\(FFI\.FFMPEG\.bytes\)\)/.test(sm) && /MDM\.TIGHTVNC\.label, mb: MB\(MDM\.TIGHTVNC\.bytes\)/.test(sm), 'each thing by name, source and size from the PURE rows (src/ffmpeg-install.js, TIGHTVNC) — never a copy in the page');
ok(/listens on the local network/.test(sm) && /listens on this PC only \(127\.0\.0\.1 and ::1, port 5900\)/.test(sm) && /it listens on nothing/.test(sm), 'what each listens on is said before the copy: ffmpeg nothing; TightVNC this PC only; a Mac\'s Screen Sharing the local network');
ok(/if \(k === 'win' && winNoElevate && setupOn\.win\.desktop\)[^\n]*TightVNC alone still asks/.test(sm), 'Q2: with normal rights, the sheet says TightVNC alone still asks once');

console.log('② THE AGENT\'S SETUP MODES');
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-setup-'));
  const run = (...a) => { const r = spawnSync(process.execPath, [path.join(REPO, 'src/agentd/agentd.js'), ...a], { encoding: 'utf8', timeout: 60000, env: { ...process.env, HOME: T, VIBESPACE_AGENTD_ROOT: path.join(T, 'root'), VIBESPACE_DEVICE_ROOT: path.join(T, 'root') } }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const bogus = run('--setup', 'bogus'), plan = run('--setup-plan', 'nothing'), vnc = run('--setup-plan', 'tightvnc'), ff = run('--setup', 'ffmpeg');
  ok(bogus.rc === 2 && plan.rc === 2, 'an unknown word exits 2 (nothing done)', { bogus, plan });
  ok(process.platform === 'win32' || (vnc.rc === 3 && /Windows/.test(vnc.out)), 'a plan this machine cannot run is refused by name (TightVNC off Windows: exit 3)', vnc);
  ok(process.platform === 'win32' || (ff.rc === 4 && /ffmpeg: .*Windows/.test(ff.out)), 'a need not met exits 4 with its line — said, never fatal (ffmpeg off Windows)', ff);
  fs.rmSync(T, { recursive: true, force: true });
}

console.log('③ THE MAC / LINUX INSTALLER, its setup block in a real bash');
{
  const sh = read('scripts/vibespace-agentd-install.sh');
  const i = sh.indexOf('# WHAT THIS MACHINE WILL BE USED FOR (lane machine-needs-at-pairing pick 3');
  const block = i >= 0 ? sh.slice(i) : '';
  ok(block && /--setup\) SETUP="\$2"; shift 2;;/.test(sh) && sh.indexOf(block) > sh.indexOf('retire_siblings\n'), 'the setup block is the installer\'s LAST part — after the agent runs and the older installs are retired (the pairing is done first)');
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-setup-sh-'));
  fs.mkdirSync(path.join(T, 'root/current'), { recursive: true });
  // the installer reads sudo's password from /dev/tty (curl | bash has no stdin); a suite has no terminal, so its copy reads /dev/null —
  // with no terminal at all the real line fails before sudo and is SAID ✗ (the declined case below)
  fs.writeFileSync(path.join(T, 'block.sh'), block.split('< /dev/tty').join('< /dev/null'));
  fs.writeFileSync(path.join(T, 'agent'), '#!/bin/sh\ncase "$*" in *--setup-plan*) echo "echo PLAN-RAN"; exit 0;; *--setup*) echo "→ opened Screen & System Audio Recording — switch vibespace-screen on there"; echo "✗ could not open Accessibility (x) — open it by hand"; exit 4;; esac\n', { mode: 0o755 });
  const bash = (osName, setup, sudoOk, file = 'block.sh') => spawnSync('bash', ['-c', `set -euo pipefail; uname() { echo ${osName}; }; sudo() { [ "${sudoOk}" = yes ] && { shift 0; "$@"; } < /dev/null; }; ROOT=${T}/root; NODE_BIN=${T}/agent; SETUP=${setup}; source ${T}/${file}; echo SCRIPT-WENT-ON`], { encoding: 'utf8', timeout: 30000 });
  const mac = bash('Darwin', 'mac,sharing', 'no'), lin = bash('Linux', 'xpra', 'yes'), linNo = bash('Linux', 'xpra', 'no');
  ok(mac.status === 0 && /SCRIPT-WENT-ON/.test(mac.stdout) && /What this machine will be used for:\n  → opened Screen & System Audio Recording[\s\S]*  ✗ could not open Accessibility/.test(mac.stdout) && /the pairing is done; a need not met keeps its button/.test(mac.stdout), 'a Mac: the panes the agent opened and the one it could not are SAID in the last lines, and the script goes on (law 3)', mac.stdout);
  ok(lin.status === 0 && /PLAN-RAN/.test(lin.stdout) && /✓ xpra: installed/.test(lin.stdout) && /SCRIPT-WENT-ON/.test(lin.stdout), 'Linux: the xpra plan from the agent runs under sudo, said ✓', lin.stdout);
  ok(linNo.status === 0 && /✗ xpra: not installed \(sudo was declined/.test(linNo.stdout) && /SCRIPT-WENT-ON/.test(linNo.stdout), 'Linux, sudo declined: ✗ said, the script goes on', linNo.stdout);
  fs.writeFileSync(path.join(T, 'unguarded.sh'), block.replace(/ \|\| true # exit 4[^\n]*/, '').replace(/PRC=0; PLAN=\$\(([^\n]*)\) \|\| PRC=\$\? # set -e[^\n]*/, 'PLAN=$($1); PRC=$?'));
  const red = bash('Darwin', 'mac', 'no', 'unguarded.sh');
  ok(red.status !== 0 && !/SCRIPT-WENT-ON/.test(red.stdout), 'RED CONTROL: without its guards, the first unmet need ends the script under set -e (the pairing\'s end) — the guards are what keep it going', { status: red.status });
  fs.rmSync(T, { recursive: true, force: true });
}

console.log('④ THE WINDOWS INSTALLER (read)');
{
  const ps = read('scripts/vibespace-agentd-install.ps1');
  const iSetup = ps.indexOf("if ($Setup -match '(^|,)desktop(,|$)')"), iRun = ps.indexOf('-> starting daemon with dial-out'), iPersist = ps.indexOf("$persist = 'none (re-run this command after a reboot)'");
  ok(/\[string\]\$Setup/.test(ps) && iRun > 0 && iRun < iSetup && iSetup < iPersist, '-Setup desktop runs after the agent is started (the pairing done) and before its one administrator moment');
  ok(/--setup ffmpeg 2>&1 \| Tee-Object -Variable ffOut \| Out-Host/.test(ps) && /--setup-plan tightvnc/.test(ps), 'ffmpeg through the agent\'s own setup (shown as it goes); TightVNC\'s commands from the agent\'s PURE plan');
  ok(/if \(\$vncCmds\) \{ \$reg = \$reg \+ "`n" \+ 'powershell\.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' \+ \(VsEnc \$vncCmds\) \+ "`n" \+ 'exit 0' \}/.test(ps) && /if \(\$vncCmds\) \{ \$proc = Start-Process powershell\.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',\$enc \}/.test(ps), 'TightVNC rides the agent\'s ONE administrator window — visible then (its password typed there), a child of it, so the window\'s exit stays the task\'s');
  ok(/if \(\$vncCmds\) \{ powershell\.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand \(VsEnc \$vncCmds\) \}/.test(ps) && /if \(\$NoElevate -and \$vncCmds\) \{/.test(ps), 'already administrator: TightVNC inline in that console; -NoElevate: TightVNC alone asks ONE prompt (Q2)');
  ok(/TightVNC's result is what listens now/.test(ps) && /Get-NetTCPConnection -LocalPort 5900 -State Listen/.test(ps), 'TightVNC\'s result is what listens on 5900 afterwards — never the window\'s exit');
  const iSummary = ps.lastIndexOf("Write-Host 'What this machine will be used for:'");
  ok(iSummary > ps.indexOf('function Get-VsDial') && !/exit \d/.test(ps.slice(iSummary)), 'the summary is the LAST lines (after the older installs are retired) and ends nothing: the pairing stays done');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
