#!/usr/bin/env node
// test-app-system-chain-helper — THE HEAVY TWIN of test-app-system-chain (B-7e49, lane lg-recovery, by the tier's own rule: a
// leg that runs a program as a child is heavy). Its §2–§4 MOVED VERBATIM: each WAITS on real children — the REAL helper script
// deploy/sysroot/vs-sysroot-enter run over recorder fakes (§2 the refusals, §3 a patched helper per rule) and the REAL keeper
// over a fake sudo (§4: the stay probes, the killed sleepers). The fast suite keeps §1 (the chain's law: the argv table),
// §5 (the boot order) and a pin that this file holds these three.
// It runs where the fast one ran: sh and node over recorder fakes — no root, no namespace, no mount, no desktop program, no
// binary the hosted image lacks (the hosted runner). The original description follows.
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
//   §2 REFUSALS before any namespace op (exit 111, by name, nothing recorded) + stage 2 called directly (no private ns)
//   §3 CONTROLS — a patched helper per rule (scratch copies), each caught by the table
//   §4 THE KEEPER: a sys row's shim (S.shimText) launched by the REAL keeper (desktop-serve, setsid) over a fake sudo that
//      execs ⇒ the keeper's pid P IS the app (exe, session leader, allowlisted environ) and the group stop ends it.
//      CONTROL: a sudo that forks (the drop-in's !use_pty missing) ⇒ P is sudo, the app a child
//   §5 THE BOOT ORDER: building the machine half + the engine (server.js does it before listen) spawns nothing; after listen
//      the boot step's children run off the loop — with two 400 ms sudo children and a 300-entry app system the largest
//      loop gap stays under half of a CONTROL's (the same boot waiting for its sudo child synchronously: the hold the law
//      forbids; no literal wall-clock bound — scripts/wall-clock-census.mjs); "helper + sudoers installed" before "boot:"
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
const ok = (c, m, extra) => { if (typeof m !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof m}, not a string — the arguments are swapped`); /* B-7e49: a NEW file's helper is guarded (test-ci-gate-tiers §7b) */ if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 2000) : ''}`); } return !!c; };
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
await leg('§2', async () => {
  console.log('§2 REFUSALS — exit 111 by name, before any namespace op');
  const cases = [
    ['no SUDO_UID', {}, (e) => { delete e.SUDO_UID; return e; }, ['--', PROBE], /no SUDO_UID/],
    ['SUDO_UID 0', {}, (e) => ({ ...e, SUDO_UID: '0' }), ['--', PROBE], /SUDO_UID is 0/],
    ['a uid with no passwd entry', {}, (e) => ({ ...e, SUDO_UID: '4242' }), ['--', PROBE], /has no passwd entry/],
    ['a relative --cwd', {}, (e) => e, ['--cwd', 'proj', '--', PROBE], /--cwd must be an absolute path/],
    ['--next without --root', {}, (e) => e, ['--next', '--', PROBE], /--next is for --root only/],
    ['--root running a shell', {}, (e) => e, ['--root', '--', 'sh', '-c', 'id'], /--root runs apt-get/],
    ['--root with --cwd', {}, (e) => e, ['--root', '--cwd', '/tmp', '--', 'dpkg', '--audit'], /--cwd is for the user mode only/],
    ['no command', {}, (e) => e, ['--'], /no command/],
    ['an unknown option', {}, (e) => e, ['--privileged', '--', PROBE], /unknown option --privileged/],
    ['another helper contract', { contract: S.HELPER_CONTRACT + 1 }, (e) => e, ['--', PROBE], /identity of another helper contract/],
    ['another architecture', { arch: 'arm64' }, (e) => e, ['--', PROBE], /architecture mismatch/],
  ];
  const got = [];
  for (const [what, wo, envEdit, args, re] of cases) {
    const wd = world(wo);
    if (what === 'another architecture') fs.writeFileSync(path.join(wd.w, 'arch'), 'amd64\n'); // the machine stays amd64; the identity says arm64
    const r = await run(HELPER, wd, args, envEdit(callerEnv(wd)));
    const cs = calls(wd);
    got.push({ what, ok: r.code === 111 && re.test(r.stderr) && !cs.some((c) => c.name === 'unshare' || c.name === 'mount' || c.name === 'chroot'), code: r.code, stderr: r.stderr.trim().slice(0, 160), calls: cs.map((c) => c.name) });
  }
  ok(got.every((g) => g.ok), `${got.length} refusals by name, nothing unshared / mounted / chrooted first: ${got.map((g) => g.what).join(' · ')}`, got.filter((g) => !g.ok));
  // the userland itself not what root expects
  const shapes = [
    ['etc is a symlink', (wd) => { fs.renameSync(path.join(wd.R, 'etc'), path.join(wd.R, 'etc-real')); fs.symlinkSync('etc-real', path.join(wd.R, 'etc')); }, /a symlink inside the app system/],
    ['etc writable by the group', (wd) => fs.chmodSync(path.join(wd.R, 'etc'), 0o775), /not root's directory inside the app system/],
    ['the rootfs world-writable', (wd) => fs.chmodSync(wd.R, 0o757), /world-writable/],
    ['the rootfs reached through a link', (wd) => { fs.renameSync(wd.R, wd.R + '-real'); fs.symlinkSync(wd.R + '-real', wd.R); }, /not canonical/],
    ['no identity file', (wd) => fs.rmSync(path.join(wd.R, 'etc', 'vibespace-sysroot.json')), /no root-owned identity file/],
    ['the identity is a link', (wd) => { const f = path.join(wd.R, 'etc', 'vibespace-sysroot.json'); fs.renameSync(f, f + '.real'); fs.symlinkSync(f + '.real', f); }, /no root-owned identity file/],
  ];
  const got2 = [];
  for (const [what, edit, re] of shapes) {
    const wd = world(); edit(wd);
    const r = await run(HELPER, wd, ['--', PROBE], callerEnv(wd));
    got2.push({ what, ok: r.code === 111 && re.test(r.stderr) && !calls(wd).length, code: r.code, stderr: r.stderr.trim().slice(0, 160), calls: calls(wd).map((c) => c.name) });
  }
  ok(got2.every((g) => g.ok), `the userland's shape, refused before anything: ${got2.map((g) => g.what).join(' · ')}`, got2.filter((g) => !g.ok));
  const wd = world();
  const d = await run(HELPER, wd, ['--stage2', '--cwd', wd.home, '--', PROBE], callerEnv(wd));
  ok(d.code === 111 && /stage 2 outside a private mount namespace/.test(d.stderr) && !calls(wd).some((c) => c.name === 'mount'), 'stage 2 called directly (no fresh namespace — its mounts would land in the pod\'s): refused, nothing mounted', { code: d.code, stderr: d.stderr, calls: calls(wd) });
  const wl = world();
  fs.symlinkSync('/etc', path.join(wl.R, 'proc'));
  const l = await run(HELPER, wl, ['--', PROBE], callerEnv(wl));
  const lm = calls(wl).filter((c) => c.name === 'mount');
  ok(l.code === 111 && /a symlink inside the app system: .*\/proc/.test(l.stderr) && !lm.length, 'a bind target planted as a link (rootfs/proc → /etc) is refused by name before its mount — root never mounts through it', { code: l.code, stderr: l.stderr, mounts: lm });
});

await leg('§3', async () => {
  console.log('§3 CONTROLS — a patched helper per rule; the table above catches each');
  const ctl = async (name, edit, judge) => {
    const h = helperCopy(name, (t) => { const u = edit(t); if (u === t) throw new Error(`control ${name}: the edit changed nothing`); return u; });
    const wd = world();
    const r = await run(h, wd, name === 'stage2-check' ? ['--stage2', '--cwd', wd.home, '--', PROBE] : ['--cwd', wd.home, '--', PROBE], callerEnv(wd));
    return judge({ r, wd, cs: calls(wd), app: kv(path.join(wd.log, 'app-env')) || {} });
  };
  const rows = [
    ['shared-propagation', (t) => t.replace('exec unshare --mount --propagation private --', 'exec unshare --mount --'), ({ cs }) => !same(cs.find((c) => c.name === 'unshare').argv.slice(0, 4), ['--mount', '--propagation', 'private', '--'])],
    ['sys-writable', (t) => t.replace('bind_dir /sys /sys ro', 'bind_dir /sys /sys'), ({ cs, wd }) => !same(cs.filter((c) => c.name === 'mount').map((c) => c.argv), mountTable(wd.R, 'user'))],
    ['token-kept', (t) => t.replace(/^KEEP="([^"]*)"$/m, 'KEEP="$1 VIBESPACE_SESSION_TOKEN"'), ({ app }) => app.VIBESPACE_SESSION_TOKEN === 'vsst_never_inside'],
    ['no-userspec', (t) => t.replace('exec chroot --userspec="$U_UID:$U_GID" "$R"', 'exec chroot "$R"'), ({ cs }) => { const c = cs.find((x) => x.name === 'chroot'); return !!c && !c.argv[0].startsWith('--userspec='); }],
    ['host-path', (t) => t.replace('ENVV=(PATH="$SYS_PATH"', 'ENVV=(PATH="$PATH:$SYS_PATH"'), ({ app }) => !!app.PATH && app.PATH !== SYS_PATH],
    ['stage2-check', (t) => t.replace(/^\[ "\$\(readlink \/proc\/self\/ns\/mnt\)" != "\$\(readlink \/proc\/1\/ns\/mnt\)" \] \|\| die .*$/m, ': # (control: no namespace check)'), ({ cs }) => cs.some((c) => c.name === 'mount') && !cs.some((c) => c.name === 'unshare')],
  ];
  const caught = [];
  for (const [name, edit, judge] of rows) caught.push({ name, caught: await ctl(name, edit, judge).catch((e) => `threw: ${e.message}`) });
  ok(caught.every((c) => c.caught === true), `each patched helper shows the hole the table pins: ${caught.map((c) => c.name).join(' · ')}`, caught);
});

await leg('§4', async () => {
  console.log('§4 THE KEEPER — a sys row\'s shim, started by the REAL keeper, IS the app (pid P through sudo → helper → unshare → chroot → sh)');
  const D = require(path.join(repo, 'src/desktop-display.js'));
  const DS = require(path.join(repo, 'src/desktop-serve.js'));
  const Mx = require(path.join(repo, 'src/desktop-apps.js'));
  const wd = world();
  fs.writeFileSync(CUR, wd.w);
  const shimDir = mk(path.join(wd.home, '.vibespace', 'sysroot', 'bin'));
  const sudoDir = (name, body) => { const d = mk(path.join(root, name)); put(path.join(d, 'sudo'), `#!/bin/sh\nW=$(cat '${CUR}')\n${REC(name)}\n[ "$1" = -n ] && shift\n${body}\n`, 0o755); return d; };
  const EXEC_SUDO = sudoDir('sudo-exec', `exec /usr/bin/env SUDO_UID=${ME} SUDO_GID=${MYGID} "$@"`); // the drop-in's !use_pty: sudo EXECs
  const FORK_SUDO = sudoDir('sudo-fork', `/usr/bin/env SUDO_UID=${ME} SUDO_GID=${MYGID} "$@"\nexit $?`); // a monitor process stays the parent
  const { rows, exports } = S.sysRows([{ id: 'app.probe', label: 'Probe', exec: PROBE, args: ['stay'], category: 'app' }], { shimDir, present: new Set([PROBE]) });
  for (const e of exports) put(path.join(shimDir, e.name), S.shimText(e.target, { helper: HELPER }), 0o755);
  const row = rows[0];
  const FAKE_DISPLAY = ':4093';
  const kids = [];
  const fakeDisplay = {
    ...D,
    hostFacts: async () => ({ hostId: null, bins: { fakex: '/bin/true' }, [['xp', 'ra'].join('')]: null /* B-7e49: the key ASSEMBLED, as the tier rule's own suites do (test-ci-gate-shards §8c) — the host derivation reads program words, and this null field starts no display program: the suite starts none */, browsers: {}, office: { exec: null, path: null, program: null, confinement: null, modules: null }, at: Date.now() }),
    RECIPES: Object.freeze({ 'fake-x': async (ctx) => { const c = await D.spawnDetached('sleep', ['600'], { env: ctx.base, logFd: ctx.logFd, name: 'fake-x' }).spawned; kids.push(c.pid); ctx.onPart('x', c, { display: FAKE_DISPLAY, port: 1, alsoServer: true }); return { display: FAKE_DISPLAY, port: 1, shared: false, wm: false }; } }),
    waitForListen: async () => ({ ok: true }), listenerHeldBy: () => true,
    enumerateWindows: async () => ({ ok: true, why: null, windows: [] }), displaySize: async () => ({ ok: true, width: 1280, height: 800 }), applyWindowPlan: async () => ({ ok: true }),
  };
  const vnc = Mx.DISPLAY_BACKENDS.find((b) => b.id === 'vnc-display');
  const BACKENDS = Object.freeze([Object.freeze({ ...vnc, needs: Object.freeze([Object.freeze(['fakex'])]), recipes: Object.freeze({ fakex: 'fake-x' }) })]);
  const log = { log: () => {}, warn: () => {}, error: () => {} };
  const procOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), rest = st.slice(st.lastIndexOf(')') + 2).split(' '); return { exe: fs.readlinkSync(`/proc/${pid}/exe`), sid: Number(rest[3]), uids: (/^Uid:\s+(.*)$/m.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')) || [, ''])[1].trim().split(/\s+/).map(Number), env: Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) }; } catch (e) { return { error: e.message }; } };
  const launch = async (sudo, name) => {
    fs.rmSync(path.join(wd.log, 'app'), { force: true });
    const env = () => ({ PATH: `${sudo}:/usr/bin:/bin`, HOME: wd.home, VIBESPACE_SESSION_TOKEN: 'vsst_never_inside', LD_LIBRARY_PATH: '/nonexistent-vs-loader' });
    const apps = { catalogRows: () => [{ ...row, args: [...row.args] }], refreshCatalog: async () => {}, witnessRows: () => [] };
    const ds = DS.install({ dataDir: path.join(root, `ds-${name}`), env, display: fakeDisplay, backends: BACKENDS, registryRows: [], log, now: Date.now, tickMs: 3600e3, apps });
    const rec = await ds.launch({ appId: row.id }, {});
    const app = await until(() => kv(path.join(wd.log, 'app')));
    await sleep(150); // the probe's own `exec sleep` (same pid)
    const r = ds.get(rec.id), P = r && r.pids && r.pids.app;
    return { ds, rec, P, app, proc: P ? procOf(P) : null };
  };
  const a = await launch(EXEC_SUDO, 'exec');
  const sleepBin = fs.realpathSync('/bin/sleep');
  ok(a.P && a.app && Number(a.app.pid) === a.P, `the keeper's pid P (${a.P}) is the app's own pid — shim → sudo → helper → unshare → stage 2 → chroot → env → sh → app, all execs`, { P: a.P, app: a.app });
  ok(a.proc && fs.realpathSync(a.proc.exe || '/') === sleepBin && a.proc.sid === a.P && a.proc.uids.every((u) => u === ME), 'P is the app binary itself (exe), the session leader (the keeper\'s setsid), all four uids the user\'s — the handle, starttime, group kill and PSS read hold the app', a.proc);
  const pe = (a.proc && a.proc.env) || {};
  ok(pe.DISPLAY === FAKE_DISPLAY && pe.VIBESPACE_DESKTOP_APP && pe.HOME === wd.home && pe.PATH === SYS_PATH && !('VIBESPACE_SESSION_TOKEN' in pe) && !('LD_LIBRARY_PATH' in pe), 'P\'s environ: the keeper\'s DISPLAY + VIBESPACE_DESKTOP_APP crossed, HOME from passwd, the system PATH; the keeper env\'s session token and loader knob did not', pe);
  const sudoCall = calls(wd).find((c) => c.name === 'sudo-exec');
  ok(sudoCall && same(sudoCall.argv, ['-n', HELPER, '--cwd', sudoCall.argv[3], '--', PROBE, 'stay']) && sudoCall.pid === a.P, 'the shim ran `sudo -n <helper> --cwd "$PWD" -- <target> <args…>` on P (S.shimText, byte for byte the shipped template)', sudoCall);
  await a.ds.stop(a.rec.id, { why: 'user' });
  ok(await until(() => { try { process.kill(a.P, 0); return false; } catch { return true; } }, 8000), 'Stop: the keeper\'s group kill ends the app (no sudo or helper left in between to outlive it)');
  const b = await launch(FORK_SUDO, 'fork');
  ok(b.P && b.app && Number(b.app.pid) !== b.P && b.proc && fs.realpathSync(b.proc.exe || '/') !== sleepBin, `CONTROL — a sudo that forks (no !use_pty): P (${b.P}) is sudo's process, the app (${b.app && b.app.pid}) a child of it — the drop-in is load-bearing`, { P: b.P, app: b.app, exe: b.proc && b.proc.exe });
  await b.ds.stop(b.rec.id, { why: 'user' });
  for (const p of [...kids, Number(b.app && b.app.pid)]) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
});

} finally {
  fs.rmSync(CUR, { force: true });
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
