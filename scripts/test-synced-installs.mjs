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
const T0 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-synced-installs-'));
const real = (c) => cp.spawnSync('sh', ['-c', `command -v ${c}`], { encoding: 'utf8' }).stdout.trim();
try {
  // the sandbox PATH: stand-ins first, the box's own tools after
  const BIN = path.join(T0, 'bin'); fs.mkdirSync(BIN);
  const stub = (name, body) => { fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\n${body}\n`); fs.chmodSync(path.join(BIN, name), 0o755); };
  stub('install', 'while [ $# -gt 2 ]; do shift; done; echo "install $2" >> "$LOG"; cp "$1" "$2"');
  stub('visudo', 'echo "visudo $*" >> "$LOG"; [ -z "$VISUDO_FAIL" ]');
  stub('sync', 'echo "sync $*" >> "$LOG"; [ -z "$SYNC_FAIL" ]');
  stub('mv', `echo "mv $*" >> "$LOG"; exec ${real('mv')} "$@"`);
  stub('stat', `case "$*" in *%u*) echo 0 ;; *%a*) echo 755 ;; *) exec ${real('stat')} "$@" ;; esac`);
  const sh = (script, env = {}) => { const log = path.join(T0, `log-${Math.random().toString(36).slice(2)}`); fs.writeFileSync(log, ''); const r = cp.spawnSync('sh', ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, LOG: log, ...env } }); return { rc: r.status, out: r.stdout + r.stderr, log: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) }; };
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

  // ① THE SUDOERS DROP-IN AND THE ROOT HELPER (INSTALL_SCRIPT's two install lines)
  console.log('① the sudoers drop-in and the root helper: the file that takes the name checked, synced, then moved');
  const lineOf = (script, re) => String(script).split('\n').find((l) => re.test(l)) || '';
  const HELPER = lineOf(AS.INSTALL_SCRIPT, /^if cmp -s "\$T\/h" "\$H"/), SUDOERS = lineOf(AS.INSTALL_SCRIPT, /^if cmp -s "\$T\/s" "\$SD"/);
  ok(!!HELPER && !!SUDOERS, 'the install script\'s two install lines are found', { HELPER: !!HELPER, SUDOERS: !!SUDOERS });
  const install = (lines, { helperSame = false, oldSudoers = null, env = {} } = {}) => {
    const d = fs.mkdtempSync(path.join(T0, 'inst-')), T = path.join(d, 't'); fs.mkdirSync(T); fs.mkdirSync(path.join(d, 'sudoers.d'));
    fs.writeFileSync(path.join(T, 'h'), '#!/bin/sh\necho helper\n'); fs.writeFileSync(path.join(T, 's'), '#1000 ALL=(root) NOPASSWD:NOSETENV: /h\n');
    const H = path.join(d, 'helper'), SD = path.join(d, 'sudoers.d', '~vibespace-sysroot');
    if (helperSame) fs.copyFileSync(path.join(T, 'h'), H);
    if (oldSudoers !== null) fs.writeFileSync(SD, oldSudoers);
    const hd = cp.spawnSync('sh', ['-c', `sha256sum < ${shq(path.join(T, 'h'))} | cut -d" " -f1`], { encoding: 'utf8' }).stdout.trim();
    const r = sh(`say() { printf '= %s\\n' "$*"; }; T=${shq(T)}; H=${shq(H)}; SD=${shq(SD)}; set -- x y ${hd} 0; ${lines.join('\n')}`, env);
    return { ...r, sd: fs.existsSync(SD) ? fs.readFileSync(SD, 'utf8') : null, sdNew: fs.existsSync(SD + '.new'), hNew: fs.existsSync(H + '.new'), H, SD };
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
    const r = sh(`say() { printf '= %s\\n' "$*"; }; refuse() { say refused "$@"; exit 125; }; ${line}\nput ${shq(src)} ${shq(fs.realpathSync(dir))} app.conf; say put-done`, env);
    return { ...r, file: fs.readFileSync(path.join(dir, 'app.conf'), 'utf8'), vs: fs.existsSync(path.join(dir, '.app.conf.vs')), order: r.log.map((l) => l.replace(/ \S*\//g, ' ')).join(' · ') };
  };
  const p1 = put(PUT), p2 = put(PUT, { SYNC_FAIL: '1' });
  ok(!!PUT && p1.rc === 0 && /= put-done/.test(p1.out) && p1.file === 'new\n' && p1.order === 'install .app.conf.vs · sync -- .app.conf.vs · mv -fT .app.conf.vs app.conf', `② put(): synced before its move (${p1.order})`, p1);
  ok(p2.rc === 125 && /= refused not-synced \S*app\.conf/.test(p2.out) && p2.file === 'old\n' && !p2.vs, `② put()'s failed sync: refused by name (not-synced), the old file kept, the temp removed (${p2.order})`, p2);
  const OLD_PUT = 'put() { ( cd "$2" && [ "$(pwd -P)" = "$2" ] && [ "$(stat -c %u .)" = 0 ] && [ $(( 0$(stat -c %a .) & 022 )) -eq 0 ] && install -m 0644 -o root -g root "$1" "./.$3.vs" && mv -fT "./.$3.vs" "./$3" ) || refuse link-in-userland "$2/$3"; }';   // stale-pins: kept (the release's line, the RED)
  const p0 = put(OLD_PUT);
  ok(p0.rc === 0 && p0.order === 'install .app.conf.vs · mv -fT .app.conf.vs app.conf', `② RED (the release's put): moved unsynced (${p0.order})`, p0);

  // ③ THE XPRA APT KEY: checked, synced, then moved
  console.log('③ the xpra apt key: checked, synced, then moved; a failed sync changes nothing');
  const steps = DA.xpraRepoSteps('bookworm'), at = (re) => steps.findIndex((l) => re.test(l));
  const iCheck = at(/sha256sum -c --status/), iSync = at(/sync -- "\$K"/), iMove = at(/^mv -f \/usr\/share\/keyrings\/xpra\.asc\.new/);
  ok(iCheck >= 0 && iSync > iCheck && iMove > iSync, `③ the key's steps: the pinned check (${iCheck}), its sync (${iSync}), then the move (${iMove})`, steps);
  const k = path.join(T0, 'xpra.asc.new'), keySync = steps[iSync].split('/usr/share/keyrings/xpra.asc.new').join(k);
  fs.writeFileSync(k, 'key'); const k1 = sh(keySync); const kept1 = fs.existsSync(k);
  const k2 = sh(keySync, { SYNC_FAIL: '1' });
  ok(k1.rc === 0 && kept1 && k2.rc === 3 && !fs.existsSync(k) && /could not be written to disk/.test(k2.out), `③ the key's sync: on its success the checked file stays for the move; on a failure it is removed, said («${k2.out.trim().slice(0, 80)}»), exit 3`, { k1, k2 });

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
} finally { fs.rmSync(T0, { recursive: true, force: true }); }
report();
