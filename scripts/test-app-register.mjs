#!/usr/bin/env node
// test-app-register — lane app-register-model (2026-10-11): an app an AGENT installs is REGISTERED with VibeSpace. PURE legs
// (the argv splitter, validateRegistered's refusals, THE WITNESS-MATCH RULE, adoptPrefill, the flatpak kind's argv / row /
// gone words, the witness exclusion) + one in-process machine leg (src/app-serve.js in a scratch HOME, a stub `flatpak`):
// add --kind flatpak's record, a witnessed declaration recorded directly, an unknown one refused `not_witnessed`, the variant launch.
// ⑨ (int254, the leg the lane left): the ENGINE (src/server/apps-engine.js) over that machine half — register of an unwitnessed
// exec = ONE For-you item, Accept records it with its variants; a witnessed Flatpak recorded directly; sudo / pkexec ⇒ needs_root on
// every path; remove = a proposal whose Accept runs the registered recipe (a PATH stub) and the row leaves; the witness drops covered rows.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WD = require(path.join(ROOT, 'src/argv-words.js'));
const K = require(path.join(ROOT, 'src/app-kinds/index.js'));
const RG = require(path.join(ROOT, 'src/app-kinds/registered.js'));
const FP = require(path.join(ROOT, 'src/app-kinds/flatpak.js'));
const AW = require(path.join(ROOT, 'src/app-witness.js'));
const A = require(path.join(ROOT, 'src/app-manifest.js'));
const M = require(path.join(ROOT, 'src/desktop-apps.js'));
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const sec = (s) => console.log(s);

sec('① the argv splitter (src/argv-words.js): quotes, escapes, a shell word refused by name, unicode, the round trip');
eq(WD.splitWords('flatpak run org.jaspstats.JASP --safe-mode').argv, ['flatpak', 'run', 'org.jaspstats.JASP', '--safe-mode'], 'plain words');
eq(WD.splitWords(`a 'b c' "d \\"e\\"" f\\ g`).argv, ['a', 'b c', 'd "e"', 'f g'], 'single / double quotes + escapes');
eq(WD.splitWords(`统计 'é ü' "中 文"`).argv, ['统计', 'é ü', '中 文'], 'unicode');
for (const [l, at] of [['x | y', 2], ['a;b', 1], ['a & b', 2], ['a > f', 2], ['a < f', 2], ['echo $HOME', 5], ['a `b`', 2]]) { const r = WD.splitWords(l); ok(!r.ok && r.code === 'bad_args' && r.at === at, `${l} refused bad_args at ${at} (${JSON.stringify(r)})`); }
eq(WD.splitWords(`'|' "a;b" '$x'`).argv, ['|', 'a;b', '$x'], 'a metachar inside quotes is a word');
ok(!WD.splitWords(`'open`).ok && !WD.splitWords(`"open`).ok, 'an unbalanced quote is refused');
const words = ['a b', "it's", '', '中文', '|', 'plain-1.2', '--x=1'];
eq(WD.splitWords(WD.joinWords(words)).argv, words, 'joinWords → splitWords round trip');

sec('② validateRegistered — every refusal by name');
const res = (x) => (x === 'flatpak' ? '/usr/bin/flatpak' : x === '/opt/jasp/bin/JASP' ? x : x === 'jasp' ? '/home/u/.local/bin/jasp' : null);
const V = (e, o = {}) => RG.validateRegistered(e, { resolve: res, home: '/home/u', iconBytes: () => 2048, engineIds: ['firefox', 'xterm'], entries: [{ id: 'gimp', kind: 'apt' }], ...o });
const jasp = { label: 'JASP', launch: [{ exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] }, { label: 'Safe mode', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP', '--safe-mode'] }], remove: { exec: 'flatpak', args: ['uninstall', '--user', '-y', 'org.jaspstats.JASP'] }, reinstall: { exec: 'flatpak', args: ['install', '--user', '-y', 'flathub', 'org.jaspstats.JASP'] } };
const good = V(jasp);
ok(good.ok && good.entry.launch[0].id === 'default' && good.entry.launch[1].id === 'safe-mode' && good.entry.launch[0].path === '/usr/bin/flatpak', `a good declaration (${JSON.stringify(good).slice(0, 200)})`);
const code = (e, o) => V(e, o).code;
eq(code({ ...jasp, label: '' }), 'bad_label', 'empty label');
eq(code({ ...jasp, label: 'x'.repeat(81) }), 'bad_label', 'label > 80');
eq(code({ ...jasp, launch: [{ exec: 'nosuchprog' }] }), 'bad_exec', 'exec that does not resolve');
eq(code({ ...jasp, launch: [{ exec: 'rm -rf /' }] }), 'bad_exec', 'a shell string as exec');
eq(code({ ...jasp, launch: [{ exec: 'flatpak', args: ['x'.repeat(257)] }] }), 'bad_args', 'an arg > 256');
eq(code({ ...jasp, launch: [{ exec: 'flatpak', args: Array(33).fill('a') }] }), 'bad_args', '> 32 args');
eq(code({ ...jasp, launch: Array(9).fill({ exec: 'flatpak' }).map((v, i) => ({ ...v, id: `v${i}` })) }), 'too_many_variants', '9 variants');
eq(code({ ...jasp, remove: { exec: 'sudo', args: ['flatpak', 'uninstall', 'org.jaspstats.JASP'] } }), 'needs_root', 'a sudo remove recipe');
eq(code({ ...jasp, reinstall: { exec: 'flatpak', args: ['install'] }, remove: { exec: 'pkexec', args: ['x'] } }), 'needs_root', 'a pkexec recipe');
eq(code({ ...jasp, icon: '/etc/passwd.png' }), 'bad_icon', 'an icon outside home / /usr/share');
eq(code({ ...jasp, icon: '/home/u/big.png' }, { iconBytes: () => 2 * 1024 * 1024 }), 'bad_icon', 'an icon > 1 MiB');
eq(code({ ...jasp, label: 'Firefox' }), 'shadow', 'a slug that shadows an engine row');
eq(code({ ...jasp, label: 'GIMP' }), 'shadow', 'a slug that is another kind\'s entry');
ok(V({ ...jasp, launch: [{ exec: 'flatpak', args: ['run', 'a|b;c'] }] }).ok, 'a shell metachar in an argv word is just a word');

sec('③ THE WITNESS-MATCH RULE');
const seenF = { id: 'seen.f.org.jaspstats.jasp', label: 'JASP', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'], witnessed: true, source: 'flatpak-user', flatpak: 'org.jaspstats.JASP' };
const seenD = { id: 'seen.d.jasp', label: 'JASP', exec: '/opt/jasp/bin/JASP', args: [], witnessed: true, source: 'desktop-user', desktop: '/home/u/.local/share/applications/jasp.desktop' };
const m1 = RG.witnessMatch(good.entry, [seenD, seenF]);
ok(m1.match && m1.seen.id === seenF.id && m1.witness === 'flatpak:org.jaspstats.JASP', 'the same flatpak appId ⇒ recorded directly');
const d = V({ label: 'JASP desk', launch: [{ exec: '/opt/jasp/bin/JASP' }] }).entry;
const m2 = RG.witnessMatch(d, [seenF, seenD]);
ok(m2.match && m2.witness === `desktop:${seenD.desktop}`, 'the same absolute Exec as a witnessed desktop entry ⇒ recorded directly');
ok(!RG.witnessMatch(V({ label: 'JASP x', launch: [{ exec: '/opt/jasp/bin/JASP', args: ['--batch'] }] }).entry, [seenD]).match, 'the same exec with other args ⇒ a proposal');
ok(!RG.witnessMatch(V({ label: 'Jasp CLI', launch: [{ exec: 'jasp' }] }).entry, [seenF, seenD]).match, 'an exec nothing lists ⇒ a proposal');
ok(!RG.witnessMatch(V({ ...jasp, launch: [{ exec: 'flatpak', args: ['run', '--command=sh', 'org.jaspstats.JASP'] }] }).entry, [seenF]).match, 'flatpak run with another command ⇒ a proposal');

sec('④ adoptPrefill — both shapes');
const pf = RG.adoptPrefill(seenF);
eq(pf.launch, [{ id: 'default', label: 'Open', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] }], 'flatpak launch');
eq([pf.remove, pf.reinstall, pf.witness], [{ exec: 'flatpak', args: ['uninstall', '--user', '-y', 'org.jaspstats.JASP'] }, { exec: 'flatpak', args: ['install', '--user', '-y', 'org.jaspstats.JASP'] }, 'flatpak:org.jaspstats.JASP'], 'flatpak recipes + witness');
ok(!RG.adoptPrefill({ ...seenF, source: 'flatpak-system' }).remove, 'a system Flatpak: no recipe (it needs root)');
const pd = RG.adoptPrefill(seenD);
ok(pd.launch[0].exec === '/opt/jasp/bin/JASP' && !pd.remove && pd.witness === `desktop:${seenD.desktop}`, 'desktop: its Exec, no remove, its path');

sec('⑤ the kinds: rows + argv + gone words; the CLI copy serves both');
const kv = K.kindsView();
ok(kv.some((r) => r.id === 'flatpak' && r.entry === 'home' && r.keeps === 'home' && r.cliWord === 'flatpak' && r.agent) && kv.some((r) => r.id === 'registered' && r.entry === 'home' && r.keeps === 'home' && r.agent), 'kindsView lists flatpak + registered');
ok(K.HOME_KINDS.includes('flatpak') && K.HOME_KINDS.includes('registered') && K.AGENT_KINDS.includes('registered'), 'HOME_KINDS / AGENT_KINDS');
eq(String(FP.ID_RE), String(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){2,}$/), 'flatpak ID_RE = the witness FLATPAK_ID_RE');
ok(AW.parseFlatpakList('org.jaspstats.JASP\tJASP\t0.19\n').length === 1 && FP.appIdOk('org.jaspstats.JASP') && !FP.appIdOk('jasp'), 'appId rule');
const fe = { id: 'jasp', kind: 'flatpak', appId: 'org.jaspstats.JASP', remote: 'flathub', label: 'JASP' };
eq(FP.installCmd('org.jaspstats.JASP', 'flathub'), ['flatpak', 'install', '--user', '-y', 'flathub', 'org.jaspstats.JASP'], 'install argv');
eq(A.removePlanFor(fe).homeArgv, ['flatpak', 'uninstall', '--user', '-y', 'org.jaspstats.JASP'], 'remove = flatpak uninstall --user -y (home)');
eq(FP.goneWords(fe), 'reinstall: flatpak install --user -y flathub org.jaspstats.JASP', 'the gone-exec rung words');
const parsed = A.parseDesktopFile('[Desktop Entry]\nType=Application\nName=JASP\nExec=/usr/bin/flatpak run --branch=stable --arch=x86_64 --command=org.jaspstats.JASP org.jaspstats.JASP %U\nIcon=org.jaspstats.JASP\n', { entry: 'jasp', path: '/h/.local/share/flatpak/exports/share/applications/org.jaspstats.JASP.desktop', primary: true, validate: M.validateAppRow });
const fr = FP.rowOf(fe, parsed.ok ? parsed.row : null);
ok(parsed.ok && fr.exec === '/usr/bin/flatpak' && fr.args.includes('org.jaspstats.JASP') && fr.icon === 'org.jaspstats.JASP' && fr.id === 'app.jasp', `the exported desktop file is the row (${JSON.stringify(fr).slice(0, 220)})`);
eq(FP.rowOf({ ...fe, noDesktop: true }).args, ['run', 'org.jaspstats.JASP'], 'no desktop file ⇒ flatpak run <appId>');
eq(FP.parseSearch('org.jaspstats.JASP\tJASP\tStatistics\nbad\tx\ty\n'), [{ appId: 'org.jaspstats.JASP', name: 'JASP', description: 'Statistics' }], 'flatpak search columns');
const re = { id: 'jasp-cli', kind: 'registered', label: 'Jasp CLI', launch: [{ id: 'default', label: 'Open', exec: 'jasp', args: [] }] };
ok(A.removePlanFor(re).ok && A.removePlanFor(re).homeArgv === null, 'a registered app without a recipe: only its record goes');
eq(A.removePlanFor({ ...re, remove: { exec: 'pipx', args: ['uninstall', 'jasp'] } }).homeArgv, ['pipx', 'uninstall', 'jasp'], 'its own remove recipe');
const nm = A.validateManifest({ v: 1, entries: [{ ...good.entry, id: 'jasp', packages: [], by: { kind: 'agent', conversation: 'c1' }, registered: { session: 's1', at: 5 } }, { ...fe, id: 'jasp-fp', packages: [], by: { kind: 'agent' } }] });
ok(nm.ok && nm.manifest.entries[0].launch.length === 2 && nm.manifest.entries[0].registered.who === 'agent' && nm.manifest.entries[1].appId === 'org.jaspstats.JASP', `the index keeps both kinds (${JSON.stringify(nm).slice(0, 200)})`);

sec('⑥ the witness exclusion: a registered / flatpak row covers what the witness lists');
const flist = [{ appId: 'org.jaspstats.JASP', name: 'JASP', scope: 'user' }, { appId: 'org.gimp.GIMP', name: 'GIMP', scope: 'user' }];
const dlist = [{ path: '/home/u/.local/share/applications/jasp.desktop', scope: 'user', text: '[Desktop Entry]\nType=Application\nName=JASP desk\nExec=/opt/jasp/bin/JASP\n' }];
const before = AW.witnessRows({ flatpaks: flist, desktops: dlist, catalog: [], validate: M.validateAppRow, parse: A.parseDesktopFile });
const regRow = RG.rowOf({ id: 'jasp-desk', label: 'JASP desk', launch: [{ id: 'default', label: 'Open', exec: '/opt/jasp/bin/JASP', args: [] }], witness: null });
const after = AW.witnessRows({ flatpaks: flist, desktops: dlist, catalog: [fr, regRow], validate: M.validateAppRow, parse: A.parseDesktopFile });
eq(before.map((r) => r.id).sort(), ['seen.d.jasp', 'seen.f.org.gimp.gimp', 'seen.f.org.jaspstats.jasp'], 'before: 3 witnessed rows');
eq(after.map((r) => r.id), ['seen.f.org.gimp.gimp'], 'after: the flatpak (same appId) and the desktop entry (same Exec) are no second row');

sec('⑦ the launch door: variant (default variants[0]), an unknown variant refused by name');
const reg = [{ ...RG.rowOf({ id: 'jasp', label: 'JASP', launch: good.entry.launch }), available: true }];
const lv = M.validateLaunchRequest({ appId: 'app.jasp', variant: 'safe-mode' }, reg);
ok(lv.ok && lv.launch.row.args.includes('--safe-mode') && lv.launch.row.variant === 'safe-mode', 'variant safe-mode runs its own argv');
ok(M.validateLaunchRequest({ appId: 'app.jasp' }, reg).launch.row.args.join(' ') === 'run org.jaspstats.JASP', 'no variant ⇒ the default');
const lb = M.validateLaunchRequest({ appId: 'app.jasp', variant: 'nope' }, reg);
ok(!lb.ok && lb.code === 'bad-request', 'an unknown variant is refused');

sec('⑧ in-process machine half (scratch HOME, stub flatpak on PATH): add --kind flatpak record, witness-match direct record, not_witnessed');
const AS = require(path.join(ROOT, 'src/app-serve.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-app-register-'));
const home = path.join(tmp, 'home'), bin = path.join(tmp, 'bin'), state = path.join(tmp, 'state');
for (const d of [home, bin, state, path.join(home, '.local/share/flatpak/app/org.jaspstats.JASP'), path.join(home, '.local/share/flatpak/exports/share/applications'), path.join(home, '.local/share/applications'), path.join(home, 'opt')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(bin, 'flatpak'), '#!/bin/sh\nif [ "$1" = list ]; then case "$*" in *--user*) printf "org.jaspstats.JASP\\tJASP\\t0.19\\n";; esac; fi\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(home, 'opt/tool'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(home, '.local/share/flatpak/exports/share/applications/org.jaspstats.JASP.desktop'), `[Desktop Entry]\nType=Application\nName=JASP\nExec=${bin}/flatpak run --branch=stable org.jaspstats.JASP\n`);
const envx = { PATH: `${bin}:/usr/bin:/bin`, HOME: home };
const runner = (cmd, args, opts = {}) => new Promise((r) => { const cp = require('child_process'); cp.execFile(cmd, args, { env: opts.env || envx, timeout: opts.timeout || 5000 }, (e, so, se) => r({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout: String(so), stderr: String(se) })); });
const apps = AS.create({ home, stateDir: state, env: () => envx, log: { log() { }, warn() { } }, runner, witnessDirs: { system: path.join(tmp, 'nosys'), flatpakSystem: path.join(tmp, 'nofp') }, engineIds: () => ['xterm'] });
const flat = await AS.runAppOp(apps, 'app-install', { kind: 'flatpak', name: 'org.jaspstats.JASP', remote: 'flathub', by: { kind: 'agent', conversation: 'c1' }, why: 'stats' });
ok(flat.ok && flat.entry.kind === 'flatpak' && flat.entry.label === 'JASP' && flat.rows[0] && flat.rows[0].exec === `${bin}/flatpak`, `add --kind flatpak recorded + its row from the exported desktop file (${JSON.stringify(flat).slice(0, 260)})`);
const miss = await AS.runAppOp(apps, 'app-install', { kind: 'flatpak', name: 'org.example.Missing', by: { kind: 'agent' } });
ok(!miss.ok && miss.code === 'not_recorded', `a Flatpak that is not installed is not recorded (${miss.code})`);
await apps.refreshWitness({ reason: 'recheck' });
ok(!apps.witnessRows().some((r) => r.flatpak === 'org.jaspstats.JASP'), 'the recorded Flatpak is no witnessed row any more');
const un = await AS.runAppOp(apps, 'app-install', { kind: 'registered', entry: { label: 'Tool', launch: [{ exec: path.join(home, 'opt/tool') }] }, by: { kind: 'agent', conversation: 'c1' }, direct: true });
ok(!un.ok && un.code === 'not_witnessed', `an unknown exec is never recorded directly (${un.code})`);
fs.writeFileSync(path.join(home, '.local/share/applications/tool.desktop'), `[Desktop Entry]\nType=Application\nName=Tool\nExec=${path.join(home, 'opt/tool')}\n`);
await apps.refreshWitness({ reason: 'recheck' });
const pl = await AS.runAppOp(apps, 'app-plan', { kind: 'registered', entry: { label: 'Tool', launch: [{ exec: path.join(home, 'opt/tool') }, { label: 'Verbose', exec: path.join(home, 'opt/tool'), args: ['-v'] }], remove: { exec: 'sudo', args: ['rm', 'x'] } } });
ok(pl.ok && pl.plan.ok === false && pl.plan.code === 'needs_root', `a sudo recipe refused at plan (${JSON.stringify(pl.plan).slice(0, 160)})`);
const dir = await AS.runAppOp(apps, 'app-install', { kind: 'registered', entry: { label: 'Tool', launch: [{ exec: path.join(home, 'opt/tool') }, { label: 'Verbose', exec: path.join(home, 'opt/tool'), args: ['-v'] }] }, by: { kind: 'agent', conversation: 'c1' }, direct: true, session: 's1' });
ok(dir.ok && dir.witnessed === 'seen.d.tool' && dir.rows[0].registered && dir.rows[0].launch.length === 2 && dir.rows[0].source === 'desktop-user', `a witnessed declaration recorded directly (${JSON.stringify(dir).slice(0, 300)})`);
await apps.refreshWitness({ reason: 'recheck' });
ok(!apps.witnessRows().some((r) => r.id === 'seen.d.tool'), 'its desktop entry is no witnessed row any more');
const st = await apps.status();
eq(st.reinstall, [], 'nothing gone ⇒ no reinstall rung');
fs.rmSync(path.join(home, '.local/share/flatpak/app/org.jaspstats.JASP'), { recursive: true });
const st2 = await apps.status();
ok(st2.reinstall.length === 1 && st2.reinstall[0].click === 'user' && st2.reinstall[0].words === 'reinstall: flatpak install --user -y flathub org.jaspstats.JASP', `a gone Flatpak = a USER-CLICK reinstall rung (${JSON.stringify(st2.reinstall)})`);
const rm = await AS.runAppOp(apps, 'app-remove', { entryId: dir.entry.id, home: true });
ok(rm.ok && !(await apps.readManifest()).manifest.entries.some((e) => e.id === dir.entry.id), 'remove of a registered app without a recipe drops its record');
fs.rmSync(tmp, { recursive: true, force: true });

sec('⑨ the ENGINE over the real machine half (int254): register → For-you proposal → accept → recorded; witnessed ⇒ direct; sudo ⇒ needs_root; remove = a proposal → accept runs the recipe');
{
  const E = require(path.join(ROOT, 'src/server/apps-engine.js'));
  const UT = require(path.join(ROOT, 'src/user-todos.js'));
  const { UserTodoManager } = UT.UserTodoManager ? UT : { UserTodoManager: UT };
  const crypto = require('crypto');
  const t9 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-app-register-e-'));
  const h9 = path.join(t9, 'home'), b9 = path.join(t9, 'bin'), s9 = path.join(t9, 'state'), d9 = path.join(t9, 'data');
  for (const d of [h9, b9, s9, d9, path.join(h9, '.local/share/flatpak/app'), path.join(h9, '.local/share/flatpak/exports/share/applications'), path.join(h9, '.local/share/applications'), path.join(h9, 'opt')]) fs.mkdirSync(d, { recursive: true });
  // the machine's programs are STUBS on the scratch PATH: flatpak lists JASP for the user; the remove recipe writes what it was given
  fs.writeFileSync(path.join(b9, 'flatpak'), '#!/bin/sh\nif [ "$1" = list ] && [ -d "$HOME/.local/share/flatpak/app/org.jaspstats.JASP" ]; then case "$*" in *--user*) printf "org.jaspstats.JASP\\tJASP\\t0.19\\n";; esac; fi\nexit 0\n', { mode: 0o755 });
  const ranFile = path.join(t9, 'recipe-ran');
  fs.writeFileSync(path.join(b9, 'tool-uninstall'), `#!/bin/sh\nprintf '%s\\n' "$*" > '${ranFile}'\nexit 0\n`, { mode: 0o755 });
  for (const x of ['apt-get', 'dpkg']) fs.writeFileSync(path.join(b9, x), '#!/bin/sh\n[ "$1" = --print-architecture ] && echo amd64\nexit 0\n', { mode: 0o755 }); // an apt machine's facts (stubs; nothing runs apt)
  const tool = path.join(h9, 'opt/tool');
  fs.writeFileSync(tool, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(h9, '.local/share/flatpak/exports/share/applications/org.jaspstats.JASP.desktop'), `[Desktop Entry]\nType=Application\nName=JASP\nExec=${b9}/flatpak run --branch=stable org.jaspstats.JASP\n`);
  const env9 = { PATH: `${b9}:/usr/bin:/bin`, HOME: h9 };
  const run9 = (cmd, args, opts = {}) => new Promise((r) => { require('child_process').execFile(cmd, args, { env: opts.env || env9, timeout: opts.timeout || 5000 }, (e, so, se) => r({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout: String(so), stderr: String(se) })); });
  const apps9 = AS.create({ home: h9, stateDir: s9, env: () => env9, log: { log() { }, warn() { } }, runner: run9, witnessDirs: { system: path.join(t9, 'nosys'), flatpakSystem: path.join(t9, 'nofp') }, engineIds: () => ['xterm'], binOnPath: (x) => (fs.existsSync(path.join(b9, x)) ? path.join(b9, x) : null) }); // desktop-serve passes binOnPath (scratch bin only here)
  // the hub's access to THIS machine, the shape of src/server/desktop-access.js call(): one app op; its own {ok:false} thrown
  const ops = [];
  const access9 = {
    async call(host, op, params = {}) { ops.push(op); const r = await AS.runAppOp(apps9, op, params); if (!r || r.ok === false) throw Object.assign(new Error((r && r.error) || op), { code: (r && r.code) || 'op_failed' }); return r; },
    async installPackage() { throw Object.assign(new Error('no package slot in this leg'), { code: 'bad-request' }); },
    planDigest: (pl) => (pl && pl.ok ? crypto.createHash('sha256').update(JSON.stringify({ commands: pl.commands || [], closure: pl.closureKey || null })).digest('hex').slice(0, 32) : null),
  };
  const todos = new UserTodoManager({ dataDir: d9, onChange: () => { }, expirySweepMs: 0 });
  const stash = new Map();
  const deliver = { stashFor: (cid, e) => { stash.set(cid, [...(stash.get(cid) || []), e]); return { stored: true }; }, stashEntries: (cid) => (stash.get(cid) || []).slice(), drainStash: (cid, only) => { const l = stash.get(cid) || []; stash.set(cid, l.filter((e) => !only.has(e))); return l.filter((e) => only.has(e)); } };
  const S1 = { agentToken: 'vsst_s1', claudeSessionId: '11111111-1111-4111-8111-111111111111', name: 'Session One', backend: 'claude' };
  const key1 = `claude:${S1.claudeSessionId}`;
  const eng = E.create({ access: access9, userTodos: todos, deliver, activeSessions: () => new Map([['w1', S1]]), sessionStatusKey: () => key1, broadcast: () => { }, dataDir: d9, log: { log() { }, warn() { }, error() { } } });
  const by = { kind: 'agent', sessionId: 'w1', conversation: S1.claudeSessionId, name: S1.name, sessionKey: key1 };
  const items = () => todos.snapshot().open.filter((i) => i.action && i.action.type === 'app-install');
  const entries = async () => (await apps9.readManifest()).manifest.entries;
  const err = (p) => p.then(() => null, (e) => e);
  // an app op re-lists the witness in the BACKGROUND and a recheck joins a listing in flight: settle it, then list afresh
  const relist = async () => { await apps9.refreshWitness({ reason: 'recheck' }); await apps9.refreshWitness({ reason: 'recheck' }); };

  // (a) an UNWITNESSED exec ⇒ a proposal: ONE For-you item, nothing recorded, nothing installed
  const decl = { label: 'Tool', launch: [{ exec: tool }, { label: 'Verbose', exec: tool, args: ['-v'] }], remove: { exec: 'tool-uninstall', args: ['--all', 'my tool'] } };
  const r1 = await eng.register({ host: 'local', entry: decl, why: 'you asked for it', by });
  ok(r1.ok && r1.waiting === true && r1.recorded === false && /^ap-/.test(r1.proposalId) && r1.entryId === 'tool', `an unwitnessed declaration waits for the owner (${JSON.stringify(r1)})`);
  const it1 = items();
  ok(it1.length === 1 && it1[0].action.id === r1.proposalId && it1[0].action.kind === 'registered' && it1[0].sessionKey === key1 && it1[0].text === `Session One registered Tool: Open (default): ${tool}` && it1[0].i18n.text.key === E.WORDS.registers, `ONE For-you item names the agent, the app and its command (${JSON.stringify(it1.map((i) => [i.text, i.action]))})`);
  ok(it1.length === 1 && /^Why: you asked for it$/m.test(it1[0].detail) && it1[0].detail.includes(`Verbose: ${tool} -v`) && /^remove: tool-uninstall --all .my tool.$/m.test(it1[0].detail), `the item's detail shows every variant + the recipe as a person reads it (${JSON.stringify(it1[0] && it1[0].detail)})`);
  ok(!(await entries()).some((e) => e.id === 'tool') && !ops.includes('app-install'), `nothing recorded before the click (ops ${ops.join(',')})`);
  // the owner's Accept = the run of the proposal with the digest it was shown
  const shown1 = await eng.planProposal(r1.proposalId);
  ok(shown1.plan && shown1.plan.ok && shown1.digest && !shown1.plan.witnessed, 'the dialog opened from the item re-plans it on the machine (still not witnessed)');
  const out1 = await eng.run({ proposalId: r1.proposalId, expectDigest: shown1.digest });
  const e1 = (await entries()).find((e) => e.id === 'tool');
  ok(out1 && out1.done && e1 && e1.kind === 'registered' && e1.launch.length === 2 && e1.launch[1].id === 'verbose' && e1.launch[1].args.join(' ') === '-v' && e1.by.kind === 'agent' && e1.by.conversation === S1.claudeSessionId && e1.registered && e1.registered.session === 'w1', `Accept ⇒ the entry is recorded with both variants, proposed by that conversation (${JSON.stringify(e1).slice(0, 400)})`);
  const row1 = (await apps9.refreshCatalog()).find((r) => r.app === 'tool');
  ok(row1 && row1.id === 'app.tool' && row1.registered && row1.launch.length === 2 && row1.remove && row1.remove.exec === 'tool-uninstall', `…and its catalog row carries every variant + the recipe (${JSON.stringify(row1).slice(0, 300)})`);
  ok(eng.get(r1.proposalId).state === 'done' && todos.get(it1[0].id).status === 'done' && items().length === 0, 'the proposal is done and its For-you item resolved');
  // a desktop entry for the same Exec appears later: it is no second ("outside VibeSpace") row
  fs.writeFileSync(path.join(h9, '.local/share/applications/tool.desktop'), `[Desktop Entry]\nType=Application\nName=Tool\nExec=${tool}\n`);
  await relist();
  ok(!apps9.witnessRows().some((r) => r.exec === tool), `the witness no longer lists what the registered row covers (${JSON.stringify(apps9.witnessRows().map((r) => r.id))})`);

  // (b) a WITNESSED flatpak id ⇒ recorded directly, no item — judged on the listing that is DUE: the agent's `flatpak install
  // --user` ran just before it registers (no listing since), and an 'open' answers from the last list without waiting
  await relist();
  ok(!apps9.witnessRows().some((r) => r.flatpak === 'org.jaspstats.JASP'), 'JASP is not installed yet: nothing lists it');
  fs.mkdirSync(path.join(h9, '.local/share/flatpak/app/org.jaspstats.JASP')); // the agent's install landed — the witness has not re-listed
  const n0 = todos.snapshot().open.length;
  const r2 = await eng.register({ host: 'local', entry: { label: 'JASP', launch: [{ exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] }, { label: 'Safe mode', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP', '--safe-mode'] }] }, why: 'stats', by });
  ok(r2.ok && r2.recorded === true && r2.waiting === false && !r2.proposalId && r2.witnessed === 'seen.f.org.jaspstats.jasp', `a witnessed flatpak is recorded directly (${JSON.stringify(r2)})`);
  ok(todos.snapshot().open.length === n0 && items().length === 0, 'no For-you item for it');
  const e2 = (await entries()).find((e) => e.id === r2.entryId);
  ok(e2 && e2.kind === 'registered' && e2.witness === 'flatpak:org.jaspstats.JASP' && e2.launch.length === 2, `its entry names the witness it matched (${JSON.stringify(e2).slice(0, 300)})`);
  await relist();
  ok(!apps9.witnessRows().some((r) => r.flatpak === 'org.jaspstats.JASP'), 'the witness no longer lists the Flatpak the registered row covers');

  // (c) a recipe naming sudo ⇒ needs_root on BOTH paths (proposal and direct) and at the owner's Adopt; nothing filed or recorded
  const before = JSON.stringify(await entries()), open0 = todos.snapshot().open.length;
  const sudoRm = { exec: 'sudo', args: ['rm', '-rf', '/opt/x'] };
  const c1 = await err(eng.register({ host: 'local', entry: { label: 'Other', launch: [{ exec: tool, args: ['--other'] }], remove: sudoRm }, by }));
  const c2 = await err(eng.register({ host: 'local', entry: { label: 'JASP 2', launch: [{ exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] }], remove: sudoRm }, by }));
  const c3 = await err(eng.adopt('local', { label: 'Other', launch: [{ exec: tool }], reinstall: { exec: 'pkexec', args: ['x'] } }));
  ok(c1 && c1.code === 'needs_root' && c2 && c2.code === 'needs_root' && c3 && c3.code === 'needs_root', `needs_root by name: proposal path ${c1 && c1.code}, direct path ${c2 && c2.code}, Adopt ${c3 && c3.code}`);
  ok(JSON.stringify(await entries()) === before && todos.snapshot().open.length === open0, 'nothing recorded, nothing filed');

  // (d) remove of a registered row ⇒ a proposal ⇒ Accept runs ITS recipe (the PATH stub, as the user) and the row leaves
  const p4 = await eng.propose({ host: 'local', request: { kind: 'remove', entryId: 'tool' }, why: 'tidy up', by });
  const it4 = items();
  ok(p4.state === 'proposed' && it4.length === 1 && it4[0].action.id === p4.id && it4[0].text === 'Session One wants to remove Tool', `remove = ONE For-you item (${JSON.stringify(it4.map((i) => i.text))})`);
  ok(!fs.existsSync(ranFile) && (await entries()).some((e) => e.id === 'tool'), 'the recipe has not run before the click');
  const shown4 = await eng.planProposal(p4.id);
  ok(shown4.plan.mode === 'home-remove' && JSON.stringify(shown4.plan.commands) === JSON.stringify(['tool-uninstall --all my tool']), `the dialog shows the recipe that will run (${JSON.stringify(shown4.plan.commands)})`);
  await eng.run({ proposalId: p4.id, expectDigest: shown4.digest });
  ok(fs.existsSync(ranFile) && fs.readFileSync(ranFile, 'utf8') === '--all my tool\n', `Accept ran the registered recipe with its own argv (${fs.existsSync(ranFile) ? JSON.stringify(fs.readFileSync(ranFile, 'utf8')) : 'never ran'})`);
  ok(!(await entries()).some((e) => e.id === 'tool') && !(await apps9.refreshCatalog()).some((r) => r.app === 'tool') && (await entries()).some((e) => e.id === r2.entryId), 'the row left (JASP stays)');
  ok(eng.get(p4.id).state === 'done' && todos.get(it4[0].id).status === 'done', 'the remove proposal is done and its item resolved');
  fs.rmSync(t9, { recursive: true, force: true });
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nall ${n} passed`);
process.exit(fails ? 1 : 0);
