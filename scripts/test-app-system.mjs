#!/usr/bin/env node
// THE APP SYSTEM — the PURE gate (docs/design-app-persistence.zh.md §3.2, Layer 1; src/app-system.js + the machine half
// src/app-system-serve.js over a STUB runner). No server, no browser, no root — and NEVER the helper, unshare, chroot,
// debootstrap or a sudoers change on this machine (the real helper runs only inside a disposable container:
// scripts/test-app-system-enter.mjs). Sections:
//   §1 the identity — parseIdentity's refusals by name; the root script writes identityText's bytes (its printf, run here)
//   §2 the verdicts — rebaseVerdict (ok · rebase still runs · blocked on another arch) · systemView's flags · auditVerdict
//   §3 rows + the export table — execTarget / resolveTarget / shimName / sysRows; the shim template + shimPlan
//   §4 THE ROOT SCRIPTS — sh + dash parse them; sysArgv positions; every argument refusal BEFORE root (run as this user:
//      a package name that is code never runs); a well-formed run as this user stops at `not-root`
//   §5 THE SECURITY RULES as a census of the helper's text (each rule one line) + the sudoers drop-in = SUDOERS_TEXT
//   §6 controls — a patched copy per rule (scripts/mutant-copy.mjs, outside the tree) that the tables above catch
//   §8 HARDENING (lane app-system-harden): the helper's env -i re-exec + in-rootfs walk, the root script's staged / put /
//      rmchild writes and the digest-checked boot install (census + controls); in-process: the launch check of a sys row's
//      shim, a sys plan's digest part, desktop + exec reads that never leave the rootfs, the bare-metal / systemd gate
//   §7 the machine half in-process — not enabled = nothing runs; the boot install's argv; a user-owned userland is refused
//      by name; the plans (Set up through rung B, apt retargeted INTO the app system) over a stub runner; the engine's
//      kinds (an agent never proposes one) and their record op
// Run: node scripts/test-app-system.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require(path.join(repo, 'src/app-system.js'));
const A = require(path.join(repo, 'src/app-manifest.js'));
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MUT = mutantCopies('app-system', repo);
const SRC = fs.readFileSync(path.join(repo, 'src/app-system.js'), 'utf8');
const HELPER = fs.readFileSync(path.join(repo, 'deploy/sysroot/vs-sysroot-enter'), 'utf8');
const SUDOERS = fs.readFileSync(path.join(repo, 'deploy/sysroot/vibespace-sysroot.sudoers'), 'utf8');
const sh = (script, args, opts = {}) => spawnSync('sh', ['-c', script, 'vs-sys', ...args], { encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin', ...opts.env }, cwd: opts.cwd });

// ── §1 ──
console.log('§1 the identity');
const ID = (o) => JSON.stringify({ v: 1, id: 'debian', codename: 'bookworm', arch: 'amd64', createdFrom: 'debootstrap', helperContract: S.HELPER_CONTRACT, createdAt: 1, ...o });
const t1 = [[null, 'no-identity'], ['', 'no-identity'], ['{', 'bad-identity'], [ID({ v: 2 }), 'bad-identity'], [ID({ arch: 'AMD64' }), 'bad-identity'], [ID({ codename: '../x' }), 'bad-identity'], [ID({ id: '' }), 'bad-identity'], [ID({ helperContract: S.HELPER_CONTRACT + 1 }), 'contract']];
ok(t1.every(([x, code]) => { const r = S.parseIdentity(x); return !r.ok && r.code === code; }), 'refused BY NAME: none · not JSON · another schema · a bad arch / codename / id · another helper contract');
const good = S.parseIdentity(ID({}));
ok(good.ok && same(good.identity, { id: 'debian', codename: 'bookworm', arch: 'amd64', createdFrom: 'debootstrap', helperContract: S.HELPER_CONTRACT, createdAt: 1 }), 'a well-formed identity reads back whole');
const fmt = /printf '(\{"v":1,[^']*)' "\$did" "\$dcn" "\$arch" "\$FROM" "\$\(date \+%s\)"/.exec(S.SYS_SCRIPT);
const printed = fmt ? spawnSync('sh', ['-c', `printf '${fmt[1]}' debian bookworm amd64 debootstrap 42`], { encoding: 'utf8' }).stdout : null;
ok(printed === S.identityText({ id: 'debian', codename: 'bookworm', arch: 'amd64', createdFrom: 'debootstrap', createdAt: 42 }) && S.parseIdentity(printed).ok, 'the root script\'s mk() printf writes identityText\'s bytes (run here: printf only) — and parseIdentity takes them');
ok(new RegExp(`^CONTRACT=${S.HELPER_CONTRACT}\\b`, 'm').test(HELPER) && S.SYS_SCRIPT.includes(`"helperContract":${S.HELPER_CONTRACT},`), 'one contract number: HELPER_CONTRACT = the helper\'s CONTRACT = what the script writes');

// ── §2 ──
console.log('§2 the verdicts');
const idn = good.identity;
const t2 = [[null, { arch: 'amd64' }, 'none'], [idn, null, 'ok'], [idn, { id: 'debian', codename: 'bookworm', arch: 'amd64' }, 'ok'], [idn, { id: 'debian', codename: 'trixie', arch: 'amd64' }, 'rebase'], [idn, { id: 'ubuntu', codename: 'noble', arch: 'amd64' }, 'rebase'], [idn, { id: 'debian', codename: 'bookworm', arch: 'arm64' }, 'blocked']];
ok(t2.every(([i, im, st]) => S.rebaseVerdict(i, im).state === st), 'rebaseVerdict: none · same → ok · another release / distribution → rebase (it keeps running) · another architecture → blocked');
const img = { id: 'debian', codename: 'bookworm', arch: 'amd64' };
const v0 = S.systemView({ enabled: false, identity: idn, image: img });
const v1 = S.systemView({ enabled: true, image: img, rungs: { b: true }, canRun: true });
const v2 = S.systemView({ enabled: true, identity: idn, image: { ...img, codename: 'trixie' }, rungs: { a: true }, canRun: true, audit: { interrupted: true, packages: ['hello'] }, prev: true, helper: { installed: true } });
const v3 = S.systemView({ enabled: true, identity: idn, image: { ...img, arch: 'arm64' }, rungs: { b: true }, canRun: true });
const v4 = S.systemView({ enabled: true, identityError: 'not-root-owned', image: img, rungs: { b: true }, canRun: true });
const v5 = S.systemView({ enabled: true, identity: idn, image: img, helper: { installed: false } });
ok(v0.blocked === 'not-enabled' && !v0.usable && !v0.canCreate && !v0.interrupted, 'not enabled (no VIBESPACE_APP_SYSTEM): blocked, nothing offered');
ok(v1.canCreate === true && v1.rung === 'b' && !v1.created && !S.systemView({ enabled: true, image: img, rungs: {}, canRun: true }).canCreate && !S.systemView({ enabled: true, image: img, rungs: { b: true }, canRun: false }).canCreate, 'Set up is offered only with a rung (tarball or debootstrap) and root/sudo');
ok(v2.usable && v2.interrupted === true && same(v2.auditPackages, ['hello']) && v2.rebase === true && v2.canRollback === true && v2.rung === 'a', 'an interrupted install → the Repair banner; another release → Migrate (still usable); a previous system → Roll back');
ok(v3.blocked === 'arch' && !v3.usable && v3.rebase === true, 'another architecture: blocked + Rebase offered');
ok(v4.created && v4.blocked === 'not-root-owned' && !v4.canCreate && v5.blocked === 'no-helper' && !v5.usable, 'a refused identity / a helper that did not install: blocked by name, never "Set up" over it');
const AUDIT = 'The following packages are only half configured, probably due to problems\nconfiguring them the first time.  The configuration should be retried using\ndpkg --configure <package> or the configure menu option in dselect:\n hello                example package based on GNU hello\n';
ok(same(S.auditVerdict({ code: 0, stdout: AUDIT }), { interrupted: true, packages: ['hello'] }) && same(S.auditVerdict({ code: 0, stdout: '' }), { interrupted: false, packages: [] }) && S.auditVerdict({ code: 111, stderr: 'vs-sysroot-enter: architecture mismatch' }) === null && S.auditVerdict({ code: 1, stdout: '' }) === null, 'auditVerdict: dpkg\'s half-configured list → interrupted + names; silence → clean; a refusal of the helper is no interruption');

// ── §3 ──
console.log('§3 rows + the export table + the shim');
const present = new Set(['/usr/bin/xterm', '/usr/bin/hello', '/usr/games/sl', '/opt/app/bin/x']);
ok(S.resolveTarget('xterm', present) === '/usr/bin/xterm' && S.resolveTarget('sl', present) === '/usr/games/sl' && S.resolveTarget('/opt/app/bin/x', present) === '/opt/app/bin/x' && S.resolveTarget('nope', present) === null && S.resolveTarget('/usr/bin/../bin/xterm', new Set(['/usr/bin/../bin/xterm'])) === null && S.resolveTarget("/usr/bin/x'y", new Set(["/usr/bin/x'y"])) === null && S.resolveTarget('a b', present) === null, 'resolveTarget: bare words through the inner PATH, absolute paths as they are; `..`, quotes and spaces never a target');
const taken = new Map([['xterm', '/usr/bin/xterm']]);
ok(S.shimName('/usr/bin/xterm', taken) === 'xterm' && S.shimName('/opt/xterm', taken) === 'xterm-2' && S.shimName('/x/.hid', new Map()) === 'hid', 'shimName: one name per target; another target of the same basename gets -2');
const XT = fs.readFileSync(path.join(repo, 'scripts/fixtures/apt/desktop-debian-xterm-bookworm.desktop'), 'utf8');
const pr = A.parseDesktopFile(XT, { entry: 'xterm', path: '/usr/share/applications/xterm.desktop', primary: true, pkg: 'xterm' });
const term = { id: 'app.btop', label: 'btop', exec: 'xterm', args: ['-e', 'hello', '--x'], app: 'btop' };
const lost = { id: 'app.gone', label: 'Gone', exec: 'gone', args: [], app: 'gone' };
const sr = S.sysRows([pr.row, term, lost], { shimDir: '/home/u/.vibespace/sysroot/bin', present });
ok(pr.ok && sr.rows.length === 2 && sr.rows[0].id === 'sys.xterm' && sr.rows[0].exec === '/home/u/.vibespace/sysroot/bin/xterm' && sr.rows[0].layer === 'sys', 'sysRows: a .desktop row → `sys.<entry>` running ITS SHIM by absolute path');
ok(sr.rows[1].exec === 'xterm' && same(sr.rows[1].args, ['-e', '/home/u/.vibespace/sysroot/bin/hello', '--x']) && same(sr.exports, [{ name: 'xterm', target: '/usr/bin/xterm' }, { name: 'hello', target: '/usr/bin/hello' }]) && same(sr.skipped, [{ id: 'sys.gone', word: 'gone' }]), 'a Terminal=true row keeps the image\'s xterm around the shim; one export per target; an Exec found nowhere inside is skipped by name');
const shim = S.shimText('/usr/bin/xterm');
ok(shim.startsWith('#!/bin/sh\n') && shim.endsWith(`exec sudo -n ${S.HELPER_PATH} --cwd "$PWD" -- '/usr/bin/xterm' "$@"\n`) && S.shimVersionOf(shim) === S.SHIM_VERSION && S.shimVersionOf('#!/bin/sh\necho mine\n') === null, 'THE SHIM: one `exec sudo -n <helper> --cwd "$PWD" -- <target> "$@"` (the same pid all the way — P7); versioned');
let threw = 0; for (const bad of ["/usr/bin/x'; rm -rf ~", 'relative', '/a b']) { try { S.shimText(bad); } catch { threw++; } }
ok(threw === 3, 'a target that is not a plain absolute path never becomes a shim');
const sp = S.shimPlan({ existing: [{ name: 'xterm', text: shim.replace(`v${S.SHIM_VERSION}`, 'v0') }, { name: 'old', text: S.shimText('/usr/bin/old') }, { name: 'mine', text: '#!/bin/sh\necho mine\n' }, { name: 'hello', text: '#!/bin/sh\necho user\n' }], exports: sr.exports });
ok(same(sp.write.map((w) => w.name), ['xterm']) && same(sp.remove, ['old']) && !sp.write.some((w) => w.name === 'hello'), 'shimPlan: an old version is rewritten, an orphan of OURS removed, a file of the user\'s never touched (not even under an export\'s name)');

const bx = S.binExports(['/usr/bin/hello', '/usr/games/sl', '/usr/bin/xterm', '/opt/xterm', '/usr/bin/../x', '/usr/bin/.hid'], { taken: new Map([['xterm', '/usr/bin/xterm']]) });
ok(same(bx, [{ name: 'hello', target: '/usr/bin/hello' }, { name: 'sl', target: '/usr/games/sl' }]), 'binExports (the CLI half, P5\'s ~/.vibespace/sysroot/bin/hello): one shim per executable; a target a row already exports, a name another target holds, `..` and dot-names are skipped');

// ── §4 ──
console.log('§4 THE ROOT SCRIPTS');
for (const [nm, txt] of [['SYS_SCRIPT', S.SYS_SCRIPT], ['INSTALL_SCRIPT', S.INSTALL_SCRIPT]]) {
  const f = path.join(MUT.dir, `${nm}.sh`); fs.writeFileSync(f, txt);
  const d = spawnSync('dash', ['-n', f], { encoding: 'utf8' }), b = spawnSync('sh', ['-n', f], { encoding: 'utf8' });
  ok(b.status === 0 && (d.error ? true : d.status === 0), `${nm}: sh${d.error ? '' : ' + dash'} parse it`);
}
const av = S.sysArgv({ mode: 'install', id: 'gimp', nonce: 'abcdef12', args: ['gimp'] });
ok(same(av.slice(0, 4), ['sudo', '-n', 'sh', '-c']) && av[4] === S.SYS_SCRIPT && same(av.slice(5), ['vs-sys', 'install', 'gimp', 'abcdef12', '--', 'gimp']), 'sysArgv: `sudo -n sh -c SYS_SCRIPT vs-sys <mode> <id> <nonce> -- <args…>` — every value a POSITION, the home never an argument');
let thr = 0; for (const x of [{ mode: 'x', id: 'a', nonce: 'abcdef12' }, { mode: 'install', id: 'A', nonce: 'abcdef12', args: ['p'] }, { mode: 'install', id: 'a', nonce: 'x', args: ['pp'] }, { mode: 'install', id: 'a', nonce: 'abcdef12', args: ['$(id)'] }, { mode: 'create', id: 'sysroot', nonce: 'abcdef12', args: ['c', 'bookworm'] }]) { try { S.sysArgv(x); } catch { thr++; } }
ok(thr === 5, 'sysArgv throws BEFORE root on a bad mode / id / nonce / package / rung');
const canary = path.join(MUT.dir, 'canary');
const refusals = [[['nope', 'a', 'abcdef12'], 'bad-mode'], [['install', '-x', 'abcdef12', '--', 'p1'], 'bad-id'], [['install', 'a', 'AB', '--', 'p1'], 'bad-nonce'], [['install', 'a', 'abcdef12', '--', `$(touch ${canary})`], 'bad-name'], [['install', 'a', 'abcdef12'], 'no-packages'], [['deb', 'a', 'abcdef12', '--', '/etc/passwd', 'a'.repeat(64)], 'bad-deb-path'], [['deb', 'a', 'abcdef12', '--', '/home/u/.vibespace/apps/staging/x.deb', 'zz'], 'bad-sha'], [['create', 'sysroot', 'abcdef12', '--', 'c', 'bookworm'], 'bad-rung'], [['create', 'sysroot', 'abcdef12', '--', 'b', 'Book;worm'], 'bad-codename'], [['create', 'sysroot', 'abcdef12', '--', 'b', 'bookworm', 'ftp://x'], 'bad-mirror'], [['install', 'a', 'abcdef12', '--', 'hello'], 'not-root'], [['rollback', 'sysroot', 'abcdef12'], 'not-root']];
const got = refusals.map(([a, code]) => { const r = sh(S.SYS_SCRIPT, a); return r.status === 125 && new RegExp(`^= refused ${code}\\b`, 'm').test(r.stdout); });
ok(got.every(Boolean) && !fs.existsSync(canary), `refused BY NAME before root (run here as this user): ${refusals.map((x) => x[1]).join(' · ')} — a package name that is code never ran${got.every(Boolean) ? '' : ` (failed: ${refusals.filter((_, i) => !got[i]).map((x) => x[1]).join(', ')})`}`);
const ir = spawnSync('sh', ['-c', S.INSTALL_SCRIPT, 'vs-sys-install', '/nope/h', '/nope/s'], { encoding: 'utf8', timeout: 5000 });
ok(ir.status === 125 && /^= refused not-root$/m.test(ir.stdout), 'INSTALL_SCRIPT as this user: refused not-root (it never reaches visudo / install here)');
ok(same(S.installArgv({ helperSrc: '/r/h', sudoersSrc: '/r/s' }), ['sudo', '-n', 'sh', '-c', S.INSTALL_SCRIPT, 'vs-sys-install', '/r/h', '/r/s', S.HELPER_SHA256, S.SUDOERS_SHA256]) && /visudo -cf "\$T\/s"/.test(S.INSTALL_SCRIPT) && /install -m 0440 -o root -g root "\$T\/s" "\$SD\.new"/.test(S.INSTALL_SCRIPT) && S.INSTALL_SCRIPT.indexOf('visudo -cf') < S.INSTALL_SCRIPT.indexOf('"$SD.new"'), 'the boot install: `visudo -cf` on root\'s own copy BEFORE it is installed 0440 root:root (a name with a dot: sudo skips it until the rename)');
ok(/^create\)\n {2}\[ ! -e "\$R" \]/m.test(S.SYS_SCRIPT) && /install -d -m 0755 -o root -g root "\$1"; chmod g-s "\$1"/.test(S.SYS_SCRIPT) && S.SYS_SCRIPT.indexOf('chmod g-s "$1"') < S.SYS_SCRIPT.indexOf('debootstrap --variant=minbase "$3"'), 'create (§5 P3): the userland dir is root:root 0755 with setgid cleared BEFORE debootstrap / the tarball writes into it; never over an existing one');

// ── §5 ──
console.log('§5 THE SECURITY RULES (the helper\'s text)');
const envLoop = /for k in \$KEEP; do\n {2}v=VS_KEEP_\$k; \[ -n "\$\{!v:-\}" \] && ENVV\+=/.exec(HELPER);
const rootCase = /case "\$1" in ([a-z/|-]+)\) ;;/.exec(HELPER);
const rules = (h, sud = SUDOERS, mod = S) => ({
  home: /getent passwd "\$SUDO_UID"/.test(h) && !/\$\{?HOME\b/.test(h.replace(/\/bin\/sh -c '[^']*'/, '')), // (the INNER sh's $HOME is the allowlisted HOME="$U_HOME")
  realpath: /\[ "\$\(realpath -e -- "\$R"\)" = "\$R" \]/.test(h),
  rootOwned: /\[ "\$\(stat -c %u "\$R"\)" = 0 \]/.test(h) && /8#\$\(stat -c %a "\$R"\) & 8#002/.test(h),
  identity: /\[ -f "\$ID_FILE" \] && \[ ! -L "\$ID_FILE" \]/.test(h) && /helperContract\\":\$CONTRACT/.test(h),
  arch: /have=\$\(dpkg --print-architecture\)/.test(h) && /\[ "\$want" = "\$have" \] \|\| die/.test(h),
  privateNs: /exec unshare --mount --propagation private -- "\$SELF" --stage2/.test(h) && /\[ "\$\(readlink \/proc\/self\/ns\/mnt\)" != "\$\(readlink \/proc\/1\/ns\/mnt\)" \] \|\| die/.test(h),
  chroot: /exec chroot --userspec="\$U_UID:\$U_GID" "\$R" \/usr\/bin\/env -i "\$\{ENVV\[@\]\}"/.test(h),
  envAllow: (() => { const m = /^KEEP="([A-Z_ ]+)"$/m.exec(h); return !!m && same(m[1].trim().split(/\s+/), [...mod.ENV_KEEP]) && /for k in \$KEEP; do\n {2}v=VS_KEEP_\$k; \[ -n "\$\{!v:-\}" \] && ENVV\+=\("\$k=\$\{!v\}"\)/.test(h); })(),
  // item 5: root code starts from env -i + the allowlist (bash -p; only builtins before the re-exec; root mode a fixed env)
  envClean: /^#!\/bin\/bash -p\n/.test(h) && h.indexOf('exec /usr/bin/env -i "${E[@]}" /bin/bash -p -- "$0" "$@"') > 0 && h.indexOf('exec /usr/bin/env -i "${E[@]}" /bin/bash -p -- "$0" "$@"') < h.indexOf('set -euo pipefail') && /E=\(PATH="\$PATH_ROOT" LC_ALL=C VS_SYSROOT_ENV=clean SUDO_UID=/.test(h) && /for k in \$KEEP; do \[ -n "\$\{!k:-\}" \] && E\+=\("VS_KEEP_\$k=\$\{!k\}"\); done/.test(h) && /DEBIAN_FRONTEND=noninteractive LANG=C\.UTF-8 TERM=dumb "\$@"/.test(h),
  // item 1: every bind target / root write inside the rootfs walked component by component (a link refused by name)
  inside: /^inside\(\) \{/m.test(h) && /\[ ! -L "\$p" \] \|\| die "a symlink inside the app system/.test(h) && /^ {2}inside "\$2" dir$/m.test(h) && /^ {2}inside "\$1" parent$/m.test(h) && /\[ -f "\$file" \] && \[ ! -L "\$file" \] \|\| die/.test(h) && /^exec 9<"\$R\/etc"$/m.test(h) && !/exec 9>"/.test(h) && !/mkdir -p/.test(h),
  noToken: !mod.ENV_KEEP.includes('VIBESPACE_SESSION_TOKEN') && !/ENVV\+=\("?VIBESPACE_SESSION_TOKEN/.test(h) && !sud.includes('VIBESPACE_SESSION_TOKEN'),
  rootOnly: (() => { const m = /case "\$1" in ([a-z/|-]+)\) ;;/.exec(h); return !!m && same(m[1].split('|').filter((x) => !x.startsWith('/')), [...mod.ROOT_COMMANDS]) && same(m[1].split('|').filter((x) => x.startsWith('/')), mod.ROOT_COMMANDS.map((c) => `/usr/bin/${c}`)); })(),
  // r2: the drop-in's own NOSETENV user rule for the helper (read after any user-named drop-in), the uid written by the
  // installer before visudo; with it env_keep is ALSO what a sudo command line may set — never a loader / shell / PATH knob
  noSetenv: sud.split('\n').includes(`${mod.SUDOERS_UID_MARK} ALL=(root) NOPASSWD:NOSETENV: ${mod.HELPER_PATH}`) && /^\/etc\/sudoers\.d\/~[a-z-]+$/.test(mod.SUDOERS_PATH) && mod.INSTALL_SCRIPT.includes(`SD=${mod.SUDOERS_PATH}`) && /sed "s\/\^#VS_UID \/#\$SUDO_UID \/" "\$T\/s0" > "\$T\/s"/.test(mod.INSTALL_SCRIPT) && /grep -qxF "#\$SUDO_UID ALL=\(root\) NOPASSWD:NOSETENV: \$H" "\$T\/s" \|\| \{ say refused no-setenv-rule/.test(mod.INSTALL_SCRIPT) && mod.INSTALL_SCRIPT.indexOf('no-setenv-rule') < mod.INSTALL_SCRIPT.indexOf('install -m 0440') && !mod.ENV_KEEP.some((k) => /^(LD_|PATH$|IFS$|BASH_ENV$|ENV$|SHELLOPTS$|BASHOPTS$|PS4$|PYTHON|PERL|NODE_OPTIONS$)/.test(k)),
  directExec: sud === mod.SUDOERS_TEXT && /!use_pty, !pam_session, !pam_setcred/.test(sud) && new RegExp(`env_keep \\+= "${mod.ENV_KEEP.join(' ')}"`).test(sud) && sud.includes(`Defaults!${mod.HELPER_PATH} `),
});
const R0 = rules(HELPER);
for (const [k, v] of Object.entries(R0)) ok(v, `rule ${k}: ${({ noSetenv: 'the drop-in carries `#<uid> ALL=(root) NOPASSWD:NOSETENV: <helper>` (the uid written by the installer; the file sorts after user-named drop-ins) — a sudo command line sets only env_keep names, and ENV_KEEP holds no loader / shell / PATH knob', envClean: 'root code starts from env -i + the allowlist (bash -p, a re-exec before any external command; --root a fixed env)', inside: 'bind targets + root writes inside the rootfs walked level by level — a symlink refused by name, the lock = etc itself', home: 'HOME from SUDO_UID\'s passwd entry, never the environment', realpath: 'realpath(rootfs) == rootfs (no symlink anywhere in the path)', rootOwned: 'root-owned, not writable by others (the group may be fsGroup\'s)', identity: 'the identity file present (regular, root-owned) and of this helper\'s contract', arch: 'the identity\'s arch = dpkg --print-architecture', privateNs: 'a private mount namespace (same pid); stage 2 refuses the pod\'s own namespace', chroot: 'chroot --userspec + env -i of the allowlist', envAllow: 'the env allowlist = ENV_KEEP exactly', noToken: 'VIBESPACE_SESSION_TOKEN never inside (not kept by sudo, not in the allowlist)', rootOnly: '--root runs apt-get/apt-cache/apt-mark/dpkg/dpkg-query only', directExec: 'the sudoers drop-in = SUDOERS_TEXT: !use_pty !pam_session !pam_setcred (sudo direct-exec — P7), env_keep = ENV_KEEP' })[k]}`);
ok(envLoop && rootCase, 'the census found the helper\'s env loop and its --root command list');
const sysRules = (mod) => {
  const t = mod.SYS_SCRIPT, i = mod.INSTALL_SCRIPT;
  return {
    staged: /^stage\(\) \{ \( cd "\$1" && \[ "\$\(pwd -P\)" = "\$1" \]/m.test(t) && /dd if="\.\/\$f" of="\$2\/\$f" iflag=nofollow,nonblock/.test(t) && /stage "\$d" "\$T\/src"; if \[ -d "\$A\/sys\/keys" \]; then stage "\$A\/sys\/keys" "\$T\/src"; fi/.test(t),
    put: /^put\(\) \{ \( cd "\$2" && \[ "\$\(pwd -P\)" = "\$2" \]/m.test(t) && /install -m 0644 -o root -g root "\$1" "\.\/\.\$3\.vs" && mv -fT/.test(t) && !/install -m 0644 -o root -g root "[^"]*" "\$(R|1|NX|EN|E)\//.test(t) && !/> "\$(R|E|1|NX)\//.test(t) && !/\bcp "/.test(t),
    removal: (t.match(/rm -rf --one-file-system/g) || []).length === 1 && /^rmchild\(\) \{ case \$1 in rootfs\.prev\|rootfs\.next\|rootfs\.new\|rootfs\.swap\) ;;.*\( cd "\$S" && \[ "\$\(pwd -P\)" = "\$S" \] && \[ -d "\.\/\$1" \] && \[ ! -L "\.\/\$1" \] && \[ "\$\(stat -c %u "\.\/\$1"\)" = 0 \] && rm -rf --one-file-system "\.\/\$1" \)/m.test(t),
    digest: /\[ "\$\(sha256sum < "\$T\/h" \| cut -d" " -f1\)" = "\$3" \] && \[ "\$\(sha256sum < "\$T\/s0" \| cut -d" " -f1\)" = "\$4" \] \|\| \{ say refused digest-mismatch/.test(i) && i.indexOf('sha256sum < "$T/h"') > i.indexOf('cp "$1" "$T/h"') && i.indexOf('sha256sum < "$T/h"') < i.indexOf('visudo -cf'),
  };
};
const SR0 = sysRules(S);
for (const [k, v] of Object.entries(SR0)) ok(v, `root script ${k}: ${({ staged: 'item 2 — the user-side sources + keys are staged into root\'s private dir first (the dir held as the cwd, each file read O_NOFOLLOW)', put: 'item 2 — every write into the userland is put: the dir checked canonical + root\'s, then written by a relative name from inside it (no install / > / cp to a userland path)', removal: 'item 3 — the one recursive removal is rmchild: an expected child of the canonical sysroot, root\'s real dir, from inside it, --one-file-system', digest: 'item 8 — the boot install checks root\'s private copies against this release\'s digests BEFORE visudo / install' })[k]}`);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
ok(S.HELPER_SHA256 === sha(HELPER) && S.SUDOERS_SHA256 === sha(SUDOERS) && S.SUDOERS_SHA256 === sha(S.SUDOERS_TEXT), `item 8: HELPER_SHA256 / SUDOERS_SHA256 = the digests of deploy/sysroot (an edited helper ⇒ bump HELPER_SHA256 to ${sha(HELPER).slice(0, 12)}…)`);

// ── §6 ──
console.log('§6 controls — a patched copy per rule, caught by the table above');
const patch = (from, to, tag) => { const m = SRC.replace(from, to); ok(m !== SRC, `CONTROL (${tag}): the patch applies`); return MUT.load('src/app-system.js', m, tag); };
const mArch = patch("if (identity.arch !== image.arch) return { state: 'blocked', why: 'arch' };", '', 'no-arch');
ok(!t2.every(([i, im, st]) => mArch.rebaseVerdict(i, im).state === st), 'CONTROL: a verdict that ignores the architecture fails §2\'s table');
const mContract = patch("if (j.helperContract !== HELPER_CONTRACT) return { ok: false, code: 'contract' };", '', 'no-contract');
ok(!t1.every(([x, code]) => { const r = mContract.parseIdentity(x); return !r.ok && r.code === code; }), 'CONTROL: an identity reader that skips the contract fails §1\'s table');
const mDots = patch("return SAFE_PATH_RE.test(w) && !w.split('/').includes('..') && has(w) ? w : null;", 'return has(w) ? w : null;', 'dots');
ok(mDots.resolveTarget('/usr/bin/../bin/xterm', new Set(['/usr/bin/../bin/xterm'])) !== null, 'CONTROL: a resolver without the plain-path rule takes a `..` target (§3 refuses it)');
const mUser = patch('if (cur != null && shimVersionOf(cur) == null) continue;', '', 'clobber');
ok(mUser.shimPlan({ existing: [{ name: 'hello', text: '#!/bin/sh\necho user\n' }], exports: [{ name: 'hello', target: '/usr/bin/hello' }] }).write.length === 1, 'CONTROL: a plan without the "not ours" rule overwrites the user\'s file (§3 never does)');
const mTok = patch("'TERM', 'COLORTERM']);", "'TERM', 'COLORTERM', 'VIBESPACE_SESSION_TOKEN']);", 'token');
ok(!rules(HELPER, SUDOERS, mTok).noToken && !rules(HELPER, SUDOERS, mTok).envAllow, 'CONTROL: ENV_KEEP gaining VIBESPACE_SESSION_TOKEN reds the token rule (and the allowlist equality)');
const mBare = patch("exec: t.terminal ? 'xterm' : shim,", "exec: t.terminal ? 'xterm' : name,", 'bare');
ok(mBare.sysRows([pr.row], { shimDir: '/s', present }).rows[0].exec === 'xterm', 'CONTROL: a row that runs its shim by bare name (PATH order decides) is what §3\'s absolute-path check catches');
const hp = (from, to) => { const m = HELPER.replace(from, to); return m === HELPER ? null : rules(m); };
const hc = [['--propagation private ', '', 'privateNs'], ['getent passwd "$SUDO_UID"', 'getent passwd "$(id -u "${HOME##*/}")"', 'home'], ['[ "$(realpath -e -- "$R")" = "$R" ] ||', 'true ||', 'realpath'], ['--userspec="$U_UID:$U_GID" ', '', 'chroot'], ['apt-get|apt-cache|', 'apt-get|apt-cache|sh|', 'rootOnly'], ['8#$(stat -c %a "$R") & 8#002', '8#$(stat -c %a "$R") & 8#000', 'rootOwned']];
for (const [from, to, rule] of hc) { const r = hp(from, to); ok(r && r[rule] === false, `CONTROL: the helper without its ${rule} line reds rule ${rule}`); }
for (const [from, to, rule] of [['exec /usr/bin/env -i "${E[@]}" /bin/bash -p -- "$0" "$@"', ':', 'envClean'], ['#!/bin/bash -p\n', '#!/bin/bash\n', 'envClean'], ['  inside "$2" dir\n', '  [ -d "$dst" ] || mkdir -p "$dst"\n', 'inside'], ['exec 9<"$R/etc"', 'exec 9>"$R/etc/.vibespace-sysroot.lock"', 'inside'], ['    [ -f "$file" ] && [ ! -L "$file" ] || die "not a regular file: $file"', '    :', 'inside']]) { const r = hp(from, to); ok(r && r[rule] === false, `CONTROL: the helper without ${JSON.stringify(from.trim().slice(0, 40))} reds rule ${rule}`); }
const js = (x) => JSON.stringify(x).slice(1, -1);
for (const [from, to, rule] of [['stage "$A/sys/keys" "$T/src"', 'cp -L "$A/sys/keys"/* "$T/src"/', 'staged'], ['put "$T/req" "$E" "$ID.list"', 'cp "$T/req" "$E/$ID.list"', 'put'], ['( cd "$S" && [ "$(pwd -P)" = "$S" ] && [ -d "./$1" ] && [ ! -L "./$1" ] && [ "$(stat -c %u "./$1")" = 0 ] && rm -rf --one-file-system "./$1" )', 'rm -rf --one-file-system "$S/$1"', 'removal'], ['[ "$(sha256sum < "$T/h" | cut -d" " -f1)" = "$3" ] && [ "$(sha256sum < "$T/s0" | cut -d" " -f1)" = "$4" ] || { say refused digest-mismatch; exit 125; }', ':', 'digest']]) { const m = patch(js(from), js(to), `sys-${rule}`); ok(sysRules(m)[rule] === false, `CONTROL: the root script without its ${rule} step reds that rule`); }
const noRule = SUDOERS.split('\n').filter((l) => !l.includes('NOPASSWD:NOSETENV')).join('\n');
const mKeep = patch("'TERM', 'COLORTERM']);", "'TERM', 'COLORTERM', 'LD_PRELOAD']);", 'keep-ld');
ok(rules(HELPER, noRule, { ...S, SUDOERS_TEXT: noRule }).noSetenv === false && rules(HELPER, SUDOERS.replace('#VS_UID', '#VS_UID'), mKeep).noSetenv === false, 'CONTROL: a drop-in without the NOSETENV line, or an ENV_KEEP that lets LD_PRELOAD through the sudo command line, reds noSetenv');
ok(rules(HELPER, SUDOERS.replace('!use_pty, ', ''))?.directExec === false, 'CONTROL: a sudoers drop-in without !use_pty (sudo would fork a monitor — P7\'s failing shape) reds directExec');

// ── §7 ──
console.log('§7 the machine half in-process (a stub runner — nothing runs)');
const SS = require(path.join(repo, 'src/app-system-serve.js'));
const AS = require(path.join(repo, 'src/app-serve.js'));
const E = require(path.join(repo, 'src/server/apps-engine.js'));
const dir = scratch('app-system');
const home = path.join(dir, 'home'); fs.mkdirSync(path.join(home, '.vibespace'), { recursive: true });
const calls = [];
const stub = (answers = {}) => async (cmd, args) => { calls.push([cmd, ...args]); const k = Object.keys(answers).find((x) => [cmd, ...args].join(' ').includes(x)); return k ? answers[k] : { code: 0, stdout: '', stderr: '' }; };
const off = SS.create({ home, env: () => ({}), runner: stub(), platform: 'linux' });
const vOff = await off.view({ facts: { distro: 'debian', codename: 'bookworm', arch: 'amd64', sudo: true } });
ok(vOff.enabled === false && vOff.blocked === 'not-enabled' && calls.length === 0, 'not enabled: the view says so and NOTHING ran (no sudo, no install, no audit) — a bare-metal / systemd install never touches sudoers');
calls.length = 0;
const on = SS.create({ home, env: () => ({ VIBESPACE_APP_SYSTEM: '1' }), runner: stub({ 'vs-sys-install': { code: 0, stdout: '= helper installed\n= sudoers installed\n= ok\n', stderr: '' } }), platform: 'linux', which: (n) => (n === 'debootstrap' ? '/usr/sbin/debootstrap' : null) });
const vOn = await on.view({ facts: { distro: 'debian', codename: 'bookworm', arch: 'amd64', sudo: true } });
const inst = calls.find((c) => c.includes('vs-sys-install'));
ok(inst && same(inst.slice(0, 4), ['sudo', '-n', 'sh', '-c']) && inst[5] === 'vs-sys-install' && inst[6] === path.join(repo, 'deploy/sysroot/vs-sysroot-enter') && inst[7] === path.join(repo, 'deploy/sysroot/vibespace-sysroot.sudoers') && on.helperState().installed === true, 'enabled: after listen the helper + drop-in are installed FROM THE CHECKOUT through `sudo -n sh -c INSTALL_SCRIPT` (once — the boot step is memoized)');
ok(vOn.canCreate === true && vOn.rung === 'b' && !calls.some((c) => c.includes('--audit')), 'no app system yet: Set up offered (rung B: debootstrap on PATH); no audit without one');
fs.mkdirSync(path.join(home, '.vibespace/sysroot/rootfs/etc'), { recursive: true });
fs.writeFileSync(path.join(home, '.vibespace/sysroot/rootfs/etc/vibespace-sysroot.json'), ID({}));
const vMine = await on.view({ facts: { distro: 'debian', codename: 'bookworm', arch: 'amd64', sudo: true } });
ok(vMine.created && vMine.blocked === 'not-root-owned' && !vMine.usable && (await on.catalog()).length === 0, 'a userland the USER owns (not root) is refused by name — no rows, no shims, nothing planned into it');
const osr = path.join(dir, 'os-release'); fs.writeFileSync(osr, 'ID=debian\nVERSION_CODENAME=bookworm\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\n');
fs.rmSync(path.join(home, '.vibespace/sysroot/rootfs'), { recursive: true, force: true });
const apps = AS.create({ home, stateDir: path.join(dir, 'state'), env: () => ({ VIBESPACE_APP_SYSTEM: '1', PATH: '/usr/bin:/bin' }), osRelease: osr, binOnPath: (n) => ({ 'apt-get': '/usr/bin/apt-get', sudo: '/usr/bin/sudo', debootstrap: '/usr/sbin/debootstrap' })[n] || null, runner: stub({ '--print-architecture': { code: 0, stdout: 'amd64\n', stderr: '' }, 'vs-sys-install': { code: 0, stdout: '= ok\n', stderr: '' } }), dpkgStatus: path.join(dir, 'none'), markerDir: path.join(dir, 'm'), systemLists: path.join(dir, 'lists') });
fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
const pc = await apps.plan({ kind: 'sys-create' });
ok(pc.plan.ok && pc.plan.mode === 'create' && pc.plan.layer === 'sys' && same(pc.plan.argv.slice(5), ['vs-sys', 'create', 'sysroot', pc.plan.nonce, '--', 'b', 'bookworm']) && pc.plan.commands.some((c) => /debootstrap --variant=minbase bookworm/.test(c)), 'Set up → a plan through the package slot: SYS_SCRIPT create, rung B, the machine\'s own codename; its commands say debootstrap');
const pr2 = await apps.plan({ kind: 'repair' });
const st = await apps.status();
ok(!pr2.plan.ok && pr2.plan.code === 'no_app_system' && st.appSystem && st.appSystem.enabled && st.appSystem.canCreate === true && Array.isArray(st.entries), 'Repair with no app system: refused by name; GET /api/apps carries `appSystem` (the dialog\'s contract)');
const pApt = await apps.plan({ kind: 'apt', packages: ['hello'] });
ok(!pApt.plan.layer && pApt.plan.argv === undefined ? true : !pApt.plan.layer, 'no usable app system: an apt plan stays Layer 0 (never retargeted)');
const ret = on.retarget({ ok: true, mode: 'install', entryId: 'hello', packages: ['hello'], argv: ['x'], commands: ['y'] }, 'abcdef12');
ok(ret.layer === 'sys' && same(ret.argv.slice(5), ['vs-sys', 'install', 'hello', 'abcdef12', '--', 'hello']) && ret.commands.some((c) => c.includes(`${S.HELPER_PATH} --root -- apt-get`)) && same(S.simOpts('/r').slice(0, 2), ['-o', 'Dir=/r/']), 'retarget: an apt plan INTO the app system runs SYS_SCRIPT install (apt inside through the helper\'s --root); its simulation reads the userland (simOpts)');
const nr = (rq, agent) => E.normRequest(rq, { agent });
ok(S.SYS_KINDS.every((k) => nr({ kind: k }, false).ok && nr({ kind: k }, true).code === 'agent_forbidden') && same([...E.SYS_REQUEST_KINDS], [...S.SYS_KINDS]) && same(AS.PLAN_KINDS.slice(-S.SYS_KINDS.length), [...S.SYS_KINDS]), 'the engine: the app system\'s kinds are the user\'s (an agent asking one: agent_forbidden — D3, agents only propose)');
ok(same(E.recordOf({ kind: 'rebase' }, { nonce: 'abcdef12', mode: 'rebase' }), ['app-refresh', { nonce: 'abcdef12', id: 'sysroot', mode: 'rebase' }]) && same(E.recordOf({ kind: 'refresh' }, { nonce: 'abcdef12', mode: 'refresh' })[1].id, 'refresh'), 'their record op: app-refresh under the run id `sysroot` (the slot\'s log key)');
const m0 = A.validateManifest({ v: 1, generation: 1, sources: [], entries: [{ id: 'hello', kind: 'apt', packages: ['hello'], layer: 'sys', by: { kind: 'user' }, rows: [{ id: 'sys.hello', label: 'Hello', exec: '/h/.vibespace/sysroot/bin/hello', args: [] }] }], resolved: {} });
ok(m0.ok && m0.manifest.entries[0].layer === 'sys' && m0.manifest.entries[0].rows[0].id === 'sys.hello', 'the index keeps an entry\'s `layer: sys` and its `sys.` rows');

// ── §8 ──
{ // (a block: §8's names never meet §1–§7's)
console.log('§8 HARDENING — the machine half in-process (a fixture userland of this user stands in for root\'s: rootUid)');
const SSRC = fs.readFileSync(path.join(repo, 'src/app-system-serve.js'), 'utf8');
const spatch = (from, to, tag) => { const m = SSRC.replace(from, to); ok(m !== SSRC, `CONTROL (${tag}): the patch applies`); return MUT.load('src/app-system-serve.js', m, tag); };
const me = process.getuid();
const H2 = path.join(dir, 'home2'), R2 = path.join(H2, '.vibespace/sysroot/rootfs'), OUT = path.join(dir, 'outside');
const wf = (p, t, m = 0o644) => { fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o755 }); fs.writeFileSync(p, t, { mode: m }); fs.chmodSync(p, m); };
const DESK = (name, exec) => `[Desktop Entry]\nType=Application\nName=${name}\nExec=${exec}\n`;
wf(path.join(R2, 'etc/vibespace-sysroot.json'), ID({}));
const ENT = path.join(R2, 'var/lib/vibespace/entries'), APPS2 = path.join(R2, 'usr/share/applications');
for (const n of ['hello', 'foo']) { wf(path.join(APPS2, `${n}.desktop`), DESK(n, n)); wf(path.join(ENT, `${n}.list`), `${n}\n`); wf(path.join(ENT, `${n}.desktop`), `/usr/share/applications/${n}.desktop\n`); wf(path.join(ENT, `${n}.bin`), ''); }
wf(path.join(R2, 'usr/bin/hello'), '#!/bin/sh\n', 0o755);
wf(path.join(OUT, 'games/foo'), '#!/bin/sh\n', 0o755);
fs.symlinkSync(path.join(OUT, 'games'), path.join(R2, 'usr/games')); // an absolute link that leaves the rootfs (on this machine)
const logs = [];
const hard = (mod = SS, e = { VIBESPACE_APP_SYSTEM: '1' }) => mod.create({ home: H2, env: () => e, runner: stub(), platform: 'linux', rootUid: me, log: { warn: (m) => logs.push(m), log: () => { } } });
const h0 = hard();
const r0 = (await h0.rows()).rows;
ok(r0.length === 1 && r0[0].id === 'sys.hello' && r0[0].exec === path.join(h0.shimDir, 'hello'), `item 7: an Exec reached only through a link that leaves the rootfs (usr/games → outside) is no row — sys.hello only (${r0.map((r) => r.id).join(' ')})`);
const mExec = spatch('if (await existsIn(c)) set.add(c);', 'if (await lst(path.join(rootfs, c))) set.add(c);', 'exec-follows');
ok((await hard(mExec).rows()).rows.some((r) => r.id === 'sys.foo'), 'CONTROL: an exec lookup that follows the link (the pre-hardening lstat) makes sys.foo a row from outside the rootfs');
fs.mkdirSync(path.join(R2, 'opt/bar'), { recursive: true }); wf(path.join(R2, 'opt/bar/bar'), '', 0o755);
fs.symlinkSync('/opt/bar/bar', path.join(R2, 'usr/bin/bar')); fs.symlinkSync(`${'../'.repeat(12)}${OUT.slice(1)}/games/foo`, path.join(R2, 'usr/bin/esc'));
ok(await h0.existsIn('/usr/bin/hello') && await h0.existsIn('/usr/bin/bar') && !(await h0.existsIn('/usr/games/foo')) && !(await h0.existsIn('/usr/bin/esc')), 'item 7: exec targets resolve the way the chroot will — an absolute link re-rooted at the rootfs (/opt/bar/bar there), `..` stops at its top; nothing outside is looked at');
fs.renameSync(APPS2, `${APPS2}.real`); wf(path.join(OUT, 'applications/hello.desktop'), DESK('hello', 'hello')); fs.symlinkSync(path.join(OUT, 'applications'), APPS2);
ok((await hard().rows()).rows.length === 0, 'item 7: a .desktop file reached through a link (usr/share/applications → outside) is never read — no row');
const mWalk = spatch('const p = await inRoot(dir, rel);', 'const p = path.join(dir, String(rel));', 'no-walk');
ok((await hard(mWalk).rows()).rows.length === 1, 'CONTROL: a reader without the component walk reads the .desktop file outside the rootfs (a row appears)');
fs.unlinkSync(APPS2); fs.renameSync(`${APPS2}.real`, APPS2);
const h4 = hard(), shim = path.join(h4.shimDir, 'hello');
const c1 = await h4.catalog();
ok(c1.length === 1 && !c1[0].blocked && fs.readFileSync(shim, 'utf8') === S.shimText('/usr/bin/hello'), 'item 4: VibeSpace\'s own shim (its bytes = shimText(target), this user\'s, 0755) — the row launches');
fs.writeFileSync(`${shim}.u`, '#!/bin/sh\necho mine\n', { mode: 0o755 }); fs.renameSync(`${shim}.u`, shim);
const c2 = await h4.catalog();
ok(c2[0].blocked === 'shim-not-ours' && logs.some((m) => m.includes(shim) && m.includes('(content)')) && fs.readFileSync(shim, 'utf8').includes('echo mine'), 'item 4: a file of the user\'s under the shim\'s name is left alone, ignored and REPORTED — the row is blocked `shim-not-ours`, never launched');
const mAny = spatch("return text === S.shimText(target) ? null : 'content';", 'return null;', 'any-shim');
ok(!(await hard(mAny).catalog())[0].blocked, 'CONTROL: a launch check without the content digest launches the user\'s file');
fs.unlinkSync(shim); const c3 = await h4.catalog();
wf(path.join(OUT, 'shim'), S.shimText('/usr/bin/hello'), 0o755); fs.unlinkSync(shim); fs.symlinkSync(path.join(OUT, 'shim'), shim);
const v3 = h4.verifyRow(c3[0]);
fs.unlinkSync(shim); fs.writeFileSync(shim, S.shimText('/usr/bin/hello'), { mode: 0o775 }); fs.chmodSync(shim, 0o775);
const v4 = h4.verifyRow(c3[0]);
ok(!c3[0].blocked && v3.blocked === 'shim-not-ours' && v4.blocked === 'shim-not-ours' && logs.some((m) => m.includes('(a-link)')) && logs.some((m) => m.includes('(owner)')), 'item 4: checked again AT LAUNCH (a row read earlier): a link to the right bytes, or a group-writable copy — ignored and reported');
const DSV = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8'), ASV = fs.readFileSync(path.join(repo, 'src/app-serve.js'), 'utf8');
ok(/if \(row\.layer === 'sys' && !row\.available\) throw namedError/.test(DSV) && DSV.indexOf("row.layer === 'sys' && !row.available") < DSV.indexOf('const execPath = resolveExec(row.exec);') && /function catalogRows\(\) \{ return catalog\.rows\.map\(\(r\) => sys\.verifyRow\(/.test(ASV) && /await sys\.inRoot\(sys\.rootfs, c0\)/.test(ASV), 'item 4: every catalog read (= every launch) re-checks the launcher and the launch refuses a blocked sys row before anything starts; item 7: a sys icon is read only with no link on the way');
// item 6 — the digest binds what a sys plan runs
const hostPl = { ok: true, mode: 'install', entryId: 'hello', packages: ['hello'], commands: ['sudo apt-get install -y hello'], argv: A.appArgv({ mode: 'install', appsDir: '/h/.vibespace/apps', id: 'hello', nonce: 'abcdef12', args: ['hello'] }) };
const sysA = on.retarget(hostPl, 'abcdef12'), pA = S.sysDigestPart(sysA);
ok(same(S.sysDigestPart(hostPl), {}) && pA && pA.layer === 'sys' && same(pA, S.sysDigestPart(on.retarget(hostPl, 'zz99yy88'))) && !same(pA, S.sysDigestPart(on.retarget({ ...hostPl, packages: ['hello', 'sl'] }, 'abcdef12'))), 'item 6: a sys plan\'s digest binds its RUN (SYS_SCRIPT\'s argv, the nonce aside) + its layer; a host plan\'s part is empty (its digest unchanged); another package list is another run');
const swapped = [S.sysDigestPart({ ...sysA, argv: hostPl.argv }), S.sysDigestPart({ ...hostPl, argv: sysA.argv }), S.sysDigestPart({ ...sysA, argv: [...sysA.argv.slice(0, 4), 'echo other', ...sysA.argv.slice(5)] })];
ok(swapped[0] === null && swapped[1] === null && swapped[2].run !== pA.run, 'item 6: a host plan never stands in for a sys plan, nor the reverse (no digest — it never runs); another script is another run');
const DAX = fs.readFileSync(path.join(repo, 'src/server/desktop-access.js'), 'utf8');
ok(/const sys = SYS\.sysDigestPart\(plan\);\n\s+if \(!sys\) return null;/.test(DAX) && /closure: String\(plan\.closureKey\) \} : \{\}\), \.\.\.sys \}/.test(DAX) && /if \(planDigest\(plan\) == null\) \{ const e = named\('refused'/.test(DAX), 'item 6: planDigest binds the sys part; a plan with no digest never reaches the slot (installPackage refuses it)');
const mSwap = patch('if (sys !== (run != null)) return null;', '', 'swap');
ok(mSwap.sysDigestPart({ ...sysA, argv: hostPl.argv }) !== null, 'CONTROL: a digest part without the layer ⇔ argv rule lets a host argv run under a sys plan');
// item 8 — the boot install: off by default, never on a bare-metal / systemd install
const gate = async (e, mod = SS) => { const n0 = calls.length; const g = mod.create({ home, env: () => e, runner: stub({ 'vs-sys-install': { code: 0, stdout: '= ok\n', stderr: '' } }), platform: 'linux' }); await g.boot(); return { on: g.enabled(), ran: calls.length - n0, argv: calls.slice(n0).find((c) => c.includes('vs-sys-install')) || null }; };
const UNIT = { PORT: '3456', PATH: '/home/u/.nvm/versions/node/v24.12.0/bin:/home/u/.local/bin:/usr/local/bin:/usr/bin:/bin', INVOCATION_ID: '5b1f0c2a9e6d4c3b8a7f6e5d4c3b2a19', JOURNAL_STREAM: '8:123' }; // this host: a systemd user unit (Environment= PORT, PATH; EnvironmentFile without the flag)
const gs = [await gate({}), await gate(UNIT), await gate({ ...UNIT, VIBESPACE_APP_SYSTEM: '1' }), await gate({ VIBESPACE_APP_SYSTEM: '0' }), await gate({ VIBESPACE_APP_SYSTEM: 'false' })];
const gPod = await gate({ VIBESPACE_APP_SYSTEM: '1' });
ok(gs.every((g) => !g.on && g.ran === 0) && gPod.on && gPod.argv && same(gPod.argv.slice(-2), [S.HELPER_SHA256, S.SUDOERS_SHA256]), 'item 8: off by default; this host\'s shape (a systemd unit: INVOCATION_ID) installs NOTHING — even with the flag set; a pod (tini, the flag) installs with this release\'s digests');
const mUnit = spatch('!e.INVOCATION_ID && ', '', 'no-systemd-rule');
ok((await gate({ ...UNIT, VIBESPACE_APP_SYSTEM: '1' }, mUnit)).ran > 0, 'CONTROL: a gate without the systemd rule installs the helper + sudoers on a systemd host whose env file sets the flag');
// lane app-system-env — THE REAL WIRING: server.js hands the machine half `env: () => agentEnv()` (src/ws-handler.js → src/agent-env.js),
// which drops every VIBESPACE_* an agent child must not see; the pod's flag is in the PROCESS's env (the chart's container env)
{
  const { agentEnv } = require('../src/agent-env.js');
  const prev = process.env.VIBESPACE_APP_SYSTEM;
  process.env.VIBESPACE_APP_SYSTEM = '1';
  // mirror-green-211: the pod's env has no INVOCATION_ID; an Actions runner (a systemd service) hands its children one — strip it (the pod)
  const pod = () => { const { INVOCATION_ID, ...e } = agentEnv(process.env); return e; };
  const wired = async (mod = SS, env = pod) => { const lines = [], n0 = calls.length; const g = mod.create({ home, env, runner: stub({ 'vs-sys-install': { code: 0, stdout: '= ok\n', stderr: '' } }), platform: 'linux', log: { log: (m) => lines.push(m), warn: (m) => lines.push(m) } }); await g.boot(); return { on: g.enabled(), ran: calls.length - n0, line: lines.find((m) => /^\[apps\] app system: helper \+ sudoers installed in \d+ ms$/.test(m)) || null }; };
  const w = await wired();
  const mSan = spatch(' || process.env.VIBESPACE_APP_SYSTEM', '', 'sanitized-env-only');
  const wm = await wired(mSan);
  const wu = await wired(SS, () => agentEnv({ ...process.env, INVOCATION_ID: UNIT.INVOCATION_ID }));
  if (prev === undefined) delete process.env.VIBESPACE_APP_SYSTEM; else process.env.VIBESPACE_APP_SYSTEM = prev;
  ok(!('VIBESPACE_APP_SYSTEM' in agentEnv({ VIBESPACE_APP_SYSTEM: '1' })) && w.on && w.ran > 0 && w.line, 'app-system-env: the serve built as server.js builds it (env: () => agentEnv(), the flag in the process env only) is ENABLED and its boot step logs "[apps] app system: helper + sudoers installed in N ms"', w);
  ok(!wm.on && wm.ran === 0 && !wm.line, 'CONTROL (sanitized-env-only): an enabled() that reads the sanitized env alone never turns on in a pod (the 2.369.210 fleet bug)', wm);
  ok(!wu.on && wu.ran === 0 && !wu.line, 'the INVOCATION_ID rule on the same wiring: the flag in the process env but INVOCATION_ID too (a systemd unit — this host, an Actions runner) ⇒ OFF, nothing installed', wu);
}
}
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 6 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
