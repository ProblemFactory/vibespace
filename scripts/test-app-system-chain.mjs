#!/usr/bin/env node
// test-app-system-chain — THE HELPER'S ARGV TABLE, THE SAME-PID CHAIN UNDER THE KEEPER, THE BOOT ORDER (lane
// app-persist-layer1, docs/design-app-persistence.zh.md §3.2 Layer 1). Fast, no root, no namespace: the REAL helper
// deploy/sysroot/vs-sysroot-enter runs here as this user with ONE line changed — its fixed root PATH (PATH_ROOT) starts
// with a scratch dir of fakes. Facts: `id -u` → 0, `stat -c %u` maps this user to 0, `getent` → a scratch HOME, `dpkg
// --print-architecture` → a file's word, `readlink` of the two mount-namespace links → "pod" until the fake unshare ran.
// Recorders: sudo / unshare / mount / chroot / chown append their argv + pid to a log; unshare and a USER-mode chroot then
// exec the rest (the real ones exec too), a --root chroot stops there (no apt ever runs here). Nothing mounts, nothing
// changes namespace or root — the real legs run in a disposable container (scripts/test-app-system-enter.mjs) and on the
// test pod (the lane's real-leg.md). Sections:
//   §1 THE ARGV TABLE (the spec): user mode / --root / --root --next — unshare's argv, every mount in order, chroot's argv
//      with the env allowlist, the app's own environment; the session token, a loader knob and BASH_ENV never cross; ONE
//      pid from the spawn to the app; the passwd / group upsert inside the userland
//   §2–§4 MOVED to the heavy twin scripts/test-app-system-chain-helper.mjs (B-7e49): each waits on real children;
//      their text kept here for the reader:
//   §2 REFUSALS before any namespace op (exit 111, by name, nothing recorded) + stage 2 called directly (no private ns)
//   §3 CONTROLS — a patched helper per rule (scratch copies), each caught by the table
//   §4 THE KEEPER: a sys row's shim (S.shimText) launched by the REAL keeper (desktop-serve, setsid) over a fake sudo that
//      execs ⇒ the keeper's pid P IS the app (exe, session leader, allowlisted environ) and the group stop ends it.
//      CONTROL: a sudo that forks (the drop-in's !use_pty missing) ⇒ P is sudo, the app a child
//   §5 THE BOOT ORDER: building the machine half + the engine (server.js does it before listen) spawns nothing; after listen
//      the boot step's children run off the loop — with two 400 ms sudo children and a 300-entry app system the largest
//      loop gap stays under half of a CONTROL's (the same boot waiting for its sudo child synchronously: the hold the law
//      forbids; no literal wall-clock bound — scripts/wall-clock-census.mjs); "helper + sudoers installed" before "boot:"
//   §T the twin holds §1–§4 (a pin)
// Run: node scripts/test-app-system-chain.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = require(path.join(repo, 'src/app-system.js'));
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 2000) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 25) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const leg = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} ran to its end`, e && e.stack); } };

const root0 = scratch('app-sys-chain');
fs.rmSync(root0, { recursive: true, force: true });
fs.mkdirSync(root0, { recursive: true, mode: 0o755 });
const root = fs.realpathSync(root0); // the helper refuses a non-canonical userland path
const ME = process.getuid(), MYGID = process.getgid();
const NAME = 'vsuser', GROUP = 'vsgroup';
const mk = (d) => { fs.mkdirSync(d, { recursive: true }); fs.chmodSync(d, 0o755); return d; };
const put = (p, text, mode = 0o644) => { fs.writeFileSync(p, text); fs.chmodSync(p, mode); return p; };
for (const d of [root, path.join(root, 'fake'), path.join(root, 'w')]) mk(d);
const FAKE = path.join(root, 'fake');
const SYS_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const INNER = 'cd "$0" 2>/dev/null || cd "$HOME"; exec "$@"';
const HELPER_SRC = fs.readFileSync(path.join(repo, 'deploy/sysroot/vs-sysroot-enter'), 'utf8');
const KEEP = (/^KEEP="([A-Z_ ]+)"$/m.exec(HELPER_SRC) || [, ''])[1].trim().split(/\s+/);

// ── the world: a scratch HOME per case (its userland root's = this user's, which the fake stat calls root) ──
let n = 0;
function world({ arch = 'amd64', contract = S.HELPER_CONTRACT, localtimeLink = true } = {}) {
  const w = path.join(root, 'w', `c${++n}`), home = path.join(w, 'home'), log = path.join(w, 'log');
  const R = path.join(home, '.vibespace', 'sysroot', 'rootfs');
  for (const d of [w, home, log, path.join(home, '.vibespace'), path.join(home, '.vibespace', 'sysroot'), R, path.join(R, 'etc'), path.join(R, 'usr'), path.join(R, 'usr', 'bin')]) mk(d);
  put(path.join(R, 'etc', 'vibespace-sysroot.json'), `{"v":1,"id":"debian","codename":"bookworm","arch":"${arch}","createdFrom":"tarball","helperContract":${contract}}\n`);
  put(path.join(R, 'etc', 'passwd'), 'root:x:0:0:root:/root:/bin/bash\n');
  put(path.join(R, 'etc', 'group'), 'root:x:0:\n');
  if (localtimeLink) fs.symlinkSync('/usr/share/zoneinfo/Etc/UTC', path.join(R, 'etc', 'localtime')); // minbase ships it as a link (§5 P3)
  put(path.join(w, 'arch'), `${arch}\n`);
  put(path.join(w, 'passwd'), `${NAME}:x:${ME}:${MYGID}:VS:${home}:/bin/bash\n`);
  put(path.join(w, 'group'), `${GROUP}:x:${MYGID}:\n`);
  return { w, home, log, R };
}
// ONE fake dir; each fake reads the case's world from the helper's own SUDO_UID-independent anchor: the file `cur` (the
// case under way — one case runs at a time; the helper's env is cleared, so a fake cannot be told through it)
const CUR = path.join(root, 'cur');
const fake = (name, body) => put(path.join(FAKE, name), `#!/bin/sh\nW=$(cat '${CUR}')\n${body}\n`, 0o755);
// a recorder line: name<TAB>pid<TAB>arg…  (no fixture argument holds a tab or a newline)
const REC = (name) => `{ printf '%s\\t%s' '${name}' "$$"; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\n'; } >> "$W/log/calls"`;
fake('id', `if [ "$1" = -u ] && [ $# = 1 ]; then echo 0; else exec /usr/bin/id "$@"; fi`);
fake('stat', `out=$(/usr/bin/stat "$@") || exit $?\nif [ "$2" = %u ] && [ "$out" = ${ME} ]; then out=0; fi\nprintf '%s\\n' "$out"`);
fake('getent', `case "$1" in passwd) f="$W/passwd";; group) f="$W/group";; *) exit 2;; esac\nawk -F: -v k="$2" '$3==k {print; found=1} END {exit found ? 0 : 2}' "$f"`);
fake('dpkg', `if [ "$1" = --print-architecture ]; then cat "$W/arch"; else exit 1; fi`);
fake('readlink', `case "$*" in /proc/1/ns/mnt) echo 'mnt:[4026531841]';; /proc/self/ns/mnt) if [ -e "$W/log/in-ns" ]; then echo 'mnt:[4026532999]'; else echo 'mnt:[4026531841]'; fi;; *) exec /usr/bin/readlink "$@";; esac`);
fake('unshare', `${REC('unshare')}\n: > "$W/log/in-ns"\nwhile [ $# -gt 0 ] && [ "$1" != -- ]; do shift; done\nshift\nexec "$@"`);
fake('mount', `${REC('mount')}\nexit 0`);
fake('chown', `${REC('chown')}\nexit 0`);
fake('chroot', `${REC('chroot')}\ncase "$1" in --userspec=*) shift 2; env > "$W/log/chroot-env"; exec "$@";; esac\nexit 0`);
// the APP: its pid, cwd and whole environment (env -i ⇒ only what the helper's allowlist put there + what sh adds)
const PROBE = put(path.join(root, 'probe-app'), `#!/bin/sh\nW=$(cat '${CUR}')\n{ echo "pid=$$"; echo "cwd=$(pwd)"; echo "args=$*"; } > "$W/log/app"\nenv > "$W/log/app-env"\n[ "$1" = stay ] && exec sleep 600\nexit 0\n`, 0o755);

/** a helper copy: the real text with PATH_ROOT led by the fakes (+ an optional named edit for a control) */
function helperCopy(name, edit = (t) => t) {
  const line = 'PATH_ROOT=/usr/sbin:/usr/bin:/sbin:/bin';
  if (!HELPER_SRC.includes(`\n${line}\n`)) throw new Error('the helper\'s PATH_ROOT line moved — this harness patches exactly that line');
  const text = edit(HELPER_SRC.replace(`\n${line}\n`, `\nPATH_ROOT=${FAKE}:/usr/sbin:/usr/bin:/sbin:/bin\n`));
  const p = path.join(root, `helper-${name}`);
  return put(p, text, 0o755);
}
const HELPER = helperCopy('real');
const BASH_CANARY = path.join(root, 'bash-env-ran');
const bashEnv = put(path.join(root, 'bash-env'), `touch '${BASH_CANARY}'\n`);
/** what sudo might hand the helper at WORST (a rule with SETENV): everything the caller had, + SUDO_UID */
const callerEnv = (wd, extra = {}) => ({ PATH: '/usr/bin:/bin', SUDO_UID: String(ME), SUDO_GID: String(MYGID), SUDO_USER: NAME, DISPLAY: ':4093', XAUTHORITY: path.join(wd.home, '.Xauthority'), VIBESPACE_DESKTOP_APP: 'ds-1a2b', LANG: 'C.UTF-8', TZ: 'Etc/UTC', VIBESPACE_SESSION_TOKEN: 'vsst_never_inside', LD_LIBRARY_PATH: '/nonexistent-vs-loader', BASH_ENV: bashEnv, IFS: ',', HOME: '/root-lied', ...extra });
function run(helper, wd, args, env) {
  fs.writeFileSync(CUR, wd.w);
  return new Promise((resolve) => {
    const c = spawn(helper, args, { env, cwd: wd.home, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), 15000);
    c.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr, pid: c.pid }); });
  });
}
const calls = (wd) => { try { return fs.readFileSync(path.join(wd.log, 'calls'), 'utf8').split('\n').filter(Boolean).map((l) => { const [name, pid, ...argv] = l.split('\t'); return { name, pid: Number(pid), argv }; }); } catch { return []; } };
const kv = (file) => { try { return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return null; } };
/** THE MOUNT TABLE the spec says, for this host (a source that does not exist here is skipped — the helper's own rule) */
function mountTable(R, mode) {
  const t = [];
  const dir = (src, dst, ro) => { if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) return; t.push(['--rbind', src, R + dst]); if (ro) t.push(['-o', 'remount,bind,ro', R + dst]); };
  dir('/proc', '/proc'); dir('/sys', '/sys', true); dir('/dev', '/dev');
  for (const f of ['/etc/resolv.conf', '/etc/hosts', '/etc/hostname', '/etc/localtime']) if (fs.existsSync(f)) t.push(['--bind', f, R + f], ['-o', 'remount,bind,ro', R + f]);
  dir('/usr/share/fonts', '/usr/share/fonts/vibespace-host', true);
  if (mode === 'user') { dir('/home', '/home'); dir('/tmp', '/tmp'); dir(`/run/user/${ME}`, `/run/user/${ME}`); }
  return t;
}
// bash itself defines TERM=dumb (unexported) when the caller has none, and the helper's `${!k}` reads shell variables: the
// app then sees TERM=dumb (a terminal row's xterm sets its own) — the table says so
const keptEnv = (env) => { const e = { TERM: 'dumb', ...env }; return KEEP.filter((k) => e[k]).map((k) => `${k}=${e[k]}`); };
const LEAKS = ['vsst_never_inside', '/nonexistent-vs-loader', 'root-lied', 'LD_LIBRARY_PATH', 'BASH_ENV', 'VIBESPACE_SESSION_TOKEN'];
const leaks = (texts) => LEAKS.filter((x) => texts.some((t) => String(t).includes(x)));

try {
await leg('§1', async () => {
  console.log('§1 THE ARGV TABLE — the real helper over recorders (user mode, --root, --root --next)');
  const wd = world();
  const env = callerEnv(wd);
  const cwd = path.join(wd.home, 'proj'); mk(cwd);
  const r = await run(HELPER, wd, ['--cwd', cwd, '--', PROBE, 'a b', '--flag'], env);
  const cs = calls(wd), un = cs.filter((c) => c.name === 'unshare'), mo = cs.filter((c) => c.name === 'mount'), ch = cs.filter((c) => c.name === 'chroot');
  ok(r.code === 0 && un.length === 1 && ch.length === 1, 'user mode ran to the app: one unshare, one chroot, exit 0', { code: r.code, stderr: r.stderr.slice(0, 600), names: cs.map((c) => c.name) });
  ok(gateOf(un[0]) && verdictOf(same(un[0].argv, ['--mount', '--propagation', 'private', '--', HELPER, '--stage2', '--cwd', cwd, '--', PROBE, 'a b', '--flag'])), 'unshare: `--mount --propagation private -- <helper> --stage2 --cwd <dir> -- <cmd> <args…>` (the helper again, inside the fresh private namespace)', un[0] && un[0].argv);
  const R = wd.R, table = mountTable(R, 'user');
  ok(verdictOf(same(mo.map((c) => c.argv), table)), `the mount table, in order (${table.length} calls): rbind /proc (the container's masks), /sys then ro, /dev; ro binds of resolv.conf / hosts / hostname / localtime; the image's fonts ro at usr/share/fonts/vibespace-host; /home, /tmp, /run/user/<uid>`, { got: mo.map((c) => c.argv), want: table });
  const wantChroot = [`--userspec=${ME}:${MYGID}`, R, '/usr/bin/env', '-i', `PATH=${SYS_PATH}`, `HOME=${wd.home}`, `USER=${NAME}`, `LOGNAME=${NAME}`, 'SHELL=/bin/bash', ...keptEnv(env), 'GDK_BACKEND=x11', 'QT_QPA_PLATFORM=xcb', ...(fs.existsSync(`/run/user/${ME}`) ? [`XDG_RUNTIME_DIR=/run/user/${ME}`] : []), '/bin/sh', '-c', INNER, cwd, PROBE, 'a b', '--flag'];
  ok(gateOf(ch[0]) && verdictOf(same(ch[0].argv, wantChroot)), 'chroot: `--userspec=<uid>:<gid> <rootfs> /usr/bin/env -i <the allowlist> /bin/sh -c \'cd "$0" || cd "$HOME"; exec "$@"\' <cwd> <cmd…>` — HOME from passwd (the caller said /root-lied), the system PATH, the X env + GDK/QT', { got: ch[0] && ch[0].argv, want: wantChroot });
  const pids = new Set([r.pid, ...un.map((c) => c.pid), ...ch.map((c) => c.pid)]);
  const app = kv(path.join(wd.log, 'app')) || {};
  ok(pids.size === 1 && Number(app.pid) === r.pid, `ONE pid from the spawn to the app (${r.pid}): env -i re-exec → unshare → stage 2 → chroot → env → sh → the app, every hop an exec`, { spawn: r.pid, recorded: [...pids], app: app.pid });
  ok(app.cwd === cwd && app.args === 'a b --flag', '--cwd kept; the arguments arrive as given (a space inside one stays inside it)', app);
  const ae = kv(path.join(wd.log, 'app-env')) || {};
  const names = Object.keys(ae).sort(), allowed = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', ...KEEP, 'GDK_BACKEND', 'QT_QPA_PLATFORM', 'XDG_RUNTIME_DIR', 'PWD', 'OLDPWD', 'SHLVL', '_']);
  ok(gateOf(names.every((k) => allowed.has(k))) && ae.PATH === SYS_PATH && ae.HOME === wd.home && ae.DISPLAY === ':4093' && ae.VIBESPACE_DESKTOP_APP === 'ds-1a2b', `the app's environment = the allowlist (+ what sh sets): ${names.join(' ')}`, ae);
  ok(!leaks([...cs.flatMap((c) => c.argv), JSON.stringify(ae)]).length && !fs.existsSync(BASH_CANARY), 'never across: VIBESPACE_SESSION_TOKEN, a loader knob (LD_LIBRARY_PATH), BASH_ENV (not even run: `bash -p`), the caller\'s HOME', leaks([...cs.flatMap((c) => c.argv), JSON.stringify(ae)]));
  const pw = fs.readFileSync(path.join(R, 'etc', 'passwd'), 'utf8'), gr = fs.readFileSync(path.join(R, 'etc', 'group'), 'utf8');
  ok(gateOf(pw.includes(`\n${NAME}:x:${ME}:${MYGID}::${wd.home}:/bin/sh\n`)) && gateOf(pw.startsWith('root:x:0:0:')) && verdictOf(gr.includes(`\n${GROUP}:x:${MYGID}:\n`)), 'the userland\'s passwd / group carry the user (upserted; the shell is /bin/sh while the userland has no /bin/bash)', { pw, gr });
  ok(gateOf(fs.statSync(path.join(R, 'etc', 'localtime')).isFile()) && !fs.lstatSync(path.join(R, 'etc', 'localtime')).isSymbolicLink(), 'minbase\'s etc/localtime LINK replaced by a plain file before its bind (never followed out of the userland)');
  const again = await run(HELPER, wd, ['--cwd', cwd, '--', PROBE], env);
  ok(again.code === 0 && fs.readFileSync(path.join(R, 'etc', 'passwd'), 'utf8') === pw, 'a second start leaves passwd byte-identical (the upsert writes only a difference)');

  const wr = world();
  fs.writeFileSync(CUR, wr.w);
  const rr = await run(HELPER, wr, ['--root', '--', 'dpkg', '--audit'], callerEnv(wr));
  const cr = calls(wr), mr = cr.filter((c) => c.name === 'mount').map((c) => c.argv), chr = cr.find((c) => c.name === 'chroot');
  ok(rr.code === 0 && verdictOf(same(cr.find((c) => c.name === 'unshare').argv, ['--mount', '--propagation', 'private', '--', HELPER, '--stage2', '--root', '--', 'dpkg', '--audit'])), '--root: unshare carries `--stage2 --root -- dpkg --audit`', cr.map((c) => c.argv));
  ok(verdictOf(same(mr, mountTable(wr.R, 'root'))), '--root mounts NO /home, /tmp, /run/user (root inside sees the userland, the masks, the fonts — never the user\'s files)', { got: mr, want: mountTable(wr.R, 'root') });
  const wantRoot = [wr.R, '/usr/bin/env', '-i', `PATH=${SYS_PATH}`, 'HOME=/root', 'USER=root', 'LOGNAME=root', 'DEBIAN_FRONTEND=noninteractive', 'LANG=C.UTF-8', 'TERM=dumb', 'dpkg', '--audit'];
  ok(gateOf(chr) && verdictOf(same(chr.argv, wantRoot)), '--root chroot: no --userspec, a FIXED environment (no allowlisted value reaches apt / dpkg)', { got: chr && chr.argv, want: wantRoot });
  ok(!fs.readFileSync(path.join(wr.R, 'etc', 'passwd'), 'utf8').includes(NAME), '--root never upserts the user into passwd');

  const wn = world();
  mk(wn.R + '.next'); mk(path.join(wn.R + '.next', 'etc'));
  put(path.join(wn.R + '.next', 'etc', 'vibespace-sysroot.json'), `{"v":1,"arch":"amd64","helperContract":${S.HELPER_CONTRACT}}\n`);
  const rn = await run(HELPER, wn, ['--root', '--next', '--', 'apt-get', 'install', '-y', 'hello'], callerEnv(wn));
  const cn = calls(wn), chn = cn.find((c) => c.name === 'chroot');
  ok(rn.code === 0 && gateOf(same(cn.find((c) => c.name === 'unshare').argv.slice(4, 8), [HELPER, '--stage2', '--root', '--next'])) && gateOf(chn) && chn.argv[0] === wn.R + '.next' && verdictOf(same(chn.argv.slice(-4), ['apt-get', 'install', '-y', 'hello'])), '--root --next: the Rebase target rootfs.next, the same fixed environment', cn.map((c) => c.argv));
});

await leg('§5', async () => {
  console.log('§5 THE BOOT ORDER — nothing before listen; after it, every step off the loop (judged against a control that holds it)');
  const AS = require(path.join(repo, 'src/app-serve.js')), E = require(path.join(repo, 'src/server/apps-engine.js'));
  const { agentEnv } = require(path.join(repo, 'src/agent-env.js'));
  const N = 300;
  const SUDO_CHILD_S = '0.4'; // each of the boot's two sudo children (the install, dpkg --audit) takes this long
  /** one boot over a 300-entry app system of this user (rootUid: this user — the machine half's fixture seam). `hold`:
   *  the CONTROL — the sudo child waited for SYNCHRONOUSLY (the hold the law forbids); else a real async child */
  async function boot(tag, { hold = false } = {}) {
    const base = mk(path.join(root, tag)), home = mk(path.join(base, 'home')), stateDir = mk(path.join(base, 'state'));
    mk(path.join(home, '.vibespace')); mk(path.join(base, 'eng'));
    const sys = mk(path.join(home, '.vibespace', 'sysroot')), R = mk(path.join(sys, 'rootfs'));
    for (const d of ['etc', 'usr', 'usr/bin', 'var', 'var/lib', 'var/lib/vibespace', 'var/lib/vibespace/entries', 'var/lib/dpkg']) mk(path.join(R, d));
    put(path.join(R, 'etc', 'vibespace-sysroot.json'), JSON.stringify({ v: 1, id: 'debian', codename: 'bookworm', arch: 'amd64', createdFrom: 'tarball', helperContract: S.HELPER_CONTRACT }) + '\n');
    for (let i = 0; i < N; i++) {
      put(path.join(R, 'usr', 'bin', `tool${i}`), '#!/bin/sh\n', 0o755);
      put(path.join(R, 'var/lib/vibespace/entries', `e${i}.list`), `tool${i}\n`);
      put(path.join(R, 'var/lib/vibespace/entries', `e${i}.bin`), `/usr/bin/tool${i}\n`);
    }
    const osr = put(path.join(base, 'os-release'), 'ID=debian\nVERSION_CODENAME=bookworm\n');
    const lines = [], seen = { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error: () => {} };
    const spawned = [];
    const answer = (line) => (line.includes('vs-sys-install') ? { code: 0, stdout: '= helper installed\n= sudoers installed\n= ok\n', stderr: '' } : { code: 0, stdout: '', stderr: '' });
    const runner = (cmd, args) => {
      const line = [cmd, ...args].join(' ');
      spawned.push({ at: Date.now(), what: line.includes('vs-sys-install') ? 'install' : line.includes('--audit') ? 'audit' : cmd });
      if (hold && cmd === 'sudo') { spawnSync('sleep', [SUDO_CHILD_S]); return Promise.resolve(answer(line)); }
      return new Promise((resolve) => { const c = spawn('sleep', [cmd === 'sudo' ? SUDO_CHILD_S : '0']); c.on('close', () => resolve(answer(line))); });
    };
    const pod = () => { const { INVOCATION_ID, ...e } = agentEnv({ ...process.env, VIBESPACE_APP_SYSTEM: '1' }); return e; };
    const apps = AS.create({ home, stateDir, env: pod, osRelease: osr, binOnPath: () => null, runner, rootUid: ME, dpkgStatus: path.join(base, 'no-status'), markerDir: path.join(base, 'markers'), log: seen });
    const call = async (h, op, params) => { const r = await AS.runAppOp(apps, op, params); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r; };
    const eng = E.create({ access: { call }, dataDir: path.join(base, 'eng'), log: seen });
    const built = spawned.length;
    await sleep(100);
    const gaps = [];
    let last = Date.now();
    const tick = setInterval(() => { const t = Date.now(); gaps.push(t - last); last = t; }, 5);
    const t0 = Date.now();
    try {
      const r = await eng.afterListen();
      const st = await eng.status('local');
      const cat = await apps.refreshCatalog().then((rs) => ({ rows: rs.length }), (e) => ({ error: e.message }));
      return { r, st, cat, lines, spawned, built, gaps, t0, tEnd: Date.now(), shims: fs.existsSync(path.join(sys, 'bin')) ? fs.readdirSync(path.join(sys, 'bin')).filter((x) => !x.startsWith('.')) : [] };
    } finally { clearInterval(tick); }
  }
  const prev = process.env.VIBESPACE_APP_SYSTEM, prevInv = process.env.INVOCATION_ID;
  process.env.VIBESPACE_APP_SYSTEM = '1'; delete process.env.INVOCATION_ID;
  try {
    const b = await boot('boot');
    const c = await boot('boot-held', { hold: true });
    ok(b.built === 0 && c.built === 0, 'building the machine half + the engine (server.js does it BEFORE listen) spawns no child — no sudo before listen');
    const bootAt = b.lines.findIndex((m) => /^\[apps\] app system: helper \+ sudoers installed in \d+ ms$/.test(m)), replayAt = b.lines.findIndex((m) => /^\[apps\] boot: /.test(m));
    ok(!b.r.error && gateOf(b.st.appSystem) && b.st.appSystem.enabled === true && b.st.appSystem.helper.installed === true && bootAt >= 0 && replayAt > bootAt, 'after listen: the helper + sudoers install, then the replay line ("installed" before "[apps] boot:")', { r: b.r, lines: b.lines.slice(0, 8), appSystem: b.st.appSystem });
    ok(b.spawned.length >= 2 && b.spawned[0].what === 'install' && verdictOf(b.spawned.some((s) => s.what === 'audit')), `the boot's children in order: ${b.spawned.map((s) => s.what).join(' → ')} (each a real child; the sudo ones ${SUDO_CHILD_S} s)`, b.spawned);
    ok(b.shims.length === N, `the ${N} launchers written by the catalog read after the boot (stale / missing ones regenerated)`, { shims: b.shims.length, cat: b.cat });
    const maxGap = Math.max(...b.gaps), ctlGap = Math.max(...c.gaps), childMs = Number(SUDO_CHILD_S) * 1000;
    ok(ctlGap >= childMs, `CONTROL: the same boot waiting for its sudo child SYNCHRONOUSLY holds the loop for the child's whole run (${ctlGap} ms ≥ ${childMs})`, { ctlGap });
    ok(maxGap * 2 < ctlGap, `no step held the loop: the boot's largest gap (${maxGap} ms over ${b.tEnd - b.t0} ms: two ${SUDO_CHILD_S} s sudo children, ${N} entries, ${N} shims) is under half the control's hold (${ctlGap} ms)`, { maxGap, ctlGap, worst: [...b.gaps].sort((x, y) => y - x).slice(0, 5) });
    console.log(`    (boot timings, fakes: afterListen→status→catalog ${b.tEnd - b.t0} ms; children ${b.spawned.map((s) => `${s.what}@+${s.at - b.t0}`).join(' ')}; worst loop gaps ${[...b.gaps].sort((x, y) => y - x).slice(0, 3).join('/')} ms; the held control's ${ctlGap} ms)`);
  } finally {
    if (prev === undefined) delete process.env.VIBESPACE_APP_SYSTEM; else process.env.VIBESPACE_APP_SYSTEM = prev;
    if (prevInv !== undefined) process.env.INVOCATION_ID = prevInv;
  }
});

// ── §T the twin holds §2–§4 (B-7e49: a leg cannot fall between the two files) ─────────────────────────────────────────────
await leg('§T', async () => {
  console.log('§T the heavy twin holds the sections that wait on real children');
  const twinRel = 'scripts/test-app-system-chain-helper.mjs';
  const twin = fs.existsSync(path.join(repo, twinRel)) ? fs.readFileSync(path.join(repo, twinRel), 'utf8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const MOVED = [
    "console.log('§2 REFUSALS — exit 111 by name, before any namespace op');",
    "console.log('§3 CONTROLS — a patched helper per rule; the table above catches each');",
    "console.log('§4 THE KEEPER — a sys row\\'s shim, started by the REAL keeper, IS the app (pid P through sudo → helper → unshare → chroot → sh)');",
  ];
  const ci = fs.readFileSync(path.join(repo, 'scripts/ci.mjs'), 'utf8');
  ok(gateOf(MOVED.every((h) => twin.includes(h))) && !/^await leg\('§[234]'/m.test(here) && gateOf(/^await leg\('§1'/m.test(here)) && verdictOf(/^await leg\('§5'/m.test(here)), 'the twin holds §2 (the refusals), §3 (the controls) and §4 (the keeper) by their headings, and this file runs none of them (§1, the chain\'s law, stays here)', MOVED.filter((h) => !twin.includes(h)));
  ok(verdictOf(/\{ name: 'test-app-system-chain-helper', tier: 'heavy',/.test(ci)), 'the twin is a HEAVY row of the tier');
});
} finally {
  fs.rmSync(CUR, { force: true });
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
