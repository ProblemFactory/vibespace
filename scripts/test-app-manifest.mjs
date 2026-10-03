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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(repo, 'scripts/fixtures/apt');
const fx = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
const A = require('../src/app-manifest.js');
const M = require('../src/desktop-apps.js');
const MUT = mutantCopies('app-manifest', repo);
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

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 8 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
