#!/usr/bin/env node
// lane windows-device-fs (B-c484) — THE HUB ASSUMED `sh` FOR FILES TOO. The owner's Windows machine WIN-DESK1:
// GET /api/files?host=host-dial-WIN-DESK1 → 400 "command failed (127)". src/remote-fs.js ran `dm.runCmd('sh', …)` for
// every device operation (the home, the listing's fallback, du, zip, the download streams) and a Windows machine has no
// `sh`. No Windows box runs this lane: "Windows" = a REAL agent built from this tree whose hello says `win32` and whose
// PATH holds no `sh` (the exit-run suite's real-daemon template); the old agent = the BASE tree's agent, same shape.
//   §1 THE CENSUS — every hub→device shell site in src/ (runCmd / runStream / an `sh` spawn spec / `-lc`), each
//      classified: works on win32 via X | refused by name on win32 | n/a. A new site is red until it is classified.
//   §2 THE DOOR (src/agentd/client.js posixShellRefusal) — a POSIX shell asked of a win32 agent THAT SAYS IT HAS NONE is
//      refused by name (verify-r1 F1: the device's fact `posixShells`, not the platform; too old to say ⇒ asked, a failed
//      spawn named).
//   §3 the Files view on a Windows agent: every op through the agent's own fs ops, never `sh`; the shell-only ops
//      refused by name; the pre-fix hub over the same agent = the owner's "command failed (127)".
//   §4 an OLD Windows agent (the base tree's) — asked `sh` once; none there ⇒ the one sentence (its version, the one step).
//   §4b verify-r1 F1: a Windows agent WITH `sh` (Git for Windows / MSYS2 / Cygwin) and an old one with `sh` keep every
//      shell line that ran before this lane.
//   §5 the POSIX path unchanged — a real Linux agent: the head and the base RemoteFs give the same answers.
//   §6 patched-copy controls — each new rule removed ⇒ its leg goes red.
//   §7 verify-r2: the agent's shell probe — bounded, async, a shell counts only if it RAN a POSIX line, re-measured at
//      every hello (one installed later is seen at the next link); an old agent's hub-side probe judges the same way; the
//      Files refusals travel as CODES the client words (zh / ja); du's bound and a cross-drive move say what is left where.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = '296a748f';
// mirror-green-207: the Actions checkout is depth 1, so BASE is not there. Every leg that needs the base tree SKIPs by
// name (counted apart, never as a pass: the 2.369.164 r2 rule) and every leg on this tree still runs.
let HAVE_BASE = false; try { execFileSync('git', ['-C', REPO, 'cat-file', '-e', `${BASE}^{commit}`], { stdio: 'ignore' }); HAVE_BASE = true; } catch { }
const SKIPPED = [];
const skip = (n) => { SKIPPED.push(n); console.log(`  SKIP ${n} — base ${BASE} not in this checkout — depth-1 clone`); };
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra === undefined ? '' : ' — ' + JSON.stringify(extra).slice(0, 400))); } };
const SCR = path.join(os.tmpdir(), `vs-wdfs-${process.pid}`);
fs.mkdirSync(SCR, { recursive: true });
const daemonPids = [];
const cleanup = () => { for (const p of daemonPids) { try { process.kill(p, 'SIGTERM'); } catch { } } try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
const rel = (src) => src.replace(/require\('\.\.\//g, `require('${path.join(REPO, 'src')}/`).replace(/require\('\.\//g, `require('${path.join(REPO, 'src/agentd')}/`);
const relTop = (src) => src.replace(/require\('\.\//g, `require('${path.join(REPO, 'src')}/`);
const baseOf = (file) => { try { return execFileSync('git', ['-C', REPO, 'show', `${BASE}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const writeCopy = (name, src) => { const f = path.join(SCR, name); fs.writeFileSync(f, src); return f; };

// ── §1 THE CENSUS ──
console.log('§1 the census: every hub→device shell site in src/');
const SITE_RE = /\.(?:runCmd|runStream)\(|\bcmd:\s*'sh'|\['-lc'/;
const DOOR = 'refused by name at THE DOOR where the device says it has no `sh` (client.js posixShellRefusal over the hello\'s posixShells: windows_no_shell) — nothing is sent; a Windows machine WITH `sh` is asked as before';
const TABLE = [
  { file: 'src/remote-fs.js', has: "(await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'])).stdout.trim();", verdict: 'win32', how: 'never reached: home() asks the agent (fsHome), _devAbs hands `~` to a Windows agent unexpanded (it expands it)' },
  { file: 'src/remote-fs.js', has: "const r = await dm.runCmd('sh', ['-c', cmd], { timeoutMs: Math.min(timeoutMs, 30000) });", verdict: 'win32', how: '_run: every Files op takes _win first (list/info/read/write/mkdir/rename/rm/stat/copy/move ⇒ fs ops; the archive ops refused by name); anything else hits the door' },
  { file: 'src/remote-fs.js', has: "this._shSeen.set(info, dm.runCmd('sh', ['-c', 'exit 0']", verdict: 'win32', how: 'verify-r1 F1: the one probe a Windows agent too old to say whether it has `sh` is asked (once per link); none there ⇒ ENOENT, named (the outdated sentence / WIN_REFUSED), never a bare 127' },
  { file: 'src/remote-fs.js', has: "await dm.runCmd('sh', ['-c', `du -sk", verdict: 'win32', how: 'stat(withDu): the agent\'s own walk (fsDu)' },
  { file: 'src/remote-fs.js', has: 'const r = await dm.runStream(cmd, args, { onData:', verdict: 'win32', how: 'downloads: _winStreamTo over read-range (no `cat`); folder .zip refused by name before it (WIN_REFUSED.zip)' },
  { file: 'src/remote-fs.js', has: "const r = await dm.runStream('sh', ['-c', cmd], { onData:", verdict: 'win32', how: 'fetchToLocal: _winFetchToLocal over read-range; an archive entry refused by name (WIN_REFUSED[archive-entry])' },
  { file: 'src/exit-proxy.js', has: "await dm.runCmd(XS.POSIX_SHELL, ['-lc', cmd], opts);", verdict: 'win32', how: 'run-shell: the agent picks cmd.exe; a Windows agent without run-shell is refused by name (canRunLine ⇒ device_agent_outdated) before this rung' },
  { file: 'src/ctx-sync.js', has: "const inv = await dm.runCmd('sh', ['-c',", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "const r = await dm.runCmd('sh', ['-c', script], { timeoutMs });", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "out = String((await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'])).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "for c in dtach node claude codex", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "out = String((await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 10000 })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "if (base === '' || base === '~') base = String((await dm.runCmd('sh'", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "else if (base.startsWith('~/')) base = String((await dm.runCmd('sh'", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "const find = await dm.runCmd('sh', ['-c', `find ${root}", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "const home = (await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'])).stdout.trim();", verdict: 'refused', how: DOOR },
  { file: 'src/hosts.js', has: "await dm.runStream('node', [scanPath]", verdict: 'refused', how: 'reached only past the `echo $HOME` line above it, which the door refuses on Windows', argv: true },
  { file: 'src/machine-mounts.js', has: 'const r = await dm.runCmd(cmd, args, { stdin: input, timeoutMs: 60000 });', verdict: 'refused', how: 'argv carrier: its `sh` argvs hit the door; detectOS\'s `uname` answers nothing on Windows ⇒ \'windows\' (the mount refuses the OS)', argv: true },
  { file: 'src/machine-mounts.js', has: "const r = await dm.runStream('sh', ['-c', script]", verdict: 'refused', how: DOOR },
  { file: 'src/machine-mounts.js', has: "const home = String((await dm.runCmd('sh', ['-c', 'echo \"$HOME\"'], { timeoutMs: 8000 })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/machine-mounts.js', has: "await dm.runCmd('sh', ['-c', `mount | grep -qF", verdict: 'refused', how: DOOR },
  { file: 'src/machine-mounts.js', has: "await dm.runCmd('sh', ['-c', `command -v curl", verdict: 'refused', how: DOOR },
  { file: 'src/port-forward.js', has: "await dm.runCmd('sh', ['-c', PORT_SCAN]", verdict: 'refused', how: DOOR },
  { file: 'src/port-forward.js', has: "await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 6000 })", verdict: 'refused', how: DOOR },
  { file: 'src/server/desktop-access.js', has: 'const stream = dm.runStream(launch[0], launch.slice(1)', verdict: 'refused', how: 'launch = desktop-apps installLauncherArgv = [\'sh\', \'-c\', …] ⇒ the door', argv: true },
  // the 2.369.204 integration: desktop-vnc-native (design 014 D1) — a Windows machine's desktop is asked through PowerShell, never `sh`
  { file: 'src/server/desktop-access.js', has: 'try { r = await dm.runCmd(plan.argv[0], plan.argv.slice(1), { timeoutMs: 20000, waitMs: 25000 }); }', verdict: 'win32', how: 'Run on its desktop…: desktop-apps desktopRunPlan = PowerShell -EncodedCommand on win32 (no `sh`), /bin/sh on darwin (macOS ships it), refused elsewhere', argv: true },
  { file: 'src/server/desktop-access.js', has: 'const r = await dm.runStream(plan.argv[0], plan.argv.slice(1), { onData, timeoutMs: installMs });', verdict: 'win32', how: 'the TightVNC install (runUacInstall): tightvncInstallPlan = PowerShell -EncodedCommand (elevated by UAC on that machine), win32 only', argv: true },
  { file: 'src/server/mounts-plugins-wiring.js', has: "await dm.runCmd('sh', ['-c', 'printf %s \"${VIBESPACE_DEVICE_ROOT", verdict: 'refused', how: DOOR },
  { file: 'src/server/mounts-plugins-wiring.js', has: "await dm.runCmd('chmod', ['600', root + '/state/dial.json']", verdict: 'n/a', how: 'reached only past the root read above it (refused at the door on Windows)', argv: true },
  { file: 'src/server/sysinfo-wiring.js', has: "out = String((await dm.runCmd('sh', ['-c', script], { timeoutMs: 8000 })).stdout", verdict: 'refused', how: DOOR },
  { file: 'src/writer-sweep.js', has: "const r = await dm.runCmd('sh', ['-c', script], { timeoutMs });", verdict: 'refused', how: DOOR },
  { file: 'src/spawn/dial.js', has: "await dm.runCmd('sh', ['-c', 'printf %s \"$HOME\"'], { timeoutMs: 8000 })", verdict: 'refused', how: DOOR },
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

// ── §2 THE DOOR ──
console.log('§2 the door');
const CL = require(path.join(REPO, 'src/agentd/client.js'));
const W32 = { platform: 'win32', posixShells: [] }; // the device said: no POSIX shell here
const WORDS_NOSH = /^this needs a POSIX shell \(\w+\), and this Windows machine has none — not available on Windows machines without one yet$/;
for (const c of ['sh', '/bin/sh', 'bash', 'BASH.EXE', 'C:\\Program Files\\Git\\bin\\sh.exe', 'dash', 'zsh']) {
  const e = CL.posixShellRefusal(W32, c);
  ok(e && e.code === 'windows_no_shell' && WORDS_NOSH.test(e.message), `win32 saying no shells + ${JSON.stringify(c)} ⇒ windows_no_shell, by name`, e && e.message);
}
ok(['cmd.exe', 'node', 'uname', 'shx', 'chmod'].every((c) => CL.posixShellRefusal(W32, c) === null), 'win32 + a non-shell argv (cmd.exe, node, uname, shx, chmod) ⇒ asked as before');
ok(['linux', 'darwin', undefined].every((p) => CL.posixShellRefusal({ platform: p, posixShells: [] }, 'sh') === null) && CL.posixShellRefusal(null, 'sh') === null, 'every other platform (and no hello) ⇒ `sh` asked as before');
// verify-r1 F1: the DEVICE'S FACT, not the platform — Git for Windows / MSYS2 / Cygwin put sh.exe on PATH
const GITBASH = { platform: 'win32', posixShells: ['sh', 'bash'] };
ok(['sh', 'bash', 'C:\\Program Files\\Git\\usr\\bin\\sh.exe'].every((c) => CL.posixShellRefusal(GITBASH, c) === null), 'F1: win32 saying it HAS sh / bash (Git Bash on PATH) ⇒ asked as before');
ok(CL.posixShellRefusal(GITBASH, 'zsh')?.code === 'windows_no_shell', 'F1: …a shell its list leaves out (zsh) ⇒ refused by name');
ok(['sh', 'bash'].every((c) => CL.posixShellRefusal({ platform: 'win32' }, c) === null), 'F1: a win32 agent too old to say ⇒ asked (today\'s behaviour), never refused by platform');
const ENOENT = { code: 127, spawnError: { code: 'ENOENT', message: 'spawn sh ENOENT' }, stdout: '', stderr: '' };
ok(CL.posixShellFailed({ platform: 'win32' }, 'sh', ENOENT)?.code === 'windows_no_shell' && WORDS_NOSH.test(CL.posixShellFailed({ platform: 'win32' }, 'sh', ENOENT).message), 'F1: asked, and the spawn failed (ENOENT) ⇒ named after the fact, not "(127)"');
ok(CL.posixShellFailed({ platform: 'win32' }, 'sh', { code: 127, error: 'spawn sh ENOENT' })?.code === 'windows_no_shell', 'F1: …the run-stream shape too (127 + error text)');
ok(CL.posixShellFailed({ platform: 'win32' }, 'sh', { code: 127, stdout: '', stderr: 'zip: command not found' }) === null && CL.posixShellFailed({ platform: 'linux' }, 'sh', ENOENT) === null && CL.posixShellFailed({ platform: 'win32' }, 'node', ENOENT) === null, 'F1: a shell that started (its own 127), a non-Windows agent, a non-shell argv ⇒ the answer as it came');

// ── real agents ──
const bundleFrom = (srcFile, tag) => {
  const out = path.join(SCR, `agentd-${tag}.js`);
  execFileSync('npx', ['esbuild', srcFile, '--bundle', '--platform=node', '--external:node-pty', `--outfile=${out}`, '--log-level=warning'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
};
const HELLO = 'platform: process.platform, arch: process.arch, nodeVersion: process.version,';
// a Windows machine has no `sh`: the copy's child_process answers ENOENT for sh / bash (the daemon adds the usual bin dirs
// to every child's PATH, so an empty PATH alone would not model it) — and its hello says win32
const NO_SH = "{ const cp_ = require('child_process'), pt_ = require('path'); const no_ = (f) => (/^(sh|bash|dash|zsh|ksh)$/.test(pt_.basename(String(f))) ? '/nonexistent-vs-wdfs/sh' : f); const e_ = cp_.execFile, s_ = cp_.spawn, y_ = cp_.spawnSync; cp_.execFile = function (f, ...a) { return e_.call(this, no_(f), ...a); }; cp_.spawn = function (f, ...a) { return s_.call(this, no_(f), ...a); }; cp_.spawnSync = function (f, ...a) { return y_.call(this, no_(f), ...a); }; }\n";
// verify-r1 F1: a Windows machine WITH `sh` (Git for Windows / MSYS2 / Cygwin) = the hello says win32, child_process untouched
const asWindowsWithSh = (src) => { if (!src.includes(HELLO)) throw new Error('hello-ack anchor moved'); return src.replace(HELLO, "platform: 'win32', arch: process.arch, nodeVersion: process.version,"); };
const asWindows = (src) => { if (!src.includes(HELLO)) throw new Error('hello-ack anchor moved'); return NO_SH + src.replace(HELLO, "platform: 'win32', arch: process.arch, nodeVersion: process.version,"); };
const NOBIN = path.join(SCR, 'nobin'); fs.mkdirSync(NOBIN, { recursive: true });
const realDaemon = async (bundle, tag, { windows = false, Client = CL } = {}) => {
  const root = path.join(SCR, 'root-' + tag); fs.mkdirSync(root, { recursive: true });
  const home = path.join(SCR, 'home-' + tag); fs.mkdirSync(home, { recursive: true });
  const dataDir = path.join(SCR, 'data-' + tag); fs.mkdirSync(dataDir, { recursive: true });
  const saved = { PATH: process.env.PATH, HOME: process.env.HOME, ROOT: process.env.VIBESPACE_AGENTD_ROOT };
  process.env.VIBESPACE_AGENTD_ROOT = root; process.env.HOME = home;
  if (windows) process.env.PATH = NOBIN; // a Windows machine: no `sh` anywhere on the agent's PATH
  try {
    const dm = new Client.DeviceManager({ dataDir, bundlePath: bundle, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => {} });
    const conn = await dm.connect();
    try { daemonPids.push(Number(String(fs.readFileSync(path.join(root, 'state', 'agentd.lock'), 'utf8')).trim())); } catch { }
    return { dm, conn, root, home, dataDir, bundle };
  } finally { process.env.PATH = saved.PATH; process.env.HOME = saved.HOME; if (saved.ROOT === undefined) delete process.env.VIBESPACE_AGENTD_ROOT; else process.env.VIBESPACE_AGENTD_ROOT = saved.ROOT; }
};
const secondManager = (d, Client) => { const saved = process.env.VIBESPACE_AGENTD_ROOT; process.env.VIBESPACE_AGENTD_ROOT = d.root; try { return new Client.DeviceManager({ dataDir: d.dataDir, bundlePath: d.bundle, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => {} }); } finally { if (saved === undefined) delete process.env.VIBESPACE_AGENTD_ROOT; else process.env.VIBESPACE_AGENTD_ROOT = saved; } };
/** what the hub ASKED the agent: every request + stream op, by op / action / cmd */
const record = (dm) => {
  const asked = [];
  const rq = dm._request.bind(dm), so = dm._streamOp.bind(dm);
  dm._request = (p) => { asked.push({ op: p.op, action: p.action, cmd: p.cmd, path: p.path }); return rq(p); };
  dm._streamOp = (p, o) => { asked.push({ op: p.op, cmd: p.cmd }); return so(p, o); };
  return asked;
};
const hostsOf = (dm, name = 'WIN-DESK1') => ({ get: (id) => ({ id, name, transport: 'dial' }), deviceBounded: async () => dm, dataPlaneOn: () => true, sshArgs: () => [] });
class FakeRes {
  constructor() { this.headers = {}; this.code = 200; this.chunks = []; this.headersSent = false; this.ended = false; this.body = null; this._l = {}; this.done = new Promise((r) => { this._done = r; }); }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; } removeHeader(k) { delete this.headers[k.toLowerCase()]; }
  status(c) { this.code = c; return this; }
  json(o) { this.body = o; this.headersSent = true; this.ended = true; this._done(); return this; }
  write(b) { this.headersSent = true; this.chunks.push(Buffer.from(b)); return true; }
  end() { this.headersSent = true; this.ended = true; this._done(); }
  on(ev, f) { (this._l[ev] = this._l[ev] || []).push(f); return this; } once(ev, f) { return this.on(ev, f); }
  bytes() { return Buffer.concat(this.chunks); }
}
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };
const RFS = require(path.join(REPO, 'src/remote-fs.js'));
const BaseRFS = HAVE_BASE ? require(writeCopy('remote-fs-base.cjs', relTop(baseOf('src/remote-fs.js')))) : null;
const BaseCL = HAVE_BASE ? require(writeCopy('client-base.cjs', rel(baseOf('src/agentd/client.js')))) : null;
const seed = (home) => {
  fs.mkdirSync(path.join(home, 'docs', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(home, 'a.txt'), 'hello from the device\n');
  fs.writeFileSync(path.join(home, 'docs', 'note.md'), '# note\n');
  fs.writeFileSync(path.join(home, 'docs', 'sub', 'deep.txt'), 'x'.repeat(5000));
  fs.writeFileSync(path.join(home, 'bin.dat'), Buffer.from([1, 2, 0, 3, 4]));
  fs.writeFileSync(path.join(home, 'big.bin'), Buffer.alloc(9 * 1024 * 1024 + 123, 7));
};

// ── §3 the Files view on a Windows agent ──
console.log('§3 the Files view on a Windows agent (a real agent: hello win32, no `sh` on its PATH)');
const headBundle = bundleFrom('src/agentd/agentd.js', 'head');
const winBundle = bundleFrom(writeCopy('agentd-win.cjs', rel(asWindows(fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8')))), 'win');
const win = await realDaemon(winBundle, 'win', { windows: true });
seed(win.home);
ok(win.conn.info.platform === 'win32' && win.conn.info.capabilities.includes('fs-portable'), 'the agent says win32 and advertises fs-portable (the THREE-TOUCH rule: capability first)', win.conn.info.capabilities);
ok(Array.isArray(win.conn.info.posixShells) && win.conn.info.posixShells.length === 0, 'F1: the agent MEASURED its shells (started each one) and says it has none', win.conn.info.posixShells);
{
  const dm = win.dm, asked = record(dm);
  const rf = new RFS.RemoteFs(hostsOf(dm));
  const H = win.home, J2 = (...p) => path.join(H, ...p);
  const ID = 'host-dial-WIN-DESK1';
  ok(await rf.home(ID) === H, 'home() = the agent\'s own home (fsHome)');
  const l = await rf.list(ID, '~');
  ok(l.path === H && l.items[0].name === 'docs' && l.items[0].isDirectory && l.items.some((i) => i.name === 'a.txt' && i.size === 22), 'list("~") — the owner\'s GET /api/files: the agent resolves `~` and lists it, folders first', l);
  ok((await rf.list(ID, J2('docs'))).items.map((i) => i.name).join() === 'sub,note.md', 'list(<abs folder>)');
  const lmiss = await rejects(rf.list(ID, J2('nope')));
  ok(lmiss && /ENOENT|no such file/i.test(lmiss.message) && !/127/.test(lmiss.message), 'a missing folder: the agent\'s own error, never a 127', lmiss && lmiss.message);
  const inf = await rf.info(ID, '~/a.txt'), infb = await rf.info(ID, J2('bin.dat'));
  ok(inf.size === 22 && inf.isBinary === false && !inf.isDirectory && infb.isBinary === true, 'info: size, text vs binary (a NUL in the head)', [inf, infb]);
  ok((await rf.readText(ID, '~/a.txt')).content === 'hello from the device\n', 'readText');
  ok(Buffer.compare(await rf.readBinary(ID, J2('bin.dat'), 1, 3), Buffer.from([2, 0, 3])) === 0, 'readBinary(offset, length)');
  await rf.write(ID, '~/new/b.txt', Buffer.from('written'));
  ok(fs.readFileSync(J2('new', 'b.txt'), 'utf8') === 'written', 'write (its folder made)');
  await rf.mkdir(ID, J2('made', 'deep'));
  ok(fs.statSync(J2('made', 'deep')).isDirectory(), 'mkdir (recursive)');
  await rf.rename(ID, J2('new', 'b.txt'), J2('new', 'c.txt'));
  ok(fs.existsSync(J2('new', 'c.txt')) && !fs.existsSync(J2('new', 'b.txt')), 'rename');
  const clob = await rejects(rf.rename(ID, J2('new', 'c.txt'), J2('a.txt')));
  ok(clob && /already exists/.test(clob.message) && fs.readFileSync(J2('a.txt'), 'utf8') === 'hello from the device\n', 'rename onto an existing name is refused, said (mv -n never clobbered either)', clob && clob.message);
  await rf.copy(ID, J2('docs'), J2('docs2'));
  ok(fs.readFileSync(J2('docs2', 'sub', 'deep.txt'), 'utf8').length === 5000, 'copy a folder (recursive)');
  fs.writeFileSync(J2('docs2', 'note.md'), 'mine');
  await rf.copy(ID, J2('docs'), J2('docs2'));
  ok(fs.readFileSync(J2('docs2', 'note.md'), 'utf8') === 'mine', 'copy over an existing file keeps it (= cp -rn)');
  await rf.move(ID, J2('docs2'), J2('made', 'docs3'));
  ok(fs.existsSync(J2('made', 'docs3', 'sub', 'deep.txt')) && !fs.existsSync(J2('docs2')), 'move a folder');
  const st = await rf.stat(ID, J2('docs'), true);
  ok(st.kind === 'directory' && Number.isFinite(st.du) && st.du >= 5000 + 7, 'stat(withDu) — du = the agent\'s own walk', st);
  await rf.remove(ID, J2('made'));
  ok(!fs.existsSync(J2('made')), 'remove (recursive)');
  const r1 = new FakeRes(); rf.downloadTo(ID, J2('big.bin'), r1, { attachment: true }); await r1.done;
  ok(r1.code === 200 && r1.bytes().length === 9 * 1024 * 1024 + 123 && r1.bytes().every((b) => b === 7) && /attachment/.test(r1.headers['content-disposition']), 'download (9 MB, three read-range chunks), named', { code: r1.code, n: r1.bytes().length });
  const r2 = new FakeRes(); rf.downloadTo(ID, J2('a.txt'), r2); await r2.done;
  ok(r2.bytes().toString() === 'hello from the device\n' && /inline/.test(r2.headers['content-disposition']), 'the raw viewer stream, inline + the file\'s name');
  const r3 = new FakeRes(); rf.downloadTo(ID, J2('gone.txt'), r3, { attachment: true }); await r3.done;
  ok(r3.code === 404 && !r3.headers['content-disposition'], 'a missing file ⇒ 404, no name', r3);
  const out = path.join(SCR, 'fetched.bin');
  await rf.fetchToLocal(ID, J2('docs', 'sub', 'deep.txt'), out);
  ok(fs.readFileSync(out, 'utf8').length === 5000, 'fetchToLocal (the local-parser previews)');
  const big = await rejects(rf.fetchToLocal(ID, J2('big.bin'), out, 1024 * 1024));
  ok(big && big.status === 413 && /too large/.test(big.message), 'fetchToLocal past its cap ⇒ 413, said', big && big.message);
  const z = new FakeRes(); rf.downloadZipTo(ID, J2('docs'), z); await z.done;
  ok(z.code === 501 && z.body && z.body.error === 'folder download as .zip is not available on Windows machines yet' && !z.headers['content-disposition'] && !z.headers['content-type'], 'folder download as .zip ⇒ refused BY NAME (501), never a 127', z);
  for (const [what, p] of [['archive-list', rf.archiveList(ID, J2('x.zip'))], ['archive-entry', rf.archiveExtractEntry(ID, J2('x.zip'), 'a', path.join(SCR, 'e'))], ['archive-extract', rf.archiveExtract(ID, J2('x.zip'), J2('o'))], ['make-archive', rf.makeArchive(ID, J2('x.zip'), H, ['a.txt'])]]) {
    const e = await rejects(p);
    ok(e && e.code === 'windows_unsupported' && e.message === RFS.WIN_REFUSED[what], `${what} ⇒ refused by name: "${RFS.WIN_REFUSED[what]}"`, e && e.message);
  }
  ok(asked.length > 20 && !asked.some((a) => a.op === 'run-cmd' || a.op === 'run-stream'), `nothing was asked of a shell: ${asked.length} asks, every one an fs-op (${[...new Set(asked.map((a) => a.action))].join(', ')})`, asked.filter((a) => a.op !== 'fs-op'));
  const dr = await rejects(dm.runCmd('sh', ['-c', 'echo "$HOME"']));
  ok(dr && dr.code === 'windows_no_shell' && !asked.some((a) => a.op === 'run-cmd'), 'THE DOOR on a real link: `sh` asked of this agent is refused by name, nothing sent', dr && dr.message);
  const ds = await rejects(dm.runStream('sh', ['-c', 'zip -r - x'], { onData: () => {} }));
  ok(ds && ds.code === 'windows_no_shell', '…runStream too');
  ok(String((await dm.runCmd(process.execPath, ['-e', 'process.stdout.write("argv ok")'])).stdout) === 'argv ok', '…a non-shell argv still runs');
  // the pre-fix hub (base remote-fs + base client) over the SAME agent = the owner's report
  if (!BaseCL) skip('PRE-FIX (the base hub over this agent): list("~") ⇒ "command failed (127)"'); else {
  const bdm = secondManager(win, BaseCL);
  const brf = new BaseRFS.RemoteFs(hostsOf(bdm));
  const be = await rejects(brf.list(ID, '~'));
  ok(be && /command failed \(127\)/.test(be.message), 'PRE-FIX (the base hub over this agent): list("~") ⇒ "command failed (127)" — the owner\'s 400', be && be.message);
  }
}

// ── §4 an OLD Windows agent ──
console.log('§4 an old Windows agent (the base tree\'s agent, hello win32)');
const old = HAVE_BASE ? await realDaemon(bundleFrom(writeCopy('agentd-old-win.cjs', rel(asWindows(baseOf('src/agentd/agentd.js')))), 'oldwin'), 'oldwin', { windows: true }) : null;
if (!old) skip('§4 an old Windows agent (the base tree\'s agent): every leg');
else seed(old.home);
if (old) {
  const dm = old.dm, asked = record(dm);
  const rf = new RFS.RemoteFs(hostsOf(dm));
  ok(!old.conn.info.capabilities.includes('fs-portable'), 'the old agent lacks fs-portable');
  const WORDS = /^this machine's agent is [^,]+, too old to browse files on Windows — rerun the device's install command \(Remote → WIN-DESK1 → Pairing command\)$/;
  const e1 = await rejects(rf.list('h', '~'));
  ok(e1 && e1.code === 'device_agent_outdated' && WORDS.test(e1.message), 'list ⇒ the one sentence: its version, too old for files on Windows, the one step (lane device-upgrade-stuck\'s helper)', e1 && e1.message);
  ok(e1 && e1.message === RFS.filesOutdatedText('WIN-DESK1', old.conn.info.daemonVersion), '…naming the version its hello said');
  for (const [n, p] of [['home', rf.home('h')], ['info', rf.info('h', '~/a.txt')], ['stat', rf.stat('h', '~', true)], ['write', rf.write('h', '~/x', Buffer.from('x'))], ['copy', rf.copy('h', '~/a.txt', '~/b.txt')]]) {
    const e = await rejects(p); ok(e && e.code === 'device_agent_outdated', `${n} ⇒ the same sentence`, e && e.message);
  }
  const r = new FakeRes(); rf.downloadTo('h', '~/a.txt', r, { attachment: true }); await r.done;
  ok(r.code === 409 && WORDS.test(r.body && r.body.error) && !r.headers['content-disposition'], 'a download ⇒ 409 + the sentence, no name', r);
  ok(asked.length === 1 && asked[0].op === 'run-cmd' && asked[0].cmd === 'sh', 'F1: the old agent cannot say whether it has `sh` — asked ONCE per link (`sh -c "exit 0"`, the line it ran anyway), no fs-op it might not know', asked);
  const g = await rejects(dm.fsHome());
  ok(g && g.code === 'host_needs_daemon' && asked.length === 1, 'the client\'s capability gate: fsHome on an agent without fs-portable is refused at once, never asked', g && g.message);
  const ns = await rejects(dm.runCmd('sh', ['-c', 'echo "$HOME"']));
  ok(ns && ns.code === 'windows_no_shell' && WORDS_NOSH.test(ns.message) && asked.length === 2, 'F1: `sh` asked of the old agent (too old to say) IS sent, and its failed spawn comes back named — not "command failed (127)"', ns && ns.message);
}

// ── §4b verify-r1 F1: Windows machines WITH `sh` ──
console.log('§4b Windows WITH `sh` (Git for Windows / MSYS2 / Cygwin on PATH): the shell lines that ran before still run');
const wshBundle = bundleFrom(writeCopy('agentd-win-sh.cjs', rel(asWindowsWithSh(fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8')))), 'winsh');
const wsh = await realDaemon(wshBundle, 'winsh');
seed(wsh.home);
{
  const dm = wsh.dm, asked = record(dm);
  ok(wsh.conn.info.platform === 'win32' && wsh.conn.info.posixShells.includes('sh'), 'F1: the agent says win32 AND that `sh` starts there (measured)', wsh.conn.info.posixShells);
  const r = await dm.runCmd('sh', ['-c', 'printf %s "$HOME"']);
  ok(r.code === 0 && r.stdout === wsh.home, 'F1: runCmd(`sh -c …`) — the ctx-sync / sweeps / sysinfo / port-forward carrier — answers as before', r);
  const st = await dm.runStream('sh', ['-c', 'echo streamed'], { onData: () => { } });
  ok(st.code === 0, 'F1: runStream(`sh`) — the mounts / install carrier — runs', st);
  const ps = await rejects(dm.openPipeSession({ sid: 'wdfs-f1', cmd: 'sh', args: ['-lc', 'echo hi'], cwd: wsh.home }));
  ok(ps === null, 'F1: openPipeSession(`sh -lc`) — a ws-create session — opens', ps && ps.message);
  const rf = new RFS.RemoteFs(hostsOf(dm));
  const n0 = asked.length;
  ok((await rf.list('h', '~')).items.some((i) => i.name === 'a.txt') && asked.slice(n0).every((a) => a.op === 'fs-op'), 'F1: the Files view still takes the agent\'s own fs ops (native paths), not `sh`');
  const ae = await rejects(rf.archiveList('h', path.join(wsh.home, 'nope.tar')));
  ok(!(ae && ae.code === 'windows_unsupported') && asked.some((a) => a.op === 'run-cmd' && a.cmd === 'sh'), 'F1: a shell-only verb (an archive) is asked of the machine that has `sh` — not refused by name', ae && ae.message);
}
const oldSh = HAVE_BASE ? await realDaemon(bundleFrom(writeCopy('agentd-old-win-sh.cjs', rel(asWindowsWithSh(baseOf('src/agentd/agentd.js')))), 'oldwinsh'), 'oldwinsh') : null;
if (!oldSh) skip('§4b an old Windows agent WITH `sh` (the base tree\'s agent): every leg');
else seed(oldSh.home);
if (oldSh) {
  const dm = oldSh.dm, asked = record(dm);
  ok(oldSh.conn.info.platform === 'win32' && oldSh.conn.info.posixShells === undefined && !oldSh.conn.info.capabilities.includes('fs-portable'), 'F1: an old Windows agent: says neither its shells nor fs-portable');
  const r = await dm.runCmd('sh', ['-c', 'printf %s "$HOME"']);
  ok(r.code === 0 && r.stdout === oldSh.home, 'F1: too old to say ⇒ asked (today\'s behaviour) — its `sh` answers', r);
  const l = await new RFS.RemoteFs(hostsOf(dm)).list('h', '~');
  const b = await new BaseRFS.RemoteFs(hostsOf(dm)).list('h', '~');
  ok(JSON.stringify(l) === JSON.stringify(b) && l.items.some((i) => i.name === 'a.txt') && !asked.some((a) => a.op === 'fs-op' && a.action === 'home'), 'F1: its Files view answers what the base hub answered (over `sh`), and it is never asked an fs op it lacks', [l, b]);
}

// ── §5 the POSIX path unchanged ──
console.log('§5 the POSIX path unchanged (a real Linux agent from this tree)');
const lin = await realDaemon(headBundle, 'linux');
seed(lin.home);
if (!BaseRFS) skip('§5 the POSIX path: the head and the base RemoteFs answer alike (every parity leg)'); else {
  const dm = lin.dm, asked = record(dm);
  const head = new RFS.RemoteFs(hostsOf(dm, 'linux-box')), base = new BaseRFS.RemoteFs(hostsOf(dm, 'linux-box'));
  const H = lin.home;
  for (const [n, f] of [['home', (r) => r.home('l')], ['list ~', (r) => r.list('l', '~')], ['list docs', (r) => r.list('l', '~/docs')], ['info', (r) => r.info('l', '~/bin.dat')], ['readText', (r) => r.readText('l', '~/a.txt')], ['stat+du', (r) => r.stat('l', path.join(H, 'docs'), true)]]) {
    const a = await f(head), b = await f(base);
    ok(JSON.stringify(a) === JSON.stringify(b), `${n}: the head answers exactly what the base answered`, [a, b]);
  }
  ok(asked.some((a) => a.op === 'run-cmd' && a.cmd === 'sh'), 'the POSIX agent is still asked `sh` where it always was (home, du) — unchanged');
  // verify-r1 item 3: the ERRORS too, not only the answers
  for (const [n, f] of [['list missing', (r) => r.list('l', path.join(H, 'nope'))], ['info missing', (r) => r.info('l', path.join(H, 'nope.txt'))], ['readText missing', (r) => r.readText('l', path.join(H, 'nope.txt'))], ['stat missing', (r) => r.stat('l', path.join(H, 'nope'), true)], ['copy missing', (r) => r.copy('l', path.join(H, 'nope'), path.join(H, 'nope2'))], ['archiveList missing', (r) => r.archiveList('l', path.join(H, 'nope.zip'))]]) {
    const a = await rejects(f(head)), b = await rejects(f(base));
    ok(JSON.stringify([a?.message, a?.code, a?.status]) === JSON.stringify([b?.message, b?.code, b?.status]), `${n}: the head fails exactly as the base failed`, [a?.message, b?.message]);
  }
  const mh = new FakeRes(), mb = new FakeRes();
  head.downloadTo('l', path.join(H, 'nope.bin'), mh, { attachment: true }); await mh.done; base.downloadTo('l', path.join(H, 'nope.bin'), mb, { attachment: true }); await mb.done;
  ok(mh.code === mb.code && JSON.stringify([mh.headers, mh.body, mh.bytes().length]) === JSON.stringify([mb.headers, mb.body, mb.bytes().length]), 'a missing download answers what the base answered (status, headers, body)', [mh.code, mb.code, mh.headers, mb.headers]);
  const rh = new FakeRes(), rb = new FakeRes();
  head.downloadTo('l', path.join(H, 'big.bin'), rh); await rh.done; base.downloadTo('l', path.join(H, 'big.bin'), rb); await rb.done;
  ok(rh.bytes().length === 9 * 1024 * 1024 + 123 && Buffer.compare(rh.bytes(), rb.bytes()) === 0 && asked.some((a) => a.op === 'run-stream' && a.cmd === 'cat'), 'a download streams `cat` as before, same bytes');
}

// ── §6 patched-copy controls ──
console.log('§6 controls — each rule removed');
{
  const src = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const DOORLINE = "const noShell = posixShellRefusal(info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (the device's fact)";
  const FAILLINE = "const failed = posixShellFailed(info, cmd, r); if (failed) throw failed; // verify-r1 F1: asked, and it was not there ⇒ named";
  ok(src.split(DOORLINE).length === 3 && src.split(FAILLINE).length === 3, '(c1) the door line + the named-failure line sit in runCmd + runStream');
  const NoDoor = require(writeCopy('client-nodoor.cjs', rel(src.split(DOORLINE).join(''))));
  const ndm = secondManager(win, NoDoor); const nasked = record(ndm);
  const ne = await rejects(ndm.runCmd('sh', ['-c', 'echo "$HOME"']));
  ok(nasked.some((a) => a.op === 'run-cmd' && a.cmd === 'sh') && ne && ne.code === 'windows_no_shell', 'CONTROL c1 — no door: `sh` IS sent to the Windows agent that said it has none (only named after it failed)', { nasked, e: ne && ne.message });
  const NoName = require(writeCopy('client-noname.cjs', rel(src.split(DOORLINE).join('').split(FAILLINE).join(''))));
  const r = await secondManager(win, NoName).runCmd('sh', ['-c', 'echo "$HOME"']);
  ok(r.code === 127, 'CONTROL c1b — no door, no naming: `sh` comes back 127 (the number nobody can act on)', r);
  const FACT = "if (!base || !Array.isArray(info.posixShells) || info.posixShells.includes(base)) return null;";
  ok(src.includes(FACT), '(c6) the door keys on the device\'s fact');
  const ByPlatform = require(writeCopy('client-byplatform.cjs', rel(src.replace(FACT, 'if (!base) return null;'))));
  const pe = await rejects(secondManager(wsh, ByPlatform).runCmd('sh', ['-c', 'echo "$HOME"']));
  ok(pe && pe.code === 'windows_no_shell', 'CONTROL c6 — the door keyed on the PLATFORM (the lane head e90dfd88): the Windows machine WITH `sh` is refused what it ran (F1)', pe && pe.message);
  if (!oldSh) skip('CONTROL c6 — …and the old agent with `sh` too'); else { const pe2 = await rejects(secondManager(oldSh, ByPlatform).runCmd('sh', ['-c', 'echo "$HOME"']));
  ok(pe2 && pe2.code === 'windows_no_shell', 'CONTROL c6 — …and the old agent with `sh` too', pe2 && pe2.message); }
  const GATE = "if (!conn.info?.capabilities?.includes?.('fs-portable')) { const e = new Error('daemon lacks fs-portable (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }";
  ok(src.includes(GATE), '(c2) the gate line is there');
  const NoGate = require(writeCopy('client-nogate.cjs', rel(src.replace(GATE, ''))));
  if (!old) skip('CONTROL c2 — no gate: the old agent IS asked an op it lacks'); else {
  const gdm = secondManager(old, NoGate); const asked = record(gdm);
  const ge = await rejects(gdm.fsHome());
  ok(asked.some((a) => a.action === 'home') && !(ge && ge.code === 'host_needs_daemon'), 'CONTROL c2 — no gate: the old agent IS asked an op it lacks', { asked, e: ge && ge.message });
  }
  const rsrc = fs.readFileSync(path.join(REPO, 'src/remote-fs.js'), 'utf8');
  const ROUTE = "if (info.platform !== 'win32') return null;";
  ok(rsrc.includes(ROUTE), '(c3) the route line is there');
  const NoRoute = require(writeCopy('rfs-noroute.cjs', relTop(rsrc.replace(ROUTE, 'return null;'))));
  const ce = await rejects(new NoRoute.RemoteFs(hostsOf(win.dm)).copy('h', path.join(win.home, 'a.txt'), path.join(win.home, 'a2.txt')));
  ok(ce && ce.code === 'windows_no_shell' && !fs.existsSync(path.join(win.home, 'a2.txt')), 'CONTROL c3 — no route: a copy falls back to `cp -rn` over `sh` (only the door stops it)', ce && ce.message);
  const CAPLINE = "throw named('device_agent_outdated', filesOutdatedText(this._host(id)?.name || id, info.daemonVersion), 409, { machine: this._host(id)?.name || id, version: agentVersionOf(info.daemonVersion) || '' });";
  ok(rsrc.split(CAPLINE).length === 2, '(c4) the outdated refusal is there');
  const NoOld = require(writeCopy('rfs-noold.cjs', relTop(rsrc.replace(CAPLINE, 'return null;'))));
  if (!old) skip('CONTROL c4 — no outdated refusal (the old agent)'); else { const oe = await rejects(new NoOld.RemoteFs(hostsOf(old.dm)).list('h', '~'));
  ok(oe && oe.code !== 'device_agent_outdated' && !/too old to browse files/.test(oe.message), 'CONTROL c4 — no outdated refusal: the old agent answers a bare refusal nobody can act on', oe && oe.message); }
  const SHFACT = 'if (await this._winHasSh(dm, info)) return null;';
  ok(rsrc.includes(SHFACT), '(c7) the Files route asks whether the machine has `sh`');
  const NoSh = require(writeCopy('rfs-nosh.cjs', relTop(rsrc.replace(SHFACT, ''))));
  if (!oldSh) skip('CONTROL c7 — refused by platform: the old agent WITH `sh`'); else { const se = await rejects(new NoSh.RemoteFs(hostsOf(oldSh.dm)).list('h', '~'));
  ok(se && se.code === 'device_agent_outdated', 'CONTROL c7 — refused by platform (the lane head): the old agent WITH `sh` loses the Files view it had (F1)', se && se.message); }
  const ze = await rejects(new NoSh.RemoteFs(hostsOf(wsh.dm)).archiveList('h', path.join(wsh.home, 'nope.tar')));
  ok(ze && ze.code === 'windows_unsupported', 'CONTROL c7 — …and the machine WITH `sh` is refused its archives by name', ze && ze.message);
  const asrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const EXP = 'const p = devPath(msg.path);';
  ok(asrc.includes(EXP), '(c5) the agent expands `~` itself');
  const nb = bundleFrom(writeCopy('agentd-notilde.cjs', rel(asWindows(asrc.replace(EXP, "const p = String(msg.path || '');")))), 'notilde');
  const nt = await realDaemon(nb, 'notilde', { windows: true });
  const te = await rejects(new RFS.RemoteFs(hostsOf(nt.dm)).list('h', '~'));
  ok(te && /absolute path required/.test(te.message), 'CONTROL c5 — an agent that does not expand `~`: the Files view\'s first listing fails', te && te.message);
}

console.log('§7 verify-r2 — a `sh` that is not a usable POSIX shell; one installed later; refusals as codes; du / EXDEV in words');
// the agent's children see <its HOME>/.local/bin right after node's own dir (spawnEnv's extras), so a fake shell there wins
const fakeShells = (tag, files) => { const d = path.join(SCR, 'home-' + tag, '.local', 'bin'); fs.mkdirSync(d, { recursive: true }); for (const [n, body] of Object.entries(files)) { const f = path.join(d, n); try { fs.unlinkSync(f); } catch { } fs.writeFileSync(f, '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); } };
const BAD = { sh: 'exec sleep 30', bash: 'exit 3', dash: 'echo not-a-posix-shell', ksh: 'exec /bin/sh "$@"' }; // hung (WSL booting / a prompt), broken, not POSIX, fine
const agentSrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
let r2;
{
  fakeShells('r2probe', BAD);
  const b2 = bundleFrom(writeCopy('agentd-r2probe.cjs', rel(asWindowsWithSh(agentSrc))), 'r2probe'), t0 = Date.now();
  r2 = await realDaemon(b2, 'r2probe');
  const first = Date.now() - t0, sh = r2.conn.info.posixShells;
  console.log(`    first link (agent start + boot probe + hello): ${first} ms; says ${JSON.stringify(sh)}`);
  ok(!sh.includes('sh') && !sh.includes('bash') && !sh.includes('dash') && sh.includes('ksh'), 'r2: a hung `sh`, a `bash` that exits 3, a `dash` that is not POSIX are NOT shells here; a working `ksh` is', sh);
  ok(first < 3000 + 4000, 'r2: the first hello is bounded (the hung `sh` costs ≤ the 3 s probe bound, never its 30 s)', first);
  const m2 = secondManager(r2, CL), t1 = Date.now(), c2 = m2.connect();
  const tp = Date.now(); const h = await r2.dm.fsHome(); const ping = Date.now() - tp;
  const conn2 = await c2; const hello2 = Date.now() - t1;
  console.log(`    second link's hello (re-measures, the hung sh holds it): ${hello2} ms; the first link answered an op meanwhile in ${ping} ms`);
  ok(h && h.home === r2.home && ping < 1500, 'r2: the probe is async — the agent answers its other links while a hung shell is timed out', { ping });
  ok(hello2 >= 2500 && hello2 < 3000 + 2500 && !conn2.info.posixShells.includes('sh'), 'r2: a hello re-measures, bounded by the probe (≈ 3 s added by a hung `sh`)', { hello2, sh: conn2.info.posixShells });
  m2.stop();
  fakeShells('r2probe', { sh: 'exec /bin/sh "$@"' }); // Git for Windows installed after the agent started
  const m3 = secondManager(r2, CL), conn3 = await m3.connect();
  const rr = await m3.runCmd('sh', ['-c', 'echo installed-later']);
  ok(conn3.info.posixShells.includes('sh') && rr.code === 0 && rr.stdout.trim() === 'installed-later', 'r2: a `sh` installed after the agent started is seen at the NEXT link (and runs)', { sh: conn3.info.posixShells, rr });
  m3.stop();
}
let r2old = null;
if (!HAVE_BASE) skip('r2: an old agent whose `sh` RAN but failed gets the outdated sentence (the base tree\'s agent)'); else {
  fakeShells('r2old', { sh: 'exit 3' }); // an old Windows agent whose `sh` is broken
  r2old = await realDaemon(bundleFrom(writeCopy('agentd-r2old.cjs', rel(asWindowsWithSh(baseOf('src/agentd/agentd.js')))), 'r2old'), 'r2old');
  const asked = record(r2old.dm), rf = new RFS.RemoteFs(hostsOf(r2old.dm));
  const e1 = await rejects(rf.list('h', '~')), e2 = await rejects(rf.info('h', '/x'));
  const probes = asked.filter((a) => a.op === 'run-cmd' && a.cmd === 'sh').length;
  ok(e1 && e1.code === 'device_agent_outdated' && e2 && e2.code === 'device_agent_outdated' && probes === 1 && !asked.some((a) => a.op === 'fs-op'), 'r2: an old agent whose `sh` RAN but failed gets the outdated sentence (its update is the way out) — probed ONCE per link, never per call, never an fs op', { e1: e1 && e1.message, probes, asked });
  ok(e1 && e1.params && e1.params.machine === 'WIN-DESK1' && 'version' in e1.params, 'r2: the refusal carries its params (machine, version) for the client\'s words', e1 && e1.params);
}
// item 2: the Files view's refusals as CODES, worded client-side (zh / ja)
const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
const opsSrc = fs.readFileSync(path.join(REPO, 'src/lib/file-explorer-ops.js'), 'utf8');
const fnSrc = opsSrc.slice(opsSrc.indexOf('const WIN_UNSUPPORTED = {'), opsSrc.indexOf('export function installExplorerOps')).replace('export function fsErrorText', 'function fsErrorText');
const tOf = (dict) => (k, p = {}) => String(dict[k] || k).replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m));
const wordIn = (dict) => new Function('t', fnSrc + '\nreturn fsErrorText;')(tOf(dict));
// no base tree (depth 1): an agent too old for fs-portable whose `sh` probe fails stands in for the old agent's hello
const oldDuck = { status: () => ({ info: { platform: 'win32', capabilities: [], daemonVersion: '2.369.0' } }), runCmd: async () => ({ code: 127, stdout: '', stderr: '' }) };
const outdated = await rejects(new RFS.RemoteFs(hostsOf(old ? old.dm : oldDuck)).list('h', '~'));
const zipE = await rejects(new RFS.RemoteFs(hostsOf(win.dm)).archiveList('h', path.join(win.home, 'x.zip')));
const noSh = await rejects(win.dm.runCmd('sh', ['-c', 'exit 0']));
const bodies = [outdated, zipE, noSh].map((e) => RFS.fsErrorBody(e));
ok(bodies.map((b) => b.code).join() === 'device_agent_outdated,windows_unsupported,windows_no_shell' && bodies.every((b) => b.error && b.params), 'r2: the three refusals travel as a CODE + params beside the English error', bodies);
const CJK = /[\u3040-\u30ff\u4e00-\u9fff]/;
for (const [lang, dict] of [['zh', zh], ['ja', ja]]) {
  const words = bodies.map((b) => wordIn(dict)(b));
  ok(words.every((w) => CJK.test(w)) && words[0].includes('WIN-DESK1') && words[2].includes('sh'), `r2: the Files view words each one in ${lang}`, words);
}
ok(wordIn(zh)({ error: 'ENOENT: no such file' }) === 'ENOENT: no such file', 'r2: any other error keeps its own text');
const filesSrc = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8').split('\n');
const remoteCatches = filesSrc.filter((l, i) => /\bR\.fs\.\w+\(/.test(l + (filesSrc[i - 1] || '') + (filesSrc[i - 2] || '')) && /catch \(e\)/.test(l));
ok(remoteCatches.length >= 13 && remoteCatches.every((l) => l.includes('fsErrorBody(e)')), 'r2: every remote Files route answers fsErrorBody(e) (the code rides along)', remoteCatches.filter((l) => !l.includes('fsErrorBody(e)')));
// item 3a: du stopped at its bound SAYS so
const duDm = { status: () => ({ info: { platform: 'win32', capabilities: ['fs-portable'] } }), fsStat: async () => ({ stat: { isDir: true, size: 0, mtimeMs: 1 } }), fsDu: async () => ({ bytes: 4096, entries: 1000000, truncated: true }) };
const duSt = await new RFS.RemoteFs(hostsOf(duDm)).stat('h', 'C:\\big', true);
ok(duSt.du === 4096 && duSt.duPartial === 1000000 && filesSrc.some((l) => l.includes('duPartial: s.duPartial')) && opsSrc.includes("d2.duPartial ? t('at least {size} (stopped counting after {n} entries)'") && zh['at least {size} (stopped counting after {n} entries)'] && ja['at least {size} (stopped counting after {n} entries)'], 'r2: a du the device stopped at 10^6 entries reaches Properties as "at least …" (zh / ja too)', duSt);
// item 3b: a move across drives that fails says what is left where (the agent's own move; /dev/shm is another filesystem)
let xdev = null;
try { if (fs.statSync('/dev/shm').dev !== fs.statSync(SCR).dev) { xdev = fs.mkdtempSync('/dev/shm/vs-wdfs-'); process.on('exit', () => { try { fs.chmodSync(path.join(SCR, 'mv-b', 'sub'), 0o755); } catch { } try { fs.rmSync(xdev, { recursive: true, force: true }); } catch { } }); } } catch { }
const xdevMove = async (dm, tag) => {
  const a = path.join(SCR, tag + '-a'), b = path.join(SCR, tag + '-b');
  fs.mkdirSync(path.join(a, 'sub'), { recursive: true }); fs.writeFileSync(path.join(a, 'ok.txt'), 'ok'); fs.writeFileSync(path.join(a, 'sub', 'locked.txt'), 'x'); fs.chmodSync(path.join(a, 'sub', 'locked.txt'), 0o000);
  fs.mkdirSync(path.join(b, 'sub'), { recursive: true }); fs.writeFileSync(path.join(b, 'sub', 'stays.txt'), 'y'); fs.chmodSync(path.join(b, 'sub'), 0o555);
  const ea = await rejects(dm.fsMove(a, path.join(xdev, tag + '-a'))), eb = await rejects(dm.fsMove(b, path.join(xdev, tag + '-b')));
  fs.chmodSync(path.join(b, 'sub'), 0o755); fs.chmodSync(path.join(a, 'sub', 'locked.txt'), 0o644);
  return { ea, eb, aLeft: fs.existsSync(path.join(xdev, tag + '-a')), aKept: fs.existsSync(path.join(a, 'ok.txt')), bCopied: fs.existsSync(path.join(xdev, tag + '-b', 'sub', 'stays.txt')), bKept: fs.existsSync(path.join(b, 'sub', 'stays.txt')) };
};
let xr = null;
if (!xdev || process.getuid?.() === 0) console.log('    SKIP the cross-drive legs (no second filesystem at /dev/shm, or root ignores the permissions)');
else {
  xr = await xdevMove(r2.dm, 'mv');
  ok(xr.ea && /could not copy to the other drive \(permission denied\) — nothing was moved; .* is unchanged/.test(xr.ea.message) && !/EACCES/.test(xr.ea.message) && !xr.aLeft && xr.aKept, 'r2: a cross-drive move whose copy failed: no partial copy left, the source unchanged — said in words', xr.ea && xr.ea.message);
  ok(xr.eb && /moved a full copy to .*, but removing .* stopped \(permission denied\) — what could not be removed is still at /.test(xr.eb.message) && !/EACCES/.test(xr.eb.message) && xr.bCopied && xr.bKept, 'r2: a cross-drive move whose source removal failed: both places named, no errno', xr.eb && xr.eb.message);
}
{
  // c8 — the r1 probe's judgement (a shell that STARTED counts; a hung one counts): the broken / hung / non-POSIX shells are said to be here
  const JUDGE = "(err, out) => end(!err && String(out).trim() === 'vs-42' ? c : null)";
  const HUNG = "const tm = setTimeout(() => { end(null);";
  ok(agentSrc.includes(JUDGE) && agentSrc.includes(HUNG), '(c8) the probe judges by the line it ran');
  fakeShells('r2c8', BAD);
  const c8 = await realDaemon(bundleFrom(writeCopy('agentd-r2c8.cjs', rel(asWindowsWithSh(agentSrc.replace(JUDGE, "(err) => end(!err || !/^E[A-Z]+$/.test(String(err.code)) ? c : null)").replace(HUNG, 'const tm = setTimeout(() => { end(c);')))), 'r2c8'), 'r2c8');
  const s8 = c8.conn.info.posixShells;
  ok(s8.includes('sh') && s8.includes('bash') && s8.includes('dash'), 'CONTROL c8 — judged by "it started" (the r1 rule): a hung `sh`, a broken `bash`, a non-POSIX `dash` all said to be here', s8);
  // c9 — measured once, kept forever (the r1 memo): a shell installed later is never seen
  const RESET = '.finally(() => { posixShellsRun = null; });';
  ok(agentSrc.includes(RESET), '(c9) each hello re-measures');
  fakeShells('r2c9', { sh: 'exit 3' });
  const c9 = await realDaemon(bundleFrom(writeCopy('agentd-r2c9.cjs', rel(asWindowsWithSh(agentSrc.replace(RESET, ';')))), 'r2c9'), 'r2c9');
  fakeShells('r2c9', { sh: 'exec /bin/sh "$@"' });
  const m9 = secondManager(c9, CL), conn9 = await m9.connect(); m9.stop();
  ok(!c9.conn.info.posixShells.includes('sh') && !conn9.info.posixShells.includes('sh'), 'CONTROL c9 — measured once: the `sh` installed later is still "absent" at the next link', conn9.info.posixShells);
  // c10 — the hub's old-agent probe judged by "no ENOENT" (r1): the broken `sh` takes the shell lines, whose error is not the sentence
  const rsrc = fs.readFileSync(path.join(REPO, 'src/remote-fs.js'), 'utf8');
  const OLDJ = '.then((r) => !!r && r.code === 0 && !r.timedOut,';
  ok(rsrc.includes(OLDJ), '(c10) the old-agent probe judges by the exit');
  const R10 = require(writeCopy('rfs-r2c10.cjs', relTop(rsrc.replace(OLDJ, '.then(() => true,'))));
  if (!r2old) skip('CONTROL c10 — judged by "no ENOENT" (the old agent with a broken `sh`)'); else { const e10 = await rejects(new R10.RemoteFs(hostsOf(secondManager(r2old, CL))).list('h', '~'));
  ok(!(e10 && e10.code === 'device_agent_outdated'), 'CONTROL c10 — judged by "no ENOENT": the old agent with a broken `sh` gets its shell line\'s failure, not the way out', e10 && e10.message); }
  // c11 — the route body without the code (r1): the client can only show the English sentence
  const BODY = "...(e && FS_REFUSALS.includes(e.code) ? { code: e.code, params: e.params || {} } : {})";
  ok(rsrc.includes(BODY), '(c11) the body carries the code');
  const R11 = require(writeCopy('rfs-r2c11.cjs', relTop(rsrc.replace(BODY, ''))));
  const w11 = [outdated, zipE, noSh].map((e) => wordIn(zh)(R11.fsErrorBody(e)));
  ok(w11.every((w) => !CJK.test(w)), 'CONTROL c11 — no code in the body: a zh reader gets the English sentence (r1 item 4)', w11);
  // c12 — the r1 stat line (drops `truncated`): a stopped walk reads as the whole size
  const DULINE = 'const r = await w.fsDu(target); du = r.bytes; duPartial = r.truncated ? r.entries : undefined;';
  ok(rsrc.includes(DULINE), '(c12) the stat keeps the walk\'s stop');
  const R12 = require(writeCopy('rfs-r2c12.cjs', relTop(rsrc.replace(DULINE, 'du = (await w.fsDu(target)).bytes;'))));
  const d12 = await new R12.RemoteFs(hostsOf(duDm)).stat('h', 'C:\\big', true);
  ok(d12.du === 4096 && d12.duPartial === undefined, 'CONTROL c12 — the walk\'s stop dropped: 10^6 entries read as the folder\'s whole size, unsaid', d12);
  // c13 — the r1 move body (copy then remove, errors raw): a raw errno, and a partial copy left behind
  const MV0 = agentSrc.slice(agentSrc.indexOf('      const why = (x) => FS_WHY'), agentSrc.indexOf("throw Object.assign(new Error(`moved a full copy to"));
  const MV1 = agentSrc.slice(agentSrc.indexOf("throw Object.assign(new Error(`moved a full copy to")); const mvEnd = MV1.indexOf('\n    }\n') + '\n    }\n'.length;
  ok(MV0.length > 100 && mvEnd > 50, '(c13) the move says what is left where');
  if (xdev && xr) {
    const r1Move = agentSrc.replace(MV0 + MV1.slice(0, mvEnd), "      f.cpSync(m.path, to, { recursive: true, force: false, errorOnExist: true }); f.rmSync(m.path, { recursive: true, force: true });\n    }\n");
    const c13 = await realDaemon(bundleFrom(writeCopy('agentd-r2c13.cjs', rel(asWindowsWithSh(r1Move))), 'r2c13'), 'r2c13');
    const x13 = await xdevMove(c13.dm, 'mv13');
    ok(x13.ea && /EACCES/.test(x13.ea.message) && x13.aLeft && x13.eb && /EACCES/.test(x13.eb.message), 'CONTROL c13 — the r1 move: a raw errno, and a partial copy left on the other drive', { a: x13.ea && x13.ea.message, aLeft: x13.aLeft, b: x13.eb && x13.eb.message });
  }
}

if (SKIPPED.length) console.log(`\n${SKIPPED.length} skipped (never counted as passed) — base ${BASE} not in this checkout — depth-1 clone`);
console.log(`\ntest-windows-device-fs: ${pass} passed, ${fail} failed`);
if (fail) { console.log('FAIL'); process.exit(1); }
console.log(`ALL PASS (${pass})`);
process.exit(0);
