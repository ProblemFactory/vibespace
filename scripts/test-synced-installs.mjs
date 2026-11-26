#!/usr/bin/env node
// test-synced-installs — B-bcb8 unit A (lane lg-store-writes, 主开发 r1366): A FILE THAT CAN LOCK A PERSON OUT OF THEIR OWN MACHINE,
// OR IS THEIR OWN SETTINGS, IS CHECKED AND SYNCED BEFORE IT TAKES ITS NAME. FAST: the app system's install lines (the sudoers
// drop-in, the root helper), its put() into a root folder, the xpra apt key's steps, and the agy wrapper's allow rule — each run
// for real under sh with stand-in commands on a sandbox PATH (install, visudo, sync, mv, stat: each logs its call; visudo and
// sync fail on cue), or with a recording file system — the ORDER (the file that takes the name checked, then synced, then
// moved), a failed check or sync (the old file kept, the new one removed, refused BY NAME), and the RED of each: the release's
// own lines. Run: node scripts/test-synced-installs.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const AS = require(path.join(REPO, 'src/app-system.js')), DA = require(path.join(REPO, 'src/desktop-apps.js'));
const AM = require(path.join(REPO, 'src/app-manifest.js')), IS = require(path.join(REPO, 'src/install-slot.js'));
const T0 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-synced-installs-'));
const real = (c) => cp.spawnSync('sh', ['-c', `command -v ${c}`], { encoding: 'utf8' }).stdout.trim();
try {
  // the sandbox PATH: stand-ins first, the box's own tools after
  const BIN = path.join(T0, 'bin'); fs.mkdirSync(BIN);
  const stub = (name, body) => { fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\n${body}\n`); fs.chmodSync(path.join(BIN, name), 0o755); };
  stub('install', 'while [ $# -gt 2 ]; do shift; done; echo "install $2" >> "$LOG"; [ -z "$INSTALL_FAIL" ] || exit 1; cp "$1" "$2"');
  stub('visudo', 'echo "visudo $*" >> "$LOG"; [ -z "$VISUDO_FAIL" ]');
  stub('sync', 'if [ "$1" = --help ]; then if [ -n "$SYNC_OLD" ]; then echo "Usage: sync [OPTION]"; else echo "  -d, --data             sync only file data, no unneeded metadata"; echo "  -f, --file-system      sync the file systems that contain the files"; fi; exit 0; fi; echo "sync $*" >> "$LOG"; if [ -n "$SYNC_UUTILS" ] && [ "$1" != -d ] && [ "$1" != -f ]; then echo "WHOLE-MACHINE" >> "$LOG"; exit 0; fi; if [ -n "$SYNC_OLD" ]; then [ $# -eq 0 ] || { echo "sync: invalid option" >&2; exit 1; }; exit 0; fi; if [ -n "$SYNC_NOTDONE" ] && [ $# -gt 0 ]; then echo "sync: error syncing x: Invalid argument" >&2; exit 1; fi; if [ -n "$SYNC_FAIL_ON" ]; then case "$*" in *"$SYNC_FAIL_ON"*) echo "sync: error syncing x: Input/output error" >&2; exit 1 ;; esac; fi; [ -z "$SYNC_FAIL" ]');   // B-bcb8 unit D: --help names the data and file-system forms (none: SYNC_OLD, a sync before coreutils 8.24); SYNC_UUTILS = a plain operand is a WHOLE-MACHINE sync (uutils sync.rs: no flag → sync()); SYNC_NOTDONE = EINVAL; SYNC_FAIL_ON = EIO on one file
  stub('mv', `echo "mv $*" >> "$LOG"; [ -z "$MV_FAIL" ] || exit 1; exec ${real('mv')} "$@"`);
  stub('dpkg-deb', 'echo "Package: hello"');   // B-bcb8 unit D: index()'s stanza reads a .deb's control fields; dash refuses a function named dpkg-deb
  stub('stat', `case "$*" in *%u*) echo 0 ;; *%a*) echo 755 ;; *) exec ${real('stat')} "$@" ;; esac`);
  const sh = (script, env = {}) => { const log = path.join(T0, `log-${Math.random().toString(36).slice(2)}`); fs.writeFileSync(log, ''); const r = cp.spawnSync('sh', ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, LOG: log, ...env } }); return { rc: r.status, out: r.stdout + r.stderr, err: r.stderr, log: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) }; };
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

  // ① THE SUDOERS DROP-IN AND THE ROOT HELPER (INSTALL_SCRIPT's two install lines)
  console.log('① the sudoers drop-in and the root helper: the file that takes the name checked, synced, then moved');
  const lineOf = (script, re) => String(script).split('\n').find((l) => re.test(l)) || '';
  // r1716 (4): every scene runs under its script's OWN head (its first line: set -eu), as production does
  const HEAD_I = String(AS.INSTALL_SCRIPT).split('\n')[0], HEAD_S = String(AS.SYS_SCRIPT).split('\n')[0];
  ok(/^set -[a-z]*e[a-z]*$/.test(HEAD_I) && /^set -[a-z]*e[a-z]*$/.test(HEAD_S) && HEAD_I.includes('u') && HEAD_S.includes('u'), `the scenes run under the scripts' own heads (${HEAD_I} · ${HEAD_S})`, { HEAD_I, HEAD_S });
  const HELPER = lineOf(AS.INSTALL_SCRIPT, /^if cmp -s "\$T\/h" "\$H"/), SUDOERS = lineOf(AS.INSTALL_SCRIPT, /^if cmp -s "\$T\/s" "\$SD"/);
  ok(!!HELPER && !!SUDOERS, 'the install script\'s two install lines are found', { HELPER: !!HELPER, SUDOERS: !!SUDOERS });
  const install = (lines, { helperSame = false, oldHelper = null, oldSudoers = null, digest = null, env = {} } = {}) => {
    const d = fs.mkdtempSync(path.join(T0, 'inst-')), T = path.join(d, 't'); fs.mkdirSync(T); fs.mkdirSync(path.join(d, 'sudoers.d'));
    fs.writeFileSync(path.join(T, 'h'), '#!/bin/sh\necho helper\n'); fs.writeFileSync(path.join(T, 's'), '#1000 ALL=(root) NOPASSWD:NOSETENV: /h\n');
    const H = path.join(d, 'helper'), SD = path.join(d, 'sudoers.d', '~vibespace-sysroot');
    if (helperSame) fs.copyFileSync(path.join(T, 'h'), H);
    if (oldHelper !== null) fs.writeFileSync(H, oldHelper);
    if (oldSudoers !== null) fs.writeFileSync(SD, oldSudoers);
    const hd = cp.spawnSync('sh', ['-c', `sha256sum < ${shq(path.join(T, 'h'))} | cut -d" " -f1`], { encoding: 'utf8' }).stdout.trim();
    const r = sh(`${HEAD_I}; say() { printf '= %s\\n' "$*"; }; T=${shq(T)}; H=${shq(H)}; SD=${shq(SD)}; set -- x y ${digest || hd} 0; ${lines.join('\n')}`, env);
    return { ...r, sd: fs.existsSync(SD) ? fs.readFileSync(SD, 'utf8') : null, sdNew: fs.existsSync(SD + '.new'), hNew: fs.existsSync(H + '.new'), h: fs.existsSync(H) ? fs.readFileSync(H, 'utf8') : null, H, SD };
  };
  const a = install([HELPER, SUDOERS]);
  const order = (r) => r.log.map((l) => l.split(r.SD).join('SD').split(r.H).join('H')).join(' · ');   // every path of the scene named, each time
  ok(a.rc === 0 && /= helper installed/.test(a.out) && /= sudoers installed/.test(a.out) && order(a) === 'install H.new · sync -- H.new · mv -f H.new H · install SD.new · visudo -cf SD.new · sync -- SD.new · mv -f SD.new SD', `① the helper's copy checked by its digest and synced, the drop-in checked by visudo ON THE FILE THAT TAKES THE NAME and synced, each before its move (${order(a)})`, { out: a.out, log: a.log });
  const b = install([HELPER, SUDOERS], { helperSame: true, oldSudoers: 'the old drop-in\n', env: { SYNC_FAIL: '1' } });
  ok(b.rc === 125 && /= refused sudoers-not-installed/.test(b.out) && b.sd === 'the old drop-in\n' && !b.sdNew && !b.log.some((l) => /^mv /.test(l)), `① a failed SYNC: refused by name (sudoers-not-installed), the old drop-in kept, the new one removed, nothing moved (${order(b)})`, { out: b.out, log: b.log, sd: b.sd });
  const c = install([HELPER, SUDOERS], { helperSame: true, oldSudoers: 'the old drop-in\n', env: { VISUDO_FAIL: '1' } });
  ok(c.rc === 125 && /= refused sudoers-not-installed/.test(c.out) && c.sd === 'the old drop-in\n' && !c.sdNew && !c.log.some((l) => /^(sync|mv) /.test(l)), `① a failed CHECK of the file that takes the name: refused, the old drop-in kept, nothing synced or moved (${order(c)})`, { out: c.out, log: c.log });
  const e = install([HELPER, SUDOERS], { env: { SYNC_FAIL: '1' } });
  ok(e.rc === 125 && /= refused helper-not-installed/.test(e.out) && !e.hNew, `① the helper's failed sync: refused by name (helper-not-installed), its new copy removed (${order(e)})`, { out: e.out, log: e.log });
  // r1716 (1): EVERY STEP OF BOTH CHAINS FAILED IN TURN — the install, the check, the sync, the mv: each ends with the .new
  // removed, the refusal said, exit 125, and the live file as it was
  const OLD_H = '#!/bin/sh\necho the old helper\n', OLD_SD = 'the old drop-in\n', WRONG = 'f'.repeat(64);
  for (const [step, opt] of [['install', { env: { INSTALL_FAIL: '1' } }], ['digest check', { digest: WRONG }], ['sync', { env: { SYNC_FAIL: '1' } }], ['mv', { env: { MV_FAIL: '1' } }]]) {
    const x = install([HELPER, SUDOERS], { oldHelper: OLD_H, ...opt });
    ok(x.rc === 125 && /= refused helper-not-installed/.test(x.out) && !x.hNew && x.h === OLD_H && !/= helper installed/.test(x.out), `① the helper's failed ${step}: refused by name (helper-not-installed), exit 125, its new copy removed, the live helper as it was (${order(x)})`, { out: x.out, log: x.log });
  }
  for (const [step, opt] of [['install', { env: { INSTALL_FAIL: '1' } }], ['visudo check', { env: { VISUDO_FAIL: '1' } }], ['sync', { env: { SYNC_FAIL: '1' } }], ['mv', { env: { MV_FAIL: '1' } }]]) {
    const x = install([HELPER, SUDOERS], { helperSame: true, oldSudoers: OLD_SD, ...opt });
    ok(x.rc === 125 && /= refused sudoers-not-installed/.test(x.out) && !x.sdNew && x.sd === OLD_SD && !/= sudoers installed/.test(x.out), `① the drop-in's failed ${step}: refused by name (sudoers-not-installed), exit 125, its .new removed, the live drop-in as it was (${order(x)})`, { out: x.out, log: x.log });
  }
  // r1716 (2): the helper's SECOND digest check (on the copy that takes the name) — its leg is the «digest check» above; its RED,
  // the line with that check cut: a copy whose bytes are not this release's takes the name
  const NO_SECOND = anchored(HELPER, '[ "$(sha256sum < "$H.new" | cut -d" " -f1)" = "$3" ] && ', '', 'the helper\'s second digest check');
  const n2 = install([NO_SECOND, SUDOERS], { oldHelper: OLD_H, digest: WRONG });
  ok(/= helper installed/.test(n2.out) && n2.h !== OLD_H, `① RED (the second digest check cut): a copy whose bytes are not this release's took the helper's name (${order(n2)})`, { out: n2.out, log: n2.log });
  // RED: the release's own lines (no check of the file that takes the name, no sync)
  const OLD_HELPER = 'if cmp -s "$T/h" "$H"; then say helper same; else install -m 0755 -o root -g root "$T/h" "$H.new"; mv -f "$H.new" "$H"; say helper installed; fi';   // stale-pins: kept (the release's line, the RED)
  const OLD_SUDOERS = 'if cmp -s "$T/s" "$SD"; then say sudoers same; else install -m 0440 -o root -g root "$T/s" "$SD.new"; mv -f "$SD.new" "$SD"; say sudoers installed; fi';   // stale-pins: kept (the release's line, the RED)
  const r0 = install([OLD_HELPER, OLD_SUDOERS]);
  ok(r0.rc === 0 && order(r0) === 'install H.new · mv -f H.new H · install SD.new · mv -f SD.new SD', `① RED (the release's lines): the drop-in took its name unchecked and unsynced (${order(r0)})`, r0.log);

  // ② put() INTO A ROOT FOLDER (SYS_SCRIPT)
  console.log('② put() into a root folder: synced before its move; a failed sync refused by name, the old file kept');
  const PUT = lineOf(AS.SYS_SCRIPT, /^put\(\) \{/);
  const put = (line, env = {}) => {
    const d = fs.mkdtempSync(path.join(T0, 'put-')), dir = path.join(d, 'etc'); fs.mkdirSync(dir);
    const src = path.join(d, 'src.conf'); fs.writeFileSync(src, 'new\n'); fs.writeFileSync(path.join(dir, 'app.conf'), 'old\n');
    const r = sh(`${HEAD_S}; say() { printf '= %s\\n' "$*"; }; refuse() { say refused "$@"; exit 125; }; ${line}\nput ${shq(src)} ${shq(fs.realpathSync(dir))} app.conf; say put-done`, env);
    return { ...r, file: fs.readFileSync(path.join(dir, 'app.conf'), 'utf8'), vs: fs.existsSync(path.join(dir, '.app.conf.vs')), order: r.log.map((l) => l.replace(/ \S*\//g, ' ')).join(' · ') };
  };
  const p1 = put(PUT), p2 = put(PUT, { SYNC_FAIL: '1' });
  ok(!!PUT && p1.rc === 0 && /= put-done/.test(p1.out) && p1.file === 'new\n' && p1.order === 'install .app.conf.vs · sync -- .app.conf.vs · mv -fT .app.conf.vs app.conf', `② put(): synced before its move (${p1.order})`, p1);
  ok(p2.rc === 125 && /= refused not-synced \S*app\.conf/.test(p2.out) && p2.file === 'old\n' && !p2.vs, `② put()'s failed sync: refused by name (not-synced), the old file kept, the temp removed (${p2.order})`, p2);
  // r1716 (3): a failure that is NOT the sync (here the install) is still said link-in-userland — never «not-synced»
  const p3 = put(PUT, { INSTALL_FAIL: '1' });
  ok(p3.rc === 125 && /= refused link-in-userland \S*app\.conf/.test(p3.out) && !/not-synced/.test(p3.out) && p3.file === 'old\n' && !p3.vs, `② put()'s failed install: still refused as link-in-userland (only a failed sync is «not-synced»), the old file kept (${p3.order})`, p3);
  const ALL_NS = anchored(PUT, '[ $r != 3 ] || refuse not-synced "$2/$3"; refuse link-in-userland "$2/$3";', 'refuse not-synced "$2/$3";', 'put()\'s failure told apart by its code');
  const p4 = put(ALL_NS, { INSTALL_FAIL: '1' });
  ok(/= refused not-synced/.test(p4.out) && !/link-in-userland/.test(p4.out), `② RED (every failure read as not-synced): the failed install is said «not-synced» — the leg above catches it (${p4.out.trim().split('\n').pop()})`, p4);
  const OLD_PUT = 'put() { ( cd "$2" && [ "$(pwd -P)" = "$2" ] && [ "$(stat -c %u .)" = 0 ] && [ $(( 0$(stat -c %a .) & 022 )) -eq 0 ] && install -m 0644 -o root -g root "$1" "./.$3.vs" && mv -fT "./.$3.vs" "./$3" ) || refuse link-in-userland "$2/$3"; }';   // stale-pins: kept (the release's line, the RED)
  const p0 = put(OLD_PUT);
  ok(p0.rc === 0 && p0.order === 'install .app.conf.vs · mv -fT .app.conf.vs app.conf', `② RED (the release's put): moved unsynced (${p0.order})`, p0);

  // ③ THE XPRA APT KEY: checked, synced, then moved
  console.log('③ the xpra apt key: checked, synced, then moved; a failed sync changes nothing');
  const steps = DA.xpraRepoSteps('bookworm'), at = (re) => steps.findIndex((l) => re.test(l));
  const iCheck = at(/sha256sum -c --status/), iSync = at(/sync -- "\$K"/), iMove = at(/^mv -f \/usr\/share\/keyrings\/xpra\.asc\.new/);
  ok(iCheck >= 0 && iSync > iCheck && iMove > iSync, `③ the key's steps: the pinned check (${iCheck}), its sync (${iSync}), then the move (${iMove})`, steps);
  const k = path.join(T0, 'xpra.asc.new'), keySync = steps[iSync].split('/usr/share/keyrings/xpra.asc.new').join(k);
  // r1716 (4): the plan's own head (planLines: its script's first line)
  const HEAD_P = String(DA.xpraInstallPlan({ platform: 'linux', apt: '/usr/bin/apt-get', distro: 'debian', like: [], codename: 'bookworm', sudo: true, aptXpra: '3.2' }).script || '').split('\n')[0];
  ok(/^set -[a-z]*e/.test(HEAD_P), `the key's scene runs under the plan's own head (${HEAD_P})`, HEAD_P);
  fs.writeFileSync(k, 'key'); const k1 = sh(`${HEAD_P}; ${keySync}`); const kept1 = fs.existsSync(k);
  const k2 = sh(`${HEAD_P}; ${keySync}`, { SYNC_FAIL: '1' });
  ok(k1.rc === 0 && kept1 && k2.rc === 3 && !fs.existsSync(k) && /could not be written to disk/.test(k2.err) && !/could not be written to disk/.test(k2.out.slice(0, k2.out.length - k2.err.length)), `③ the key's sync: on its success the checked file stays for the move; on a failure it is removed, said ON STDERR like its two neighbours («${k2.err.trim().slice(0, 80)}»), exit 3`, { k1, k2 });

  // ④ THE AGY WRAPPER'S ALLOW RULE (a wrapper boots at load: its function is driven from its own text, with a recording fs)
  console.log('④ the agy wrapper\'s allow rule: the account\'s settings synced before they take the name');
  const wsrc = fs.readFileSync(path.join(REPO, 'data/bin/agy-wrapper.js'), 'utf8');
  const fnOf = (src) => { const i = src.indexOf('function addAllowRule(rule) {'), j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j); };
  const drive = (fnText, { failSync = false } = {}) => {
    const d = fs.mkdtempSync(path.join(T0, 'agy-')), fp = path.join(d, 'settings.json'); fs.writeFileSync(fp, JSON.stringify({ permissions: { allow: [] } }));
    const order = [], fds = new Map(), role = (x) => (String(x) === fp ? 'file' : /\.tmp$/.test(String(x)) ? 'temp' : path.basename(String(x)));
    const rfs = { ...fs,
      openSync: (q, ...r) => { const fd = fs.openSync(q, ...r); fds.set(fd, role(q)); order.push('open ' + role(q)); return fd; },
      writeSync: (fd, ...r) => { const n = fs.writeSync(fd, ...r); if (order[order.length - 1] !== 'write ' + fds.get(fd)) order.push('write ' + fds.get(fd)); return n; },
      writeFileSync: (q, ...r) => { order.push('writeFile ' + role(q)); return fs.writeFileSync(q, ...r); },
      fsyncSync: (fd) => { order.push('fsync ' + fds.get(fd)); if (failSync) throw Object.assign(new Error('i/o error at the sync'), { code: 'EIO' }); return fs.fsyncSync(fd); },
      closeSync: (fd) => { order.push('close ' + fds.get(fd)); return fs.closeSync(fd); },
      renameSync: (x, y) => { order.push(`rename ${role(x)} > ${role(y)}`); return fs.renameSync(x, y); } };
    const f = new Function('fs', 'ruleFile', 'process', `${fnText}\nreturn addAllowRule;`)(rfs, () => ({ ok: true, fp }), { pid: 4242 });
    const r = f('Bash(ls:*)');
    return { r, order: order.join(' → '), disk: JSON.parse(fs.readFileSync(fp, 'utf8')), temps: fs.readdirSync(d).filter((x) => /\.tmp$/.test(x)) };
  };
  const g1 = drive(fnOf(wsrc)), g2 = drive(fnOf(wsrc), { failSync: true });
  ok(g1.r.ok === true && g1.order === 'open temp → write temp → fsync temp → close temp → rename temp > file' && g1.disk.permissions.allow.includes('Bash(ls:*)'), `④ the allow rule: ${g1.order}`, g1);
  ok(g2.r.ok === false && /writing it failed \(i\/o error at the sync\)/.test(g2.r.why) && !/rename/.test(g2.order) && g2.disk.permissions.allow.length === 0 && g2.temps.length === 0, `④ a failed sync: the write failed by name («${g2.r.why}»), nothing renamed, the account's settings as they were, the temp removed`, g2);
  const OLD_AGY = "  try { fs.writeFileSync(tmp, JSON.stringify(j, null, 2) + '\\n', { mode: 0o600 }); fs.renameSync(tmp, f.fp); }";   // stale-pins: kept (the release's line, the RED)
  const newBlockAt = fnOf(wsrc).indexOf('  // B-bcb8 unit A'), newBlockEnd = fnOf(wsrc).indexOf('  catch (e) { try { fs.unlinkSync(tmp); }');
  const g0 = drive(anchored(fnOf(wsrc), fnOf(wsrc).slice(newBlockAt, newBlockEnd), OLD_AGY + '\n', 'the release\'s allow-rule write'));
  ok(g0.r.ok === true && g0.order === 'writeFile temp → rename temp > file', `④ RED (the release's write): ${g0.order} — no sync before the name`, g0);

  // ⑤–⑦ B-bcb8 unit D (lane bl-scratch, 主开发 r5211 / r5214 / r5309): THE APP FAMILY's RECORDS — the app manifest's records, its
  // stanzas and the .debs it renames, the app system's new trees, the install slot's exit record — each synced in its own string
  // before its rename, and THAT FILE's DATA only (sync_file: `sync -d -- <file>`), never the machine: a plain `sync FILE` is a
  // whole-system sync() where the coreutils are uutils (sync.rs: no flag → sync()). The trees: their file system (sync_tree: `sync -f`).
  // A failed sync is a failed write, said (the record from before stands; the .deb kept; the tree refused by name; no exit record). A
  // machine whose sync names no data or file-system form in its --help (coreutils before 8.24) makes NO sync, said once. A sync its
  // file system does not do (EINVAL) lands, said. The pid record is a live run's: no sync. RED: 64fafc5be's spelling (a plain `sync --`:
  // a whole-machine sync on uutils) and each release line, in copies.
  const SF = (script) => lineOf(script, /^sync_file\(\) \{/);
  const SFs = [SF(AM.APP_SCRIPT), SF(IS.INSTALL_RUNNER)], ST = lineOf(AS.SYS_SCRIPT, /^sync_tree\(\) \{/);
  ok(!!SFs[0] && SFs[0] === SFs[1] && /sync -d -- "\$1"/.test(SFs[0]) && /sync -f -- "\$1"/.test(ST), `⑤ ONE SPELLING: sync_file is the same ONE line in the app script and the install runner, and it syncs a file's DATA (sync -d); sync_tree syncs a tree's file system (sync -f)`, { SFs, ST });
  const rel = (scene) => scene.log.map((l) => l.trim().split(scene.d).join('D')).join(' · ');   // every path of the scene named from its folder
  const whole = (scene) => scene.log.filter((l) => l === 'WHOLE-MACHINE').length;
  const SAID = /its file system does not do a sync: its new bytes take their name unsynced/;
  console.log('⑤ the app manifest\'s records, stanzas and renamed .debs: their data synced before they take their names');
  const HEAD_A = String(AM.APP_SCRIPT).split('\n')[0];
  const FIN = lineOf(AM.APP_SCRIPT, /^finish\(\) \{/), BASE = lineOf(AM.APP_SCRIPT, /^base\(\) \{/), LIST = lineOf(AM.APP_SCRIPT, /^list\(\) \{/);
  const LINES_A = String(AM.APP_SCRIPT).split('\n'), iSkip = LINES_A.findIndex((l) => /^ {4}s=\$D\/\$\{n%\.deb\}\.stanza; if \[ "\$\{f##\*\/\}" = "\$n" \]/.test(l));
  const DEB = iSkip > 0 ? LINES_A.slice(iSkip, iSkip + 6) : [];   // the skip, the one sync, the rename, the stanza's name, its up-to-date check, the stanza
  ok(!!FIN && !!BASE && !!LIST && DEB.length === 6 && DEB[1] === '    sync_file "$f" || continue' && /sync_file "\$s\.tmp" && mv -f "\$s\.tmp" "\$s"$/.test(DEB[5]), 'the app script\'s finish(), base(), list() and index()\'s .deb lines (one sync, then the rename; the stanza\'s own sync) are found', { FIN: !!FIN, BASE: !!BASE, LIST: !!LIST, DEB });
  const app = (lines, call, env = {}, pre = '') => {
    const d = fs.mkdtempSync(path.join(T0, 'app-')); for (const x of ['V', 'R/base', 'R/entries', 'T', 'Dd']) fs.mkdirSync(path.join(d, x), { recursive: true });
    fs.writeFileSync(path.join(d, 'status'), 'the dpkg status\n'); fs.writeFileSync(path.join(d, 'T/req'), 'hello\n'); fs.writeFileSync(path.join(d, 'T/desktop'), '/usr/share/applications/x.desktop\n'); fs.writeFileSync(path.join(d, 'T/from'), 'src hello\n');
    fs.writeFileSync(path.join(d, 'V/last-dpkg.list'), 'the list from before\n'); fs.writeFileSync(path.join(d, 'R/entries/e1.list'), 'the entry from before\n');
    fs.writeFileSync(path.join(d, 'Dd/x.deb'), 'deb bytes');   // a .deb apt fetched under a name that is not its canonical one
    const body = lines.map((l) => l.split(AM.LAST_LIST).join(path.join(d, 'V/last-dpkg.list')).split(AM.SLOT_ENDED).join(path.join(d, 'V/slot-ended')).split('/var/lib/dpkg/status').join(path.join(d, 'status'))).join('\n');
    const r = sh(`${HEAD_A}; say() { printf '= %s\\n' "$*"; }; q() { echo 'hello:amd64 1.0'; }; pins() { :; }; V=${shq(path.join(d, 'V'))}; R=${shq(path.join(d, 'R'))}; T=${shq(path.join(d, 'T'))}; D=${shq(path.join(d, 'Dd'))}; ID=e1\n${pre || SFs[0]}\n${body}\n${call}\nsay done`, env);
    const rd = (x) => (fs.existsSync(path.join(d, x)) ? fs.readFileSync(path.join(d, x), 'utf8') : null);
    return { ...r, d, list: rd('V/last-dpkg.list'), base: rd('R/base/status'), entry: rd('R/entries/e1.list'), desk: rd('R/entries/e1.desktop'), pin: rd('R/entries/e1.pin'), debs: fs.readdirSync(path.join(d, 'Dd')).sort(), stanza: rd('Dd/hello_1.0_amd64.stanza') };
  };
  const LOOP = (lines) => `for f in "$D"/*.deb; do n=hello_1.0_amd64.deb\n${lines.join('\n')}\ndone`;
  {
    const f1 = app([FIN], 'finish'), f2 = app([FIN], 'finish', { SYNC_FAIL_ON: 'last-dpkg.list.tmp' }), f3 = app([FIN], 'finish', { SYNC_OLD: '1' }), f4 = app([FIN], 'finish', { SYNC_NOTDONE: '1' });
    ok(f1.rc === 0 && f1.list === 'hello:amd64 1.0\n' && rel(f1) === 'sync -d -- D/V/last-dpkg.list.tmp · mv -f D/V/last-dpkg.list.tmp D/V/last-dpkg.list', `⑤ the package list at a run's end: its DATA synced, then moved (${rel(f1)})`, f1);
    ok(f2.rc === 0 && f2.list === 'the list from before\n' && !f2.log.some((l) => /^mv /.test(l)) && /Input\/output error/.test(f2.err), `⑤ its sync FAILED (EIO): the list from before stands, nothing moved, the failure SAID (${f2.err.trim()})`, f2);
    ok(f3.rc === 0 && f3.list === 'hello:amd64 1.0\n' && rel(f3) === 'mv -f D/V/last-dpkg.list.tmp D/V/last-dpkg.list' && /no data-only sync/.test(f3.err), `⑤ a sync whose --help names no data form (coreutils before 8.24): NO sync made — never the machine's — said, and the list moves (${rel(f3)})`, f3);
    ok(f4.rc === 0 && f4.list === 'hello:amd64 1.0\n' && SAID.test(f4.err) && f4.err.split('\n').filter((l) => SAID.test(l)).length === 1, `⑤ a file system that does not do a sync (EINVAL): said once, the list lands (${f4.err.trim()})`, f4);
    const b1 = app([BASE], 'base'), b2 = app([BASE], 'base', { SYNC_FAIL_ON: 'status.tmp' });
    ok(b1.rc === 0 && b1.base === 'the dpkg status\n' && /sync -d -- D\/R\/base\/status\.tmp · mv -f D\/R\/base\/status\.tmp D\/R\/base\/status/.test(rel(b1)), `⑤ the base's dpkg status: its data synced, then moved (${rel(b1)})`, b1);
    ok(b2.base === null && !b2.log.some((l) => /^mv /.test(l)) && /Input\/output error/.test(b2.err), `⑤ its sync FAILED: no base taken (made at the next run, as when absent), said (${rel(b2)})`, b2);
    const l1 = app([LIST], 'list; echo after-list'), l2 = app([LIST], 'list; echo after-list', { SYNC_FAIL_ON: 'e1.pin.tmp' });
    ok(l1.rc === 0 && l1.entry === 'hello\n' && !!l1.desk && !!l1.pin && l1.log.filter((l) => /^sync -d -- /.test(l)).length === 3 && l1.log.every((l, i) => !/^mv /.test(l) || /^sync -d -- /.test(l1.log[i - 1] || '')), `⑤ an app's entries (.list, .desktop, .pin): each its data synced, then moved (${rel(l1)})`, l1);
    ok(l2.rc === 0 && /after-list/.test(l2.out) && l2.pin === null && !!l2.desk && /Input\/output error/.test(l2.err), `⑤ the LAST entry's sync failed (.pin): said, its temp never moved — and the run goes on (list() still ends 0 under set -e)`, { rc: l2.rc, out: l2.out, err: l2.err });
    const d1 = app([LOOP(DEB)], ':'), d2 = app([LOOP(DEB)], ':', { SYNC_FAIL_ON: 'x.deb' });
    ok(d1.rc === 0 && d1.debs.join() === 'hello_1.0_amd64.deb,hello_1.0_amd64.stanza' && rel(d1) === 'sync -d -- D/Dd/x.deb · mv -f D/Dd/x.deb D/Dd/hello_1.0_amd64.deb · sync -d -- D/Dd/hello_1.0_amd64.stanza.tmp · mv -f D/Dd/hello_1.0_amd64.stanza.tmp D/Dd/hello_1.0_amd64.stanza', `⑤ a .deb renamed and given a stanza: its data synced ONCE, then renamed; the stanza's OWN bytes synced before its name (${rel(d1)})`, d1);
    ok(d2.rc === 0 && d2.debs.join() === 'x.deb' && !d2.log.some((l) => /^mv /.test(l)), `⑤ its sync FAILED: the .deb KEPT as it is (a person's own one exists nowhere else), never renamed, no stanza this run (${rel(d2)})`, d2);
    const d3 = app([LOOP(DEB)], ':'), up = path.join(d3.d, 'Dd');
    const again = sh(`${HEAD_A}; D=${shq(up)}\n${SFs[0]}\n${LOOP(DEB)}`);
    ok(again.rc === 0 && again.log.length === 0, `⑤ an up-to-date .deb under its canonical name asks NOTHING at the next index (no sync, no move): ${again.log.length} calls`, again.log);
    // THE PIN (r5309): no WHOLE-MACHINE sync where a plain operand is one (uutils) — RED: 64fafc5be's spelling, in a copy
    const u = [app([FIN], 'finish', { SYNC_UUTILS: '1' }), app([BASE], 'base', { SYNC_UUTILS: '1' }), app([LIST], 'list', { SYNC_UUTILS: '1' }), app([LOOP(DEB)], ':', { SYNC_UUTILS: '1' })];
    const OLD_SPELL = (l) => l.split(/sync_file ("[^"]+")/).map((p, k) => (k % 2 ? `{ e=$(LC_ALL=C sync -- ${p} 2>&1) || sync_not_done "$e"; }` : p)).join('');
    const ND = "sync_not_done() { case $1 in *'Invalid argument'*|*'not supported'*|*'Function not implemented'*) printf '%s\\n' \"$1\" >&2; return 0 ;; esac; return 1; }";   // stale-pins: kept (64fafc5be's helper, the RED)
    const ur = [app([OLD_SPELL(FIN)], 'finish', { SYNC_UUTILS: '1' }, ND), app([OLD_SPELL(LIST)], 'list', { SYNC_UUTILS: '1' }, ND)];
    ok(u.every((x) => whole(x) === 0) && u.reduce((n, x) => n + x.log.filter((l) => /^sync -d -- /.test(l)).length, 0) === 7 && ur.every((x) => whole(x) > 0),
      `⑤ PINNED: every sync of these strings is \`sync -d -- <file>\` — NO whole-machine sync on uutils (${u.map(whole).join(', ')}); RED (64fafc5be's plain \`sync -- <file>\`, in copies): ${ur.map(whole).join(' + ')} whole-machine syncs`, { tip: u.map((x) => rel(x)), red: ur.map((x) => rel(x)) });
    const relFin = anchored(FIN, ' && sync_file "$V/last-dpkg.list.tmp"', '', 'the release\'s finish()');
    const relList = anchored(LIST, / && sync_file "[^"]+"/, '', 'the release\'s list()', { count: 3 });
    const relDeb = '    if [ "${f##*/}" != "$n" ]; then mv -f "$f" "$D/$n"; f=$D/$n; fi';   // stale-pins: kept (the release's .deb rename, the RED)
    const x1 = app([relFin], 'finish'), x2 = app([relList], 'list'), x3 = app([LOOP([relDeb])], ':');
    ok(rel(x1) === 'mv -f D/V/last-dpkg.list.tmp D/V/last-dpkg.list' && x2.log.length === 3 && x2.log.every((l) => /^mv /.test(l)) && rel(x3) === 'mv -f D/Dd/x.deb D/Dd/hello_1.0_amd64.deb',
      `⑤ RED (the release's finish(), list() and .deb rename, in copies): each moved with NO sync (${rel(x1)} | ${rel(x2)} | ${rel(x3)})`, { x1: x1.log, x2: x2.log, x3: x3.log });
  }
  console.log('⑥ the app system\'s new tree: its file system synced before it takes the name; a failed sync refused by name');
  {
    const CREATE = lineOf(AS.SYS_SCRIPT, /^ {2}sync_tree "\$S\/rootfs\.new" \|\| refuse not-synced/), REBASE = lineOf(AS.SYS_SCRIPT, /^ {2}sync_tree "\$NX" \|\| refuse not-synced/);
    ok(!!CREATE && !!REBASE && !!ST, 'the system script\'s create and rebase moves, and its sync_tree, are found', { CREATE, REBASE, ST });
    const sys = (line, env = {}) => {
      const d = fs.mkdtempSync(path.join(T0, 'sys-')); for (const x of ['rootfs.new', 'rootfs.next', 'rootfs']) { fs.mkdirSync(path.join(d, x)); fs.writeFileSync(path.join(d, x, 'who'), x); }
      const r = sh(`${HEAD_S}; say() { printf '= %s\\n' "$*"; }; refuse() { say refused "$@"; exit 125; }; S=${shq(d)}; R=${shq(path.join(d, 'rootfs'))}; P=${shq(path.join(d, 'rootfs.prev'))}; NX=${shq(path.join(d, 'rootfs.next'))}; bad=0\n${ST}\ncase x in x)\n${line}\nesac`, env);
      const who = (x) => (fs.existsSync(path.join(d, x, 'who')) ? fs.readFileSync(path.join(d, x, 'who'), 'utf8') : null);
      return { ...r, d, root: who('rootfs'), prev: who('rootfs.prev'), next: who('rootfs.next') };
    };
    const C = CREATE.replace(/^ {2}/, '  rm -rf "$R"; ');
    const c1 = sys(C), c2 = sys(C, { SYNC_FAIL_ON: 'rootfs.new' }), c3 = sys(C, { SYNC_OLD: '1' }), c4 = sys(C, { SYNC_NOTDONE: '1' }), c5 = sys(C, { SYNC_UUTILS: '1' });
    ok(c1.rc === 0 && c1.root === 'rootfs.new' && rel(c1) === 'sync -f -- D/rootfs.new · mv D/rootfs.new D/rootfs', `⑥ create: the new tree's file system synced, then moved into place (${rel(c1)})`, c1);
    ok(c2.rc === 125 && /= refused not-synced \S*rootfs\.new/.test(c2.out) && c2.root === null && !c2.log.some((l) => /^mv /.test(l)), `⑥ create's sync FAILED (EIO): refused by name (not-synced), the new tree never moved (${rel(c2)})`, c2);
    ok(c3.rc === 0 && c3.root === 'rootfs.new' && rel(c3) === 'mv D/rootfs.new D/rootfs' && /no file-system sync/.test(c3.err), `⑥ a sync whose --help names no file-system form: NO sync made — never the machine's — said, the tree moves (${rel(c3)})`, c3);
    ok(c4.rc === 0 && c4.root === 'rootfs.new' && SAID.test(c4.err), `⑥ a file system that does not do a sync: said, the tree moves (${c4.err.trim()})`, c4);
    ok(c5.rc === 0 && whole(c5) === 0, `⑥ no whole-machine sync on uutils (${rel(c5)})`, c5);
    const r1 = sys(REBASE), r2 = sys(REBASE, { SYNC_FAIL_ON: 'rootfs.next' });
    ok(r1.rc === 0 && r1.root === 'rootfs.next' && r1.prev === 'rootfs' && rel(r1) === 'sync -f -- D/rootfs.next · mv D/rootfs D/rootfs.prev · mv D/rootfs.next D/rootfs', `⑥ rebase: the rebased tree synced, then the swap (${rel(r1)})`, r1);
    ok(r2.rc === 125 && /= refused not-synced/.test(r2.out) && r2.root === 'rootfs' && r2.next === 'rootfs.next' && !r2.log.some((l) => /^mv /.test(l)), `⑥ rebase's sync FAILED: refused, the live system as it was, the new one beside it (${rel(r2)})`, r2);
    const relC = anchored(CREATE, 'sync_tree "$S/rootfs.new" || refuse not-synced "$S/rootfs.new"; ', '', 'the release\'s create');
    const relR = anchored(REBASE, 'sync_tree "$NX" || refuse not-synced "$NX"; ', '', 'the release\'s rebase');
    const y1 = sys(relC.replace(/^ {2}/, '  rm -rf "$R"; ')), y2 = sys(relR);
    ok(rel(y1) === 'mv D/rootfs.new D/rootfs' && rel(y2) === 'mv D/rootfs D/rootfs.prev · mv D/rootfs.next D/rootfs', `⑥ RED (the release's create and rebase, in copies): the tree moved with NO sync (${rel(y1)} | ${rel(y2)})`, { y1: y1.log, y2: y2.log });
  }
  console.log('⑦ the install slot\'s records: the exit record\'s data synced; the pid record a live run\'s (no sync), its failed write refused');
  {
    const FINR = lineOf(IS.INSTALL_RUNNER, /^w=; fin\(\) \{/), PIDR = lineOf(IS.INSTALL_RUNNER, /^echo "\$\$ \$s \$K" > "\$P\.tmp"/);
    ok(!!FINR && !!PIDR, 'the install runner\'s exit and pid lines are found', { FINR, PIDR });
    const slot = (lines, env = {}) => {
      const d = fs.mkdtempSync(path.join(T0, 'slot-'));
      const r = sh(`X=${shq(path.join(d, 'exit'))}; P=${shq(path.join(d, 'pid'))}; L=${shq(path.join(d, 'log'))}; K=k1; s=123\n${SFs[1]}\n${lines.join('\n')}`, env);
      const rd = (x) => (fs.existsSync(path.join(d, x)) ? fs.readFileSync(path.join(d, x), 'utf8') : null);
      return { ...r, d, exit: rd('exit'), pid: rd('pid'), runlog: rd('log') || '', ran: /^ran$/m.test(r.out) };
    };
    const e1 = slot([FINR, 'fin 0']), e2 = slot([FINR, 'fin 0'], { SYNC_FAIL_ON: 'exit.tmp' }), e3 = slot([FINR, 'fin 0'], { SYNC_OLD: '1' }), e4 = slot([FINR, 'fin 0'], { SYNC_UUTILS: '1' });
    ok(e1.rc === 0 && /^0 \d+ k1\n$/.test(e1.exit || '') && rel(e1) === 'sync -d -- D/exit.tmp · mv -f D/exit.tmp D/exit', `⑦ the exit record: its data synced, then moved (${rel(e1)})`, e1);
    ok(e2.rc === 0 && e2.exit === null && !e2.log.some((l) => /^mv /.test(l)), `⑦ its sync FAILED: NO exit record (a follow reads «unrecorded», never a torn one), the runner's own exit unchanged (${rel(e2)})`, e2);
    ok(e3.rc === 0 && /^0 /.test(e3.exit || '') && rel(e3) === 'mv -f D/exit.tmp D/exit', `⑦ a sync with no data form: no sync made (never the machine's), the record moved (${rel(e3)})`, e3);
    ok(e4.rc === 0 && whole(e4) === 0, `⑦ no whole-machine sync on uutils (${rel(e4)})`, e4);
    const p1 = slot([FINR, PIDR, 'echo ran']), p2 = slot([FINR, PIDR, 'echo ran'], { MV_FAIL: '1' });
    ok(p1.rc === 0 && p1.ran && /^\d+ 123 k1\n$/.test(p1.pid || '') && rel(p1) === 'mv -f D/pid.tmp D/pid', `⑦ the pid record (a LIVE run's, «live-record»): moved with NO sync — none sits inside the launcher's wait for it — and the install runs (${rel(p1)})`, p1);
    ok(p2.rc === 125 && !p2.ran && p2.pid === null && /the install slot's pid record could not be written - nothing was run/.test(p2.runlog), `⑦ its write or move FAILED: REFUSED by name (exit 125, its line in the log) — the install never runs where the launcher could not see it (${rel(p2)})`, p2);
    const relF = anchored(FINR, ' && sync_file "$X.tmp"', '', 'the release\'s fin()');
    const relP = 'echo "$$ $s $K" > "$P.tmp" && mv -f "$P.tmp" "$P"; w=1';   // stale-pins: kept (the release's pid line, the RED)
    const z1 = slot([relF, 'fin 0']), z2 = slot([FINR, relP, 'echo ran'], { MV_FAIL: '1' });
    ok(rel(z1) === 'mv -f D/exit.tmp D/exit' && z2.ran, `⑦ RED (the release's fin() and pid line, in copies): the exit record moved with NO sync (${rel(z1)}); a failed pid move goes on and the install runs unseen (ran: ${z2.ran})`, { z1: z1.log, z2: { log: z2.log, ran: z2.ran } });
  }
} finally { fs.rmSync(T0, { recursive: true, force: true }); }
report();
