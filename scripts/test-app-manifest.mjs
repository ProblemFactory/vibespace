#!/usr/bin/env node
// APPS THAT SURVIVE A REBUILT MACHINE — the PURE gate (docs/design-app-persistence.zh.md §3.1, Layer 0; src/app-manifest.js).
// No server, no browser, no root. The apt / dpkg / .desktop text it parses is REAL output captured by
// scripts/capture-app-fixtures.sh (this Ubuntu box's `apt-get -s` + a throwaway Debian 12 container — the fleet image's
// base — where the real installs ran as the container's root); the one invented input is the snap simulation's EMPTY
// dpkg status (this box has snapd, so its own simulation never lists it — apt and its lists are real). Sections:
//   §1 the index's schema — validate / with / without / generation / sources (https + a key, by name) / entry ids
//   §2 apt's words — parseSim / parseUris over every captured shape (Ubuntu 26.04 + Debian 12)
//   §3 THE PLAN — every named refusal (needs_snap · conflict · removes · not_found · bad_name · no_apt · no_facts · disk
//      with its numbers · shared) and the ok plan's numbers (download = the URIs' own sizes, installed, closure, origins)
//   §4 parseDesktopFile — real .desktop files (xterm, feh NoDisplay, btop Terminal, Chrome %U, LibreOffice Math), the
//      spec's quoting, every row through the model's own validateAppRow
//   §5 the dpkg set — the status file's installed set IS the root script's `q` lines, byte for byte, and the base sha
//   §6 the local repository — the stanza, the index, the file name, cacheVerdict (closure − base ⊆ cache)
//   §7 after a rebuild — replayRungs' table; driftVerdict's table; diskVerdict's numbers
//   §8 THE ROOT SCRIPT — dash + sh parse it; argv positions; every argument refusal BEFORE root is asked (run here as
//      this user: a name that is code is refused and never runs); parseRunLog over the captured install + replay logs
//   §9 controls — a patched copy per rule (scripts/mutant-copy.mjs, outside the tree) that the table above catches
//   §10 the MACHINE half in-process (src/app-serve.js): the OpenPGP fingerprints against gpg's own on two real public
//      keys; a plan over a stub runner that answers the captured apt text (the argv's positions, the staged .deb's sha256,
//      the user's lists only when the system has none); the record reads only what ROOT wrote (a user-written entries
//      list or a forged log line is never a row)
// Run: node scripts/test-app-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(repo, 'scripts/fixtures/apt');
const fx = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
const A = require('../src/app-manifest.js');
const E = require('../src/server/apps-engine.js'); // lane dc-apps-rows §kinds: the engine's kind lists derive from the table
const M = require('../src/desktop-apps.js');
const MUT = mutantCopies('app-manifest', repo);
const MANIFEST_SRC = fs.readFileSync(path.join(repo, 'src/app-manifest.js'), 'utf8');
/** One shell function of the root script by name (one-line `f() { … }` or a block ending at a `}` line). */
const fnOf2 = (script, name) => (new RegExp(`^${name}\\(\\) \\{ .*\\}$`, 'm').exec(script) || new RegExp(`^${name}\\(\\) \\{[^\\n]*\\n[\\s\\S]*?\\n\\}$`, 'm').exec(script) || [null])[0];
const DIRS = [];
const myDir = (n) => { const d = scratchDir(n); DIRS.push(d); return d; };
process.on('exit', () => { for (const d of DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const FACTS = { platform: 'linux', apt: '/usr/bin/apt-get', sudo: true, root: false, rootFree: 50e9, homeFree: 80e9 };

console.log('§1 the index\'s schema');
{
  const m0 = A.emptyManifest();
  ok(A.validateManifest(m0).ok && same(A.validateManifest(m0).manifest, m0), 'an empty manifest validates and normalizes to itself');
  ok(!A.validateManifest({ ...m0, v: 2 }).ok && /version/.test(A.validateManifest({ ...m0, v: 2 }).error), 'an unknown version is refused by name (never read as v1)');
  const e = { id: 'gimp', kind: 'apt', packages: ['gimp'], addedAt: 1, by: { kind: 'agent', conversation: 'c-1', name: 'Session 3' }, approvedAt: 2, rows: [{ id: 'app.gimp', label: 'GNU Image Manipulation Program', exec: 'gimp', args: [] }], services: [] };
  const m1 = A.withEntry(m0, e);
  ok(m1.generation === 1 && m1.entries.length === 1 && m1.entries[0].by.kind === 'agent' && m1.entries[0].rows[0].id === 'app.gimp', 'withEntry adds the entry and bumps the generation');
  const m2 = A.withEntry(m1, { ...e, packages: ['gimp', 'gimp-data'] });
  ok(m2.generation === 2 && m2.entries.length === 1 && same(m2.entries[0].packages, ['gimp', 'gimp-data']), 'withEntry REPLACES by id (never two entries of one id)');
  ok(A.withoutEntry(m2, 'gimp').entries.length === 0 && A.withoutEntry(m2, 'gimp').generation === 3, 'withoutEntry drops it and bumps the generation');
  ok(A.validateManifest(m2).ok && same(A.validateManifest(JSON.parse(JSON.stringify(m2))).manifest, m2), 'a written manifest reads back identical (the JSON round trip)');
  const bad = [
    [{ ...e, id: 'GIMP' }, /entry id/], [{ ...e, kind: 'snap' }, /kind/], [{ ...e, packages: [] }, /packages/], [{ ...e, packages: ['gimp; rm -rf /'] }, /packages/],
    [{ ...e, by: { kind: 'root' } }, /by/], [{ ...e, kind: 'deb', deb: { package: 'x', sha256: 'nope' } }, /deb entry/],
  ];
  for (const [b, re] of bad) ok(re.test(throws(() => A.withEntry(m0, b)) || ''), `withEntry refuses ${JSON.stringify(b).slice(0, 70)}… by name`);
  ok(!A.validateManifest({ ...m0, entries: [e, e] }).ok, 'two entries of one id are refused');
  ok(A.validateManifest({ ...m0, extra: 1, entries: [{ ...e, junk: 'x' }] }).ok && !('junk' in A.validateManifest({ ...m0, entries: [{ ...e, junk: 'x' }] }).manifest.entries[0]), 'unknown keys are dropped, never carried');
  // sources: https + a key, every refusal named bad_source
  const src = { id: 'vscode', uris: ['https://packages.example.com/repos/code'], suites: ['stable'], components: ['main'], key: 'https://packages.example.com/keys/key.asc' };
  ok(A.validateSourceSpec(src).ok, 'a third-party source with an https address and an https key validates');
  const srcBad = [[{ ...src, uris: ['http://packages.example.com/x'] }, /not https/], [{ ...src, key: '' }, /Signed-By/], [{ ...src, key: 'http://x/k.asc' }, /https/], [{ ...src, uris: ['https://x/a b'] }, /plain https/], [{ ...src, suites: ['stable; rm'] }, /suites/], [{ ...src, id: 'Bad Id' }, /name/], [{ ...src, fingerprints: ['xyz'] }, /fingerprint/]];
  for (const [b, re] of srcBad) { const v = A.validateSourceSpec(b); ok(!v.ok && v.code === 'bad_source' && re.test(v.error), `a source is refused bad_source: ${v.error}`); }
  ok(A.sourceDeb822(A.validateSourceSpec(src).source, '/etc/apt/keyrings/vibespace-vscode.asc') === 'Types: deb\nURIs: https://packages.example.com/repos/code\nSuites: stable\nComponents: main\nSigned-By: /etc/apt/keyrings/vibespace-vscode.asc\n', 'the deb822 of an approved source names its key under /etc/apt/keyrings (root-only — never a path under the user\'s home)');
  { // lane dc-apps-rows (F-I2): sourceDeb822 is THE deb822 of an approved source — the shipped root script's writer (APP_SCRIPT,
    // shell printf over $U $SU $CO $ID $x) must write the very same bytes; run it in sh beside the PURE text
    const g = /\{ printf 'Types: deb[^\n]*?\} > "\$T\/src"/.exec(A.APP_SCRIPT);
    const s1 = A.validateSourceSpec(src).source;
    const runW = (co) => spawnSync('sh', ['-c', `${g[0].replace(/ > "\$T\/src"$/, '')}`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', U: s1.uris.join(' '), SU: s1.suites.join(' '), CO: co, ID: 'vscode', x: 'asc' } }).stdout;
    ok(g && runW(s1.components.join(' ')) === A.sourceDeb822(s1, '/etc/apt/keyrings/vibespace-vscode.asc') && runW('') === A.sourceDeb822({ ...s1, components: [] }, '/etc/apt/keyrings/vibespace-vscode.asc'), 'the root script\'s deb822 writer writes exactly sourceDeb822\'s bytes (with and without Components)');
  }
  const m3 = A.withSource(m0, { ...src, keySha256: 'a'.repeat(64), fingerprints: ['B'.repeat(40)] });
  ok(m3.sources.length === 1 && m3.sources[0].fingerprints[0] === 'B'.repeat(40) && A.withoutSource(m3, 'vscode').sources.length === 0, 'withSource / withoutSource');
  ok(A.entryIdFor('gimp') === 'gimp' && A.entryIdFor('gimp', ['gimp']) === 'gimp-2' && A.entryIdFor('libreoffice-calc') === 'libreoffice-calc' && A.entryIdFor('g++') === 'g' && A.entryIdFor('python3.12-venv') === 'python3-12-venv', 'entryIdFor: the package name, dots/pluses as dashes, a taken id numbered');
  ok(A.PKG_RE.source === M.PKG_RE.source, 'the package-name rule is the SAME as the xpra / LibreOffice plans\' (src/desktop-apps.js PKG_RE)');
}

console.log('§2 apt\'s words — parseSim / parseUris over the captured shapes');
{
  const uh = A.parseSim(fx('ubuntu-hello.sim.txt'));
  ok(uh.inst.length === 1 && same(uh.inst[0], { package: 'hello', arch: 'amd64', version: '2.10-5build1', from: null, origin: 'Ubuntu:26.04/resolute' }) && same(uh.counts, { upgraded: 0, installed: 1, removed: 0, notUpgraded: 7 }), 'Ubuntu 26.04: hello — one Inst line, its origin, the counts line', uh.inst);
  const dh = A.parseSim(fx('debian-hello.sim.txt'));
  ok(dh.inst.length === 1 && dh.inst[0].version === '2.10-3' && dh.inst[0].origin === 'Debian:12.15/oldstable', 'Debian 12: hello', dh.inst);
  for (const os of ['ubuntu', 'debian']) {
    const g = A.parseSim(fx(`${os}-gimp.sim.txt`));
    const u = A.parseUris(fx(`${os}-gimp.uris.txt`));
    ok(g.inst.length === g.counts.installed && g.inst.length > 20 && u.debs.length === g.inst.length && g.inst.every((i) => u.debs.some((d) => d.file.startsWith(i.package + '_'))), `${os} gimp: every Inst line is a counted new package, and every one has its URI line (${g.inst.length})`);
  }
  const du = A.parseUris(fx('debian-hello.uris.txt'));
  const sec = A.parseUris(fx('debian-gimp.uris.txt')).debs.filter((d) => /debian-security/.test(d.url));
  ok(sec.length === 13 && sec.every((d) => d.hash === null && d.size > 0), 'a security-mirror URI line carries NO hash (a trailing space — measured): still a file with its size', sec.length);
  ok(du.debs.length === 1 && du.debs[0].size === 53080 && du.debs[0].file === 'hello_2.10-3_amd64.deb' && /^MD5Sum:/.test(du.debs[0].hash) && du.needBytes === 53100 && du.afterBytes === 284000, 'Debian hello URIs: the exact size of the file + the two size lines (kB = 1000 B)', du);
  const ug = A.parseUris(fx('ubuntu-gimp.uris.txt'));
  ok(ug.needBytes === 28900000 && ug.afterBytes === 148000000 && ug.debs.some((d) => /%3a/.test(d.file)), 'Ubuntu gimp: 28.9 MB / 148 MB, and an epoch file name apt spells with %3a', { need: ug.needBytes, after: ug.afterBytes });
  const miss = A.parseSim(fx('ubuntu-missing.sim.txt'));
  ok(same(miss.notFound, ['no-such-package-vs']) && !miss.inst.length, 'a missing package: "Unable to locate package" → notFound');
  const cf = A.parseSim(fx('debian-conflict.sim.txt'));
  ok(cf.broken && cf.unmet.length === 2 && cf.unmet.every((u) => /Conflicts mail-transport-agent/.test(u)), 'exim4 light + heavy: broken + the two unmet Conflicts lines', cf.unmet);
  const rm = A.parseSim(fx('debian-remove.sim.txt'));
  ok(rm.remv.length === 27 && rm.remv[0].package === 'xterm' && rm.remv[0].version === '379-1' && rm.counts.removed === 27, 'a removal: 27 Remv lines (with their versions)');
  const up = A.parseSim(fx('ubuntu-upgrade.sim.txt'));
  ok(up.inst.length === 1 && up.inst[0].from === '154.0.8037.57-1' && up.inst[0].version === '154.0.8037.92-1' && up.inst[0].origin === 'Google:1.0/stable', 'an upgrade: Inst with [from] (to …)', up.inst);
  const ou = A.parseSim(fx('debian-only-upgrade.sim.txt'));
  ok(same(ou.already, [{ package: 'xterm', version: '379-1' }]) && same(ou.skipped, ['hello']), '--only-upgrade: already the newest / skipping a not-installed one');
  const db = A.parseSim(fx('debian-deb.sim.txt'));
  ok(db.inst.length === 1 && db.inst[0].origin === 'Debian:12.15/oldstable, local-deb', 'a .deb file: the local-deb origin is kept');
  ok(A.parseSize('53.1 kB') === 53100 && A.parseSize('1,234 kB') === 1234000 && A.parseSize('9 B') === 9 && A.parseSize('1.2 GB') === 1.2e9 && A.parseSize('nothing') === null, 'parseSize: apt\'s SI units, a thousands comma, bytes');
}

console.log('§3 THE PLAN — every refusal by name, the numbers of an ok one');
{
  const p = A.parsePlan(fx('debian-hello.sim.txt'), fx('debian-hello.uris.txt'), { requested: ['hello'], facts: FACTS });
  ok(p.ok && p.canRun && p.code === null && p.downloadBytes === 53080 && p.installedBytes === 284000 && p.newCount === 1 && same(p.origins, ['Debian:12.15/oldstable']) && p.closureKey === 'hello=2.10-3' && p.replaySeconds >= 1, 'hello on Debian: ok, the download = the URI\'s exact size, 284 kB installed, one new package, its origin, a replay estimate', p);
  const g = A.parsePlan(fx('debian-gimp.sim.txt'), fx('debian-gimp.uris.txt'), { requested: ['gimp'], facts: FACTS });
  const sum = A.parseUris(fx('debian-gimp.uris.txt')).debs.reduce((a, d) => a + d.size, 0);
  ok(g.ok && g.newCount === 338 && g.downloadBytes === sum && g.installedBytes === 861e6 && g.closure.length === 338 && g.replaySeconds >= 10, `gimp on Debian: 338 packages, ${A.fmtBytes(sum)} to download, 861 MB installed, replay ≈ ${g.replaySeconds} s`);
  const snap = A.parsePlan(fx('ubuntu-snap.sim.txt'), '', { requested: ['chromium-browser'], facts: FACTS });
  ok(!snap.ok && snap.code === 'needs_snap' && /snap/.test(snap.error), 'chromium-browser on Ubuntu pulls snapd → needs_snap, by name', snap.code);
  const cf = A.parsePlan(fx('debian-conflict.sim.txt'), '', { requested: ['exim4-daemon-light', 'exim4-daemon-heavy'], facts: FACTS });
  ok(!cf.ok && cf.code === 'conflict' && /mail-transport-agent/.test(cf.error), 'two packages that conflict → conflict, naming the unmet line', cf.error);
  const nf = A.parsePlan(fx('ubuntu-missing.sim.txt'), '', { requested: ['no-such-package-vs'], facts: FACTS });
  ok(!nf.ok && nf.code === 'not_found' && same(nf.notFound, ['no-such-package-vs']), 'a missing package → not_found, naming it');
  const rv = A.parsePlan(fx('debian-remove.sim.txt'), '', { requested: ['something'], facts: FACTS });
  ok(!rv.ok && rv.code === 'removes' && rv.removes.includes('xterm'), 'an install whose simulation REMOVES packages → removes, naming them (never taken away silently)');
  for (const [name, why] of [['Hello', 'capital'], ['-o APT::Get::Assume-Yes=1', 'an option'], ['hello;rm -rf /', 'a command'], ['$(touch x)', 'a substitution'], ['h', 'one char']]) {
    const v = A.parsePlan('', '', { requested: [name], facts: FACTS });
    ok(!v.ok && v.code === 'bad_name', `bad_name before apt is asked: ${why} ${JSON.stringify(name)}`);
  }
  ok(A.parsePlan('', '', { requested: ['hello'], facts: null }).code === 'no_facts', 'no facts → no_facts');
  ok(A.parsePlan('', '', { requested: ['hello'], facts: { ...FACTS, apt: null } }).code === 'no_apt' && A.parsePlan('', '', { requested: ['hello'], facts: { ...FACTS, platform: 'darwin' } }).code === 'no_apt', 'no apt-get / not Linux → no_apt');
  const disk = A.parsePlan(fx('debian-gimp.sim.txt'), fx('debian-gimp.uris.txt'), { requested: ['gimp'], facts: { ...FACTS, rootFree: 2.5e9 } });
  ok(!disk.ok && disk.code === 'disk' && /2\.5 GB free/.test(disk.error) && /861 MB/.test(disk.error) && /2\.1 GB kept free/.test(disk.error), 'a full system disk → disk, WITH the numbers (free, needed, kept)', disk.error);
  const hdisk = A.parsePlan(fx('debian-gimp.sim.txt'), fx('debian-gimp.uris.txt'), { requested: ['gimp'], facts: { ...FACTS, homeFree: 1e9 } });
  ok(!hdisk.ok && hdisk.code === 'disk' && /home disk/.test(hdisk.error), 'a full home disk (the package cache lives there) → disk, by name', hdisk.error);
  const ns = A.parsePlan(fx('debian-hello.sim.txt'), fx('debian-hello.uris.txt'), { requested: ['hello'], facts: { ...FACTS, sudo: false } });
  ok(ns.ok && !ns.canRun && ns.code === 'no_sudo' && /passwordless sudo/.test(ns.error), 'no passwordless sudo → an ok plan that cannot run (no_sudo): the commands are shown to copy');
  const asRoot = A.parsePlan(fx('debian-hello.sim.txt'), fx('debian-hello.uris.txt'), { requested: ['hello'], facts: { ...FACTS, sudo: false, root: true } });
  ok(asRoot.canRun && asRoot.code === null, 'running as root needs no sudo');
  // a removal
  const rem = A.parsePlan(fx('debian-remove.sim.txt'), '', { requested: ['xterm'], facts: FACTS, kind: 'remove', others: [] });
  ok(rem.ok && rem.removes.length === 27 && rem.kind === 'remove', 'a removal plan lists everything it takes away');
  const sh = A.parsePlan(fx('debian-remove.sim.txt'), '', { requested: ['xterm'], facts: FACTS, kind: 'remove', others: ['libxft2'] });
  ok(!sh.ok && sh.code === 'shared' && /libxft2/.test(sh.error), 'a removal that would take another app\'s package with it → shared, naming it');
  ok(A.PLAN_CODES.every((c) => typeof c === 'string') && ['needs_snap', 'conflict', 'bad_name', 'bad_source', 'no_sudo', 'no_apt', 'disk'].every((c) => A.PLAN_CODES.includes(c)), 'the brief\'s seven refusals are in the closed set');
  const s = A.parseSearch('gimp - GNU Image Manipulation Program\ngimp-data - Data files for GIMP\nNOT A LINE\n');
  ok(same(s, [{ package: 'gimp', summary: 'GNU Image Manipulation Program' }, { package: 'gimp-data', summary: 'Data files for GIMP' }]) && same(A.searchWords('Image  Editor'), ['image', 'editor']) && A.searchWords('$(x)') === null && A.searchWords('') === null, 'apt-cache search lines; a query is plain words or nothing');
  ok(same(A.updatesOf(fx('ubuntu-upgrade.sim.txt'), ['google-chrome-stable']), [{ package: 'google-chrome-stable', from: '154.0.8037.57-1', to: '154.0.8037.92-1' }]) && A.updatesOf(fx('ubuntu-upgrade.sim.txt'), ['xterm']).length === 0, 'updatesOf counts only THESE packages\' upgrades');
}

console.log('§4 parseDesktopFile — real .desktop files, every row through validateAppRow');
{
  const d = (f, o = {}) => A.parseDesktopFile(fx(f), { entry: 'x', validate: M.validateAppRow, ...o });
  const xt = d('desktop-debian-xterm.desktop', { entry: 'xterm', path: '/usr/share/applications/debian-xterm.desktop', pkg: 'xterm' });
  ok(xt.ok && same({ id: xt.row.id, label: xt.row.label, exec: xt.row.exec, args: xt.row.args, icon: xt.row.icon, category: xt.row.category, desktop: xt.row.desktop, package: xt.row.package }, { id: 'app.xterm', label: 'XTerm', exec: 'xterm', args: [], icon: 'mini.xterm', category: 'terminal', desktop: '/usr/share/applications/debian-xterm.desktop', package: 'xterm' }), 'xterm: app.<entry>, its Name, its Exec, its Icon, a category', xt.row);
  ok(!d('desktop-feh.desktop').ok && d('desktop-feh.desktop').skip === 'no-display', 'feh: NoDisplay=true → skipped (not an app a person opens)');
  const bt = d('desktop-btop.desktop', { entry: 'btop' });
  ok(bt.ok && bt.row.exec === 'xterm' && same(bt.row.args, ['-e', 'btop']) && bt.row.label === 'btop++', 'btop: Terminal=true → opened in xterm (-e btop); the unlocalised Name wins over Name[zh_TW]', bt.row);
  const ch = d('desktop-google-chrome.desktop', { entry: 'chrome' });
  ok(ch.ok && ch.row.exec === '/usr/bin/google-chrome-stable' && same(ch.row.args, []) && ch.row.label === 'Google Chrome', 'Chrome: %U stripped; only the [Desktop Entry] group is read (its actions\' Exec lines are not)', ch.row);
  const lm = d('desktop-libreoffice-math.desktop', { entry: 'libreoffice-math' });
  ok(lm.ok && lm.row.exec === 'libreoffice' && same(lm.row.args, ['--math']) && lm.row.category === 'office', 'LibreOffice Math: --math kept, %U gone, category office', lm.row);
  // the spec's own shapes (invented: no captured file carries them)
  const one = (exec, extra = '') => A.parseDesktopFile(`[Desktop Entry]\nType=Application\nName=T\nExec=${exec}\n${extra}`, { entry: 't', validate: M.validateAppRow });
  ok(same(one('"/opt/My App/bin/app" --flag "a \\"q\\" b" %f').row.args, ['--flag', 'a "q" b']) && one('"/opt/My App/bin/app"').row.exec === '/opt/My App/bin/app', 'quoting: a quoted path with spaces, an escaped quote inside, %f removed');
  ok(same(one('app --x=%%1 --file=%f').row.args, ['--x=%1', '--file=']), '%% is a percent sign; a code inside a word is cut');
  ok(same(one('env FOO=1 app %U').row.args, ['FOO=1', 'app']) && one('env FOO=1 app %U').row.exec === 'env', 'an `env` launcher keeps its words');
  ok(!one('"/broken').ok && /cannot be read/.test(one('"/broken').error), 'an unterminated quote is refused by name');
  ok(!one('%U').ok && /names no program/.test(one('%U').error), 'an Exec of only a field code names no program → refused');
  ok(one('app', 'NoDisplay=true').skip === 'no-display' && one('app', 'Hidden=true').skip === 'hidden' && A.parseDesktopFile('[Desktop Entry]\nType=Link\nName=x\nURL=https://x', { entry: 't' }).skip === 'not-an-application' && A.parseDesktopFile('[Desktop Entry]\nType=Application\nName=x', { entry: 't' }).skip === 'no-exec', 'skips: NoDisplay, Hidden, Type≠Application, no Exec');
  const long = one('app', '').row; ok(long.label === 'T', 'a plain row');
  ok(!A.parseDesktopFile('[Desktop Entry]\nType=Application\nName=x\nExec=app', { entry: 'NOT AN ID' }).ok, 'no entry id → refused');
  // the validator is the model's own: a row it refuses never becomes a catalog row
  const refused = A.parseDesktopFile(`[Desktop Entry]\nType=Application\nName=x\nExec=${'a'.repeat(600)}`, { entry: 't', validate: M.validateAppRow });
  ok(!refused.ok && /exec/.test(refused.error), 'a row validateAppRow refuses (an exec over 512 chars) is no row', refused.error);
  ok(A.rowIdFor('libreoffice', '/usr/share/applications/libreoffice-calc.desktop', false) === 'app.libreoffice.libreoffice-calc' && A.rowIdFor('gimp', '/x/gimp.desktop', true) === 'app.gimp' && M.validateAppRow({ id: A.rowIdFor('a'.repeat(40), '/x/' + 'b'.repeat(80) + '.desktop', false), label: 'x', exec: 'x' }).ok, 'row ids: app.<entry> for the primary file, app.<entry>.<stem> for the others, always a valid id');
  ok(A.desktopPathOk('/usr/share/applications/gimp.desktop') && A.desktopPathOk('/usr/local/share/applications/a.desktop') && !A.desktopPathOk('/home/u/.local/share/applications/x.desktop') && !A.desktopPathOk('/usr/share/applications/../../etc/x.desktop') && !A.desktopPathOk('/usr/share/applications/sub/x.desktop'), 'a row\'s .desktop may come only from apt\'s applications directories');
  ok(same(A.iconCandidates('gimp').slice(0, 2), ['/usr/share/icons/hicolor/scalable/apps/gimp.svg', '/usr/share/icons/hicolor/256x256/apps/gimp.png']) && A.iconCandidates('../../etc/passwd').length === 0 && A.iconCandidates('/etc/passwd').length === 0 && same(A.iconCandidates('/usr/share/pixmaps/x.png'), ['/usr/share/pixmaps/x.png']) && A.iconCandidates('/usr/share/pixmaps/x.xpm').length === 0, 'icons: a NAME searches hicolor + pixmaps (png / svg only); a path only under /usr/share/{icons,pixmaps}');
}

console.log('§5 the dpkg set — the status file\'s installed set IS the root script\'s `q` lines');
{
  const st = A.parseDpkgStatus(fx('debian-dpkg-status.txt'));
  const text = A.dpkgListText(st);
  ok(st.length === 88 && text === fx('debian-q.txt'), `a fresh Debian 12 root filesystem: 88 installed packages, byte-identical to \`q\` (${text.length} B)`, text.slice(0, 200));
  ok(crypto.createHash('sha256').update(text).digest('hex') === fx('debian-q.sha256').trim(), 'the base identity: sha256 of those lines = what the root script printed (`q | sha256sum`)');
  const parse = (f) => fx(f).split('\n').filter(Boolean).map((l) => { const [p, v, a, ...s] = l.split('\t'); return { package: p, version: v, arch: a, status: s.join(' ') }; }).filter((x) => x.status === 'install ok installed');
  const d = A.dpkgDelta(parse('debian-dpkg-before.txt'), parse('debian-dpkg-after.txt'));
  ok(d.added.length === 27 && d.added.some((x) => x.package === 'xterm' && x.version === '379-1') && !d.removed.length && !d.changed.length, 'dpkgDelta over a real xterm install: 27 added (the capture\'s own diff), nothing removed or changed', d.added.length);
  const d2 = A.dpkgDelta([{ package: 'a', arch: 'amd64', version: '1' }, { package: 'b', arch: 'all', version: '1' }], [{ package: 'a', arch: 'amd64', version: '2' }]);
  ok(same(d2, { added: [], removed: [{ package: 'b', arch: 'all', version: '1' }], changed: [{ package: 'a', arch: 'amd64', from: '1', to: '2' }] }), 'dpkgDelta: a moved version is CHANGED, a gone one REMOVED');
  ok(same(A.parseDpkgList(fx('debian-q.txt')), st.map((p) => p).sort((x, y) => (`${x.package}:${x.arch}` < `${y.package}:${y.arch}` ? -1 : 1))) || A.parseDpkgList(fx('debian-q.txt')).length === 88, 'parseDpkgList reads the `q` lines back');
}

console.log('§6 the local repository — stanza, index, file name, completeness');
{
  const control = fx('debian-deb.control.txt');
  const st = A.packagesStanza({ control, filename: 'hello_2.10-3_amd64.deb', size: 53080, sha256: 'ab'.repeat(32) });
  ok(st.startsWith('Package: hello\nVersion: 2.10-3\n') && st.endsWith('Filename: ./hello_2.10-3_amd64.deb\nSize: 53080\nSHA256: ' + 'ab'.repeat(32) + '\n') && !/\n\n/.test(st), 'the stanza: dpkg-deb -f (blank lines dropped) + Filename / Size / SHA256');
  const p = A.parseStanza(st);
  ok(p.package === 'hello' && p.version === '2.10-3' && p.arch === 'amd64' && p.file === 'hello_2.10-3_amd64.deb' && p.size === 53080, 'parseStanza reads it back');
  ok(A.packagesIndex([st, st]) === st + '\n' + st + '\n', 'the Packages file: every stanza then a blank line');
  ok(A.debFileName({ package: 'libxt6', version: '1:1.2.1-1.1', arch: 'amd64' }) === 'libxt6_1.2.1-1.1_amd64.deb' && A.debFileName({ package: 'hello', version: '2.10-3', arch: 'amd64' }) === 'hello_2.10-3_amd64.deb', 'the cache file name drops the epoch (a file: source reads Filename as written — never a %3a)');
  // the installed run's `= deb` lines name files exactly so (a real run, an epoch package among them)
  const run = A.parseRunLog(fx('debian-run-install.log'), { id: 'hello', nonce: 'abcdef123' });
  ok(run.debs.length === 29 && run.debs.every((x) => x.file === A.debFileName(x)) && run.debs.some((x) => /^\d+:/.test(x.version)), 'every cached file of the real install is named <pkg>_<version without epoch>_<arch>.deb (epoch packages among them)');
  const c = (ps) => ps.map(([p, v]) => ({ package: p, version: v }));
  const cv = A.cacheVerdict({ closure: c([['xterm', '379-1'], ['libxt6', '1:1.2.1-1.1'], ['libc6', '2.36']]), base: c([['libc6', '2.36']]), cache: c([['xterm', '379-1']]) });
  ok(!cv.complete && same(cv.missing, c([['libxt6', '1:1.2.1-1.1']])), 'cacheVerdict: closure − base − cache = what a fresh machine would miss (P15: a package another install brought is still missing)');
  ok(A.cacheVerdict({ closure: c([['a', '1']]), base: [], cache: c([['a', '1']]) }).complete && !A.cacheVerdict({ closure: c([['a', '2']]), base: [], cache: c([['a', '1']]) }).complete, 'by package AND version (an older cached version is not the one needed)');
}

console.log('§7 after a rebuild — which rung, the tripwire, the disk floor');
{
  const R = (o) => { const r = A.replayRungs(o); return `${r.run ? r.rung : '-'}:${r.why}`; };
  const base = { entries: 2, baseShaNow: 'a'.repeat(64), baseShaStored: 'a'.repeat(64) };
  const table = [
    [{ ...base, markerHit: true }, '-:replayed'], [{ ...base }, '1:fresh-rootfs'], [{ ...base, rung1Failed: true }, '2:rung1-failed'], [{ ...base, refresh: true, markerHit: true }, '2:refresh'],
    [{ ...base, baseShaNow: 'b'.repeat(64) }, '2:base-changed'], [{ ...base, baseShaStored: null }, '2:base-unknown'], [{ ...base, entries: 0 }, '-:no-entries'], [{ ...base, entries: 0, refresh: true }, '2:refresh'],
    // verify-r1 F4: no marker but every entry installed (an install ran here, no replay yet) → nothing; one missing → the rungs
    [{ ...base, missing: 0 }, '-:present'], [{ ...base, missing: 1 }, '1:fresh-rootfs'], [{ ...base, missing: 0, baseShaNow: 'b'.repeat(64) }, '-:present'], [{ ...base, markerHit: true, missing: 2 }, '-:replayed'], [{ ...base, missing: 0, refresh: true }, '2:refresh'],
  ];
  // the marker is written only by a replay that put EVERY entry back; finish() (every run's end) never writes it, and the
  // image's base is re-taken only on a root filesystem VibeSpace never ran on (the heavy gate drives both on a real apt)
  const fin = /finish\(\) \{[^\n]*\}/.exec(A.APP_SCRIPT);
  ok(fin && !fin[0].includes(A.REPLAY_MARKER) && (A.APP_SCRIPT.match(/\breplayed;/g) || []).length === 2 && (A.APP_SCRIPT.match(/if \[ \$bad -eq 0 \]; then replayed; say ok;/g) || []).length === 2 && /rebase\(\) \{ if \[ ! -e "[^"]*slot-ended" \]/.test(A.APP_SCRIPT), 'verify-r1 F4: the replay marker only after a replay with no failed entry (both rungs); finish() never writes it; rebase only where no VibeSpace run happened', fin && fin[0]);
  for (const [i, want] of table) ok(R(i) === want, `replayRungs ${JSON.stringify(i).replace(/"a{64}"|"b{64}"/g, '<sha>')} → ${want}`, R(i));
  const L = (ps) => ps.map(([p, v]) => ({ package: p, arch: 'amd64', version: v }));
  const last = L([['a', '1'], ['b', '1']]);
  const dv = (o) => A.driftVerdict({ last, now: last, managed: [], ...o });
  ok(dv({ touchedAt: null }).why === 'no-tripwire' && dv({ touchedAt: 5000, slotEndedAt: null }).why === 'no-baseline', 'no tripwire / no baseline → no verdict');
  ok(dv({ touchedAt: 5000, slotEndedAt: 4000 }).why === 'ours', 'a touch inside VibeSpace\'s own run (≤ slack after its end) is VibeSpace\'s');
  ok(dv({ touchedAt: 60000, slotEndedAt: 4000 }).why === 'unchanged', 'a touch that changed nothing (an `apt-get install` of something present) is no drift');
  const dd = dv({ touchedAt: 60000, slotEndedAt: 4000, now: L([['a', '1'], ['b', '1'], ['c', '3']]) });
  ok(dd.drift && same(dd.added.map((x) => x.package), ['c']), 'dpkg ran later AND the set moved → drift: "installed outside VibeSpace — Adopt"');
  ok(!dv({ touchedAt: 60000, slotEndedAt: 4000, now: L([['a', '1'], ['b', '1'], ['c', '3']]), managed: ['c'] }).drift, 'a package the manifest already names is never offered for adoption again');
  ok(A.diskVerdict({ rootFree: 10e9, homeFree: 10e9, installedBytes: 1e9, downloadBytes: 1e8 }) === null && A.diskVerdict({ rootFree: null, homeFree: null, installedBytes: 9e12 }) === null, 'diskVerdict: room → null; an unknown free space is not a refusal');
}

console.log('§8 THE ROOT SCRIPT — parse, positions, refusals before root, the run log');
{
  const dir = myDir('app-manifest');
  const sh = path.join(dir, 'app.sh');
  fs.writeFileSync(sh, A.APP_SCRIPT);
  for (const shell of ['dash', 'sh']) { const r = spawnSync(shell, ['-n', sh], { encoding: 'utf8' }); ok(r.status === 0, `${shell} parses the script (${A.APP_SCRIPT.length} B)`, r.stderr); }
  const argv = A.appArgv({ mode: 'install', appsDir: '/home/u/.vibespace/apps', id: 'gimp', nonce: 'abcdef123', args: ['gimp', 'gimp-data'] });
  ok(same(argv.slice(0, 4), ['sudo', '-n', 'sh', '-c']) && argv[4] === A.APP_SCRIPT && same(argv.slice(5), ['vs-app', '/home/u/.vibespace/apps', 'install', 'gimp', 'abcdef123', '--', 'gimp', 'gimp-data']), 'appArgv: sudo -n sh -c <THE script> vs-app <dir> <mode> <id> <nonce> -- <packages> — every name a POSITION');
  ok(!A.APP_SCRIPT.includes('gimp') && same(A.appArgv({ mode: 'replay', appsDir: '/r/.vibespace/apps', id: 'replay', nonce: 'n0nce0001', root: true }).slice(0, 2), ['sh', '-c']), 'the script text names no package (one text for every run); as root no sudo');
  for (const [o, re] of [[{ mode: 'rm' }, /mode/], [{ mode: 'install', appsDir: 'rel/apps' }, /absolute/], [{ mode: 'install', appsDir: '/a b/apps' }, /absolute/], [{ mode: 'install', appsDir: '/a', id: 'X' }, /id/], [{ mode: 'install', appsDir: '/a', id: 'x', nonce: 'short' }, /nonce/], [{ mode: 'install', appsDir: '/a', id: 'x', nonce: 'abcdefgh1', args: ['$(x)'] }, /package/]]) ok(re.test(throws(() => A.appArgv(o)) || ''), `appArgv refuses before anything runs: ${JSON.stringify(o)}`);
  // the script itself, run HERE as this (non-root) user: every argument refusal happens before root is asked and
  // before anything is touched — a name that is code is refused and never runs
  const apps = path.join(dir, 'home/.vibespace/apps'); fs.mkdirSync(apps, { recursive: true });
  const marker = path.join(dir, 'PWNED');
  const run = (...a) => { const r = spawnSync('sh', [sh, ...a], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: path.join(dir, 'home') } }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const cases = [
    [[apps, 'install', 'gimp', 'abcdefgh1', '--', 'gimp'], 125, /= run gimp abcdefgh1 install\n= refused not-root/, 'valid arguments reach the root check (refused not-root here — no apt was run)'],
    [[apps, 'install', 'gimp', 'abcdefgh1', '--', `$(touch ${marker})`], 125, /refused bad-name/, 'a package named `$(touch …)` → bad-name, and nothing ran'],
    [[apps, 'install', 'gimp', 'abcdefgh1', '--', `\`touch ${marker}\``], 125, /refused bad-name/, 'a backtick package name → bad-name'],
    [[apps, 'install', 'gimp', 'abcdefgh1', '--', 'gimp; touch x'], 125, /refused bad-name/, 'a `;` → bad-name'],
    [[apps, 'install', 'gimp', 'abcdefgh1', '--', '-o', 'APT::Get::Assume-Yes=1'], 125, /refused bad-name -o/, 'an apt OPTION as a package → bad-name (never an option)'],
    [[apps, 'install', 'gimp', 'abcdefgh1', '--'], 125, /refused no-packages/, 'no packages → no-packages'],
    [[apps, 'install', 'GIMP', 'abcdefgh1', '--', 'gimp'], 125, /^= refused bad-id/, 'a bad id → bad-id (before the run line: nothing to key it)'],
    [[apps, 'install', 'gimp', 'a b', '--', 'gimp'], 125, /^= refused bad-nonce/, 'a bad nonce → bad-nonce'],
    [[apps, 'format', 'gimp', 'abcdefgh1', '--'], 125, /= refused bad-mode/, 'an unknown mode → bad-mode'],
    [['relative/apps', 'install', 'gimp', 'abcdefgh1', '--', 'gimp'], 125, /refused bad-apps-dir/, 'a relative apps dir → bad-apps-dir'],
    [[apps + '/../../etc', 'install', 'gimp', 'abcdefgh1', '--', 'gimp'], 125, /refused bad-apps-dir/, 'an apps dir with /../ → bad-apps-dir'],
    [[apps, 'deb', 'x', 'abcdefgh1', '--', '/etc/passwd', 'a'.repeat(64)], 125, /refused bad-deb-path/, 'a .deb outside ~/.vibespace/apps/staging → bad-deb-path'],
    [[apps, 'deb', 'x', 'abcdefgh1', '--', apps + '/staging/x.deb', 'nothex'], 125, /refused bad-sha/, 'a .deb without a sha256 → bad-sha'],
    [[apps, 'source', 'x', 'abcdefgh1', '--', 'http://example.com/repo', 'stable', 'main', 'a'.repeat(64), apps + '/staging/x.key'], 125, /refused bad-source not-https/, 'an http source → bad-source not-https'],
    [[apps, 'source', 'x', 'abcdefgh1', '--', 'https://example.com/r', 'stable;x', 'main', 'a'.repeat(64), apps + '/staging/x.key'], 125, /refused bad-source suites/, 'a suite that is not a plain word → bad-source'],
    [[apps, 'source', 'x', 'abcdefgh1', '--', 'https://example.com/r', 'stable', 'main', 'a'.repeat(64), '/tmp/x.key'], 125, /refused bad-key-path/, 'a key outside staging → bad-key-path'],
  ];
  for (const [a, code, re, name] of cases) { const r = run(...a); ok(r.code === code && re.test(r.out), name, r); }
  ok(!fs.existsSync(marker) && !fs.existsSync(path.join(dir, 'x')), 'no refused name was ever executed (no file appeared)');
  // the run log of a REAL install + an offline replay (captured in a throwaway Debian container)
  const inst = A.parseRunLog(fx('debian-run-install.log'), { id: 'hello', nonce: 'abcdef123' });
  ok(inst.found && inst.mode === 'install' && inst.ok && inst.delta.added.length === 29 && inst.delta.added.some((x) => x.package === 'xterm') && same(inst.desktops.map((x) => x.path).sort(), ['/usr/share/applications/debian-uxterm.desktop', '/usr/share/applications/debian-xterm.desktop']) && inst.base === fx('debian-q.sha256').trim(), 'the real install: found, ok, 29 added, xterm\'s two .desktop files, the base sha the PURE reader computes', { added: inst.delta.added.length, desktops: inst.desktops, base: inst.base });
  const rp = A.parseRunLog(fx('debian-run-replay.log'), { id: 'replay1', nonce: 'noncereplay1' });
  ok(rp.found && rp.mode === 'replay' && rp.ok && same(rp.entries, { hello: { ok: true } }), 'the real OFFLINE replay on a fresh root filesystem: entry hello ok', rp);
  ok(!A.parseRunLog(fx('debian-run-install.log'), { id: 'hello', nonce: 'other0000' }).found, 'another run\'s nonce is not this run (another install held the slot)');
  const rf = A.parseRunLog('= run x abcdefgh1 install\n= refused bad-name -o\n', { id: 'x', nonce: 'abcdefgh1' });
  ok(rf.found && !rf.ok && same(rf.refused, { code: 'bad-name', detail: '-o' }), 'a refusal is read by its code');
  const cmds = A.appCommands({ mode: 'install', packages: ['gimp'] });
  ok(cmds.some((l) => /^sudo apt-get .* update$/.test(l)) && cmds.some((l) => / install -y gimp$/.test(l) && /Keep-Downloaded-Packages=true/.test(l)) && cmds.some((l) => l.startsWith('#')), 'appCommands: the commands a person reads above Install (update, install keeping the debs, what VibeSpace does around them)');
  ok(A.appCommands({ mode: 'source', source: { id: 's', uris: ['https://e/r'], suites: ['stable'], components: ['main'], key: 'https://e/k.asc', keySha256: 'c'.repeat(64), fingerprints: ['D'.repeat(40)] } }).join('\n').includes('D'.repeat(40)), 'a source plan shows the key\'s fingerprint (it is in the plan\'s digest)');
}

console.log('§8b verify-r1 F5 — the root script\'s dpkg set (q) is the PURE reader\'s set: a HELD package is installed');
// the dpkg states as dpkg-query's ${db:Status-Abbrev} spells them beside the status file's Status field; q (the base sha, the
// drift's "as VibeSpace left it" list) and parseDpkgStatus (the drift's "now", the base sha the hub compares) must agree
const STATES = [['ii ', 'install ok installed', 'a'], ['hi ', 'hold ok installed', 'b'], ['iiR', 'install reinstreq installed', 'c'], ['ri ', 'deinstall ok installed', 'd'], ['rc ', 'deinstall ok config-files', 'e'], ['iU ', 'install ok unpacked', 'f'], ['un ', 'unknown ok not-installed', 'g']];
const qSet = (script) => {
  const m = /q\(\) \{ dpkg-query [^|]*\| awk '([^']*)'/.exec(script);
  if (!m) return null;
  const input = STATES.map(([ab, , p]) => `${ab} ${p}:amd64 1.0\n`).join('');
  const r = spawnSync('awk', [m[1]], { input, encoding: 'utf8' });
  return r.stdout.trim().split('\n').filter(Boolean).sort();
};
{
  const status = STATES.map(([, st, p]) => `Package: ${p}\nStatus: ${st}\nArchitecture: amd64\nVersion: 1.0\n`).join('\n');
  const pure = A.dpkgLines(A.parseDpkgStatus(status));
  const got = qSet(A.APP_SCRIPT);
  ok(got && same(got, pure) && got.includes('b:amd64 1.0'), 'q selects exactly the packages parseDpkgStatus reads as installed — a held one ("hi") among them (else the base sha never matches on an image with a hold, and the held package reads "installed outside VibeSpace")', { q: got, pure });
  ok(/dpkg-query -W -f=\\?'\$\{db:Status-Abbrev\}\\?' "\$p" 2>\/dev\/null \| grep -q "\^\.i" \|\| refuse not-installed/.test(A.APP_SCRIPT), 'Adopt reads "installed" by the same rule (a held package can be kept)');
  const MUTq = MUT.load('src/app-manifest.js', fs.readFileSync(path.join(repo, 'src/app-manifest.js'), 'utf8').replace(`awk 'substr($1, 2, 1) == \\"i\\" {`, `awk '$1 == \\"ii\\" {`), 'q-ii-only');
  const ctl = qSet(MUTq.APP_SCRIPT);
  ok(ctl && !ctl.includes('b:amd64 1.0') && !same(ctl, pure), 'CONTROL (q-ii-only): the pre-fix filter drops the held package — the two sets differ', ctl);
}

console.log('§8c verify-r1 H1 — THE PIN of an approved source (a PURE table = the bytes root writes), the origin of a fetched .deb');
{
  const PIN = (host, names) => `Package: *\nPin: origin "${host}"\nPin-Priority: 1\n` + (names ? `\nPackage: ${names}\nPin: origin "${host}"\nPin-Priority: 500\n` : '');
  const table = [
    [{ host: 'vs-fixture.test', packages: [] }, PIN('vs-fixture.test', null)],
    [{ host: 'packages.example.com', packages: ['code', 'code-insiders', 'code'] }, PIN('packages.example.com', 'code code-insiders')],
    [{ host: 'h.example', packages: ['zz-tool', 'Bad;name', 'aa-lib', 'x'] }, PIN('h.example', 'aa-lib zz-tool')],
  ];
  for (const [i, want] of table) ok(A.sourcePin(i) === want, `sourcePin ${JSON.stringify(i)} → everything from the host at ${A.PIN_LOW}, the approved packages (sorted, unique, Debian names only) at ${A.PIN_APPROVED}`, A.sourcePin(i));
  ok(A.PIN_LOW > 0 && A.PIN_LOW < 100 && A.PIN_APPROVED === 500, 'the low priority is in apt_preferences\' "only when no version is installed" band (0 < P < 100); approved = apt\'s default 500');
  for (const [u, want] of [['https://packages.example.com/repos/code', 'packages.example.com'], ['https://vs-fixture.test:8443/repo', 'vs-fixture.test'], ['https://h.example', 'h.example'], ['http://h.example/x', null], ['https://h.example:99999999/x', null], ['https://a b/x', null]]) ok(A.pinHost(u) === want, `pinHost ${u} → ${want}`, A.pinHost(u));
  const srcs = [{ id: 'fx', uris: ['https://vs-fixture.test:8443/repo'] }, { id: 'code', uris: ['https://packages.example.com/repos/code/'] }];
  const URIS = "'https://vs-fixture.test:8443/repo/pool/capp-third_1.1_all.deb' capp-third_1.1_all.deb 1234 SHA256:ab\n'http://deb.debian.org/debian/pool/main/h/hello/hello_2.10-3_amd64.deb' hello_2.10-3_amd64.deb 53000 SHA256:cd\n'https://vs-fixture.test:8443/repository/pool/evil-x_1_all.deb' evil-x_1_all.deb 1 SHA256:ef\n'https://packages.example.com/repos/code/pool/code_1.9_amd64.deb' code_1.9_amd64.deb 9 \n'file:/home/u/.vibespace/apps/debs/./sl_5.02-1_amd64.deb' sl_5.02-1_amd64.deb 9 SHA256:00\n";
  const origins = A.parseUris(URIS).debs.map((d) => A.originOf(d.url, srcs));
  ok(same(origins, [{ source: 'fx', host: 'vs-fixture.test' }, { source: null, host: 'deb.debian.org' }, { source: null, host: 'vs-fixture.test' }, { source: 'code', host: 'packages.example.com' }, { source: null, host: null }]), 'originOf: a source\'s URI must be the URL\'s PREFIX up to a "/" (…/repository is not …/repo), else the host; a file: repository has none', origins);
  const SIM = 'Inst capp-third [1.0] (1.1 VS Fixture:stable [all])\nInst hello [2.10-2] (2.10-3 Debian:12.7/stable [amd64])\nInst code [1.8] (1.9 code stable:stable [amd64])\n';
  const ups = A.updatesOf(SIM, ['capp-third', 'hello', 'code'], { debs: A.parseUris(URIS).debs, sources: srcs });
  ok(same(ups.map((u) => [u.package, u.origin, u.source]), [['capp-third', 'fx', 'fx'], ['hello', 'deb.debian.org', null], ['code', 'code', 'code']]), 'the Refresh card names each update\'s origin: the approved source by name, else the host apt fetches it from (never the publisher\'s own Label words)', ups);
  ok(same(A.updatesOf(SIM, ['hello']), [{ package: 'hello', from: '2.10-2', to: '2.10-3' }]), '…without the fetched files the rows are as before');
  const m0 = A.withSource(A.emptyManifest(), { id: 'fx', uris: ['https://vs-fixture.test:8443/repo'], suites: ['stable'], components: ['main'], key: 'https://vs-fixture.test:8443/repo/key.asc' });
  const m1 = A.withPins(m0, A.parseRunLog('= run x nonce1234 install\n= pin fx capp-third Bad;x\n= pin ghost a-b\n= ok\n', { id: 'x', nonce: 'nonce1234' }).pins);
  ok(same(m1.sources[0].pin, { packages: ['capp-third'] }) && m1.sources.length === 1 && same(A.validateManifest(m1).manifest.sources[0].pin, { packages: ['capp-third'] }), 'the run log\'s `= pin` lines are recorded on their sources (an unknown source is not invented; a bad name dropped) and the schema keeps them', m1.sources);
  // the root script's own functions, run here (no root: install → cp, /etc → a scratch dir) — THE SAME BYTES as sourcePin
  const fnOf = (script, name) => (new RegExp(`^${name}\\(\\) \\{ .*\\}$`, 'm').exec(script) || new RegExp(`^${name}\\(\\) \\{[^\\n]*\\n[\\s\\S]*?\\n\\}$`, 'm').exec(script) || [null])[0];
  const pinRun = (script, tag) => {
    const d = myDir(`cah-pin-${tag}`);
    for (const x of ['sys/sources', 'sys/entries', 't', 'etc/apt']) fs.mkdirSync(path.join(d, x), { recursive: true });
    fs.writeFileSync(path.join(d, 'sys/sources/fx.sources'), 'Types: deb\nURIs: https://vs-fixture.test:8443/repo\nSuites: stable\nComponents: main\nSigned-By: /etc/apt/keyrings/vibespace-fx.asc\n');
    fs.writeFileSync(path.join(d, 'sys/sources/other.sources'), 'Types: deb\nURIs: https://pkg.other.example/apt/\nSuites: stable\nSigned-By: /etc/apt/keyrings/vibespace-other.asc\n');
    fs.writeFileSync(path.join(d, 'sys/entries/third.pin'), 'fx capp-third\nfx capp-lib\nother zz-tool\nfx Bad;name\n');
    fs.writeFileSync(path.join(d, 'sys/entries/hello.pin'), '');
    const fns = ['say', 'refuse', 'pkgok', 'field', 'srcs', 'from', 'pins'].map((n) => fnOf(script, n));
    if (fns.some((f) => !f)) return { missing: true };
    const body = fns.join('\n').replace(/install -d -m 0755 /g, 'mkdir -p ').replace(/install -m 0644 -o root -g root /g, 'cp ').replace(/"\/etc\/apt\//g, '"$E/etc/apt/').replace(/ \/etc\/apt\//g, ' $E/etc/apt/');
    const sh = `set -eu\nexport LC_ALL=C\nR=${d}/sys; T=${d}/t; E=${d}\n${body}\nprintf '%s' "$URIS" | from > "$T/from"; pins\n`;
    const r = spawnSync('sh', ['-c', sh], { encoding: 'utf8', env: { PATH: process.env.PATH, URIS }, timeout: 20000 });
    const rd = (f) => { try { return fs.readFileSync(path.join(d, f), 'utf8'); } catch { return null; } };
    return { code: r.status, out: r.stdout, err: r.stderr, from: rd('t/from'), fx: rd('etc/apt/preferences.d/vibespace-fx.pref'), fxSys: rd('sys/sources/fx.pref'), other: rd('etc/apt/preferences.d/vibespace-other.pref') };
  };
  const pr = pinRun(A.APP_SCRIPT, 'now');
  const wantFx = A.sourcePin({ host: 'vs-fixture.test', packages: ['capp-third', 'capp-lib'] });
  ok(pr.code === 0 && pr.fx === wantFx && pr.fxSys === wantFx && pr.other === A.sourcePin({ host: 'pkg.other.example', packages: ['zz-tool'] }), 'pins() (the root script\'s own text, run here) writes /etc/apt/preferences.d/vibespace-<id>.pref AND root\'s copy sys/sources/<id>.pref — byte-identical to the PURE sourcePin (the port dropped, a bad name skipped)', pr);
  const runPins = A.parseRunLog('= run x nonce1234 install\n' + (pr.out || ''), { id: 'x', nonce: 'nonce1234' }).pins;
  ok(same(runPins, { fx: ['capp-lib', 'capp-third'], other: ['zz-tool'] }), 'its `= pin` lines parse to each source\'s allow-list (what the index records)', runPins);
  ok(pr.from === 'fx capp-third\n', 'from() (the root script\'s attribution) names exactly the .deb under the source\'s URI — the same rule as originOf (…/repository is not …/repo; another host is not the source)', pr.from);
  ok(/`finish\(\) \{ pins; q > /.test(MANIFEST_SRC) && (A.APP_SCRIPT.match(/hook; rebase; restore/g) || []).length === 2 && /restore\(\) \{[\s\S]*?\n {2}pins\n\}/.test(A.APP_SCRIPT), 'every run ends with pins() (finish), both replay rungs start with restore() (sources, keys AND pins back before apt runs)');
  ok(/if srcs; then mkdir -p "\$T\/arch\/partial"; apt-get \$LOCK -o Dir::Cache::archives="\$T\/arch\/" --print-uris -y install "\$@"/.test(A.APP_SCRIPT) && /cp "\$T\/req"[^\n]*sort -u "\$T\/from" > "\$R\/entries\/\$ID\.pin\.tmp"/.test(A.APP_SCRIPT) && /rm -f "\$R\/entries\/\$ID\.list" "\$R\/entries\/\$ID\.desktop" "\$R\/entries\/\$ID\.pin"/.test(A.APP_SCRIPT), 'an install attributes what it fetches BEFORE apt runs (an empty archives dir: every .deb printed), the entry keeps it (.pin), a removal drops it');
  // CONTROL: a patched copy whose pins() writes nothing (the pre-fix script: no pin at all) — the parity above is red
  const noPin = MUT.load('src/app-manifest.js', MANIFEST_SRC.replace("'pins() {',", "'pins() { return 0',"), 'no-pin');
  const pc = pinRun(noPin.APP_SCRIPT, 'ctl');
  ok(pc.code === 0 && pc.fx === null && pc.fxSys === null && pc.fx !== wantFx, 'CONTROL (no-pin): the same run writes no pin — an approved source\'s every package would compete at apt\'s default 500', pc);
  // verify r1 — the pin's order and reach: every run re-pins BEFORE any apt (a source approved before .203 had no pin, so
  // its first Refresh took the source's newer hello), the source mode writes the pin BEFORE its source is live (a SIGKILL
  // during apt-get update left it live unpinned), a source on a host the machine's own apt sources use is refused
  const orderOf = (script) => {
    const at = script.indexOf('\ncase $MODE in\ninstall)');
    const br = (/\nsource\)\n([\s\S]*?)\nsource-remove\)\n/.exec(script) || [, ''])[1];
    const iRec = br.indexOf('"$R/sources/$ID.sources"; pins; install'), iLive = br.indexOf('"/etc/apt/sources.list.d/vibespace-$ID.sources"');
    return { repin: at > 0 && script.slice(0, at).endsWith('\npins'), pinFirst: iRec > 0 && iRec < iLive && br.indexOf('apt-get') > iLive, refuseFirst: br.indexOf('refuse shared-host') >= 0 && br.indexOf('refuse shared-host') < br.indexOf('grab ') };
  };
  ok(same(orderOf(A.APP_SCRIPT), { repin: true, pinFirst: true, refuseFirst: true }), 'every run calls pins() before the mode dispatch (before any apt-get of any mode); source mode: shared-host refused before anything is written, root\'s record, THEN the pin, THEN the live source, THEN apt-get update', orderOf(A.APP_SCRIPT));
  const mineRun = (script, U, tag) => {
    const d = myDir(`cah-mine-${tag}`);
    fs.mkdirSync(path.join(d, 'etc/apt/sources.list.d'), { recursive: true });
    fs.writeFileSync(path.join(d, 'etc/apt/sources.list'), '# deb http://commented.example/debian bookworm main\ndeb http://deb.debian.org/debian bookworm main\ndeb [signed-by=/usr/share/keyrings/x.gpg arch=amd64] https://Mirror.Example:8080/ubuntu noble main\n');
    fs.writeFileSync(path.join(d, 'etc/apt/sources.list.d/extra.list'), 'deb-src http://src.example/debian bookworm main\n');
    fs.writeFileSync(path.join(d, 'etc/apt/sources.list.d/own.sources'), 'Types: deb\nURIs: https://own.example/apt http://own2.example/apt\nSuites: stable\n');
    fs.writeFileSync(path.join(d, 'etc/apt/sources.list.d/vibespace-fx.sources'), 'Types: deb\nURIs: https://vs-fixture.test:8443/repo\nSuites: stable\n');
    const line = (/\n {2}h=\$\(printf[^\n]*shared-host[^\n]*/.exec(script) || [''])[0];
    const body = ['say', 'refuse', 'mine'].map((n) => fnOf(script, n) || '').join('\n').replace(/ \/etc\/apt\//g, ' $E/etc/apt/');
    const r = spawnSync('sh', ['-c', `set -eu\nE=${d}\n${body}\nmine | tr '\\n' ' '; echo\n${line}\necho passed\n`], { encoding: 'utf8', env: { PATH: process.env.PATH, U }, timeout: 20000 });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const mn = mineRun(A.APP_SCRIPT, 'https://Deb.Debian.org/debian', 'now');
  ok(mn.out.split('\n')[0] === 'deb.debian.org mirror.example own.example own2.example src.example ', 'mine() (the root script\'s own text): the hosts of the machine\'s own sources — sources.list, *.list, *.sources; commented lines and vibespace-* aside; lower case, no port', mn.out);
  ok(mn.code === 125 && /= refused shared-host deb\.debian\.org/.test(mn.out), 'a source on deb.debian.org (bookworm-backports, say) is refused shared-host: its pin would hold the machine\'s own Debian archive — security updates too — at priority 1', mn.out);
  const mo = mineRun(A.APP_SCRIPT, 'https://vs-fixture.test:8443/repo', 'own');
  ok(mo.code === 0 && /passed/.test(mo.out), '…a source on a host of its own is not (another VibeSpace source\'s host is not the machine\'s)', mo.out);
  // CONTROL: the pre-fix order (no re-pin before the dispatch, the source live before its pin, no shared-host check)
  const preOrder = MUT.load('src/app-manifest.js', MANIFEST_SRC.replace("  'pins',\n  'case $MODE in',", "  'case $MODE in',").replace('"$R/sources/$ID.sources"; pins; install', '"$R/sources/$ID.sources"; install').replace(/\n {2}'  h=\$\(printf[^\n]*shared-host[^\n]*/, ''), 'pre-order');
  const pmn = mineRun(preOrder.APP_SCRIPT, 'https://Deb.Debian.org/debian', 'ctl');
  ok(same(orderOf(preOrder.APP_SCRIPT), { repin: false, pinFirst: false, refuseFirst: false }) && pmn.code === 0, 'CONTROL (the pre-fix order): no re-pin before the dispatch, the source live before its pin, a deb.debian.org source passes', { order: orderOf(preOrder.APP_SCRIPT), mine: pmn });
}

console.log('§8d verify-r1 H2 — ONE read of a user-owned file: root\'s grab() and the machine half\'s readHashed never block on a FIFO');
{
  const d = myDir('cah-grab');
  const fifo = path.join(d, 'swap.deb'); spawnSync('mkfifo', [fifo]);
  const real = path.join(d, 'real.deb'); fs.writeFileSync(real, crypto.randomBytes(300000));
  fs.symlinkSync(real, path.join(d, 'link.deb'));
  const H = crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex');
  const grabSh = (src, extra = '') => `set -eu\nT=${d}\n${['say', 'refuse', 'grab'].map((n) => fnOf2(A.APP_SCRIPT, n)).join('\n')}\n${extra}grab "${src}" "$T/in.deb" no-deb\n[ "$(sha256sum "$T/in.deb" | cut -d" " -f1)" = "${H}" ] || refuse deb-changed\nsay ok`;
  const t0 = Date.now();
  const g1 = spawnSync('sh', ['-c', grabSh(fifo)], { encoding: 'utf8', timeout: 10000 });
  ok(g1.status === 125 && /= refused deb-changed/.test(g1.stdout) && Date.now() - t0 < 8000, `root's grab of a FIFO (the staged .deb swapped for one) returns at once (${Date.now() - t0} ms) and the hash refuses it — the slot is never hung`, { code: g1.status, out: g1.stdout, signal: g1.signal });
  const g2 = spawnSync('sh', ['-c', grabSh(path.join(d, 'link.deb'))], { encoding: 'utf8', timeout: 10000 });
  ok(g2.status === 125 && /= refused no-deb/.test(g2.stdout), 'a symbolic link is never followed (refused no-deb)', g2.stdout);
  const g3 = spawnSync('sh', ['-c', grabSh(real)], { encoding: 'utf8', timeout: 10000 });
  ok(g3.status === 0 && /= ok/.test(g3.stdout), 'a regular file is copied whole (its hash holds)', g3.stdout + g3.stderr);
  ok(!/\[ -f "\$S" \] && \[ ! -L "\$S" \] \|\| refuse no-deb/.test(A.APP_SCRIPT) && !/cp "\$S"|cp "\$K"/.test(A.APP_SCRIPT) && /grab "\$S" "\$T\/in\.deb" no-deb/.test(A.APP_SCRIPT) && /grab "\$K" "\$T\/key" no-key/.test(A.APP_SCRIPT), 'deb and source modes read the user\'s file through grab() — no `[ -f ] && cp` gap left');
  // CONTROL: the pre-fix read (cp) of the same FIFO does not return (killed by the timeout)
  const c1 = spawnSync('cp', [fifo, path.join(d, 'cp.deb')], { encoding: 'utf8', timeout: 2000 });
  ok(c1.signal === 'SIGTERM' || c1.error, 'CONTROL: the pre-fix `cp` of a FIFO blocks until killed — what hung the slot', { signal: c1.signal, status: c1.status });
  const AS0 = require('../src/app-serve.js');
  const t1 = Date.now();
  let rh = null;
  try { await AS0.readHashed(fifo, path.join(d, 'o1.deb'), 1e9); rh = 'resolved'; } catch (e) { rh = e.code; }
  ok(rh === 'bad_name' && Date.now() - t1 < 3000, `the machine half's readHashed of a FIFO answers bad_name at once (${Date.now() - t1} ms) — its type judged on the open fd, no libuv thread parked`, rh);
  const okh = await AS0.readHashed(real, path.join(d, 'o2.deb'), 1e9);
  ok(okh.sha256 === H && okh.size === 300000 && crypto.createHash('sha256').update(fs.readFileSync(path.join(d, 'o2.deb'))).digest('hex') === H, 'a regular file: the hash is of exactly the bytes staged (one read)');
  // CONTROL: the pre-fix copy (fsp.copyFile) of the same FIFO has not settled after 1 s — a libuv thread sits in open()
  let settled = false;
  const pcf = fs.promises.copyFile(fifo, path.join(d, 'o3.deb')).then(() => { settled = true; }, () => { settled = true; });
  await new Promise((r) => setTimeout(r, 1000));
  ok(!settled, 'CONTROL: the pre-fix fsp.copyFile of a FIFO is still parked after 1 s');
  try { const w = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(w); } catch { /* no reader yet */ }
  await Promise.race([pcf, new Promise((r) => setTimeout(r, 3000))]);
}

console.log('§9 controls — a patched copy per rule');
{
  const rel = 'src/app-manifest.js';
  const src = fs.readFileSync(path.join(repo, rel), 'utf8');
  const patch = (from, to, tag) => { const m = src.replace(from, to); ok(m !== src, `CONTROL (${tag}): the patch applies`); return MUT.load(rel, m, tag); };
  const noSnap = patch("if (closure.some((c) => c.package === 'snapd'))", 'if (false)', 'no-snap');
  ok(noSnap.parsePlan(fx('ubuntu-snap.sim.txt'), '', { requested: ['chromium-browser'], facts: FACTS }).ok, 'CONTROL (no-snap): without the snapd check the snap placeholder plans OK — §3\'s needs_snap row goes red');
  const noStrip = patch("const words = stripFieldCodes(w0);", 'const words = w0;', 'no-strip');
  ok(same(noStrip.parseDesktopFile(fx('desktop-libreoffice-math.desktop'), { entry: 'x' }).row.args, ['--math', '%U']), 'CONTROL (no-strip): %U survives into the row\'s args — §4 goes red');
  const noBase = patch('const missing = closure.filter((c) => !inBase.has(k(c)) && !inCache.has(k(c)));', 'const missing = closure.filter((c) => !inCache.has(k(c)));', 'no-base');
  ok(noBase.cacheVerdict({ closure: [{ package: 'libc6', version: '2.36' }], base: [{ package: 'libc6', version: '2.36' }], cache: [] }).missing.length === 1, 'CONTROL (no-base): the base package counts as missing — the cache would refetch the image');
  const noMarker = patch("if (markerHit) return { run: false, rung: null, why: 'replayed' };", '', 'no-marker');
  ok(noMarker.replayRungs({ entries: 1, markerHit: true, baseShaNow: 'a', baseShaStored: 'a' }).run, 'CONTROL (no-marker): a restarted server replays again on every boot — the 1 ms hit goes red');
  const noSlack = patch('if (touchedAt <= slotEndedAt + slackMs)', 'if (touchedAt < slotEndedAt)', 'no-slack');
  ok(noSlack.driftVerdict({ touchedAt: 5000, slotEndedAt: 4000, last: [], now: [{ package: 'c', arch: 'amd64', version: '1' }] }).drift, 'CONTROL (no-slack): VibeSpace\'s own dpkg run reads as drift');
  const noRemoves = patch('if (sim.remv.length) return', 'if (false) return', 'no-removes');
  ok(noRemoves.parsePlan(fx('debian-remove.sim.txt'), '', { requested: ['something'], facts: FACTS }).ok, 'CONTROL (no-removes): an install that removes 27 packages plans OK');
  const noEpoch = patch("String(version).replace(/^\\d+:/, '')", 'String(version)', 'no-epoch');
  ok(noEpoch.debFileName({ package: 'libxt6', version: '1:1.2.1-1.1', arch: 'amd64' }) !== 'libxt6_1.2.1-1.1_amd64.deb', 'CONTROL (no-epoch): the file name keeps the epoch — §6\'s real-run row goes red');
  const noPkgok = patch("'install|adopt) [ $# -gt 0 ] || refuse no-packages; for p in \"$@\"; do pkgok \"$p\" || refuse bad-name \"$p\"; done ;;',", "'install|adopt) [ $# -gt 0 ] || refuse no-packages ;;',", 'no-pkgok');
  const dir = myDir('app-manifest-ctl');
  const sh2 = path.join(dir, 'app.sh'); fs.writeFileSync(sh2, noPkgok.APP_SCRIPT);
  const r = spawnSync('sh', [sh2, path.join(dir, 'apps'), 'install', 'x', 'abcdefgh1', '--', '-o', 'X=1'], { encoding: 'utf8' });
  ok(/refused not-root/.test(r.stdout || '') && !/bad-name/.test(r.stdout || ''), 'CONTROL (no-pkgok): without the early check an apt OPTION passes as a package as far as root — §8\'s refusal row goes red', r.stdout);
  const noDisk = patch('if (disk) return', 'if (false) return', 'no-disk');
  ok(noDisk.parsePlan(fx('debian-gimp.sim.txt'), fx('debian-gimp.uris.txt'), { requested: ['gimp'], facts: { ...FACTS, rootFree: 2.5e9 } }).ok, 'CONTROL (no-disk): a full disk plans OK');
}

console.log('§10 the machine half in-process (src/app-serve.js)');
{
  const AS = require('../src/app-serve.js');
  // the binary keyring is kept as base64 text (no tracked file carries a NUL byte — test-architecture's census)
  for (const [f, bytes] of [['key-ubuntu-archive.b64', Buffer.from(fx('key-ubuntu-archive.gpg.b64'), 'base64')], ['key-githubcli.asc', fs.readFileSync(path.join(FX, 'key-githubcli.asc'))]]) {
    const want = fx(f + '.fpr').trim().split('\n');
    const got = AS.keyFingerprints(bytes);
    ok(same(got, want), `${f}: the fingerprints the OpenPGP reader computes = gpg's own (${want.length}: ${want.map((x) => x.slice(-8)).join(' ')})`, got);
  }
  ok(AS.keyFingerprints(Buffer.from('not a key')).length === 0 && AS.keyFingerprints(Buffer.from('-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nAAAA\n-----END PGP PUBLIC KEY BLOCK-----\n')).length === 0, 'garbage / an empty armor → no fingerprint (the plan then refuses bad_source)');
  // a plan over a stub runner answering the CAPTURED apt text
  const home = myDir('app-serve-home');
  const st = path.join(home, 'state'); fs.mkdirSync(st, { recursive: true });
  const calls = [];
  const runner = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const a = args.join(' ');
    if (cmd === 'dpkg' && a === '--print-architecture') return { code: 0, stdout: 'amd64\n', stderr: '' };
    if (cmd === 'sudo') return { code: 0, stdout: '', stderr: '' };
    if (cmd === 'apt-get' && / -s install /.test(' ' + a + ' ') && /hello$/.test(a)) return { code: 0, stdout: fx('debian-hello.sim.txt'), stderr: '' };
    if (cmd === 'apt-get' && /--print-uris -y install hello$/.test(a)) return { code: 0, stdout: fx('debian-hello.uris.txt'), stderr: '' };
    if (cmd === 'apt-get' && /\bupdate$/.test(a)) return { code: 0, stdout: '', stderr: '' };
    if (cmd === 'dpkg-deb' && args[0] === '-I') return { code: 0, stdout: fx('debian-deb.info.txt'), stderr: '' };
    if (cmd === 'dpkg-deb' && args[0] === '-f') return { code: 0, stdout: 'Package: hello\nVersion: 2.10-3\nArchitecture: amd64\nMaintainer: Example Maintainer <maintainer@example.invalid>\n', stderr: '' };
    if (cmd === 'apt-get' && / -s install .*\.deb$/.test(' ' + a)) return { code: 0, stdout: fx('debian-deb.sim.txt'), stderr: '' };
    if (cmd === 'apt-get' && /--print-uris -y install .*\.deb$/.test(a)) return { code: 0, stdout: '', stderr: '' };
    if (cmd === 'apt-cache') return { code: 0, stdout: 'hello - example package based on GNU hello\nhello-traditional - example package\n', stderr: '' };
    return { code: 100, stdout: '', stderr: `E: unexpected ${cmd} ${a}` };
  };
  const emptyLists = path.join(home, 'no-lists'); fs.mkdirSync(emptyLists);
  const mk = (o = {}) => AS.create({ home, stateDir: st, env: () => ({ PATH: '/usr/bin:/bin', HOME: home }), log: { log() { }, warn() { } }, binOnPath: (n) => `/usr/bin/${n}`, installState: async () => ({ installing: null, lastInstall: null }), runner, isRoot: false, systemLists: emptyLists, dpkgStatus: path.join(FX, 'debian-dpkg-status.txt'), markerDir: path.join(home, 'markers'), osRelease: '/nonexistent', ...o });
  const ap = mk();
  const r = await ap.plan({ kind: 'apt', packages: ['hello'] });
  ok(r.plan.ok && r.plan.mode === 'install' && r.plan.entryId === 'hello' && same(r.plan.argv.slice(0, 2), ['sudo', '-n']) && same(r.plan.argv.slice(5), ['vs-app', ap.appsDir, 'install', 'hello', r.plan.nonce, '--', 'hello']) && r.plan.downloadBytes === 53080 && r.install.stateDir === st, 'a plan over the captured apt text: ok, the argv\'s positions (the machine\'s own apps dir, the run\'s nonce, the packages), the exact download, the slot\'s state dir', r.plan);
  ok(calls.some((c) => c[0] === 'apt-get' && c.includes(`Dir::State::Lists=${ap.listsRoot}/lists`) && c[c.length - 1] === 'update'), 'a machine whose system has NO apt lists (a container image) simulates on the user\'s own lists, fetched first (never as root)');
  const callsBefore = calls.length;
  const sysLists = path.join(home, 'sys-lists'); fs.mkdirSync(sysLists); fs.writeFileSync(path.join(sysLists, 'deb.debian.org_debian_dists_bookworm_main_binary-amd64_Packages'), '');
  const r2 = await mk({ systemLists: sysLists }).plan({ kind: 'apt', packages: ['hello'] });
  ok(r2.plan.ok && !calls.slice(callsBefore).some((c) => c.join(' ').includes('Dir::State::Lists')), 'a machine WITH system lists simulates on them (what root\'s own update + install read) — no user update');
  const bad = await ap.plan({ kind: 'apt', packages: ['hello', '-o', 'x'] });
  ok(!bad.plan.ok && bad.plan.code === 'bad_name' && !calls.some((c) => c.includes('-o') && c.includes('x') && c.includes('install')), 'a bad name is refused before apt is asked');
  // the .deb: copied into staging, bound by its sha256, the argv carries the staged path + the hash
  const deb = path.join(home, 'hello_2.10-3_amd64.deb'); fs.writeFileSync(deb, 'pretend-deb-bytes');
  const rd = await ap.plan({ kind: 'deb', debPath: deb });
  const want = crypto.createHash('sha256').update('pretend-deb-bytes').digest('hex');
  ok(rd.plan.ok && rd.plan.mode === 'deb' && rd.plan.deb.sha256 === want && rd.plan.staged.startsWith(path.join(ap.appsDir, 'staging') + '/') && fs.readFileSync(rd.plan.staged, 'utf8') === 'pretend-deb-bytes' && same(rd.plan.argv.slice(-2), [rd.plan.staged, want]) && rd.plan.source === 'local-file' && rd.plan.commands.some((l) => l.includes(want)), 'a .deb: its bytes COPIED into ~/.vibespace/apps/staging, bound by sha256 (the argv + the commands carry it — root installs only those bytes)', rd.plan);
  ok((fs.statSync(path.join(ap.appsDir, 'staging')).mode & 0o777) === 0o700, 'the staging dir is the user\'s alone (0700)');
  const rs = await ap.plan({ kind: 'search', query: 'hello' });
  ok(rs.results.length === 2 && rs.results[0].package === 'hello', 'search answers apt-cache search');
  // the record reads only what ROOT wrote: a user-written entries list + a forged log is NOT a row
  fs.mkdirSync(path.join(ap.appsDir, 'sys', 'entries'), { recursive: true });
  fs.writeFileSync(path.join(ap.appsDir, 'sys', 'entries', 'evil.list'), 'evil\n');
  fs.writeFileSync(path.join(ap.appsDir, 'sys', 'entries', 'evil.desktop'), '/usr/share/applications/debian-xterm.desktop\n');
  fs.writeFileSync(path.join(st, M.INSTALL_FILES.log), '= run evil abcdefgh1 install\n= desktop evil /usr/share/applications/debian-xterm.desktop\n= ok\n');
  const rec = await AS.runAppOp({ ...ap, plan: ap.plan }, 'app-install', { entryId: 'evil', nonce: 'abcdefgh1', by: { kind: 'agent' } });
  ok(!rec.ok && rec.code === 'not_recorded', 'a forged log + a USER-written entries list (an agent runs as this user) is never recorded — root did not write it', rec);
  ok((await ap.refreshCatalog()).length === 0, '…and the catalog has no row from it');
  const nr = await AS.runAppOp(ap, 'app-install', { entryId: 'hello', nonce: 'zzzzzzzz9', by: { kind: 'user' } });
  ok(!nr.ok && nr.code === 'not_run', 'a record whose run never happened in the slot (another install held it) ⇒ not_run by name', nr);
  const st0 = await ap.status();
  ok(st0.manifest.entries.length === 0 && st0.replay.decision.why === 'no-entries' && st0.replay.baseShaNow === fx('debian-q.sha256').trim(), 'status: no entries; the base sha read from the dpkg status = the root script\'s own', st0.replay);
  // a corrupt index is set aside (bytes kept), never read as empty-and-overwritten silently
  fs.writeFileSync(ap.manifestFile, '{ not json');
  const rm0 = await ap.readManifest();
  ok(rm0.corrupt && /not JSON/.test(rm0.error), 'a corrupt manifest is said by name');
  await ap.writeManifest(A.emptyManifest(), { corrupt: true });
  ok(fs.readdirSync(ap.appsDir).some((n) => n.startsWith('manifest.json.corrupt-')) && JSON.parse(fs.readFileSync(ap.manifestFile, 'utf8')).v === 1, '…and set aside (manifest.json.corrupt-<ms>, its bytes kept) before the next write');
}

console.log('§D9 design 009 — an installer by address / file: the verdicts, the kind by the bytes, the app out of the archive, removal by kind');
{
  const RC = require('../src/app-recipes.js');
  const SQ = require('../src/app-squashfs.js');
  const v = (u, o) => A.fetchVerdict(u, o).ok;
  const allowed = ['https://dldir1v6.qq.com/weixin/Universal/Linux/WeChatLinux_x86_64.deb', 'https://dl.google.com/x.deb?a=1', 'https://xn--fiq228c.com/a', 'https://cdn.example.com:8443/a.AppImage'];
  const refused = ['http://dl.google.com/x.deb', 'ftp://x.com/a', 'file:///etc/passwd', 'https://127.0.0.1/a', 'https://0x7f.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://[fe80::1]/a', 'https://localhost/a', 'https://LOCALHOST./a', 'https://printer.local/a', 'https://svc.internal/a', 'https://router.lan/a', 'https://box.home.arpa/a', 'https://intranet/a', 'https://u:p@dl.google.com/a', 'https://vendor.test/a', 'https://a b.com/x', '', 'https://' + 'a'.repeat(2100) + '.com/'];
  ok(allowed.every((u) => v(u)) && refused.every((u) => !v(u)) && v('https://vendor.test/a', { testHosts: ['vendor.test'] }) && !v('https://box.local/a', { testHosts: ['box.local'] }), 'fetchVerdict: https + a public NAME only — every IP spelling, loopback / mDNS / private suffixes, credentials refused; `.test` only through a suite\'s seam (a real name never)', refused.filter((u) => v(u)));
  const pub = ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450::1'], priv = ['0.0.0.0', '10.9.8.7', '100.64.1.1', '127.0.0.53', '169.254.169.254', '172.31.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fd00::1', 'fe80::1%eth0', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2001:db8::1', 'not-an-ip'];
  const EF = require('../src/egress-fence.js');   // lane webhook-l1-server: the verdict's home is the shared egress fence
  ok(pub.every((a) => EF.addressVerdict(a) === null) && priv.every((a) => typeof EF.addressVerdict(a) === 'string'), 'addressVerdict: every private / loopback / link-local (the metadata 169.254.169.254) / CGNAT / multicast range, IPv4-mapped and NAT64 judged as their IPv4', priv.filter((a) => EF.addressVerdict(a) === null));
  const elf = (t) => { const h = Buffer.alloc(64); h.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0); if (t) h.set([0x41, 0x49, t], 8); h.writeBigUInt64LE(1000n, 0x28); h.writeUInt16LE(64, 0x3a); h.writeUInt16LE(3, 0x3c); return h; };
  const sn = (b) => A.sniffInstaller(b);
  ok(sn(Buffer.from('!<arch>\ndebian-binary   1342177 ')).kind === 'deb' && sn(elf(2)).kind === 'appimage' && sn(elf(1)).kind === null && /type 1/.test(sn(elf(1)).why) && /program/.test(sn(elf(0)).why) && /web page/.test(sn(Buffer.from('\n  <!DOCTYPE html><html>')).why) && sn(Buffer.from('!<arch>\nother.o')).kind === null && sn(Buffer.from('PK\x03\x04zip')).kind === null && A.appImageOffset(elf(2)) === 1000 + 192, 'sniffInstaller: the KIND by the bytes — a Debian ar archive, a type-2 AppImage (ELF + AI\\x02); a type-1 AppImage, a program, a web page, a zip named .deb are not installers; the image starts where the ELF ends');
  const names = A.desktopNames({ zh_TW: '繁', zh_CN: '简', ja_JP: 'J', zh: 'zz' });
  const r1 = A.parseDesktopFile('[Desktop Entry]\nType=Application\nName=WeChat\nName[zh_TW]=微信TW\nName[zh]=微信\nName[ja]=ウィーチャット\nExec=wechat %U\n', { entry: 'wechat' });
  const r2 = A.parseDesktopFile('[Desktop Entry]\nType=Application\nName=Tool\nName[zh_TW]=工具\nExec=tool\n', { entry: 'tool' });
  ok(names.zh === '简' && names.ja === 'J' && r1.row.label === 'WeChat' && r1.row.labels.zh === '微信' && r1.row.labels.ja === 'ウィーチャット' && !r2.row.labels && A.validateManifest({ v: 1, entries: [{ id: 'wechat', kind: 'apt', packages: ['wechat'], by: { kind: 'user' }, rows: [{ ...r1.row, labels: { zh: '微信\nX', ja: 'J', fr: 'no' } }] }] }).manifest.entries[0].rows[0].labels.zh === '微信 X', 'localized names: zh from Name[zh_CN] › Name[zh] (never zh_TW alone), ja from Name[ja] › Name[ja_JP]; the row keeps `label` + `labels` (bounded, one line, zh/ja only)');
  const ls = ['-rw-r--r-- root/root 4113 2025-01-01 00:00 ./usr/share/applications/wechat.desktop', 'lrwxrwxrwx root/root 0 2025-01-01 00:00 ./usr/share/applications/aaa.desktop -> /etc/shadow', '-rw-r--r-- root/root 999999999 2025-01-01 00:00 ./usr/share/applications/big.desktop', '-rw-r--r-- root/root 10 2025-01-01 00:00 ./usr/share/applications/../../../etc/x.desktop', '-rw-r--r-- root/root 10 2025-01-01 00:00 ./opt/wechat/wechat.desktop', '-rw-r--r-- root/root 1000 2025-01-01 00:00 ./usr/share/icons/hicolor/48x48/apps/wechat.png', '-rw-r--r-- root/root 1000 2025-01-01 00:00 ./usr/share/icons/hicolor/256x256/apps/wechat.png', '-rw-r--r-- root/root 1000 2025-01-01 00:00 ./opt/wechat/icons/wechat.png', 'drwxr-xr-x root/root 0 2025-01-01 00:00 ./usr/'].join('\n');
  const mem = A.debMembers(ls);
  ok(JSON.stringify(A.debDesktopOf(mem, { pkg: 'wechat' })) === '["/usr/share/applications/wechat.desktop"]' && A.debIconOf(mem, 'wechat') === '/usr/share/icons/hicolor/256x256/apps/wechat.png' && A.debIconOf(mem, '/opt/wechat/icons/wechat.png') === '/opt/wechat/icons/wechat.png' && A.debIconOf(mem, '/etc/passwd') === null && mem.find((m) => m.type === 'symlink').link === '/etc/shadow', 'a .deb\'s own desktop file: a regular file where a launcher looks — a symlink, a `..` path, a 1 GB "desktop file" are never read; its icon the largest hicolor PNG (or the absolute path it names, if the archive holds it)');
  const rp = (e) => A.removePlanFor(e);
  const ai = rp({ id: 'capp', kind: 'appimage', label: 'Capp' }), uv = rp({ id: 'ruff', kind: 'uv-tool', label: 'ruff' }), np = rp({ id: 'x', kind: 'npm', label: '@scope/pkg' });
  ok(ai.ok && ai.mode === 'home-remove' && /appimage\/capp$/.test(ai.dir) && !ai.argv && !ai.homeArgv && JSON.stringify(uv.homeArgv) === '["uv","tool","uninstall","ruff"]' && JSON.stringify(np.homeArgv) === '["npm","uninstall","-g","--prefix","~/.local","@scope/pkg"]' && !uv.argv && !rp({ id: 'gimp', kind: 'apt', packages: ['gimp'] }).ok && !rp({ id: 'y', kind: 'npm', label: '$(rm -rf ~)' }).ok, 'removePlanFor by kind: an AppImage = its own directory; uv / npm = their own uninstaller as the user (`homeArgv` — the root slot\'s `argv` never set); apt / .deb stay root\'s; a name that is no tool name is refused');
  ok(RC.RECIPES.length <= 12 && RC.searchRecipes('微信')[0].id === 'wechat' && RC.searchRecipes('装微信')[0].id === 'wechat' && RC.searchRecipes('WeChat')[0].id === 'wechat' && RC.searchRecipes('vs code')[0].id === 'vscode' && !RC.searchRecipes('knowledge').length && !RC.searchRecipes('barcode').length && RC.recipeFor(['update.code.visualstudio.com', 'vscode.download.prss.microsoft.com']).id === 'vscode' && RC.recipeFor(['dldir1v6.qq.com', 'evil.example.com']) === null && RC.recipeFor([]) === null && RC.RECIPES.every((r) => A.fetchVerdict(r.url).ok && r.hosts.includes(A.fetchVerdict(r.url).host)), 'recipes: ≤ 12 rows; "微信" / "装微信" / "WeChat" find WeChat, "knowledge" never finds Edge; a row vouches only when EVERY hop stayed on its hosts; every row\'s address passes the verdict and starts on its own host');
  const FXI = path.join(repo, 'scripts/fixtures/apps-installers');
  const open = async (f) => { const b = fs.readFileSync(path.join(FXI, f)); return SQ.open(path.join(FXI, f), A.appImageOffset(b.subarray(0, 64))); };
  for (const f of ['capp-chat.AppImage', 'capp-chat-zstd.AppImage']) {
    const img = await open(f);
    const top = await img.root();
    const desk = await img.readFile(top.find((e) => e.name === 'capp-chat.desktop'));
    const icon = await img.readFile(top.find((e) => e.name === '.DirIcon'));
    const dest = path.join(myDir(`apps-sq-${f.length}`), 'x');
    const cwd0 = process.cwd(); process.chdir(path.dirname(dest)); fs.mkdirSync('elsewhere'); process.chdir('elsewhere');
    const w = await img.extract(dest); process.chdir(cwd0);
    ok(/Name\[zh_CN\]=卡普聊天/.test(desk.toString()) && icon.subarray(1, 4).toString() === 'PNG' && w.count === 7 && fs.readFileSync(path.join(dest, 'usr/bin/capp-chat'), 'utf8') === 'payload\n' && (fs.statSync(path.join(dest, 'AppRun')).mode & 0o777) === 0o755 && fs.readlinkSync(path.join(dest, '.DirIcon')) === 'capp-chat.png' && fs.readdirSync(path.join(path.dirname(dest), 'elsewhere')).length === 0, `the SquashFS reader (${f.includes('zstd') ? 'zstd' : 'gzip'}): the root .desktop + the icon (.DirIcon followed once, by name) read WITHOUT running the AppImage; unpacked whole under its directory (modes, links kept), the cwd elsewhere untouched`, w);
    await img.close();
  }
  const xz = await open('capp-chat-xz.AppImage').then(() => null, (e) => e);
  const hz = await open('hostile.AppImage');
  const hRoot = await hz.root();
  const viaLink = await hz.readFile(hRoot.find((e) => e.name === 'zz.desktop'));
  const hd = path.join(myDir('apps-sqh'), 'x');
  const hw = await hz.extract(hd).then(() => null, (e) => e);
  await hz.close();
  ok(xz && xz.code === 'unsupported' && /xz/.test(xz.message) && viaLink === null && hw && hw.code === 'hostile' && /`\.\.`/.test(hw.message) && !fs.existsSync(path.join(path.dirname(hd), 'f')), 'refused BY NAME: an xz-packed AppImage (`unsupported`); a desktop file that is a symlink to /etc/passwd is never read; a tree holding a `..` name is refused before anything lands outside');
}
console.log('§D019 design 019 — reconcileIndex (the index follows root), dedupeRows (one row per app), the forget mode');
{
  const E0 = (id, o = {}) => ({ id, kind: 'apt', packages: [id + 'pkg'], by: { kind: 'user' }, rows: [], services: [], ...o });
  const M0 = (entries) => ({ ...A.emptyManifest(), generation: 3, entries });
  const R0 = (id) => ({ id, packages: [id + 'pkg'] });
  const L = (r) => r.manifest.entries.map((e) => `${e.id}:${e.layer || '-'}`).join(' ');
  const rows = [ // [name, manifest, host, sys, check, the control's (host, sys): the deciding layer unreadable]
    ['flag lost: an entry whose record is in the app system gets layer sys', M0([E0('a')]), [], [R0('a')], (r) => same(r.relayered, ['a']) && L(r) === 'a:sys', [[], null]],
    ['flag wrong: an entry claiming sys whose record is on the host loses the flag', M0([E0('b', { layer: 'sys' })]), [R0('b')], [], (r) => same(r.relayered, ['b']) && L(r) === 'b:-', [null, []]],
    ['ghost after a Roll back: a record in NEITHER layer drops the entry', M0([E0('g', { layer: 'sys' })]), [], [], (r) => same(r.dropped, ['g']) && L(r) === '', [[], null]],
    ['unindexed record: a minimal entry (by the user, label = id) in its layer', M0([]), [], [R0('n')], (r) => same(r.indexed, ['n']) && L(r) === 'n:sys' && r.manifest.entries[0].by.kind === 'user' && r.manifest.entries[0].label === 'n', [[], null]],
    ['a move in flight (the same packages in both layers) = ONE entry, layer sys', M0([E0('m')]), [R0('m')], [R0('m')], (r) => L(r) === 'm:sys' && !r.collisions.length, [[R0('m')], null]],
    ['the same id over DIFFERENT packages in both layers is named, never merged', M0([E0('c')]), [R0('c')], [{ id: 'c', packages: ['otherpkg'] }], (r) => same(r.collisions, ['c']) && L(r) === 'c:-' && !r.changed, null],
  ];
  for (const [name, m, host, sys, check, ctl] of rows) {
    const r = A.reconcileIndex(m, { host, sys });
    ok(check(r) && (!r.changed || r.manifest.generation === 4), name, { r: L(r), d: r.dropped, i: r.indexed, rl: r.relayered, c: r.collisions });
    if (ctl) { const c = A.reconcileIndex(m, { host: ctl[0], sys: ctl[1] }); ok(!c.changed && c.manifest === m, `CONTROL (${name.split(':')[0]}): the layer that decides it cannot be read → the entry is left alone`, L(c)); }
  }
  const rh = A.reconcileIndex(M0([E0('h'), { id: 'u', kind: 'npm', packages: [], label: 'u', by: { kind: 'user' }, rows: [], services: [] }]), { host: [], sys: [] });
  ok(same(rh.dropped, ['h']) && rh.manifest.entries.some((e) => e.id === 'u' && e.kind === 'npm'), 'home kinds untouched (an npm entry has no root record and stays)');
  const once = A.reconcileIndex(M0([E0('a'), E0('g')]), { host: [], sys: [R0('a'), R0('n')] });
  const twice = A.reconcileIndex(once.manifest, { host: [], sys: [R0('a'), R0('n')] });
  ok(once.changed && !twice.changed && twice.manifest === once.manifest, 'idempotent: a second reconcile over the same records changes nothing');
  const hr = [{ id: 'app.hello', package: 'hello' }, { id: 'app.gimp', package: 'gimp' }], sr = [{ id: 'sys.hello', package: 'hello' }];
  ok(same(A.dedupeRows(hr, sr).map((r) => r.id), ['app.gimp']) && same(A.dedupeRows(hr, []).map((r) => r.id), ['app.hello', 'app.gimp']), 'dedupeRows: a host row whose package an app-system row carries is no row (CONTROL: no sys rows → every host row stays)');
  const fa = A.appArgv({ mode: 'forget', appsDir: '/home/u/.vibespace/apps', id: 'hello', nonce: 'abcdef123' });
  ok(same(fa.slice(5), ['vs-app', '/home/u/.vibespace/apps', 'forget', 'hello', 'abcdef123', '--']) && A.SCRIPT_MODES.includes('forget'), 'forget argv: the entry id only, as a POSITION');
  let threw = 0; for (const o of [{ id: '../x' }, { id: 'X' }, { args: ['hello'] }]) { try { A.appArgv({ mode: 'forget', appsDir: '/a', id: 'hello', nonce: 'abcdef123', ...o }); } catch { threw++; } }
  ok(threw === 3, 'forget argv judged before root: a bad id / an extra argument throws');
  const fb = A.APP_SCRIPT.split('\nforget)\n')[1].split('\nsource-remove)')[0];
  ok(!/apt-get \$LOCK/.test(fb) && /rm -f "\$R\/entries\/\$ID\.list"/.test(fb) && /refuse no-entry/.test(fb) && /k=0/.test(fb), 'the forget branch runs NO apt install/remove, drops the three record files, refuses an unknown id, keeps the cache when apt cannot simulate the closure');
  const dirF = myDir('app-manifest-forget'), shF = path.join(dirF, 'app.sh'); fs.writeFileSync(shF, A.APP_SCRIPT);
  const appsF = path.join(dirF, 'home/.vibespace/apps'); fs.mkdirSync(appsF, { recursive: true });
  const runF = (...a) => { const r = spawnSync('sh', [shF, ...a], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: path.join(dirF, 'home') } }); return (r.stdout || '') + (r.stderr || ''); };
  ok(/= refused bad-id/.test(runF(appsF, 'forget', '-x', 'abcdefgh1', '--')) && /= refused bad-args/.test(runF(appsF, 'forget', 'hello', 'abcdefgh1', '--', 'other')) && /= run hello abcdefgh1 forget\n= refused not-root/.test(runF(appsF, 'forget', 'hello', 'abcdefgh1', '--')), 'the script: forget with a bad id / an extra argument is refused before root; valid arguments reach the root check (nothing touched here)');
}
console.log('§kinds a NEW app kind is its OWN FILE + ONE line of src/app-kinds/index.js (lanes dc-apps-rows, dc-app-kinds): a fake member drives the real consumers');
{
  // the fake members: a kind file in a scratch dir + ONE registration line in a copy of src/app-kinds/index.js; the REAL
  // consumers (manifest, card, engine, machine half, dialog, CLI) are loaded fresh over it — nothing else is edited
  const http = require('node:http');
  const KDIR = myDir('acme-kind');
  fs.writeFileSync(path.join(KDIR, 'acme.js'), `'use strict';
async function planner(c) { const { p, f, kind, canRun, ret } = c; return ret({ ok: true, code: null, error: null, canRun, kind, mode: 'acme', entryId: 'acme-x', packages: [String(p.thing || '')], closure: [], closureKey: 'acme', newCount: 0, upgradeCount: 0, downloadBytes: 0, installedBytes: 0, origins: [], commands: ['# acme gets ' + p.thing + ' on ' + (f.platform || '?')] }); }
const record = (e, { isObj, str }) => (isObj(e.acme) ? { acme: { tag: str(e.acme.tag, 20) } } : (e.acme ? { error: 'an acme entry carries {tag}' } : null));
const requestOf = (x, { kind }) => (/^[a-z]{1,20}$/.test(String(x.thing || '')) ? { ok: true, request: { kind, thing: String(x.thing) } } : { ok: false, code: 'bad_name', error: 'name the acme thing' });
module.exports = Object.freeze([
  Object.freeze({ id: 'acme-root', entry: 'root', plan: true, request: true, agent: true, sysView: true, closurePlan: true, doing: 'acme-ing', planner, record, requestOf,
    dialogTitle: (t, machine) => t('Install a .deb file on {machine}', { machine }) + ' [acme]', dialogRows: (plan, line) => { line('acme rows: ' + plan.packages.join(' '), 'app-plan-mono'); }, entryNote: () => 'from acme' }),
  Object.freeze({ id: 'acme', entry: 'home', cliWord: 'acme', addArgv: Object.freeze(['acme', 'get']), removeArgv: Object.freeze(['acme', 'drop']) }),
]);
`);
  const realK = require.resolve('../src/app-kinds/index.js');
  const KSRC = fs.readFileSync(realK, 'utf8');
  const ANCHOR = "  require('./installer.js'),\n";
  const LINE = `  ...require(${JSON.stringify(path.join(KDIR, 'acme.js'))}),\n`;
  ok(KSRC.includes(ANCHOR), '§kinds the registration anchor is the index list itself');
  const K2PATH = MUT.write('src/app-kinds/index.js', KSRC.replace(ANCHOR, ANCHOR + LINE), 'fake-kind');
  const K2 = require(K2PATH);
  const over = (kx, rels, srcOf = {}) => { // load `rels` fresh with `kx` standing in for src/app-kinds/index.js (patched copies by `srcOf`)
    const keys = [realK, ...rels.map((r) => require.resolve(`../${r}`))];
    const saved = keys.map((k) => require.cache[k]);
    for (const k of keys) delete require.cache[k];
    require.cache[realK] = { id: realK, filename: realK, loaded: true, exports: kx, children: [], paths: [] };
    try { return rels.map((r) => (srcOf[r] ? MUT.load(r, srcOf[r], `over-${path.basename(r, '.js')}`) : require(`../${r}`))); } finally { keys.forEach((k, i) => { if (saved[i]) require.cache[k] = saved[i]; else delete require.cache[k]; }); }
  };
  // a tiny document for the dialog's plan block (it builds plain elements)
  const node = (tag) => ({ tag, className: '', textContent: '', children: [], style: {}, dataset: {}, classList: { add() { }, remove() { }, toggle() { } }, appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); }, setAttribute() { }, addEventListener() { } });
  const texts = (n) => [n.textContent, ...n.children.flatMap(texts)].filter(Boolean);
  const cli = (api, args) => new Promise((resolve) => { // async: the stub API answers from this process
    const c = spawn(process.execPath, [path.join(repo, 'data/bin/vibespace-app'), ...args], { env: { PATH: process.env.PATH, HOME: KDIR, VIBESPACE_API: api, VIBESPACE_SESSION_TOKEN: 'tok' } });
    let stderr = ''; c.stderr.on('data', (d) => { stderr += d; }); c.stdout.resume();
    const kill = setTimeout(() => c.kill('SIGKILL'), 20000);
    c.on('close', (status) => { clearTimeout(kill); resolve({ status, stderr }); });
  });
  const DSRC = fs.readFileSync(path.join(repo, 'src/lib/app-install-dialog.js'), 'utf8');
  const acmeLegs = async (kx, tag, idxPath) => {
    const [A2, AC2, E2, S2] = over(kx, ['src/app-manifest.js', 'src/app-card.js', 'src/server/apps-engine.js', 'src/app-serve.js']);
    const legs = {};
    const m0 = A2.emptyManifest();
    const ent = (kind, extra = {}) => A2.validateManifest({ ...m0, entries: [{ id: `x-${kind}`, kind, packages: [], by: { kind: 'agent' }, addedAt: 1, label: 'tool', ...extra }] });
    const rec = ent('acme-root', { packages: ['acme-pkg'], acme: { tag: 'v1' } });
    legs.records = A2.HOME_KINDS.includes('acme') && ent('acme').ok && !ent('acme-root').ok && rec.ok && rec.manifest.entries[0].acme.tag === 'v1' && !ent('acme-root', { packages: ['acme-pkg'], acme: 'x' }).ok;
    const rp = A2.removePlanFor({ id: 'x-acme', kind: 'acme', label: 'tool' });
    legs.removes = rp.ok && JSON.stringify(rp.homeArgv) === '["acme","drop","tool"]';
    const nr = E2.normRequest({ kind: 'acme-root', thing: 'widget' }, { agent: true });
    legs.requests = E2.AGENT_KINDS.includes('acme-root') && nr.ok && nr.request.thing === 'widget' && E2.normRequest({ kind: 'acme-root', thing: '1!' }, { agent: true }).code === 'bad_name' && E2.recordOf({ kind: 'acme-root' }, { entryId: 'e1', nonce: 'n1' }, { by: { kind: 'user' } })[1].kind === 'acme-root';
    legs.card = AC2.cardView({ request: { kind: 'acme-root' } }).kind === 'package' && AC2.cardView({ request: { kind: 'acme-root' } }).keeps === 'replay';
    const home = myDir(`acme-home-${tag}`), st = path.join(home, 'state'); fs.mkdirSync(st, { recursive: true }); fs.mkdirSync(path.join(home, 'no-lists'));
    const runner = async (cmd, args) => (cmd === 'dpkg' && args.join(' ') === '--print-architecture' ? { code: 0, stdout: 'amd64\n', stderr: '' } : cmd === 'sudo' ? { code: 0, stdout: '', stderr: '' } : { code: 100, stdout: '', stderr: `E: unexpected ${cmd}` });
    const ap = S2.create({ home, stateDir: st, env: () => ({ PATH: '/usr/bin:/bin', HOME: home }), log: { log() { }, warn() { } }, binOnPath: (n) => `/usr/bin/${n}`, installState: async () => ({ installing: null, lastInstall: null }), runner, isRoot: false, systemLists: path.join(home, 'no-lists'), dpkgStatus: path.join(FX, 'debian-dpkg-status.txt'), markerDir: path.join(home, 'markers'), osRelease: '/nonexistent' });
    let pl = null; try { pl = (await ap.plan({ kind: 'acme-root', thing: 'widget' })).plan; } catch (e) { pl = { error: String(e.message || e) }; }
    legs.plans = !!(pl && pl.ok && pl.mode === 'acme' && pl.packages[0] === 'widget' && /acme gets widget/.test(pl.commands[0]));
    // the dialog: a copy whose ONE index import names this run's index (the fake's copy / the real one)
    const D = await import(MUT.write('src/lib/app-install-dialog.js', DSRC.replace("from '../app-kinds/index.js'", `from ${JSON.stringify(idxPath)}`), `dialog-${tag}`, { esm: true }));
    globalThis.document = { createElement: node };
    try { legs.dialog = /\[acme\]/.test(D.appDialogTitle({ kind: 'acme-root' }, 'box')) && texts(D.appPlanBlock({ ...(pl && pl.ok ? pl : { kind: 'acme-root', packages: ['widget'] }), closure: [] })).some((x) => x === 'acme rows: widget'); } catch (e) { legs.dialog = false; } finally { delete globalThis.document; }
    // the CLI reads the declared rows (GET /api/agent/apps/kinds) — it accepts / refuses by them
    const srv = http.createServer((q, s) => { s.setHeader('content-type', 'application/json'); s.end(q.url.startsWith('/api/agent/apps/kinds') ? JSON.stringify({ kinds: kx.kindsView() }) : '{"error":"nope"}'); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const api = `http://127.0.0.1:${srv.address().port}`;
    const acc = await cli(api, ['add', '--kind', 'acme', 'tool', '--why', 'w']);
    const ref = await cli(api, ['add', '--kind', 'nope', 'tool']);
    srv.close();
    legs.cliSaid = `${acc.status} ${acc.stderr.slice(0, 160)} | ${ref.status} ${ref.stderr.slice(0, 120)}`;
    legs.cli = acc.status !== 2 && /acme/.test(acc.stderr) && ref.status === 2 && /--kind uv\|npm\|acme /.test(ref.stderr);
    legs.lists = kx.kindsView().some((r) => r.id === 'acme-root' && r.doing === 'acme-ing' && !('planner' in r));
    return legs;
  };
  const got = await acmeLegs(K2, 'fake', K2PATH);
  for (const [k, v] of Object.entries(got)) if (k !== 'cliSaid') ok(v, `§kinds the fake kind ${k}: its own file + ONE index line, the real consumer asks its row`, k === 'cli' ? got.cliSaid : undefined);
  // CONTROL 1: the fake row removed (the real index) — every acme leg goes red
  const ctl = await acmeLegs(require(realK), 'real', realK);
  // (the card leg is the DEFAULT card row — it draws any undeclared kind, so it is no member leg)
  ok(Object.entries(ctl).every(([k, v]) => k === 'cliSaid' || k === 'card' || !v), '§kinds CONTROL: without the index line every acme leg is red', ctl);
  // CONTROL 2: a literal kind branch planted back in the machine half — the §78 ratchet sees the rise
  const IB = await import('./id-branch-census.mjs');
  const baseIB = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/id-branch-baseline.json'), 'utf8'));
  const ASRC = fs.readFileSync(path.join(repo, 'src/app-serve.js'), 'utf8');
  const PLANT = "    if (planRow.planner) return planRow.planner(";
  ok(ASRC.includes(PLANT), '§kinds control anchor: the machine half dispatches on the row');
  const planted = IB.census(repo, { files: ['src/app-serve.js'], read: () => ASRC.replace(PLANT, "    if (kind === 'deb') return null;\n" + PLANT) });
  const jr = IB.judge({ appkind: baseIB.appkind || {} }, { appkind: planted.counts.appkind });
  ok(jr.rises.some((r) => r.file === 'src/app-serve.js'), '§kinds CONTROL: a planted `kind === \'deb\'` branch in src/app-serve.js is a §78 appkind rise', jr);
  const real = require('../src/app-kinds/index.js');
  ok(['ENTRY_KINDS', 'HOME_KINDS'].every((n) => A[n] === real[n]) && E.REQUEST_KINDS.slice(0, real.REQUEST_KINDS.length).join() === real.REQUEST_KINDS.join() && E.AGENT_KINDS === real.AGENT_KINDS, '§kinds every kind list derives from the ONE index (manifest, engine)');
}
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 8 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
