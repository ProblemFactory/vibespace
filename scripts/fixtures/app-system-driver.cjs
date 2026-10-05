'use strict';
// THE APP SYSTEM's heavy driver — runs ONLY inside the disposable container of scripts/test-app-system-enter.mjs, as
// the image's uid-1000 user (`node`; `vibe` in the fleet image) (NOPASSWD sudo, HOME /home/u = the volume standing in for the PVC). Prints one
// `@@ {"leg", "ok", "detail"}` line per check; the suite judges them. Never run it anywhere else.
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const S = require('/repo/src/app-system.js');
const SS = require('/repo/src/app-system-serve.js');
const AS = require('/repo/src/app-serve.js');
const A = require('/repo/src/app-manifest.js');
const M = require('/repo/src/desktop-apps.js');
const H = '/home/u', SYSD = `${H}/.vibespace/sysroot`, R = `${SYSD}/rootfs`, HP = S.HELPER_PATH, SHIMS = `${SYSD}/bin`, LIB = '/usr/local/libexec/vibespace';
/** an image that BAKES rung A (the fleet image) keeps its own tarball; otherwise the driver takes one from its rung B */
const BAKED = fs.existsSync(S.MINBASE_TARBALL);
const binSum = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
/** the image's own hello / xterm before any install (the fleet image ships xterm): an install INTO the app system leaves them as they were */
const IMG_BINS = Object.fromEntries(['hello', 'xterm'].map((b) => [b, binSum(`/usr/bin/${b}`)]));
const FACTS = { distro: 'debian', codename: 'bookworm', arch: 'amd64', sudo: true };
const out = (leg, ok, detail = null) => console.log('@@ ' + JSON.stringify({ leg, ok: !!ok, detail }));
const run = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: o.timeout || 900000, env: o.env || process.env, maxBuffer: 256 << 20 }); return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; };
const su = (...a) => run('sudo', ['-n', ...a]);
const runner = async (cmd, args, o = {}) => run(cmd, args, o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nseq = 0;
const slot = (mode, id, args = []) => { const nonce = `n${Date.now().toString(36)}${++nseq}`.slice(0, 16); const a = S.sysArgv({ mode, id, nonce, args }); const t0 = Date.now(); const r = run(a[0], a.slice(1), { timeout: 1500000 }); return { ...r, ms: Date.now() - t0, log: A.parseRunLog(r.stdout, { id, nonce }) }; };
const tail = (r) => `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-6).join(' | ').slice(0, 900);
const mounts = () => fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').filter((l) => l.includes('/.vibespace/sysroot'));
const ident = (dir = R) => { const r = su('cat', `${dir}/etc/vibespace-sysroot.json`); return S.parseIdentity(r.code === 0 ? r.stdout : null); };
const enter = (args, env) => run('sudo', ['-n', ...(env || []), HP, ...args]);
const refusal = (r, re) => r.code === 111 && re.test(r.stderr);
const sudoRefused = (r) => r.code !== 0 && /not allowed to set the following environment variables/.test(r.stderr); // r2: NOSETENV for the helper
const statusOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/status`, 'utf8'); } catch { return ''; } };
const alive = (pid) => { try { process.kill(pid, 0); return !/^State:\s+Z/m.test(statusOf(pid)); } catch { return false; } };
const waitGone = async (pid, ms = 5000) => { const t = Date.now(); while (alive(pid) && Date.now() - t < ms) await sleep(100); return !alive(pid); };
const HELPER_SRC = fs.readFileSync('/repo/deploy/sysroot/vs-sysroot-enter', 'utf8');
const REEXEC = 'exec /usr/bin/env -i "${E[@]}" /bin/bash -p -- "$0" "$@"';
function ctl(name, from, to, from2 = null, to2 = '', from3 = null, to3 = '') {
  let src = HELPER_SRC.replace(from, to);
  if (from2) src = src.replace(from2, to2);
  if (from3) src = src.replace(from3, to3);
  if (src === HELPER_SRC) { out(`control ${name}: the patch applies`, false, from); return null; }
  fs.writeFileSync(`/tmp/ctl-${name}`, src);
  su('install', '-m', '0755', '-o', 'root', '-g', 'root', `/tmp/ctl-${name}`, `${LIB}/ctl-${name}`);
  return `${LIB}/ctl-${name}`;
}
const setId = (patch) => { const j = JSON.parse(su('cat', `${R}/etc/vibespace-sysroot.json`).stdout); fs.writeFileSync('/tmp/id.json', JSON.stringify({ ...j, ...patch }) + '\n'); su('cp', `${R}/etc/vibespace-sysroot.json`, '/tmp/id.orig'); su('install', '-m', '0644', '-o', 'root', '-g', 'root', '/tmp/id.json', `${R}/etc/vibespace-sysroot.json`); };
const resetId = () => su('install', '-m', '0644', '-o', 'root', '-g', 'root', '/tmp/id.orig', `${R}/etc/vibespace-sysroot.json`);

(async () => {
  // (mirror-green-211: this process env is the container's — docker run is given no -e, so it is the image env and no
  // INVOCATION_ID of the host's systemd unit or an Actions runner ever reaches it; the {...process.env} bases below are safe)
  // ── lane app-system-env: THE REAL WIRING, FIRST (nothing installed yet) — a child whose OWN env carries the flag, the
  // machine half built over agentEnv() as server.js builds it; its after-listen replay installs the helper; the status read ──
  {
    const w = run('node', ['/repo/scripts/fixtures/app-system-wired.cjs'], { env: { ...process.env, VIBESPACE_APP_SYSTEM: '1' }, timeout: 120000 });
    let j = {}; try { j = JSON.parse(w.stdout.trim().split('\n').pop()); } catch { j = { parse: w.stdout.slice(-300), stderr: w.stderr.slice(-300) }; }
    const line = (j.lines || []).find((m) => /^\[apps\] app system: helper \+ sudoers installed in \d+ ms$/.test(m)) || null;
    const hs0 = su('stat', '-c', '%u %a', HP).stdout.trim();
    out('app-system-env: a process with VIBESPACE_APP_SYSTEM in ITS env, wired as server.js (agentEnv()), reports the app system enabled after listen and installs the helper', w.code === 0 && j.enabled === true && j.helper && j.helper.installed === true && !!line && j.sanitizedHasFlag === false && hs0 === '0 755', { enabled: j.enabled, blocked: j.blocked, helper: j.helper, line, sanitizedHasFlag: j.sanitizedHasFlag, helperStat: hs0, code: w.code, error: j.error, lines: (j.lines || []).slice(0, 6) });
  }
  const sys = SS.create({ home: H, env: () => ({ ...process.env, VIBESPACE_APP_SYSTEM: '1' }), runner, which: (n) => run('sh', ['-c', `command -v ${n}`]).stdout.trim() || null, validate: M.validateAppRow, helperSrcDir: '/repo/deploy/sysroot' });
  // ── boot: the helper + the sudoers drop-in, through INSTALL_SCRIPT ──
  await sys.boot();
  const hs = su('stat', '-c', '%u %a', HP).stdout.trim(), ss = su('stat', '-c', '%u %a', S.SUDOERS_PATH).stdout.trim();
  out('boot: the server installs the helper (root 0755) + the sudoers drop-in (root 0440, = SUDOERS_TEXT), visudo -c clean', sys.helperState().installed && hs === '0 755' && ss === '0 440' && su('cat', S.SUDOERS_PATH).stdout === S.SUDOERS_TEXT.replace(`${S.SUDOERS_UID_MARK} `, '#1000 ') && su('visudo', '-c').code === 0, { hs, ss, helper: sys.helperState() });
  fs.writeFileSync('/tmp/bad.sudoers', 'Defaults!/x this is not sudoers\n');
  const before = su('sha256sum', S.SUDOERS_PATH).stdout;
  const ia = S.installArgv({ helperSrc: '/repo/deploy/sysroot/vs-sysroot-enter', sudoersSrc: '/tmp/bad.sudoers', sudoersSha256: crypto.createHash('sha256').update(fs.readFileSync('/tmp/bad.sudoers')).digest('hex') });
  const bad = run(ia[0], ia.slice(1));
  out('control: a broken drop-in is refused by visudo -cf BEFORE install (the live one untouched)', /^= refused sudoers-invalid$/m.test(bad.stdout) && su('sha256sum', S.SUDOERS_PATH).stdout === before, tail(bad));
  const v0 = await sys.view({ facts: FACTS });
  out(`no app system yet: Set up offered (${BAKED ? 'rung A — the tarball the image bakes' : 'rung B — debootstrap on PATH'})`, v0.canCreate === true && v0.rung === (BAKED ? 'a' : 'b') && !v0.created, { canCreate: v0.canCreate, rung: v0.rung });

  // ── create, rung B ──
  const c = slot('create', 'sysroot', ['b', 'bookworm', 'http://deb.debian.org/debian']);
  const id1 = ident();
  // Debian's own setgid dirs (var/mail root:mail, var/local root:staff) are policy; a LEAK is the PVC group (the user's gid) + setgid
  const sgid = su('find', R, '-xdev', '(', '-group', String(process.getgid()), '-o', '-perm', '-2000', '-group', String(process.getgid()), ')').stdout.trim().split('\n').filter(Boolean);
  out(`create (rung B, debootstrap): ok in ${Math.round(c.ms / 1000)} s; rootfs root:root 0755; its identity reads back`, c.log.ok && su('stat', '-c', '%u:%g %a', R).stdout.trim() === '0:0 755' && id1.ok && id1.identity.createdFrom === 'debootstrap' && id1.identity.codename === 'bookworm', { ms: c.ms, id: id1, tail: c.log.ok ? null : tail(c) });
  if (!c.log.ok) { out('done', false, 'create failed — nothing after it can run'); return; }
  out('§5 P3: nothing in the userland inherited the PVC root\'s group or setgid (fsGroup shape root:<user> 2775 above it)', sgid.length === 0 && (su('stat', '-c', '%a', H).stdout.trim() === '2775'), { setgid: sgid.slice(0, 5) });
  if (!BAKED) su('mkdir', '-p', '/usr/share/vibespace');
  if (!BAKED) su('tar', '-C', R, '--exclude=./etc/vibespace-sysroot.json', '--exclude=./var/lib/vibespace', '--exclude=./var/cache/apt/archives/*.deb', '-czpf', S.MINBASE_TARBALL, '.');

  // ── installs (a CLI + a GUI) through the slot; the catalog rows + the shims ──
  const i1 = slot('install', 'hello', ['hello']), i2 = slot('install', 'xterm', ['xterm']);
  out(`install hello (CLI) + xterm (GUI) INTO the app system: ok (${Math.round(i1.ms / 1000)} s + ${Math.round(i2.ms / 1000)} s); the image's own /usr/bin/hello · xterm as before (${Object.entries(IMG_BINS).map(([b, h]) => `${b} ${h ? 'present' : 'absent'}`).join(', ')})`, i1.log.ok && i2.log.ok && i2.log.desktops.length > 0 && Object.entries(IMG_BINS).every(([b, h]) => binSum(`/usr/bin/${b}`) === h), { t1: i1.log.ok ? null : tail(i1), t2: i2.log.ok ? null : tail(i2) });
  const rows = await sys.catalog();
  const xr = rows.find((r) => r.id === 'sys.xterm');
  out('catalog: sys.xterm runs its shim by absolute path; shims for xterm and hello, the template\'s exact bytes', xr && xr.exec === `${SHIMS}/xterm` && fs.readFileSync(`${SHIMS}/xterm`, 'utf8') === S.shimText('/usr/bin/xterm') && fs.readFileSync(`${SHIMS}/hello`, 'utf8') === S.shimText('/usr/bin/hello') && (fs.statSync(`${SHIMS}/hello`).mode & 0o777) === 0o755, { rows: rows.map((r) => r.id) });
  const apps = AS.create({ home: H, stateDir: '/tmp/vs-state', env: () => ({ ...process.env, VIBESPACE_APP_SYSTEM: '1' }), binOnPath: (n) => run('sh', ['-c', `command -v ${n}`]).stdout.trim() || null });
  fs.mkdirSync('/tmp/vs-state', { recursive: true });
  const pl = await apps.plan({ kind: 'apt', packages: ['cowsay'] });
  out('a plan INTO the app system: simulated as the user against the userland\'s own apt state (no root before approval); argv = SYS_SCRIPT install', pl.plan.ok && pl.plan.layer === 'sys' && pl.plan.argv[6] === 'install' && pl.plan.closure.some((x) => (x.package || x) === 'cowsay' || String(x.package || x).startsWith('cowsay')), { ok: pl.plan.ok, code: pl.plan.code, error: pl.plan.error, layer: pl.plan.layer, closure: (pl.plan.closure || []).slice(0, 5) });
  const st0 = await apps.status();
  out('GET /api/apps: appSystem usable, its rows in the catalog, its entries named layer sys', st0.appSystem.usable && st0.rows.some((r) => r.id === 'sys.xterm') && st0.entries.some((e) => e.id === 'hello' && e.layer === 'sys'), { appSystem: { usable: st0.appSystem.usable, blocked: st0.appSystem.blocked } });

  // ── the CLI shim ──
  const hi = run(`${SHIMS}/hello`, []);
  const viaPath = run('sh', ['-c', 'command -v hello'], { env: { PATH: `/usr/local/bin:/usr/bin:/bin:${SHIMS}` } }).stdout.trim();
  out('~/.vibespace/sysroot/bin/hello runs the app system\'s hello; at the END of PATH it is found where the image has none', hi.code === 0 && /Hello, world!/.test(hi.stdout) && viaPath === `${SHIMS}/hello`, { code: hi.code, out: hi.stdout.trim(), err: hi.stderr.trim().slice(0, 300), viaPath });

  // ── the GUI shim on the SAME pid (P7), the token never inside, no mount in the pod's namespace ──
  const X = spawn('Xvfb', [':9', '-nolisten', 'tcp'], { detached: true, stdio: 'ignore' });
  for (let i = 0; i < 50 && !fs.existsSync('/tmp/.X11-unix/X9'); i++) await sleep(100);
  const appEnv = { PATH: '/usr/bin:/bin', HOME: H, DISPLAY: ':9', VIBESPACE_DESKTOP_APP: 'sys.xterm', VIBESPACE_SESSION_TOKEN: 'vsst_must_not_cross', LANG: 'C.UTF-8' };
  const launch = async () => { const p = spawn(`${SHIMS}/xterm`, [], { detached: true, stdio: 'ignore', env: appEnv }); p.on('error', (e) => out('launch failed', false, e.message)); for (let i = 0; i < 60; i++) { await sleep(100); try { if (fs.statSync(`/proc/${p.pid}/exe`).ino === fs.statSync(`${R}/usr/bin/xterm`).ino) break; } catch { /* exec'ing */ } } await sleep(300); return p.pid; };
  const P = await launch();
  const stat0 = statusOf(P);
  const uids = (/^Uid:\s+(.*)$/m.exec(stat0) || [])[1] || '';
  let exeSame = false, sid = null, env0 = '', pss = false, nsOther = false;
  try { const a = fs.statSync(`/proc/${P}/exe`), b = fs.statSync(`${R}/usr/bin/xterm`); exeSame = a.ino === b.ino && a.dev === b.dev; } catch { /* gone */ }
  try { sid = Number(fs.readFileSync(`/proc/${P}/stat`, 'utf8').split(') ')[1].split(' ')[3]); } catch { /* gone */ }
  try { env0 = fs.readFileSync(`/proc/${P}/environ`, 'utf8'); } catch (e) { env0 = `ERR ${e.code}`; }
  try { pss = /^Pss:/m.test(fs.readFileSync(`/proc/${P}/smaps_rollup`, 'utf8')); } catch { /* none */ }
  try { nsOther = fs.readlinkSync(`/proc/${P}/ns/mnt`) !== fs.readlinkSync('/proc/self/ns/mnt'); } catch { /* none */ }
  const envKeys = env0.split('\0').map((x) => x.split('=')[0]).filter(Boolean);
  out('P7: the pid the keeper spawned IS the app — four Uids 1000, exe = the app system\'s xterm, its own session, PSS readable by the user', uids.split(/\s+/).every((u) => u === '1000') && exeSame && sid === P && pss, { uids, exeSame, sid, P, pss });
  out('the token never inside: DISPLAY + VIBESPACE_DESKTOP_APP crossed, VIBESPACE_SESSION_TOKEN did not, PATH = the inner system PATH', envKeys.includes('DISPLAY') && envKeys.includes('VIBESPACE_DESKTOP_APP') && !envKeys.includes('VIBESPACE_SESSION_TOKEN') && env0.split('\0').includes(`PATH=${S.SYS_PATH}`) && envKeys.every((k) => [...S.ENV_KEEP, 'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'GDK_BACKEND', 'QT_QPA_PLATFORM', 'XDG_RUNTIME_DIR', 'PWD', 'OLDPWD'].includes(k)), { envKeys }); // PWD / OLDPWD: the inner sh's own cd
  out('a private mount namespace: the app\'s is not the pod\'s, and the pod\'s shows no mount of the app system', nsOther && mounts().length === 0, { nsOther, mounts: mounts().slice(0, 3) });
  process.kill(-P, 'SIGTERM');
  out('the keeper\'s group kill (SIGTERM to -pid) ends it', await waitGone(P), null);
  const P2 = await launch();
  process.kill(-P2, 'SIGKILL');
  out('a crash (SIGKILL) leaves no mount behind — the namespace died with its last process', (await waitGone(P2)) && mounts().length === 0 && su('cat', '/proc/1/mountinfo').stdout.split('\n').every((l) => !l.includes('/.vibespace/sysroot')), { mounts: mounts().slice(0, 3) });

  // ── refusals BY NAME (each leaves no mount) ──
  const ref = [];
  su('mv', `${R}/etc/vibespace-sysroot.json`, '/tmp/id.away'); ref.push(['missing identity', refusal(enter(['--', 'true']), /no root-owned identity file/)]); su('mv', '/tmp/id.away', `${R}/etc/vibespace-sysroot.json`);
  setId({ helperContract: 2 }); ref.push(['another contract', refusal(enter(['--', 'true']), /another helper contract/)]); resetId();
  setId({ arch: 'arm64' }); ref.push(['wrong arch', refusal(enter(['--', 'true']), /architecture mismatch/)]); resetId();
  su('chown', '1000', R); ref.push(['not root-owned', refusal(enter(['--', 'true']), /not root-owned/)]); su('chown', '0', R);
  su('chmod', '0757', R); ref.push(['world-writable', refusal(enter(['--', 'true']), /world-writable/)]); su('chmod', '0755', R);
  fs.renameSync(SYSD, `${SYSD}.real`); fs.symlinkSync(`${SYSD}.real`, SYSD); ref.push(['symlinked path', refusal(enter(['--', 'true']), /not canonical/)]); fs.unlinkSync(SYSD); fs.renameSync(`${SYSD}.real`, SYSD);
  ref.push(['--root runs apt/dpkg only', refusal(enter(['--root', '--', 'sh', '-c', 'id']), /--root runs apt-get/)]);
  ref.push(['stage 2 outside a private namespace', refusal(enter(['--stage2', '--', 'true']), /stage 2 outside a private mount namespace/)]);
  ref.push(['no SUDO_UID', refusal(run('sudo', ['-n', 'env', '-u', 'SUDO_UID', HP, '--', 'true']), /no SUDO_UID/)]);
  const back = enter(['--', 'true']);
  out(`refused BY NAME (exit 111): ${ref.map(([n, k]) => `${n}${k ? '' : ' ✗'}`).join(' · ')}; restored, it enters again; no mount left`, ref.every(([, k]) => k) && back.code === 0 && mounts().length === 0, { failed: ref.filter(([, k]) => !k).map(([n]) => n), back: back.code ? tail(back) : 0 });

  // ── an interrupted install → the Repair banner → Repair ──
  const deb = (fs.readdirSync(`${R}/var/cache/apt/archives`).find((n) => /^hello_.*\.deb$/.test(n)));
  const un = deb ? enter(['--root', '--', 'dpkg', '--unpack', `/var/cache/apt/archives/${deb}`]) : { code: -1 };
  const au = await sys.auditNow(), vI = await sys.view({ facts: FACTS });
  out('an install left unpacked (what a kill mid-dpkg leaves): dpkg --audit through the helper names it → appSystem.interrupted (the Repair banner)', un.code === 0 && au && au.interrupted && au.packages.includes('hello') && vI.interrupted === true, { deb, unpack: un.code, audit: au });
  const rp = await apps.plan({ kind: 'repair' });
  const rr = slot('repair', 'sysroot');
  const au2 = await sys.auditNow();
  out('Repair (dpkg --configure -a + apt-get -f install) through the slot: ok, the audit is clean again', rp.plan.ok && rr.log.ok && au2 && !au2.interrupted, { plan: rp.plan.ok, tail: rr.log.ok ? null : tail(rr), audit: au2 });

  // ── rung A from the image's tarball ──
  su('mv', R, `${SYSD}/rootfs.hold`);
  const ca = slot('create', 'sysroot', ['a', 'bookworm']);
  const ida = ident();
  out(`create (rung A, the image's minbase tarball${BAKED ? ' — BAKED into the image' : ''}, offline): ok in ${Math.round(ca.ms / 1000)} s; the helper enters it`, ca.log.ok && ida.ok && ida.identity.createdFrom === 'minbase-tarball' && enter(['--', 'true']).code === 0, { ms: ca.ms, tail: ca.log.ok ? null : tail(ca) });
  su('rm', '-rf', '--one-file-system', R); su('mv', `${SYSD}/rootfs.hold`, R);

  // ── Rebase (rename) + Roll back + drop ──
  const pTrixie = await sys.sysPlan('rebase', { facts: { ...FACTS, codename: 'trixie' }, nonce: 'abcdef12', canRun: true, view: await sys.view({ facts: { ...FACTS, codename: 'trixie' } }) });
  const pSame = await sys.sysPlan('rebase', { facts: FACTS, nonce: 'abcdef12', canRun: true, view: await sys.view({ facts: FACTS }) });
  out('the Rebase plan: offered when the image moved (args rung + the NEW codename), refused `nothing` when it did not', pTrixie.ok && pTrixie.argv.slice(-2).join(' ') === 'a trixie' && !pSame.ok && pSame.code === 'nothing', { trixie: pTrixie.ok, same: pSame.code });
  const rb = slot('rebase', 'sysroot', ['a', 'bookworm']);
  const idNew = ident(), idPrev = ident(`${SYSD}/rootfs.prev`);
  out(`Rebase: rootfs.next built from the tarball, every entry replayed into it (${Math.round(rb.ms / 1000)} s), then rootfs → rootfs.prev, rootfs.next → rootfs`, rb.log.ok && rb.log.entries.hello && rb.log.entries.hello.ok && rb.log.entries.xterm && rb.log.entries.xterm.ok && idNew.ok && idNew.identity.createdFrom === 'minbase-tarball' && idPrev.ok && idPrev.identity.createdFrom === 'debootstrap' && fs.existsSync(`${R}/usr/bin/hello`) && run(`${SHIMS}/hello`, []).code === 0, { entries: rb.log.entries, tail: rb.log.ok ? null : tail(rb) });
  const vR = await sys.view({ facts: FACTS });
  const rl = slot('rollback', 'sysroot');
  out('Roll back swaps them (rootfs ⇄ rootfs.prev) — the old app system runs again, the new one is kept', vR.canRollback === true && rl.log.ok && ident().identity.createdFrom === 'debootstrap' && ident(`${SYSD}/rootfs.prev`).identity.createdFrom === 'minbase-tarball' && run(`${SHIMS}/hello`, []).code === 0, { tail: rl.log.ok ? null : tail(rl) });
  const dp = slot('drop-prev', 'sysroot');
  out('Delete the previous app system: rootfs.prev gone, rootfs untouched', dp.log.ok && !fs.existsSync(`${SYSD}/rootfs.prev`) && ident().ok, null);
  const rm1 = slot('remove', 'hello');
  await sys.catalog();
  out('remove hello from the app system: its record and its shim go', rm1.log.ok && !fs.existsSync(`${R}/var/lib/vibespace/entries/hello.list`) && !fs.existsSync(`${SHIMS}/hello`) && fs.existsSync(`${SHIMS}/xterm`), { tail: rm1.log.ok ? null : tail(rm1) });

  // ── hardening (lane app-system-harden): files inside the app system / under HOME that are not what the code expects ──
  const shadowRoot = su('grep', '^root:', '/etc/shadow').stdout.trim();
  su('sh', '-c', `printf keep > /tmp/vs-victim; ln -sfn /tmp/vs-victim ${R}/etc/.vibespace-sysroot.lock`);
  const h1 = enter(['--', 'true']);
  out('hardening 1: a planted etc/.vibespace-sysroot.lock link is never opened (the lock is etc itself) — its target intact', h1.code === 0 && su('cat', '/tmp/vs-victim').stdout === 'keep', tail(h1));
  su('rm', '-f', `${R}/etc/.vibespace-sysroot.lock`);
  su('sh', '-c', `mv ${R}/etc/passwd ${R}/etc/passwd.real && ln -s /etc/shadow ${R}/etc/passwd`);
  const h2 = enter(['--', 'true']);
  const h2ok = refusal(h2, /not a regular file: .*\/etc\/passwd/) && su('readlink', `${R}/etc/passwd`).stdout.trim() === '/etc/shadow';
  const cPw = ctl('passwd', '[ -f "$file" ] && [ ! -L "$file" ] || die "not a regular file: $file"', ':');
  if (cPw) run('sudo', ['-n', cPw, '--', 'true']);
  const leaked = su('cat', `${R}/etc/passwd`).stdout.includes(shadowRoot);
  su('sh', '-c', `rm -f ${R}/etc/passwd && mv ${R}/etc/passwd.real ${R}/etc/passwd`);
  out('hardening 1: etc/passwd planted as a link to the pod\'s /etc/shadow — refused by name, nothing read; CONTROL: a copy without the check copies shadow\'s lines into the userland (0644)', h2ok && leaked, { real: tail(h2), leaked });
  su('sh', '-c', `mkdir -p /usr/share/fonts/truetype /tmp/vs-fontsink; if [ -e ${R}/usr/share/fonts ]; then mv ${R}/usr/share/fonts ${R}/usr/share/fonts.real; fi; ln -s /tmp/vs-fontsink ${R}/usr/share/fonts`);
  const h3 = enter(['--', 'true']);
  const h3ok = refusal(h3, /a symlink inside the app system: .*\/usr\/share\/fonts$/m) && !fs.existsSync('/tmp/vs-fontsink/vibespace-host');
  const cIn = ctl('inside', '  inside "$2" dir\n', '  [ -d "$dst" ] || mkdir -p "$dst"\n');
  if (cIn) run('sudo', ['-n', cIn, '--', 'true']);
  const outside = fs.existsSync('/tmp/vs-fontsink/vibespace-host');
  su('sh', '-c', `rm -f ${R}/usr/share/fonts; if [ -e ${R}/usr/share/fonts.real ]; then mv ${R}/usr/share/fonts.real ${R}/usr/share/fonts; fi; rm -rf /tmp/vs-fontsink`);
  out('hardening 1: usr/share/fonts planted as a link out of the rootfs — refused by name, nothing created outside; CONTROL: a copy without the walk mkdirs on the pod\'s disk', h3ok && outside, { real: tail(h3), outside });
  const A = `${H}/.vibespace/apps`;
  su('sh', '-c', `install -d -m 0755 -o root -g root ${A}/sys ${A}/sys/sources ${A}/sys/keys && printf 'Types: deb\\nURIs: http://deb.debian.org/debian\\nSuites: bookworm\\nComponents: main\\nEnabled: no\\n' > ${A}/sys/sources/vsx.sources && ln -sfn /etc/shadow ${A}/sys/keys/vsx.asc`);
  const h4 = slot('refresh', 'refresh');
  const kr = `${R}/etc/apt/keyrings/vibespace-vsx.asc`;
  const h4ok = h4.log.ok && fs.existsSync(`${R}/etc/apt/sources.list.d/vibespace-vsx.sources`) && !fs.existsSync(kr);
  const mSrc = S.SYS_SCRIPT.replace('stage "$A/sys/keys" "$T/src"', 'cp -L "$A/sys/keys"/* "$T/src"/');
  const ma = S.sysArgv({ mode: 'refresh', id: 'refresh', nonce: 'hard1234', args: [] }); ma[4] = mSrc;
  if (mSrc !== S.SYS_SCRIPT) run(ma[0], ma.slice(1));
  const kleak = su('cat', kr).stdout.includes(shadowRoot);
  su('rm', '-f', `${A}/sys/sources/vsx.sources`, `${A}/sys/keys/vsx.asc`, kr, `${R}/etc/apt/sources.list.d/vibespace-vsx.sources`);
  out('hardening 2: a key planted as a link to /etc/shadow is staged without following it (never copied); CONTROL: a root script that follows links lands shadow in the userland\'s keyrings', h4ok && kleak, { real: h4.log.ok ? null : tail(h4), kleak });
  fs.mkdirSync(`${SYSD}/rootfs.prev/keep`, { recursive: true });
  const h5 = slot('drop-prev', 'sysroot');
  const h5ok = /^= refused unsafe-removal /m.test(h5.stdout) && fs.existsSync(`${SYSD}/rootfs.prev/keep`);
  const mRm = S.SYS_SCRIPT.replace('( cd "$S" && [ "$(pwd -P)" = "$S" ] && [ -d "./$1" ] && [ ! -L "./$1" ] && [ "$(stat -c %u "./$1")" = 0 ] && rm -rf --one-file-system "./$1" )', 'rm -rf --one-file-system "$S/$1"');
  const mr = S.sysArgv({ mode: 'drop-prev', id: 'sysroot', nonce: 'hard5678', args: [] }); mr[4] = mRm;
  if (mRm !== S.SYS_SCRIPT) run(mr[0], mr.slice(1));
  const gone = !fs.existsSync(`${SYSD}/rootfs.prev`);
  if (!gone) fs.rmSync(`${SYSD}/rootfs.prev`, { recursive: true, force: true });
  out('hardening 3: a rootfs.prev that is not root\'s own directory is refused `unsafe-removal` (kept); CONTROL: a removal without rmchild\'s checks deletes it as root', h5ok && gone, { real: tail(h5), gone });
  fs.writeFileSync('/tmp/be.sh', 'touch /tmp/be-ran\n'); fs.mkdirSync('/tmp/evil', { recursive: true });
  for (const b of ['realpath', 'stat', 'id', 'getent', 'grep', 'unshare', 'mount', 'chroot', 'flock', 'dpkg', 'sed', 'awk']) fs.writeFileSync(`/tmp/evil/${b}`, '#!/bin/sh\ntouch /tmp/evil-ran\nexit 1\n', { mode: 0o755 });
  const dirtyEnv = ['LD_PRELOAD=/nonexistent/vs.so', 'LD_LIBRARY_PATH=/tmp/evil', 'PATH=/tmp/evil:/usr/bin:/bin', 'IFS=x', 'BASH_ENV=/tmp/be.sh', 'LC_ALL=C.UTF-8', 'FOO_LEAK=1'];
  const h6s = enter(['--', '/usr/bin/env'], dirtyEnv); // the real helper's path: the drop-in's NOSETENV rule
  const h6sok = sudoRefused(h6s) && /LD_PRELOAD/.test(h6s.stderr) && !fs.existsSync('/tmp/be-ran') && !fs.existsSync('/tmp/evil-ran');
  fs.writeFileSync('/tmp/same-helper', HELPER_SRC); su('install', '-m', '0755', '-o', 'root', '-g', 'root', '/tmp/same-helper', `${LIB}/ctl-same`);
  const h6 = run('sudo', ['-n', ...dirtyEnv, `${LIB}/ctl-same`, '--', '/usr/bin/env']); // the SAME bytes on a path only the user's ALL rule (SETENV) matches: the helper's own env -i
  const h6ok = h6sok && h6.code === 0 && !/^(LD_|FOO_LEAK|IFS=|BASH_ENV)/m.test(h6.stdout) && /^PATH=\/usr\/local\/sbin:/m.test(h6.stdout) && /^LC_ALL=C\.UTF-8$/m.test(h6.stdout) && !fs.existsSync('/tmp/be-ran') && !fs.existsSync('/tmp/evil-ran');
  const preloads = (h6.stderr.match(/vs\.so/g) || []).length;
  const cEnv = ctl('envi', REEXEC, ':', '#!/bin/bash -p\n', '#!/bin/bash\n');
  if (cEnv) run('sudo', ['-n', ...dirtyEnv, cEnv, '--', '/usr/bin/env']);
  const dirtyRan = fs.existsSync('/tmp/be-ran') || fs.existsSync('/tmp/evil-ran');
  const live6 = su('cat', S.SUDOERS_PATH).stdout;
  fs.writeFileSync('/tmp/sd-norule', live6.split('\n').filter((l) => !l.includes('NOPASSWD:NOSETENV')).join('\n'));
  su('install', '-m', '0440', '-o', 'root', '-g', 'root', '/tmp/sd-norule', S.SUDOERS_PATH);
  const h6c = run('sudo', ['-n', 'LD_PRELOAD=/nonexistent/vs.so', HP, '--', 'true']);
  fs.writeFileSync('/tmp/sd-live', live6); su('install', '-m', '0440', '-o', 'root', '-g', 'root', '/tmp/sd-live', S.SUDOERS_PATH);
  const ruleCtl = h6c.code === 0 && /vs\.so/.test(h6c.stderr) && su('cat', S.SUDOERS_PATH).stdout === live6 && su('visudo', '-c').code === 0;
  out('hardening 5 (r2): the drop-in\'s NOSETENV rule — sudo REFUSES LD_PRELOAD / BASH_ENV / PATH… on the command line for the helper, though the user\'s own drop-in (zz-node) sorts after vibespace-sysroot; CONTROL: the drop-in without that line lets LD_PRELOAD reach the helper\'s loader', h6sok && ruleCtl, { real: tail(h6s), ctl: tail(h6c) });
  out('hardening 5: real sudo with LD_* / PATH / IFS / BASH_ENV / a locale / FOO_LEAK on its command line — root code starts from env -i + the allowlist (BASH_ENV never sourced, no PATH binary run, nothing but the allowlist inside); CONTROL: a copy without the re-exec runs them as root', h6ok && dirtyRan, { real: h6ok ? null : tail(h6), preloadNotes: preloads, be: fs.existsSync('/tmp/be-ran'), evil: fs.existsSync('/tmp/evil-ran') });
  su('rm', '-rf', '/tmp/be-ran', '/tmp/evil-ran', '/tmp/evil', '/tmp/be.sh');
  fs.writeFileSync('/tmp/h-mod', HELPER_SRC + '# changed after the release\n');
  const hsum = () => su('sha256sum', HP).stdout.split(' ')[0];
  const live = hsum();
  const ib = S.installArgv({ helperSrc: '/tmp/h-mod', sudoersSrc: '/repo/deploy/sysroot/vibespace-sysroot.sudoers' });
  const h7 = run(ib[0], ib.slice(1));
  const h7ok = /^= refused digest-mismatch$/m.test(h7.stdout) && hsum() === live && live === S.HELPER_SHA256;
  ib[4] = S.INSTALL_SCRIPT.replace('[ "$(sha256sum < "$T/h" | cut -d" " -f1)" = "$3" ] && [ "$(sha256sum < "$T/s0" | cut -d" " -f1)" = "$4" ] || { say refused digest-mismatch; exit 125; }', ':');
  if (ib[4] !== S.INSTALL_SCRIPT) run(ib[0], ib.slice(1));
  const swappedIn = hsum() !== live;
  const ir2 = S.installArgv({ helperSrc: '/repo/deploy/sysroot/vs-sysroot-enter', sudoersSrc: '/repo/deploy/sysroot/vibespace-sysroot.sudoers' }); run(ir2[0], ir2.slice(1));
  out('hardening 8: a helper source whose bytes are not this release\'s is refused digest-mismatch before install (the live one = HELPER_SHA256); CONTROL: an install without the digest check puts it in place', h7ok && swappedIn && hsum() === live, { real: tail(h7), swappedIn });

  // ── controls: each security rule removed from a patched copy of the helper → the bad thing happens ──
  const cNs = ctl('ns', '[ "$(readlink /proc/self/ns/mnt)" != "$(readlink /proc/1/ns/mnt)" ] || die "stage 2 outside a private mount namespace"', ':');
  if (cNs) { run('sudo', ['-n', cNs, '--stage2', '--', 'true']); const leaked = mounts().length; for (const l of mounts().reverse()) su('umount', '-l', l.split(' ')[4]); out('CONTROL private namespace: without stage 2\'s check a direct call mounts INTO the pod\'s namespace', leaked > 0 && mounts().length === 0, { leaked }); }
  const cTok = ctl('token', 'exec chroot --userspec="$U_UID:$U_GID" "$R" /usr/bin/env -i "${ENVV[@]}"', 'exec chroot --userspec="$U_UID:$U_GID" "$R" /usr/bin/env "${ENVV[@]}"', 'unset VIBESPACE_SESSION_TOKEN || true', ':', REEXEC, ':');
  if (cTok) { const real = enter(['--', '/usr/bin/env'], ['VIBESPACE_SESSION_TOKEN=vsst_leak']), mut = run('sudo', ['-n', 'VIBESPACE_SESSION_TOKEN=vsst_leak', cTok, '--', '/usr/bin/env']); out('CONTROL env -i: a token handed to the helper never crosses (sudo refuses it on the command line); without env -i it does', (sudoRefused(real) || (real.code === 0 && !real.stdout.includes('vsst_leak'))) && mut.stdout.includes('VIBESPACE_SESSION_TOKEN=vsst_leak'), { real: real.code, mut: mut.code }); }
  const cHome = ctl('home', 'R="$U_HOME/.vibespace/sysroot/rootfs${NEXT:+.next}"', 'R="$HOME/.vibespace/sysroot/rootfs${NEXT:+.next}"', REEXEC, ':');
  if (cHome) { const real = enter(['--', 'true'], ['HOME=/tmp/evil']), mut = run('sudo', ['-n', 'HOME=/tmp/evil', cHome, '--', 'true']); out('CONTROL HOME from passwd: the environment cannot steer the real helper; a copy that reads $HOME goes where it is pointed', (real.code === 0 || sudoRefused(real)) && refusal(mut, /no app system at \/tmp\/evil\//), { real: real.code, mut: mut.stderr.trim() }); }
  const cReal = ctl('realpath', '[ "$(realpath -e -- "$R")" = "$R" ] || die', 'true || die');
  if (cReal) { fs.renameSync(SYSD, `${SYSD}.real`); fs.symlinkSync(`${SYSD}.real`, SYSD); const mut = run('sudo', ['-n', cReal, '--', 'true']); fs.unlinkSync(SYSD); fs.renameSync(`${SYSD}.real`, SYSD); out('CONTROL realpath == path: a copy without it enters a symlinked app system', mut.code === 0, tail(mut)); }
  const cOwn = ctl('owner', '[ "$(stat -c %u "$R")" = 0 ] || die "app system root is not root-owned: $R"', ':');
  if (cOwn) { su('chown', '1000', R); const mut = run('sudo', ['-n', cOwn, '--', 'true']); su('chown', '0', R); out('CONTROL root-owned: a copy without it enters a user-owned app system', mut.code === 0, tail(mut)); }
  const cCon = ctl('contract', 'grep -q "\\"helperContract\\":$CONTRACT[,}]" "$ID_FILE" || die', 'true || die');
  if (cCon) { setId({ helperContract: 2 }); const mut = run('sudo', ['-n', cCon, '--', 'true']); resetId(); out('CONTROL identity contract: a copy without it enters an app system of another contract', mut.code === 0, tail(mut)); }
  const cArch = ctl('arch', '[ -n "$want" ] && [ "$want" = "$have" ] || die', 'true || die');
  if (cArch) { setId({ arch: 'arm64' }); const mut = run('sudo', ['-n', cArch, '--', 'true']); resetId(); out('CONTROL arch: a copy without it enters an app system of another architecture', mut.code === 0, tail(mut)); }
  const cUs = ctl('userspec', 'exec chroot --userspec="$U_UID:$U_GID" "$R"', 'exec chroot "$R"');
  if (cUs) { const real = enter(['--', '/usr/bin/id', '-u']), mut = run('sudo', ['-n', cUs, '--', '/usr/bin/id', '-u']); out('CONTROL chroot --userspec: the real helper runs the app as 1000; without it the app runs as root', real.stdout.trim() === '1000' && mut.stdout.trim() === '0', { real: real.stdout.trim(), mut: mut.stdout.trim() }); }
  const cRoot = ctl('rootcmds', '*) die "--root runs apt-get / apt-cache / apt-mark / dpkg / dpkg-query only, not $1";;', '*) ;;');
  if (cRoot) { const mut = run('sudo', ['-n', cRoot, '--root', '--', '/bin/sh', '-c', 'id -u']); out('CONTROL --root allowlist: without it a shell runs as root inside', mut.stdout.trim() === '0', tail(mut)); }
  fs.writeFileSync('/tmp/sleep-shim', S.shimText('/usr/bin/sleep'), { mode: 0o755 });
  const Pr = spawn('/tmp/sleep-shim', ['30'], { detached: true, stdio: 'ignore', env: appEnv });
  await sleep(1200);
  const ur = (/^Uid:\s+(.*)$/m.exec(statusOf(Pr.pid)) || [])[1] || '';
  process.kill(-Pr.pid, 'SIGTERM'); await waitGone(Pr.pid);
  su('mv', S.SUDOERS_PATH, '/tmp/sd.hold');
  const Pc = spawn('/tmp/sleep-shim', ['30'], { detached: true, stdio: 'ignore', env: appEnv });
  await sleep(1200);
  const uc = (/^Uid:\s+(.*)$/m.exec(statusOf(Pc.pid)) || [])[1] || '';
  let readable = true; try { fs.readFileSync(`/proc/${Pc.pid}/smaps_rollup`); } catch { readable = false; }
  // the shell's builtin with `--`: node:22-slim has no /usr/bin/kill (this kill was a silent no-op there), and the fleet
  // image's procps-ng 4.0.2 kill misreads `kill -TERM -<pgid>` without `--` — it took the driver's whole session down
  su('sh', '-c', 'kill -s TERM -- "$1"', 'sh', `-${Pc.pid}`); await waitGone(Pc.pid);
  su('mv', '/tmp/sd.hold', S.SUDOERS_PATH);
  out('CONTROL the sudoers drop-in (P7): with it a sleep shim\'s pid is the app (Uids 1000); without it that pid is sudo (euid 0) — PSS unreadable to the user', ur.split(/\s+/).every((u) => u === '1000') && /^1000\s+0\b/.test(uc) && !readable, { real: ur, uids: uc, readable });
  su('sh', '-c', `rm -f ${LIB}/ctl-*`);
  try { process.kill(-X.pid, 'SIGTERM'); } catch { /* gone */ }
  // ── design 019 (lane app-layers-tidy): the REAL `forget` as root, and a real move of one small package (sl) ──
  {
    const SD = '/tmp/d019-state'; fs.mkdirSync(SD, { recursive: true });
    const LOGF = `${SD}/${M.INSTALL_FILES.log}`;
    const bop = (n) => run('sh', ['-c', `command -v ${n}`]).stdout.trim() || null;
    const host = AS.create({ home: H, stateDir: SD, env: () => ({ ...process.env, VIBESPACE_APP_SYSTEM: '' }), binOnPath: bop });
    const mv = AS.create({ home: H, stateDir: SD, env: () => ({ ...process.env, VIBESPACE_APP_SYSTEM: '1' }), binOnPath: bop });
    const go = (pl) => { const r = run(pl.argv[0], pl.argv.slice(1), { timeout: 1500000 }); fs.appendFileSync(LOGF, r.stdout); return r; };
    const HE = `${H}/.vibespace/apps/sys/entries`, DEBS = `${H}/.vibespace/apps/debs`;
    const ph = (await host.plan({ kind: 'apt', packages: ['sl'] })).plan;
    const rh = ph.ok ? go(ph) : { stdout: '', stderr: '' };
    const ih = ph.ok ? await AS.runAppOp(host, 'app-install', { entryId: ph.entryId, nonce: ph.nonce, kind: 'apt', by: { kind: 'user' }, label: 'Steam Locomotive' }) : null;
    const debsBefore = fs.readdirSync(DEBS).filter((n) => n.startsWith('sl_') && n.endsWith('.deb'));
    out('design 019: a host entry to move (sl, recorded by root on the base, its .deb cached)', ph.ok && !ph.layer && ih && ih.ok && fs.existsSync(`${HE}/sl.list`) && debsBefore.length === 1, { plan: ph.ok ? null : ph, tail: tail(rh), ih, debsBefore });
    const pf0 = (await mv.plan({ kind: 'forget', entryId: 'sl' })).plan;
    out('design 019: forget is refused by name until the app system holds the same packages (not_moved) — nothing ran', !pf0.ok && pf0.code === 'not_moved' && fs.existsSync(`${HE}/sl.list`), pf0);
    const pm = (await mv.plan({ kind: 'apt', packages: ['sl'] })).plan;
    const rm1 = pm.ok ? go(pm) : { stdout: '', stderr: '' };
    const im = pm.ok ? await AS.runAppOp(mv, 'app-install', { entryId: pm.entryId, nonce: pm.nonce, kind: 'apt', by: { kind: 'user' }, keep: true }) : null;
    const pf = (await mv.plan({ kind: 'forget', entryId: 'sl' })).plan;
    su('mv', HE, `${HE}.real`); su('ln', '-s', `${HE}.real`, HE);
    const rl = pf.ok ? run(pf.argv[0], pf.argv.slice(1)) : { stdout: '', stderr: '' };
    su('rm', HE); su('mv', `${HE}.real`, HE);
    out('design 019: forget through a symlinked entries dir is refused as root (not-root-owned) — the record stays', /^= refused not-root-owned /m.test(rl.stdout) && fs.existsSync(`${HE}/sl.list`), { tail: tail(rl), pf: pf.ok ? null : pf, im, sys: tail(rm1) });
    const rf = pf.ok ? go(pf) : { stdout: '', stderr: '' };
    const fo = pf.ok ? await AS.runAppOp(mv, 'app-forget', { entryId: 'sl', nonce: pf.nonce }) : null;
    const st = await mv.status();
    const dpkgSl = run('dpkg-query', ['-W', '-f=${Status}', 'sl']).stdout;
    const debsAfter = fs.readdirSync(DEBS).filter((n) => n.startsWith('sl_') && n.endsWith('.deb'));
    const ie = st.manifest.entries.filter((e) => e.id === 'sl');
    out('design 019: a REAL move of sl — the app system holds it, root\'s host record is gone with NO apt (still installed on the base until the rebuild), its cached .deb pruned, ONE index entry (layer sys, its label kept), the boot replay says no-entries', pm.ok && pm.layer === 'sys' && pm.forgets === 'sl' && im && im.ok && fo && fo.ok && /^= ok$/m.test(rf.stdout) && !/apt-get/.test(rf.stdout) && !fs.existsSync(`${HE}/sl.list`) && /install ok installed/.test(dpkgSl) && debsAfter.length === 0 && st.entries.some((e) => e.id === 'sl' && e.layer === 'sys') && ie.length === 1 && ie[0].layer === 'sys' && ie[0].label === 'Steam Locomotive' && st.replay.decision.why === 'no-entries', { tail: tail(rf), dpkgSl, debsAfter, why: st.replay.decision.why, ie, fo, pm: pm.ok ? pm.forgets : pm });
  }
  // ── verify r1 (app-layers-tidy): 1 forget refusals as root · 2 a real replay under a lying index · 3 a move interrupted + restart · 5 a REAL Roll back + status() ──
  {
    const AM = require('/repo/src/app-manifest.js'); // the driver's `A` is a path string in this scope (line 181)
    const SD = '/tmp/d019-state', LOGF = `${SD}/${M.INSTALL_FILES.log}`;
    const bop = (n) => run('sh', ['-c', `command -v ${n}`]).stdout.trim() || null;
    const mkH = () => AS.create({ home: H, stateDir: SD, env: () => ({ ...process.env, VIBESPACE_APP_SYSTEM: '' }), binOnPath: bop });
    const mkS = () => AS.create({ home: H, stateDir: SD, env: () => ({ ...process.env, VIBESPACE_APP_SYSTEM: '1' }), binOnPath: bop });
    const go = (pl) => { const r = run(pl.argv[0], pl.argv.slice(1), { timeout: 1500000 }); fs.appendFileSync(LOGF, r.stdout); return r; };
    const HE = `${H}/.vibespace/apps/sys/entries`, SE = `${R}/var/lib/vibespace/entries`, APPS = `${H}/.vibespace/apps`;
    const idx = async (a) => (await a.readManifest()).manifest.entries;
    const brief = (es) => es.map((e) => `${e.id}:${e.layer || 'host'}:${e.label || ''}:${(e.by || {}).kind || ''}`);
    let Dm = null; try { Dm = await import('/repo/src/lib/app-install-dialog.js'); } catch (e) { out('d019 r1 dialog module import (banner judged by its own filter instead)', true, String(e.message).slice(0, 200)); }
    const banner = (st) => (Dm ? Dm.appsMoveModel(st) : (st.appSystem.usable && st.entries.filter((e) => !e.layer).length ? { n: st.entries.filter((e) => !e.layer).length } : null));
    const dpkgOk = (p) => /install ok installed/.test(run('dpkg-query', ['-W', '-f=${Status}', p]).stdout);
    let host = mkH(), mv = mkS();
    // setup: xterm leaves the app system (so it can be a fresh HOST entry), then the host installs it
    const prx = (await mv.plan({ kind: 'remove', entryId: 'xterm' })).plan;
    const rrx = prx.ok ? go(prx) : { stdout: '' };
    const irx = prx.ok ? await AS.runAppOp(mv, 'app-remove', { entryId: 'xterm', nonce: prx.nonce }) : null;
    const phx = (await host.plan({ kind: 'apt', packages: ['xterm'] })).plan;
    const rhx = phx.ok ? go(phx) : { stdout: '' };
    const ihx = phx.ok ? await AS.runAppOp(host, 'app-install', { entryId: phx.entryId, nonce: phx.nonce, kind: 'apt', by: { kind: 'user' }, label: 'XTerm' }) : null;
    const st0 = await mv.status();
    const hostRows0 = st0.rows.filter((r) => r.app === 'xterm');
    out('d019 r1 setup: xterm removed from the app system, then installed on the BASE as host entry xterm (its rows in the catalog)', prx.ok && irx && irx.ok && phx.ok && phx.entryId === 'xterm' && !phx.layer && ihx && ihx.ok && fs.existsSync(`${HE}/xterm.list`) && !fs.existsSync(`${SE}/xterm.list`) && hostRows0.length > 0, { prx: prx.ok ? null : prx, rrx: tail(rrx), phx: phx.ok ? phx.entryId : phx, rhx: tail(rhx), rows: st0.rows.map((r) => `${r.id}<${r.app || ''}`) });
    // ── check 1 at root: the REAL root script refuses a forget with a bad id / extra args BEFORE acting; the record stays ──
    const badIds = ['../xterm', 'xterm/..', 'XTERM', '-xterm', 'xterm.list', ''];
    const jsRefused = badIds.filter((id) => { try { AM.appArgv({ mode: 'forget', appsDir: APPS, id, nonce: 'abcdef12' }); return false; } catch { return true; } }).length;
    const fArgv = (id, nonce) => { const a = AM.appArgv({ mode: 'forget', appsDir: APPS, id: 'xterm', nonce }); a[a.indexOf('vs-app') + 3] = id; return a; }; // the bad id put straight into root's argv (past appArgv's own refusal)
    const debs0 = fs.readdirSync(`${APPS}/debs`).sort().join(' '); // the cache before the refusals (closure − base: no xterm .deb on an image that ships xterm)
    const rb1 = badIds.map((id) => { const a = fArgv(id, 'abcdef12'); return run(a[0], a.slice(1)); });
    const ax = AM.appArgv({ mode: 'forget', appsDir: APPS, id: 'xterm', nonce: 'abcdef13' }); const rx = run(ax[0], [...ax.slice(1), 'extra']);
    const an = AM.appArgv({ mode: 'forget', appsDir: APPS, id: 'nosuch', nonce: 'abcdef14' }); const rn = run(an[0], an.slice(1));
    out(`d019 r1 check 1 (root): appArgv refuses ${jsRefused}/6 bad ids; past it, the real forget as root refuses 6 bad ids (bad-id), extra args (bad-args), an id with no record (no-entry) — xterm\'s host record and the cached .debs stay as they were (xterm\'s own .deb among them unless the image ships xterm)`, jsRefused === badIds.length && rb1.every((r) => /^= refused bad-id/m.test(r.stdout) && !/forgot/.test(r.stdout)) && /^= refused bad-args/m.test(rx.stdout) && /^= refused no-entry nosuch/m.test(rn.stdout) && fs.existsSync(`${HE}/xterm.list`) && fs.readdirSync(`${APPS}/debs`).sort().join(' ') === debs0 && (IMG_BINS.xterm || debs0.split(' ').some((n) => n.startsWith('xterm_'))), { debs0: debs0.slice(0, 300), imgXterm: !!IMG_BINS.xterm, bad: rb1.map((r) => (r.stdout.match(/^= refused .*/m) || [tail(r)])[0]), extra: tail(rx), none: tail(rn) });
    const pfx = (await mv.plan({ kind: 'forget', entryId: 'xterm' })).plan, pfp = (await mv.plan({ kind: 'forget', entryId: '../sys/entries/xterm' })).plan;
    out('d019 r1 check 1 (server): forget xterm before the app system holds it → not_moved; a path id → not_found (both by name, no argv run)', !pfx.ok && pfx.code === 'not_moved' && !pfp.ok && pfp.code === 'not_found' && fs.existsSync(`${HE}/xterm.list`), { pfx, pfp });
    // ── check 2: the index LIES (xterm claimed layer sys); the rebuild's loss; the REAL replay reinstalls it from root's host record ──
    const lie = async () => { const m = (await host.readManifest()).manifest; const e = m.entries.find((x) => x.id === 'xterm'); await host.writeManifest(AM.withEntry(m, { ...e, layer: 'sys' })); };
    await lie();
    const rmx = su('dpkg', '-r', 'xterm');
    const gone = !dpkgOk('xterm');
    const prp = (await host.plan({ kind: 'replay' })).plan; // (the replay plan reads status() — its reconcile corrects the index first)
    const fixedByPlan = !((await idx(host)).find((e) => e.id === 'xterm') || {}).layer;
    await lie(); // the lie again, so root's run happens WHILE the index claims sys
    const lied = (await idx(host)).find((e) => e.id === 'xterm');
    const rrp = prp.ok ? go(prp) : { stdout: '' };
    const back = dpkgOk('xterm');
    const stillLied = (await idx(host)).find((e) => e.id === 'xterm');
    out('d019 r1 check 2: with the index claiming xterm is layer sys, the base loses xterm (dpkg -r) and the REAL replay reinstalls it from root\'s host record — the index is not the authority', lied && lied.layer === 'sys' && gone && prp.ok && /^= ok$/m.test(rrp.stdout) && back && stillLied.layer === 'sys', { back, fixedByPlan, still: stillLied && stillLied.layer, said: (rrp.stdout.match(/^= (?!deb ).*/gm) || []).slice(-6), rrp: tail(rrp).slice(0, 400), lied: lied && lied.layer, gone, prp: prp.ok ? prp.argv.slice(-4) : prp, rmx: rmx.code });
    const st2 = await mv.status();
    const i2 = (await idx(mv)).filter((e) => e.id === 'xterm');
    out('d019 r1 check 2: status() then corrects the index (xterm host, label kept); the banner offers its move', i2.length === 1 && !i2[0].layer && i2[0].label === 'XTerm' && banner(st2) && banner(st2).n === 1, { i2: brief(i2), banner: banner(st2) });
    // ── check 3: a Move interrupted between its two steps (the sys install recorded, forget never ran), then a server restart ──
    const mp = (await mv.plan({ kind: 'move' })).plan;
    const me1 = mp.ok && mp.entries.find((e) => e.id === 'xterm');
    const pli = me1 ? (await mv.plan(me1.request)).plan : { ok: false };
    const rli = pli.ok ? go(pli) : { stdout: '' };
    const ili = pli.ok ? await AS.runAppOp(mv, 'app-install', { entryId: pli.entryId, nonce: pli.nonce, kind: 'apt', by: { kind: 'user' }, keep: true }) : null;
    out('d019 r1 check 3 setup: the Move\'s step 1 — xterm installed INTO the app system (same id, forgets xterm), recorded; then the server dies', mp.ok && me1 && !me1.recorded && pli.ok && pli.layer === 'sys' && pli.forgets === 'xterm' && pli.entryId === 'xterm' && ili && ili.ok, { mp: mp.ok ? mp.entries.map((e) => e.id) : mp, pli: pli.ok ? { f: pli.forgets, id: pli.entryId } : pli, rli: tail(rli) });
    host = mkH(); mv = mkS(); // the restart
    const st3 = await mv.status();
    const i3 = (await idx(mv)).filter((e) => e.id === 'xterm');
    const xr = st3.rows.filter((r) => r.app === 'xterm' || /xterm/.test(r.id));
    const pkgRows = (rows) => { const by = {}; for (const r of rows) if (r.package) by[r.package] = (by[r.package] || 0) + 1; return by; };
    out('d019 r1 check 3: after the restart BOTH records exist, ONE index entry (sys, label kept), the catalog carries NO host row for xterm (only the sys rows), the banner still offers the move', fs.existsSync(`${HE}/xterm.list`) && fs.existsSync(`${SE}/xterm.list`) && st3.entries.filter((e) => e.id === 'xterm').length === 2 && i3.length === 1 && i3[0].layer === 'sys' && i3[0].label === 'XTerm' && xr.length > 0 && xr.every((r) => r.id.startsWith('sys.')) && banner(st3) && banner(st3).n === 1, { i3: brief(i3), rows: xr.map((r) => `${r.id}<${r.package || ''}`), all: st3.rows.map((r) => r.id), byPkg: pkgRows(st3.rows), banner: banner(st3) });
    const mp2 = (await mv.plan({ kind: 'move' })).plan;
    const pf2 = (await mv.plan({ kind: 'forget', entryId: 'xterm' })).plan;
    const rf2 = pf2.ok ? go(pf2) : { stdout: '' };
    const fo2 = pf2.ok ? await AS.runAppOp(mv, 'app-forget', { entryId: 'xterm', nonce: pf2.nonce }) : null;
    const st3b = await mv.status();
    const i3b = (await idx(mv)).filter((e) => e.id === 'xterm');
    out('d019 r1 check 3: the second click — the Move plan says xterm is recorded (forget only); the real forget drops the host record; one sys entry, no banner, replay no-entries, still one set of xterm rows', mp2.ok && mp2.entries.length === 1 && mp2.entries[0].recorded === true && fo2 && fo2.ok && /^= ok$/m.test(rf2.stdout) && !fs.existsSync(`${HE}/xterm.list`) && fs.existsSync(`${SE}/xterm.list`) && i3b.length === 1 && i3b[0].layer === 'sys' && !banner(st3b) && st3b.replay.decision.why === 'no-entries' && st3b.rows.filter((r) => r.app === 'xterm' || /xterm/.test(r.id)).every((r) => r.id.startsWith('sys.')), { mp2: mp2.ok ? mp2.entries : mp2, rf2: tail(rf2), i3b: brief(i3b), why: st3b.replay.decision.why, rows: st3b.rows.map((r) => r.id) });
    // ── check 5: a REAL Rebase, then hello in / sl out of the new userland, then the REAL Roll back → status() on a fresh server ──
    const rb = slot('rebase', 'sysroot', ['a', 'bookworm']);
    mv = mkS(); await mv.status();
    const ph = (await mv.plan({ kind: 'apt', packages: ['hello'] })).plan;
    const rh = ph.ok ? go(ph) : { stdout: '' };
    const ih = ph.ok ? await AS.runAppOp(mv, 'app-install', { entryId: ph.entryId, nonce: ph.nonce, kind: 'apt', by: { kind: 'user' }, label: 'Hello' }) : null;
    const prs = (await mv.plan({ kind: 'remove', entryId: 'sl' })).plan;
    const rrs = prs.ok ? go(prs) : { stdout: '' };
    const irs = prs.ok ? await AS.runAppOp(mv, 'app-remove', { entryId: 'sl', nonce: prs.nonce }) : null;
    const i5a = await idx(mv);
    out('d019 r1 check 5 setup: a real Rebase (sl + xterm replayed into the new userland), then hello installed into it and sl removed from it (the index follows: hello sys, no sl)', rb.log.ok && ph.ok && ph.layer === 'sys' && ih && ih.ok && prs.ok && irs && irs.ok && i5a.some((e) => e.id === 'hello' && e.layer === 'sys') && !i5a.some((e) => e.id === 'sl') && fs.existsSync(`${SYSD}/rootfs.prev/var/lib/vibespace/entries/sl.list`), { rb: rb.log.ok ? rb.log.entries : tail(rb), ph: ph.ok ? ph.entryId : ph, rh: tail(rh), prs: prs.ok ? null : prs, rrs: tail(rrs), idx: brief(i5a) });
    const prb = (await mv.plan({ kind: 'rollback' })).plan;
    const rrb = prb.ok ? go(prb) : { stdout: '' };
    mv = mkS(); // a fresh server: no app-refresh record of the Roll back — status() alone must reconcile
    const st5 = await mv.status();
    const i5 = await idx(mv);
    const sysRows5 = Dm ? Dm.appSystemRows(st5).map((r) => r.text) : [];
    out('d019 r1 check 5: the REAL Roll back, then status(): the ghost hello dropped from the index and named in state.sys.gone, the unindexed sl record indexed (sys, by user), xterm untouched', prb.ok && /^= ok$/m.test(rrb.stdout) && fs.existsSync(`${SE}/sl.list`) && !fs.existsSync(`${SE}/hello.list`) && !i5.some((e) => e.id === 'hello') && i5.some((e) => e.id === 'sl' && e.layer === 'sys' && e.by.kind === 'user') && i5.some((e) => e.id === 'xterm' && e.layer === 'sys' && e.label === 'XTerm') && st5.state.sys && st5.state.sys.gone && JSON.stringify(st5.state.sys.gone.ids) === '["hello"]', { prb: prb.ok ? null : prb, rrb: tail(rrb), idx: brief(i5), gone: st5.state.sys && st5.state.sys.gone, entries: st5.entries.map((e) => `${e.id}:${e.layer || 'host'}:${e.indexed}`) });
    const st5b = await mv.status();
    const sysRows5b = Dm ? Dm.appSystemRows(st5b).map((r) => r.text) : [];
    out('d019 r1 check 5: a second status() changes nothing — hello named once (gone = [hello], one dialog line), the index stable', JSON.stringify(st5b.state.sys.gone.ids) === '["hello"]' && JSON.stringify(brief(await idx(mv))) === JSON.stringify(brief(i5)) && (!Dm || sysRows5b.filter((t) => /hello/.test(t)).length === 1), { rows: sysRows5b, first: sysRows5 });
    const prb2 = (await mv.plan({ kind: 'rollback' })).plan;
    const rrb2 = prb2.ok ? go(prb2) : { stdout: '' };
    const rec2 = prb2.ok ? await AS.runAppOp(mv, 'app-refresh', { nonce: prb2.nonce, id: S.SYS_RUN_ID, mode: 'rollback' }) : null;
    const i5c = await idx(mv);
    out('d019 r1 check 5: rolling back again through the engine\'s record (app-refresh sysroot): gone = [sl], hello indexed again — the record path agrees with status()', rec2 && rec2.ok && JSON.stringify(rec2.run.gone) === '["sl"]' && JSON.stringify(rec2.run.indexed) === '["hello"]' && !i5c.some((e) => e.id === 'sl') && i5c.some((e) => e.id === 'hello' && e.layer === 'sys') && JSON.stringify(rec2.state.sys.gone.ids) === '["sl"]', { rec2: rec2 && { ok: rec2.ok, run: rec2.run, gone: rec2.state && rec2.state.sys && rec2.state.sys.gone }, rrb2: tail(rrb2), idx: brief(i5c) });
  }
  out('done', mounts().length === 0, null);
})().catch((e) => { out('driver crashed', false, String(e && e.stack || e).slice(0, 1500)); process.exitCode = 1; });
