#!/usr/bin/env node
// THE WINDOWS DEVICE FILES — THE SOURCE-TEXT CENSUS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-windows-device-fs.mjs, whose door, real Windows / old / POSIX agents and patched-copy controls
// stay there: §1 the census of every hub→device shell site in src/ (over `git ls-files src`) with its two controls (a new site
// is red until it has a row; a row whose site moved is stale). The rows name the files they classify, so ci.mjs's affected
// rule selects this suite on a change of one; the tracked-file list makes it a tree-wide reader.
// Run: node scripts/test-windows-device-fs-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra === undefined ? '' : ' — ' + JSON.stringify(extra).slice(0, 400))); } };

// ── §1 THE CENSUS ──
console.log('§1 the census: every hub→device shell site in src/');
const SITE_RE = /\.(?:runCmd|runStream)\(|\bcmd:\s*'sh'|\['-lc'/;
const DOOR = 'refused by name at THE DOOR where the device says it has no `sh` (client.js posixShellRefusal over the hello\'s posixShells: windows_no_shell) — nothing is sent; a Windows machine WITH `sh` is asked as before';
const TABLE = [
  { file: 'src/remote-fs.js', has: "(await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'], { by: this._actBy })).stdout.trim();", verdict: 'win32', how: 'never reached: home() asks the agent (fsHome), _devAbs hands `~` to a Windows agent unexpanded (it expands it)' },
  { file: 'src/remote-fs.js', has: "const r = await dm.runCmd('sh', ['-c', cmd], { timeoutMs: Math.min(timeoutMs, 30000), by: this._actBy });", verdict: 'win32', how: '_run: every Files op takes _win first (list/info/read/write/mkdir/rename/rm/stat/copy/move ⇒ fs ops; the archive ops refused by name); anything else hits the door' },
  { file: 'src/remote-fs.js', has: "this._shSeen.set(info, dm.runCmd('sh', ['-c', 'exit 0']", verdict: 'win32', how: 'verify-r1 F1: the one probe a Windows agent too old to say whether it has `sh` is asked (once per link); none there ⇒ ENOENT, named (the outdated sentence / WIN_REFUSED), never a bare 127' },
  { file: 'src/remote-fs.js', has: "await dm.runCmd('sh', ['-c', `du -sk", verdict: 'win32', how: 'stat(withDu): the agent\'s own walk (fsDu)' },
  { file: 'src/remote-fs.js', has: 'const r = await dm.runStream(cmd, args, { onData:', verdict: 'win32', how: 'downloads: _winStreamTo over read-range (no `cat`); folder .zip refused by name before it (WIN_REFUSED.zip)' },
  { file: 'src/remote-fs.js', has: "const r = await dm.runStream('sh', ['-c', cmd], { onData:", verdict: 'win32', how: 'fetchToLocal: _winFetchToLocal over read-range; an archive entry refused by name (WIN_REFUSED[archive-entry])' },
  { file: 'src/exit-proxy.js', has: "await dm.runCmd(XS.POSIX_SHELL, ['-lc', cmd], { ...opts, by: opts.by });", verdict: 'win32', how: 'run-shell: the agent picks cmd.exe; a Windows agent without run-shell is refused by name (canRunLine ⇒ device_agent_outdated) before this rung' },
  { file: 'src/ctx-sync.js', has: "const inv = await dm.runCmd('sh', ['-c',", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "const r = await dm.runCmd('sh', ['-c', script], { timeoutMs, by });", verdict: 'refused', how: DOOR },
  // B-69ec: the remote CLI ask of a person's create (src/server/remote-cli.js) carries its consent — the consent rides the request
  // only: runCmd (src/agentd/client.js) asks THE DOOR before it, so a Windows machine with no `sh` refuses it by name, as the plain probe on the next line of `_hostShell`
  { file: 'src/hosts.js', has: "if (consent) { const rc = await dm.runCmd('sh', ['-c', script], { timeoutMs, by, consent: true });", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "out = String((await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'], { by: 'system:hosts' })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "for c in dtach node claude codex", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "out = String((await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 10000, by })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "try { const dm = await this.deviceBounded(id, 4000); return String((await dm.runCmd('sh', ['-c', script], { timeoutMs: 6000, by })).stdout || ''); }", verdict: 'refused', how: DOOR + ' (lane path-field: the path field\'s slice — the field says «the machine did not answer: …» with the refusal)' },
  { file: 'src/hosts.js', has: "if (base === '' || base === '~') base = String((await dm.runCmd('sh'", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "else if (base.startsWith('~/')) base = String((await dm.runCmd('sh'", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "const find = await dm.runCmd('sh', ['-c', `find ${root}", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "const home = (await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'], { by: 'system:usage-harvest' })).stdout.trim();", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "await dm.runStream('node', [scanPath]", verdict: 'refused', how: 'reached only past the `echo $HOME` line above it, which the door refuses on Windows', argv: true },
  { file: 'src/machine-mounts.js', has: 'const r = await dm.runCmd(cmd, args, { stdin: input, timeoutMs: 60000, by: \'system:machine-mounts\' });', verdict: 'refused', how: 'argv carrier: its `sh` argvs hit the door; detectOS\'s `uname` answers nothing on Windows ⇒ \'windows\' (the mount refuses the OS)', argv: true },
  { file: 'src/machine-mounts.js', has: "const r = await dm.runStream('sh', ['-c', script]", verdict: 'refused', how: DOOR },
  { file: 'src/machine-mounts.js', has: "const home = String((await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'], { timeoutMs: 8000, by: 'system:machine-mounts' })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/machine-mounts.js', has: "await dm.runCmd('sh', ['-c', `mount | grep -qF", verdict: 'refused', how: DOOR },
  { file: 'src/machine-mounts.js', has: "await dm.runCmd('sh', ['-c', `command -v curl", verdict: 'refused', how: DOOR },
  { file: 'src/port-forward.js', has: "await dm.runCmd('sh', ['-c', PORT_SCAN]", verdict: 'refused', how: DOOR },
  { file: 'src/port-forward.js', has: "await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 6000, by: 'system:port-forward' })", verdict: 'refused', how: DOOR },
  { file: 'src/server/desktop-access.js', has: 'const stream = dm.runStream(launch[0], launch.slice(1)', verdict: 'refused', how: 'launch = desktop-apps installLauncherArgv = [\'sh\', \'-c\', …] ⇒ the door', argv: true },
  // the 2.369.204 integration: desktop-vnc-native (design 014 D1) — a Windows machine's desktop is asked through PowerShell, never `sh`
  { file: 'src/server/desktop-access.js', has: 'try { r = await dm.runCmd(plan.argv[0], plan.argv.slice(1), { timeoutMs: 20000, waitMs: 25000, by }); }', verdict: 'win32', how: 'Run on its desktop…: desktop-apps desktopRunPlan = PowerShell -EncodedCommand on win32 (no `sh`), /bin/sh on darwin (macOS ships it), refused elsewhere', argv: true },
  // lane stream-mic-road (.339; re-pointed at ci-339-reds): the same door now also runs the microphone installs, and the plan's env rides along
  { file: 'src/server/desktop-access.js', has: 'const r = await dm.runStream(plan.argv[0], plan.argv.slice(1), { onData, timeoutMs: installMs, by, ...(plan.env ? { env: plan.env } : {}) });', verdict: 'win32', how: 'the administrator installs (runUacInstall): tightvncInstallPlan and mic-install\'s VB-CABLE install / removal = PowerShell -EncodedCommand (elevated by UAC on that machine) on win32; the Mac\'s microphone plug-in = /bin/sh -c behind its password dialog (macOS ships sh) — never `sh` on Windows', argv: true },
  // lane machine-needs-at-pairing pick 2 (its own site since 7774887da; the census row came with pick 3f): 「取得 FFmpeg」's streamed fetch
  { file: 'src/server/desktop-access.js', has: 'const r = await dm.runStream(plan.argv[0], plan.argv.slice(1), { onData: (d) => { seen(d); onData(d); }, timeoutMs: installMs, by });', verdict: 'win32', how: '「取得 FFmpeg」 (runStreamInstall): src/ffmpeg-install.js — powershell.exe -EncodedCommand (PS_ARGV), an unelevated PowerShell on the Windows machine; a Mac / Linux machine is refused not_windows before any plan' },
  { file: 'src/server/mounts-plugins-wiring.js', has: "await dm.runCmd('sh', ['-c', 'printf %s \"${VIBESPACE_DEVICE_ROOT", verdict: 'refused', how: DOOR },
  { file: 'src/server/mounts-plugins-wiring.js', has: "await dm.runCmd('chmod', ['600', root + '/state/dial.json']", verdict: 'n/a', how: 'reached only past the root read above it (refused at the door on Windows)', argv: true },
  { file: 'src/server/sysinfo-wiring.js', has: "out = String((await dm.runCmd('sh', ['-c', script], { timeoutMs: 8000, by })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/writer-sweep.js', has: "const r = await dm.runCmd('sh', ['-c', script], { timeoutMs, by: 'system:writer-sweep' });", verdict: 'refused', how: DOOR },
  { file: 'src/spawn/dial.js', has: "await dm.runCmd('sh', ['-c', 'printf %s \"$HOME\"'], { timeoutMs: 8000, by })", verdict: 'refused', how: DOOR },
  { file: 'src/spawn/dial.js', has: "await dm.runCmd('sh', ['-c',", exact: true, verdict: 'refused', how: DOOR },
  { file: 'src/spawn/dial.js', has: "await dm.runCmd('sh', ['-c', `chmod 600", verdict: 'refused', how: DOOR },
  { file: 'src/spawn/dial.js', has: "pty: { cmd: 'sh', args: ['-lc', shellCmd], cwd,", verdict: 'refused', how: 'a session spawn spec ⇒ openSession / openPipeSession ⇒ the door' },
  { file: 'src/spawn/dial.js', has: "spawn: { cmd: 'sh', args: ['-lc', shellCmd], cwd } }", verdict: 'refused', how: 'a session spawn spec ⇒ openPipeSession ⇒ the door' },
  { file: 'src/spawn/ssh.js', has: "spawn: { cmd: 'sh', args: ['-lc', shellCmd], cwd: os.homedir() } }", verdict: 'refused', how: 'a session spawn spec ⇒ openPipeSession ⇒ the door' },
  { file: 'src/ws-handler.js', has: "await dm.runCmd('sh', ['-c', `rm -f", verdict: 'refused', how: DOOR },
];
function scanSites(read) {
  const files = execFileSync('git', ['-C', REPO, 'ls-files', 'src'], { encoding: 'utf8' }).split('\n')
    .filter((f) => /\.(c?js|mjs)$/.test(f) && !/^src\/(public|lib|agentd)\//.test(f) && f !== 'src/exit-shell.js');
  const sites = [];
  for (const f of files) {
    const lines = read(f).split('\n');
    lines.forEach((t, i) => { const s = t.trim(); if (SITE_RE.test(t) && !s.startsWith('//') && !s.startsWith('*')) sites.push({ file: f, line: i + 1, text: t }); });
  }
  return sites;
}
function judge(sites, table) {
  const claimed = new Map();
  const unclassified = [], stale = [], ambiguous = [];
  for (const s of sites) {
    const rows = table.filter((r) => r.file === s.file && (r.exact ? s.text.trim() === r.has : s.text.includes(r.has)));
    if (!rows.length) unclassified.push(`${s.file}:${s.line}`);
    else if (rows.length > 1) ambiguous.push(`${s.file}:${s.line}`);
    else claimed.set(rows[0], (claimed.get(rows[0]) || []).concat(s));
  }
  for (const r of table) { const c = claimed.get(r) || []; if (c.length !== 1) stale.push(`${r.file} «${r.has.slice(0, 50)}» ×${c.length}`); }
  return { unclassified, stale, ambiguous, claimed };
}
const readHead = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sites = scanSites(readHead);
const J = judge(sites, TABLE);
ok(J.unclassified.length === 0, `every hub→device shell site is classified (${sites.length} sites)`, J.unclassified);
ok(J.stale.length === 0 && J.ambiguous.length === 0, 'every row names exactly one site (none stale, none ambiguous)', { stale: J.stale, ambiguous: J.ambiguous });
ok(TABLE.every((r) => ['win32', 'refused', 'n/a'].includes(r.verdict) && r.how), 'every row: works on win32 via X | refused by name on win32 | n/a — and says how');
ok(TABLE.filter((r) => r.how === DOOR).every((r) => (J.claimed.get(r) || []).every((s) => /\(\s*'sh'/.test(s.text))), 'every row judged "at the door" asks a literal `sh` (the door matches it); argv carriers say why');
console.log('  census (file:line — verdict — how):');
for (const r of TABLE) for (const s of J.claimed.get(r) || []) console.log(`    ${s.file}:${s.line} — ${r.verdict} — ${r.how}`);
{ // control: a new shell site is red until classified; a row whose site moved is stale
  const extra = scanSites((f) => readHead(f) + (f === 'src/writer-sweep.js' ? "\nconst x = await dm.runCmd('sh', ['-c', 'uptime']);\n" : ''));
  ok(judge(extra, TABLE).unclassified.length === 1, 'CONTROL: a new `dm.runCmd(\'sh\'` line is red until it has a row');
  ok(judge(sites, TABLE.concat([{ file: 'src/hosts.js', has: 'no such line ever', verdict: 'refused', how: DOOR }])).stale.length === 1, 'CONTROL: a row whose site is gone is red (stale)');
}

console.log(`\ntest-windows-device-fs-pins: ${pass} passed, ${fail} failed`);

if (fail) { console.log('FAIL'); process.exit(1); }
console.log(`ALL PASS (${pass})`);
process.exit(0);
