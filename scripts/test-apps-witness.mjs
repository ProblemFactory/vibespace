#!/usr/bin/env node
// test-apps-witness — WHAT IS INSTALLED, BY WITNESS (lane apps-launcher-witness, owner 2026-10-11: an agent's
// `flatpak install --user org.jaspstats.JASP` never reached the hub's Apps launcher). DOM-free, in-process:
//   §1 the PURE readers (src/app-witness.js): `flatpak list` (JASP's real row, a header, garbage), a .desktop entry
//      (Terminal, NoDisplay, a malformed file never throws), the XDG rule (the user's file of a name decides)
//   §2 THE GROUP RULE: a witnessed row lives in its own `seen.` namespace — an entry named like an engine app stays out
//      of the engine's rows, the engine's own files / flatpaks are not listed twice; RED CONTROL: a merged list is caught
//   §3 the refresh rule (open / changed / stale / install / helper / recheck)
//   §4 the machine half (src/app-serve.js refreshWitness): a stub `flatpak` runner + fixture directories → the rows, the
//      file, one listing per change (a fresh open lists nothing), a FIFO in the directory never blocks, the budget
//   §5 the registry (src/desktop-serve.js): witnessed rows beside the engine's, a gone program stays listed and says so,
//      the launch door accepts a witnessed row by id
//   §6 THE PLACE WORDS: the door's card and the helper's outcome name the machine (en / zh / ja)
//   §7 lane apps-dialog-fast: the scope rule (outside the base, never the distro), `dpkg -S`, openAnswer, an open that
//      never waits for a slow walk + the push when it lands, Check again waits, tookMs/scope in the file, the status line
// Run: node scripts/test-apps-witness.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../src/app-witness.js');
const M = require('../src/desktop-apps.js');
const AS = require('../src/app-serve.js');
const T0 = Date.now();
let pass = 0, fail = 0;
const A = require('../src/app-manifest.js');
const P = { parse: A.parseDesktopFile };
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : ''}`); } };
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
const tFor = (dict) => (s, p) => fill(dict ? (dict[s] ?? s) : s, p);
const de = (o) => ['[Desktop Entry]', 'Type=Application', ...Object.entries(o).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n';
const JASP_LINE = 'org.jaspstats.JASP\tJASP\t0.98.1'; // `flatpak list --app --user --columns=application,name,version` on linux-box-hub, 2026-10-11

console.log('§1 the readers');
{
  const f = W.parseFlatpakList(`Application ID\tName\tVersion\n${JASP_LINE}\n\nnot an id\tX\n\u0000\t\t\norg.gimp.GIMP\tGNU Image Manipulation Program\t3.0.4\n${JASP_LINE}\n`, { scope: 'user' });
  ok(f.length === 2 && f[0].appId === 'org.jaspstats.JASP' && f[0].name === 'JASP' && f[0].version === '0.98.1' && f[0].scope === 'user', 'flatpak list: JASP\'s row read; the header, a blank, garbage and a repeat skipped', f);
  ok(W.parseFlatpakList('', {}).length === 0 && W.parseFlatpakList(null).length === 0 && W.parseFlatpakList('org.a.B', { scope: 'system' })[0].scope === 'system', 'flatpak list: empty / null / a bare id (system scope)');
  const term = W.desktopWitness(de({ Name: 'Htop', Exec: 'htop', Terminal: 'true' }), { path: '/home/u/.local/share/applications/htop.desktop', validate: M.validateAppRow, ...P });
  ok(term.ok && term.row.exec === 'xterm' && term.row.args.join(' ') === '-e htop' && term.row.id === 'seen.d.htop' && term.row.source === 'desktop-user' && term.row.witnessed === true, 'a Terminal=true entry runs in xterm -e; its id is seen.d.<file>', term);
  ok(W.desktopWitness(de({ Name: 'Hidden', Exec: 'h', NoDisplay: 'true' }), { path: '/x/h.desktop', ...P }).skip === 'no-display' && W.desktopWitness(de({ Name: 'x', Exec: 'x' }), { path: '/x/x.desktop' }).error === 'no desktop-file reader', 'a NoDisplay entry is no row');
  let threw = null, results = [];
  try { for (const t of ['\u0000\u0001garbage', '[Desktop Entry]\nType=Application\nExec="unterminated\n', 'Exec=no section\n', '[Desktop Entry]\nType=Link\nURL=x\n', '', null, de({ Name: 'x'.repeat(5000), Exec: '/bin/true' })]) results.push(W.desktopWitness(t, { path: '/x/y.desktop', validate: M.validateAppRow, ...P })); } catch (e) { threw = e; }
  ok(!threw && results.slice(0, 6).every((r) => !r.ok) && results[6].ok && results[6].row.label.length <= 80, 'a malformed .desktop never throws (garbage, broken quoting, no section, a Link, empty, null); a long name is cut', threw ? String(threw) : results.map((r) => r.skip || r.error || 'ok'));
  const fpd = W.desktopWitness(de({ Name: 'JASP', Exec: '/usr/bin/flatpak run --branch=stable --arch=x86_64 --command=JASP org.jaspstats.JASP %U' }), { path: '/x/org.jaspstats.JASP.desktop', ...P });
  ok(fpd.ok && fpd.row.flatpak === 'org.jaspstats.JASP', 'an exported flatpak entry names its flatpak (flatpakOf)', fpd);
  const xdg = W.witnessRows({ desktops: [
    { path: '/usr/share/applications/foo.desktop', scope: 'system', text: de({ Name: 'Foo (system)', Exec: 'foo' }) },
    { path: '/h/.local/share/applications/foo.desktop', scope: 'user', text: de({ Name: 'Foo (mine)', Exec: 'foo --mine' }) },
    { path: '/usr/share/applications/bar.desktop', scope: 'system', text: de({ Name: 'Bar', Exec: 'bar' }) },
    { path: '/h/.local/share/applications/bar.desktop', scope: 'user', text: de({ Name: 'Bar', Exec: 'bar', NoDisplay: 'true' }) },
  ], validate: M.validateAppRow, ...P });
  ok(xdg.length === 1 && xdg[0].label === 'Foo (mine)' && xdg[0].source === 'desktop-user', 'the XDG rule: the user\'s file of a name hides the system one (a NoDisplay one too)', xdg);
}

console.log('§2 the group rule');
const ENGINE = [{ id: 'app.gimp', label: 'GIMP', exec: 'gimp', args: [], desktop: '/usr/share/applications/gimp.desktop', app: 'gimp' }, { id: 'app.kdenlive', label: 'Kdenlive', exec: 'flatpak', args: ['run', 'org.kde.kdenlive'], app: 'kdenlive' }];
const FIX = {
  flatpaks: [...W.parseFlatpakList(JASP_LINE, { scope: 'user' }), ...W.parseFlatpakList('org.kde.kdenlive\tKdenlive\t25.08\norg.jaspstats.JASP\tJASP\t0.98.1', { scope: 'system' })],
  desktops: [
    { path: '/usr/share/applications/gimp.desktop', scope: 'system', text: de({ Name: 'GIMP', Exec: 'gimp %U' }) },
    { path: '/h/.local/share/applications/fake-gimp.desktop', scope: 'user', text: de({ Name: 'GIMP', Exec: '/tmp/evil.sh' }) },
    { path: '/h/.local/share/applications/org.jaspstats.JASP.desktop', scope: 'user', text: de({ Name: 'JASP', Exec: 'flatpak run org.jaspstats.JASP' }) },
    { path: '/h/.local/share/applications/notes.desktop', scope: 'user', text: de({ Name: 'Notes', Exec: '/opt/notes/notes' }) },
  ],
};
/** THE group predicate the launcher relies on: every row witnessed, in `seen.`, no id an engine row has, and no
 *  engine row's own file or flatpak listed again. */
const groupOk = (rows, catalog) => rows.every((r) => r.witnessed === true && r.id.startsWith(W.WITNESS_PREFIX) && !catalog.some((c) => c.id === r.id)) && !rows.some((r) => catalog.some((c) => (c.desktop && c.desktop === r.desktop) || (W.flatpakOf(c) && W.flatpakOf(c) === r.flatpak)));
{
  const rows = W.witnessRows({ ...FIX, catalog: ENGINE, validate: M.validateAppRow, ...P });
  const ids = rows.map((r) => r.id);
  ok(groupOk(rows, ENGINE), 'every witnessed row is in its own group (seen.*, witnessed, never an engine id, never an engine file or flatpak again)', ids);
  const fake = rows.find((r) => r.desktop === '/h/.local/share/applications/fake-gimp.desktop');
  ok(fake && fake.label === 'GIMP' && fake.id === 'seen.d.fake-gimp' && fake.exec === '/tmp/evil.sh', 'a user entry named like the engine\'s GIMP stays in the witnessed group — its own id, its Exec shown as written', fake);
  ok(ids.includes('seen.f.org.jaspstats.jasp') && rows.filter((r) => r.flatpak === 'org.jaspstats.JASP').length === 1 && rows.find((r) => r.flatpak === 'org.jaspstats.JASP').source === 'flatpak-user', 'JASP is listed ONCE, as the user flatpak (its system copy and its exported entry fold into it)', ids);
  ok(!ids.some((i) => /kdenlive/.test(i)) && !rows.some((r) => r.desktop === '/usr/share/applications/gimp.desktop'), 'the engine\'s own Kdenlive flatpak and GIMP file are not listed again');
  // RED CONTROL: a MERGED list (the witnessed entries read as engine rows — the app-manifest reader's own ids) is caught
  const merged = FIX.desktops.map((d) => A.parseDesktopFile(d.text, { entry: 'gimp', path: d.path, primary: true })).filter((r) => r.ok).map((r) => r.row);
  ok(!groupOk(merged, ENGINE) && merged.some((r) => r.id === 'app.gimp'), 'RED CONTROL: entries merged into the engine\'s namespace (app.gimp shadowing the engine\'s GIMP) fail the group rule', merged.map((r) => r.id));
  const many = W.witnessRows({ flatpaks: Array.from({ length: 400 }, (_, i) => ({ appId: `org.x.App${i}`, name: `App ${i}`, scope: 'user' })) });
  ok(many.length === W.WITNESS_MAX, `the group is bounded (${W.WITNESS_MAX} rows)`, many.length);
}

console.log('§3 the refresh rule');
{
  const T = 1_000_000_000_000, V = (o) => W.refreshVerdict({ now: T, ...o });
  const table = [[{ listedAt: null }, true, 'never-listed'], [{ listedAt: T - 1000, sig: 'a', sigNow: 'a' }, false, 'fresh'], [{ listedAt: T - 1000, sig: 'a', sigNow: 'b' }, true, 'changed'], [{ listedAt: T - W.WITNESS_REFRESH_MS, sig: 'a', sigNow: 'a' }, true, 'stale'], [{ listedAt: T - 1000, sig: 'a', sigNow: 'a', reason: 'install' }, true, 'install'], [{ listedAt: T - 1000, sig: 'a', sigNow: 'a', reason: 'helper' }, true, 'helper'], [{ listedAt: T - 1000, sig: 'a', sigNow: 'a', reason: 'recheck' }, true, 'recheck']];
  const bad = table.filter(([o, due, why]) => { const v = V(o); return v.due !== due || v.why !== why; });
  ok(!bad.length && W.WITNESS_REFRESH_MS === 600000, 'open: never-listed / changed directory / every 10 min re-list, else fresh; install / helper / recheck re-list at once', bad);
}

console.log('§4 the machine half');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-witness-'));
const dirs = { user: path.join(tmp, 'home/.local/share/applications'), system: path.join(tmp, 'usr/share/applications'), flatpakUser: path.join(tmp, 'home/.local/share/flatpak/app'), flatpakSystem: path.join(tmp, 'var/lib/flatpak/app') };
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(dirs.user, 'notes.desktop'), de({ Name: 'Notes', Exec: '/opt/notes/notes' }));
fs.writeFileSync(path.join(dirs.user, 'hidden.desktop'), de({ Name: 'Hidden', Exec: 'h', NoDisplay: 'true' }));
fs.writeFileSync(path.join(dirs.system, 'calc.desktop'), de({ Name: 'Calculator', Exec: 'gnome-calculator' }));
fs.writeFileSync(path.join(dirs.system, 'broken.desktop'), '\u0000\u0001[[[');
execFileSync('mkfifo', [path.join(dirs.user, 'zz-fifo.desktop')]);
const calls = [];
const runner = async (cmd, args, o) => { calls.push([cmd, ...args].join(' ')); if (cmd !== 'flatpak') return { code: 127, stdout: '', stderr: 'no' }; return args.includes('--user') ? { code: 0, stdout: `${JASP_LINE}\n`, stderr: '' } : { code: 0, stdout: '', stderr: '' }; };
let clock = 2_000_000_000_000;
const apps = AS.create({ home: path.join(tmp, 'home'), stateDir: path.join(tmp, 'data'), env: { PATH: '/usr/bin:/bin', HOME: path.join(tmp, 'home') }, log: { warn() { }, info() { } }, runner, now: () => clock, witnessDirs: dirs, markerDir: path.join(tmp, 'no-base') });
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
{
  const t0 = Date.now();
  await apps.refreshWitness({ reason: 'open' }); await apps.witnessSettled(); // lane apps-dialog-fast: an open never waits — the listing settles on its own
  const v = apps.witnessView();
  const ms = Date.now() - t0;
  const rows = apps.witnessRows();
  ok(v.count === 2 && v.hidden === 1 && v.flatpak === true && rows.map((r) => r.label).join('|') === 'JASP|Notes|Calculator', 'the first open lists JASP (the user flatpak) + the two desktop entries — the user\'s own first (NoDisplay, a broken file, a FIFO skipped)', { v, rows: rows.map((r) => r.id) });
  ok(ms < W.WITNESS_BUDGET_MS && calls.filter((c) => c.startsWith('flatpak list --app')).length === 2 && calls.filter((c) => !c.startsWith('flatpak list --app')).length === 1 && calls.some((c) => /^dpkg -S .*\/calc\.desktop/.test(c)) && calls.every((c) => !/install|uninstall|update/.test(c)), `inside the budget (${ms} ms) — two read-only \`flatpak list\` children + ONE \`dpkg -S\` over the system entries, nothing else`, calls);
  const file = JSON.parse(fs.readFileSync(path.join(tmp, 'data', W.WITNESS_FILE), 'utf8'));
  ok(file.rows.length === 3 && file.listedAt === clock && typeof file.sig === 'string', `cached in data/${W.WITNESS_FILE} with listedAt + the directories' signature`);
  const n0 = calls.length;
  clock += 60_000; await apps.refreshWitness({ reason: 'open' });
  ok(calls.length === n0, 'a second open a minute later lists nothing (fresh, nothing changed)', calls.slice(n0));
  fs.mkdirSync(path.join(dirs.flatpakUser, 'org.example.New'));
  await new Promise((r) => setTimeout(r, 15));
  clock += 1000; await apps.refreshWitness({ reason: 'open' }); await apps.witnessSettled();
  ok(calls.length === n0 + 3, 'a new flatpak directory (an install around the door) re-lists at the next open', calls.slice(n0));
  const n1 = calls.length; await apps.refreshWitness({ reason: 'recheck' });
  ok(calls.length === n1 + 3, 'Check again re-lists at once');
  const apps2 = AS.create({ home: path.join(tmp, 'home'), stateDir: path.join(tmp, 'data'), env: {}, log: { warn() { } }, runner: async () => { throw new Error('must not run'); }, now: () => clock, witnessDirs: dirs });
  const v2 = await apps2.refreshWitness({ reason: 'open' });
  ok(v2.count === 2 && v2.hidden === 1 && apps2.witnessRows().length === 3, 'a restarted machine half serves the file\'s list (fresh: no child)', v2);
  const r = await AS.runAppOp({ ...apps, plan: async () => ({}), recordUserKind: async () => ({ entry: { id: 'x' } }), refreshWitness: async (o) => { calls.push(`refresh:${o.reason}`); return apps.refreshWitness(o); } }, 'app-install', { kind: 'uv-tool', name: 'x', why: 'w', by: 'user' });
  await new Promise((r2) => setTimeout(r2, 5));
  ok(r.ok && calls.includes('refresh:install'), 'an install through the door re-lists what is installed (runAppOp)', r);
}

console.log('§5 the registry and the launch door');
{
  const DS = require('../src/desktop-serve.js');
  const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'flatpak'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const ds = DS.install({ dataDir: path.join(tmp, 'ds'), env: { PATH: `${bin}:/usr/bin:/bin`, HOME: path.join(tmp, 'home') }, apps, log: { warn() { }, info() { }, log() { } } });
  try {
    const reg = ds.registry({ bins: {} });
    const seen = reg.filter((r) => r.witnessed);
    const jasp = seen.find((r) => r.flatpak === 'org.jaspstats.JASP'), notes = seen.find((r) => r.label === 'Notes');
    ok(seen.length === 3 && reg.slice(0, reg.length - 3).every((r) => !r.witnessed), 'the witnessed rows follow the engine\'s rows in the registry, flagged', reg.map((r) => r.id));
    ok(jasp && jasp.available && jasp.path === path.join(bin, 'flatpak') && jasp.args.join(' ') === 'run org.jaspstats.JASP', 'JASP launches as `flatpak run org.jaspstats.JASP`', jasp);
    ok(notes && !notes.available && notes.reasonCode === 'exec-gone' && /no longer resolves/.test(notes.reason), 'a row whose program is gone stays listed and says so (exec-gone)', notes);
    const v = M.validateLaunchRequest({ appId: jasp.id }, reg);
    ok(v.ok && v.launch.source === 'registry' && v.launch.row.id === 'seen.f.org.jaspstats.jasp', 'the launch door accepts a witnessed row by its id (the same door as the engine\'s rows)', v);
  } finally { try { await ds.shutdown?.(); } catch { } }
}

console.log('§6 the place words');
{
  const en = W.installPlace({ hostId: 'local', localName: 'linux-box-hub' });
  const z = W.installPlace({ hostId: 'local', localName: 'linux-box-hub' }, tFor(zh)), j = W.installPlace({ hostId: 'local', localName: 'linux-box-hub' }, tFor(ja));
  ok(en === 'this VibeSpace machine (linux-box-hub)' && z === '本 VibeSpace 机器（linux-box-hub）' && j === 'この VibeSpace マシン（linux-box-hub）', 'this hub by its own name (en / zh / ja)', [en, z, j]);
  ok(W.installPlace({ hostId: 'host-fe6eb215', label: 'WIN-DESK1' }) === 'WIN-DESK1' && W.installPlace({ hostId: 'host-fe6eb215' }) === 'host-fe6eb215' && W.installPlace({}) === 'this VibeSpace machine', 'a paired machine by its label (else its id); no name known ⇒ "this VibeSpace machine"');
  const CM = await import('../src/lib/app-card-model.js');
  const done = (host) => CM.progressWords({ state: 'done', kind: 'package', host, result: { rows: [{ id: 'app.x' }] } }, tFor(zh)).text;
  ok(done('local') === '已安装到本 VibeSpace 机器' && done('host-1') === '已安装到host-1', 'the install card says where it landed (zh)', [done('local'), done('host-1')]);
  const src = fs.readFileSync(new URL('../src/server/apps-engine.js', import.meta.url), 'utf8');
  ok(/is done on \$\{placeOf\(p\.host\)\}/.test(src) && /It landed on \$\{placeOf\(p\.host\)\}/.test(src), 'the helper\'s outcome (the agent\'s sentence) names the place through the same words');
  for (const k of ['Installed outside VibeSpace ({n})', 'Flatpak · yours', 'Desktop entry · yours', 'Its program is gone: {cmd}', 'Filter apps', 'Installed on {place}', 'this VibeSpace machine ({name})']) ok(zh[k] && ja[k], `zh + ja: ${k}`);
}

console.log('§7 lane apps-dialog-fast — the open never waits; "outside the door" = outside the base, never the distro');
{
  // the PURE scope rule
  const sys = (n, ex) => ({ path: `/usr/share/applications/${n}.desktop`, scope: 'system', text: de({ Name: n, Exec: ex || n }) });
  const fx = { flatpaks: [...W.parseFlatpakList(JASP_LINE, { scope: 'user' }), ...W.parseFlatpakList('org.inkscape.Inkscape\tInkscape\t1.4', { scope: 'system' })],
    desktops: [sys('gedit'), sys('mytool'), sys('orphan'), { path: '/h/.local/share/applications/notes.desktop', scope: 'user', text: de({ Name: 'Notes', Exec: 'notes' }) }], validate: M.validateAppRow, ...P,
    owners: { '/usr/share/applications/gedit.desktop': 'gedit', '/usr/share/applications/mytool.desktop': 'mytool' } };
  const shown = (rows) => rows.filter((r) => !r.distro).map((r) => r.label).join('|'), hid = (rows) => rows.filter((r) => r.distro).map((r) => r.label).join('|');
  const withBase = W.witnessRows({ ...fx, drift: ['mytool'] });
  ok(shown(withBase) === 'JASP|Notes|Inkscape|mytool' && hid(withBase) === 'gedit|orphan', 'with a base: the user\'s rows always, a system flatpak always, a system entry only when its package is in the drift set — the distro\'s (and an unowned one) flagged distro, ranked last', withBase.map((r) => [r.label, r.source, !!r.distro]));
  const noBase = W.witnessRows({ ...fx, drift: null });
  ok(shown(noBase) === 'JASP|Notes|Inkscape' && hid(noBase) === 'gedit|mytool|orphan', 'no base on this machine: every system entry hidden (the count kept), the user\'s rows + the system flatpak listed', noBase.map((r) => [r.label, !!r.distro]));
  const RED = (o) => W.witnessRows({ ...o, drift: undefined, owners: undefined }); // the pre-lane rule: no scope
  ok(hid(RED(fx)) === 'gedit|mytool|orphan', 'RED CONTROL: without a base the distro\'s rows are caught as hidden (not silently listed)');
  ok(JSON.stringify(W.witnessScope(withBase)) === JSON.stringify({ distro: 2, 'flatpak-user': 1, 'flatpak-system': 1, 'desktop-user': 1, 'desktop-system': 1 }), 'witnessScope: the per-source counts + the distro\'s', W.witnessScope(withBase));
  const own = W.parseDpkgSearch('apport-gtk: /usr/share/applications/apport-gtk.desktop\nlibreoffice-core:amd64, libreoffice-common: /usr/share/applications/x.desktop\ndiversion by foo from: /usr/share/applications/d.desktop\ndpkg-query: no path found matching pattern /z.desktop\ngarbage\n');
  ok(JSON.stringify(own) === JSON.stringify({ '/usr/share/applications/apport-gtk.desktop': 'apport-gtk', '/usr/share/applications/x.desktop': 'libreoffice-core' }), 'dpkg -S: the first owner (arch stripped); a diversion, a miss and garbage skipped', own);
  // THE OPEN'S VERDICT
  const all = [];
  for (const due of [false, true]) for (const inFlight of [false, true]) all.push({ due, inFlight, ...W.openAnswer({ cache: { rows: [1] }, due, inFlight }) });
  ok(all.every((a) => a.wait === false && a.answer.rows[0] === 1 && a.refresh === (a.due && !a.inFlight)), 'openAnswer: the answer is the cache, refresh = due && !inFlight, NEVER a wait (all four cases)', all);
  // the machine half: a SLOW walk (the stub answers after 600 ms) — the open answers at once, the listing lands later and is pushed
  const t7 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-witness7-'));
  const d7 = { user: path.join(t7, 'user'), system: path.join(t7, 'sys'), flatpakUser: path.join(t7, 'fu'), flatpakSystem: path.join(t7, 'fs') };
  for (const d of Object.values(d7)) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d7.system, 'gedit.desktop'), de({ Name: 'Text Editor', Exec: 'gedit' }));
  fs.writeFileSync(path.join(d7.system, 'mytool.desktop'), de({ Name: 'My Tool', Exec: 'mytool' }));
  // a base: last-dpkg.list (coreutils, gedit) + slot-ended, then dpkg ran outside (mytool added) — the drift set = {mytool}
  const mk = path.join(t7, 'markers'); fs.mkdirSync(mk);
  const dpkgStatus = path.join(t7, 'status');
  fs.writeFileSync(dpkgStatus, ['coreutils', 'gedit', 'mytool'].map((p) => `Package: ${p}\nStatus: install ok installed\nArchitecture: amd64\nVersion: 1.0\n`).join('\n'));
  fs.writeFileSync(path.join(mk, 'last-dpkg.list'), 'coreutils:amd64 1.0\ngedit:amd64 1.0\n');
  fs.writeFileSync(path.join(mk, 'slot-ended'), '');
  const old = new Date(Date.now() - 3600e3); fs.utimesSync(path.join(mk, 'slot-ended'), old, old); fs.utimesSync(path.join(mk, 'last-dpkg.list'), old, old);
  fs.writeFileSync(path.join(mk, 'dpkg-touched'), '');
  fs.chmodSync(mk, 0o755); for (const f of fs.readdirSync(mk)) fs.chmodSync(path.join(mk, f), 0o644); // readRootFile: never group/other-writable
  const c7 = [];
  let slow = 600;
  const run7 = async (cmd, args) => { c7.push(`${cmd} ${args[0]}`); if (cmd === 'flatpak') { await new Promise((r) => setTimeout(r, slow)); return args.includes('--user') ? { code: 0, stdout: `${JASP_LINE}\n`, stderr: '' } : { code: 0, stdout: '', stderr: '' }; }
    if (cmd === 'dpkg') return { code: 0, stdout: args.slice(1).map((p) => `${p.endsWith('mytool.desktop') ? 'mytool' : 'gedit'}: ${p}`).join('\n'), stderr: '' }; return { code: 127, stdout: '', stderr: '' }; };
  const a7 = AS.create({ home: path.join(t7, 'home'), stateDir: path.join(t7, 'data'), env: { PATH: '/usr/bin:/bin' }, log: { warn() { }, info() { } }, runner: run7, witnessDirs: d7, markerDir: mk, dpkgStatus, rootUid: process.getuid() });
  fs.mkdirSync(path.join(t7, 'data'), { recursive: true });
  const pushed = [];
  a7.onWitness((v) => pushed.push(v));
  let t0 = Date.now();
  const v0 = await a7.refreshWitness({ reason: 'open' });
  const openMs = Date.now() - t0;
  ok(openMs < 100 && v0.listing === true && v0.count === 0 && pushed.length === 0, `a due open with a 600 ms walk answers in ${openMs} ms — the last list (nothing yet), "listing…", nothing pushed yet`, v0);
  await a7.refreshWitness({ reason: 'open' });
  ok(c7.filter((c) => c.startsWith('flatpak')).length <= 2, 'a second open while the walk runs starts no second walk', c7);
  await a7.witnessSettled(); await new Promise((r) => setTimeout(r, 5));
  const v1 = a7.witnessView(), r1 = a7.witnessRows();
  ok(pushed.length === 1 && pushed[0].listing === false && pushed[0].changed === true && pushed[0].count === 2 && pushed[0].hidden === 1, 'the walk LANDS and is pushed once — listing over, changed, 2 listed + 1 hidden', pushed);
  ok(r1.filter((r) => !r.distro).map((r) => r.label).join('|') === 'JASP|My Tool' && r1.find((r) => r.label === 'Text Editor')?.distro === true, 'with the base: My Tool (its package installed after the base) listed, the distro\'s Text Editor hidden', r1.map((r) => [r.label, !!r.distro]));
  const file7 = JSON.parse(fs.readFileSync(path.join(t7, 'data', W.WITNESS_FILE), 'utf8'));
  ok(Number.isFinite(file7.tookMs) && file7.tookMs >= 500 && file7.scope && file7.scope.distro === 1 && file7.scope['flatpak-user'] === 1 && file7.scope['desktop-system'] === 1 && file7.scope.base === true && file7.changed === undefined, `the cache file keeps tookMs (${file7.tookMs} ms) + the scope counts (why a list is long)`, { tookMs: file7.tookMs, scope: file7.scope });
  slow = 300; t0 = Date.now();
  const vr = await a7.refreshWitness({ reason: 'recheck' });
  const reMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 5));
  ok(reMs >= 280 && vr.listing === false && pushed.length === 2 && pushed[1].changed === false, `Check again WAITS for its walk (${reMs} ms — the person asked); an unchanged landing still ends "listing…" (pushed, changed:false)`, { reMs, vr, p: pushed[1] });
  // the push reaches the hub as the registry's own decorated rows (desktop-serve hooks.onWitness → the keeper's broadcast)
  const DS = require('../src/desktop-serve.js');
  const hooked = [];
  const ds7 = DS.install({ dataDir: path.join(t7, 'ds'), env: { PATH: '/usr/bin:/bin', HOME: path.join(t7, 'home') }, apps: a7, hooks: { onWitness: (w) => hooked.push(w) }, log: { warn() { }, info() { }, log() { } } });
  try {
    fs.writeFileSync(path.join(d7.user, 'notes.desktop'), de({ Name: 'Notes', Exec: 'notes-app' }));
    slow = 50; await a7.refreshWitness({ reason: 'recheck' });
    for (let i = 0; i < 200 && !hooked.length; i++) await new Promise((r) => setTimeout(r, 25)); // the machine's facts first (cached after)
    const h = hooked[hooked.length - 1];
    ok(h && h.witness.changed === true && h.rows.some((r) => r.label === 'Notes' && r.witnessed && r.available === false && r.reasonCode === 'exec-gone') && h.rows.length === 4, 'desktop-serve pushes the landing through hooks.onWitness — the registry\'s witnessed rows, decorated (available / reasonCode)', h && h.rows.map((r) => [r.label, r.available]));
    const ksrc = fs.readFileSync(new URL('../src/server/desktop-app-keeper.js', import.meta.url), 'utf8');
    ok(/onWitness: notifyWitness/.test(ksrc) && /type: 'desktop-apps-witness', host: 'local', witness, rows/.test(ksrc), 'the keeper turns it into ONE desktop-apps-witness broadcast {host, witness, rows}');
  } finally { try { await ds7.shutdown?.(); } catch { } }
  // vibespace-app status follows the same rule (the machine's app-status op + the CLI line)
  let st = null;
  try { st = await AS.runAppOp({ plan: async () => ({}), status: async () => ({ drift: { drift: false } }), refreshWitness: a7.refreshWitness, witnessRows: a7.witnessRows }, 'app-status', {}); } catch (e) { st = { error: e.message }; }
  ok(st && st.ok && JSON.stringify(st.status.outside) === JSON.stringify(['JASP (flatpak-user)', 'Notes (desktop-user)', 'My Tool (desktop-system)']), 'app-status carries the apps the group lists (the distro\'s Text Editor not)', st);
  const cli = fs.readFileSync(new URL('../data/bin/vibespace-app', import.meta.url), 'utf8');
  ok(/\(j\.outside \|\| \[\]\)\.length\) lines\.push\(`Apps installed OUTSIDE VibeSpace/.test(cli), 'vibespace-app status prints that list on its OUTSIDE line');
  fs.rmSync(t7, { recursive: true, force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? '✗' : '✓'} test-apps-witness: ${pass} passed, ${fail} failed (${Date.now() - T0} ms)`);
process.exit(fail ? 1 : 0);
