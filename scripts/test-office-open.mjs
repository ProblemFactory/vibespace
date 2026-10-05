#!/usr/bin/env node
// OPEN WITH LIBREOFFICE — the PURE gate (docs/design-desktop-apps.zh.md §7.9; the owner's ruling 2026-09-27 ②: a Word
// file is EDITED in LibreOffice running as a VibeSpace desktop app). No process, no server, no browser:
//   §1 the office table + the catalog rows (valid under the model's validator, in DEFAULT_REGISTRY, the row shape)
//   §2 fileVerdict — the file rule (absolute on its machine — a display string is `relative-path` —, an office extension)
//   §3 openWithVerdict — THE VERDICT TABLE: every extension → its row; every refusal code, in its judging order
//   §4 officeArgv — the argv shape: the module switch, --nologo, the session's OWN profile, THE PATH LAST as one item
//   §5 officeRowFor over the facts matrix (no binary / modules / a snap / none)
//   §6 the closed install set + packageInstallPlan (+ installPlanFor('xpra') IS xpraInstallPlan)
//   §7 the launch request's `file` (validateLaunchRequest) + relaunchBodyOf
//   §8 src/lib/file-changed.js — the signal's detail, the folded match
//   §9 WIRING PINS — the keeper, the route, the machine facts, the explorer, the door, the code editor, the broadcast,
//      and the Word VIEWER as the door's second caller (its app named by the verdict, never a hard-coded exec; the
//      census beside two patched copies it must refuse)
//   §10 i18n — every new sentence has its zh + ja entry
//   §11 CONTROLS — a patched copy per rule (scripts/mutant-copy.mjs, outside the tree): each one the table above catches
//   §12 the routes over stubs (in-process express, 127.0.0.1:0): the verdict before any machine, peek never connects, the install stream
// Run: node scripts/test-office-open.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const O = require('../src/office-open.js');
const M = require('../src/desktop-apps.js');
const I = require('../src/installs.js'); // lane dc-apps-rows (F-I1): THE INSTALLABLES — the plan lookup + the closed set live there
const FC = await import(pathToFileURL(path.join(repo, 'src/lib/file-changed.js')).href);
const MUT = mutantCopies('office-open', repo);
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── the fixtures: a served catalog as a machine answers it (the shape desktop-serve's registry() spreads) ──
const served = (mods, { exec = 'libreoffice' } = {}) => O.OFFICE_ROWS.map((r) => O.officeRowFor(r, { exec, path: exec ? `/usr/bin/${exec}` : null, program: '/usr/lib/libreoffice/program', confinement: null, modules: mods }));
const REG_ALL = [{ id: 'xterm', available: true }, ...served({ writer: true, calc: true, impress: true })];
const REG_WRITER = [{ id: 'xterm', available: true }, ...served({ writer: true, calc: false, impress: false })];
const REG_OLD = [{ id: 'xterm', available: true }, { id: 'gedit', available: true }]; // an agent predating the office rows
const F = '/home/u/Docs/Quarterly report.docx';

console.log('§1 the office table + the catalog rows');
{
  ok(same(O.OFFICE_EXECS, ['libreoffice', 'soffice']), 'the binaries a row may resolve to: libreoffice → soffice');
  ok(O.OFFICE_ROWS.every((r) => M.validateAppRow(r).ok), 'every LibreOffice row validates under the model\'s own validator', O.OFFICE_ROWS.map((r) => [r.id, M.validateAppRow(r).error]));
  ok(O.OFFICE_ROWS.every((r) => M.DEFAULT_REGISTRY.some((x) => x.id === r.id && x === r)), 'every LibreOffice row IS in DEFAULT_REGISTRY (spread, not copied)', M.DEFAULT_REGISTRY.map((r) => r.id));
  ok(M.DEFAULT_REGISTRY.every((r) => M.validateAppRow(r).ok) && new Set(M.DEFAULT_REGISTRY.map((r) => r.id)).size === M.DEFAULT_REGISTRY.length, 'DEFAULT_REGISTRY: every row valid, every id unique');
  const w = O.OFFICE_ROWS.find((r) => r.id === 'libreoffice-writer'), c = O.OFFICE_ROWS.find((r) => r.id === 'libreoffice-calc'), i = O.OFFICE_ROWS.find((r) => r.id === 'libreoffice-impress'), g = O.OFFICE_ROWS.find((r) => r.id === 'libreoffice');
  ok(same(w.args, ['--writer']) && same(c.args, ['--calc']) && same(i.args, ['--impress']) && same(g.args, []) && [w, c, i, g].every((r) => r.category === 'office' && r.exec === 'libreoffice' && same(r.execs, O.OFFICE_EXECS)), 'the rows: Writer --writer, Calc --calc, Impress --impress, the Start Center no switch; category office; exec libreoffice, execs libreoffice → soffice');
  ok(w.office === 'writer' && c.office === 'calc' && i.office === 'impress' && g.office === 'any', 'each row names its module (the generic row: any)');
  ok(!M.validateAppRow({ ...w, office: 'draw' }).ok && !M.validateAppRow({ ...w, args: ['--writer', '-env:UserInstallation=file:///home/u/.config/libreoffice/4'] }).ok, 'refused rows: an unknown module; a row carrying its own -env:UserInstallation (the profile is the keeper\'s)');
  ok(!M.validateAppRow({ id: 'x', label: 'x', exec: 'x', execs: ['x'] }).ok && /browser or office/.test(M.validateAppRow({ id: 'x', label: 'x', exec: 'x', execs: ['x'] }).error), 'execs stays refused on a plain row (a browser or office row only)');
  const exts = { docx: 'writer', doc: 'writer', odt: 'writer', rtf: 'writer', xlsx: 'calc', xls: 'calc', ods: 'calc', csv: 'calc', pptx: 'impress', ppt: 'impress', odp: 'impress' };
  ok(same(Object.keys(O.EXT_MODULE).sort(), Object.keys(exts).sort()) && Object.entries(exts).every(([e, m]) => O.EXT_MODULE[e] === m), 'the extension table: docx doc odt rtf → Writer · xlsx xls ods csv → Calc · pptx ppt odp → Impress', O.EXT_MODULE);
  ok(O.isOfficeFile('A.DOCX') && O.isOfficeFile('a.txt.docx') && !O.isOfficeFile('a.docx.txt') && !O.isOfficeFile('.docx') && !O.isOfficeFile('docx') && !O.isOfficeFile('report') && !O.isOfficeFile('a.pdf'), 'isOfficeFile: case-insensitive, the LAST extension, a dotfile named ".docx" / no extension / a PDF are not');
}

console.log('§2 fileVerdict — the file rule');
{
  const rel = ['', null, 42, 'report.docx', '~/report.docx', 'devbox: /home/u/report.docx', './report.docx', '/home/u/r.docx\n', '/home/u/r\0.docx', '/home/u/dir/', '/', `/${'a'.repeat(5000)}.docx`];
  const bad = rel.map((f) => [JSON.stringify(f).slice(0, 40), O.fileVerdict(f).code]).filter(([, c]) => c !== 'relative-path');
  ok(!bad.length, `${rel.length} strings that are not an absolute file path on its machine ⇒ relative-path (a host-labelled display string among them)`, bad);
  ok(['/x/notes.txt', '/x/a.pdf', '/x/report', '/x/.docx'].every((f) => O.fileVerdict(f).code === 'not-office-file'), 'an absolute path without an office extension ⇒ not-office-file');
  const v = O.fileVerdict('/home//u/./Docs/../Docs/Quarterly report.DOCX');
  ok(v.ok && v.file === '/home/u/Docs/Quarterly report.DOCX' && v.ext === 'docx' && v.module === 'writer' && v.label === 'Quarterly report.DOCX', 'a valid path is FOLDED (//, /./, /../), its extension read case-insensitively, its label the basename', v);
  const long = O.fileVerdict(`/x/${'n'.repeat(120)}.docx`);
  ok(long.ok && long.label.length === O.LABEL_MAX && long.label.endsWith('.docx') && long.label.includes('…'), 'a long basename is cut in the MIDDLE to LABEL_MAX — the extension still shows', long.label);
  ok(O.fileVerdict('/x/report', 'odt').module === 'writer', 'an explicit extension overrides the name\'s (a caller that knows the type)');
}

console.log('§3 openWithVerdict — THE VERDICT TABLE');
const TABLE = [
  // [name, input, expected code | {catalogId}]
  ['a relative path is refused FIRST (before the machine rule)', { file: 'r.docx', machine: { hostId: 'local', fileHost: 'h1' } }, 'relative-path'],
  ['a display string ("host: /path")', { file: 'devbox: /home/u/r.docx', machine: {} }, 'relative-path'],
  ['a .txt', { file: '/x/notes.txt', machine: { hostId: 'local' } }, 'not-office-file'],
  ['the file on another machine than the app', { file: F, machine: { hostId: 'local', fileHost: 'devbox' } }, 'machine-mismatch'],
  ['two different paired machines', { file: F, machine: { hostId: 'h1', fileHost: 'h2' } }, 'machine-mismatch'],
  ['"", null, "local" are one machine', { file: F, machine: { hostId: '', fileHost: 'local' } }, { catalogId: 'libreoffice-writer' }],
  ['a paired machine holding the file runs it', { file: F, machine: { hostId: 'devbox', fileHost: 'devbox' } }, { catalogId: 'libreoffice-writer' }],
  ['the machine not answering', { file: F, machine: { hostId: 'devbox', reachable: false, why: 'ssh: timed out' } }, 'host-unreachable'],
  ['a non-office catalog app', { row: 'xterm', file: F, machine: {} }, 'not-office-app'],
  ['a typed command (no catalog id)', { row: { id: null, label: 'soffice' }, file: F, machine: {} }, 'not-office-app'],
  ['a machine whose catalog knows no office row (an older agent)', { file: F, machine: { registry: REG_OLD } }, 'host_needs_daemon'],
  ['Writer absent on the machine', { file: F, machine: { registry: [{ id: 'xterm', available: true }, ...served({ writer: false, calc: true, impress: true })] } }, 'app-absent'],
  ['LibreOffice absent altogether', { file: F, machine: { registry: [{ id: 'xterm', available: true }, ...served(null, { exec: null })] } }, 'app-absent'],
  ['Writer present', { file: F, machine: { registry: REG_WRITER } }, { catalogId: 'libreoffice-writer' }],
  ['a .xlsx asked of the Writer row opens in Calc — and Calc is absent', { row: 'libreoffice-writer', file: '/x/t.xlsx', machine: { registry: REG_WRITER } }, 'app-absent'],
  ['a .xlsx asked of the Writer row opens in Calc', { row: 'libreoffice-writer', file: '/x/t.xlsx', machine: { registry: REG_ALL } }, { catalogId: 'libreoffice-calc' }],
  ['the Start Center row asked with a .pptx opens Impress', { row: 'libreoffice', file: '/x/deck.pptx', machine: { registry: REG_ALL } }, { catalogId: 'libreoffice-impress' }],
  ['no registry (the hub, before a machine is asked): presence is the machine\'s verdict', { file: F, machine: { hostId: 'local' } }, { catalogId: 'libreoffice-writer' }],
];
function tableFails(Mod) {
  const out = [];
  for (const [name, input, want] of TABLE) {
    let v;
    try { v = Mod.openWithVerdict(input); } catch (e) { out.push({ name, want, got: { threw: e.message } }); continue; }
    const good = typeof want === 'string' ? (!v.ok && v.code === want) : (v.ok && v.catalogId === want.catalogId);
    if (!good) out.push({ name, want, got: v.ok ? { ok: true, catalogId: v.catalogId } : { code: v.code } });
  }
  for (const [e, m] of Object.entries(Mod.EXT_MODULE || {})) {
    let v;
    try { v = Mod.openWithVerdict({ file: `/x/f.${e}`, machine: { registry: REG_ALL } }); } catch (err) { out.push({ name: `.${e}`, got: { threw: err.message } }); continue; }
    if (!v.ok || v.catalogId !== O.OFFICE_MODULES[m].id) out.push({ name: `.${e}`, got: v });
  }
  return out;
}
{
  ok(!tableFails(O).length, `${TABLE.length} rows + every extension → its module's row, every refusal by its code`, tableFails(O));
  const a = O.openWithVerdict({ file: F, machine: { registry: [{ id: 'xterm', available: true }, ...served({ writer: false, calc: true, impress: true })], label: 'devbox' } });
  ok(a.remedy && a.remedy.what === 'libreoffice-writer' && same(a.remedy.packages, ['libreoffice-writer', 'fonts-crosextra-carlito', 'fonts-crosextra-caladea']) && a.catalogId === 'libreoffice-writer' && /LibreOffice Writer is not installed on devbox/.test(a.error), 'app-absent carries the INSTALL REMEDY (the module\'s package + the Calibri / Cambria metric faces) and names the machine', a);
  const mm = O.openWithVerdict({ file: F, machine: { hostId: 'local', fileHost: 'devbox', fileLabel: 'Dev box' } });
  ok(mm.hostId === 'local' && mm.fileHost === 'devbox' && /on Dev box/.test(mm.error), 'machine-mismatch names both machines (the file\'s by its display label — a sentence, never an argv)', mm);
  const okv = O.openWithVerdict({ file: F, machine: { registry: REG_WRITER } });
  ok(okv.file === F && okv.label === 'Quarterly report.docx' && okv.module === 'writer' && okv.hostId === 'local', 'an ok verdict: the folded path, the basename label, the module, the machine', okv);
}

console.log('§4 officeArgv — the argv shape');
{
  const w = O.OFFICE_ROWS.find((r) => r.id === 'libreoffice-writer'), g = O.OFFICE_ROWS.find((r) => r.id === 'libreoffice');
  const P = '/srv/vibe space/data/desktop-apps/da-1/profile';
  const a = O.officeArgv(w, { file: F, profileDir: P });
  ok(a.ok && same(a.argv, ['--writer', '--nologo', '-env:UserInstallation=file:///srv/vibe%20space/data/desktop-apps/da-1/profile', F]), 'Writer + a file: --writer, --nologo, the session\'s own profile (a percent-encoded file URL), THE PATH LAST', a.argv);
  ok(a.argv[a.argv.length - 1] === F && a.argv.filter((x) => x === F).length === 1 && a.argv.slice(0, -1).every((x) => x.startsWith('-')), 'the path is ONE item, LAST; every item before it is a switch (an absolute path never begins with \'-\')');
  ok(same(O.officeArgv(g, { file: '/x/deck.odp', profileDir: '/p' }).argv, ['--nologo', '-env:UserInstallation=file:///p', '/x/deck.odp']) && same(O.officeArgv(w, { profileDir: '/p' }).argv, ['--writer', '--nologo', '-env:UserInstallation=file:///p']), 'the Start Center row: no module switch; no file ⇒ no path (a catalog launch)');
  ok(O.userInstallationArg('/tmp/a#b%c?d') === '-env:UserInstallation=file:///tmp/a%23b%25c%3Fd' && O.userInstallationArg('rel/dir') === null && O.userInstallationArg('/') === null, 'the profile URL encodes # % ? per segment; a relative or root dir is no profile');
  ok(O.officeArgv(w, { file: 'devbox: /x/r.docx', profileDir: P }).code === 'relative-path' && O.officeArgv(w, { file: F, profileDir: 'rel' }).code === 'profile-not-owned' && O.officeArgv({ id: 'xterm', label: 'xterm', args: [] }, { file: F, profileDir: P }).code === 'not-office-app', 'refused: a display string as the file (it never reaches an argv), a relative profile, a non-office row');
}

console.log('§4b the document\'s lock — removed only on its witness');
{
  ok(O.lockFileOf('/home/u/Docs/Quarterly report.docx') === '/home/u/Docs/.~lock.Quarterly report.docx#' && O.lockFileOf('/r.docx') === '/.~lock.r.docx#' && O.lockFileOf('r.docx') === null, 'the lock beside a document: <dir>/.~lock.<basename># (none for a relative path)');
  const P = '/srv/vibe space/data/desktop-apps/da-1/profile';
  const mine = ',u,devbox,27.09.2026 12:13,file:///srv/vibe%20space/data/desktop-apps/da-1/profile;\n'; // the MEASURED shape (LibreOffice 26.2.5.2)
  const rows = [
    [mine, true, 'this session\'s own profile ⇒ remove'],
    [',u,h,d,file:///srv/vibe space/data/desktop-apps/da-1/profile;', true, 'the same URL, not encoded ⇒ the same witness (decoded both sides)'],
    [',u,h,d,file:///home/u/.config/libreoffice/4;', false, 'the user\'s own LibreOffice ⇒ keep'],
    [',u,h,d,file:///srv/vibe%20space/data/desktop-apps/da-2/profile;', false, 'another session\'s ⇒ keep'],
    ['', false, 'empty ⇒ keep'], ['garbage', false, 'not the shape ⇒ keep'], [null, false, 'unreadable ⇒ keep'],
  ];
  const bad = rows.filter(([c, want]) => O.staleLockVerdict(c, P).remove !== want).map(([, , n]) => n);
  ok(!bad.length && O.staleLockVerdict(mine, 'relative').remove === false, `${rows.length} locks: removed ONLY when the last field is the session's own profile URL`, bad);
}

console.log('§5 officeRowFor — the facts matrix');
{
  const rows = (o) => Object.fromEntries(O.OFFICE_ROWS.map((r) => [r.id, O.officeRowFor(r, o)]));
  const none = rows({ exec: null });
  ok(Object.values(none).every((r) => !r.available && r.reasonCode === 'app-absent' && /not installed/.test(r.reason) && r.remedy && r.remedy.what === r.id), 'no binary ⇒ every row dimmed app-absent with its OWN install remedy (the generic row installs all three)', Object.values(none).map((r) => [r.id, r.reason, r.remedy && r.remedy.what]));
  ok(same(O.installSpecFor('libreoffice').packages.slice(0, 3), ['libreoffice-writer', 'libreoffice-calc', 'libreoffice-impress']), 'the generic row\'s install is the three modules');
  const wr = rows({ exec: 'soffice', path: '/usr/bin/soffice', modules: { writer: true, calc: false, impress: false } });
  ok(wr['libreoffice-writer'].available && wr['libreoffice-writer'].exec === 'soffice' && wr['libreoffice-writer'].path === '/usr/bin/soffice' && !wr['libreoffice-calc'].available && /package libreoffice-calc/.test(wr['libreoffice-calc'].reason) && wr.libreoffice.available, 'Writer only: its row available (served exec = the binary found), Calc dimmed naming its package, the Start Center available', wr['libreoffice-calc'].reason);
  const snap = rows({ exec: 'libreoffice', path: '/snap/bin/libreoffice', modules: null, confinement: 'snap' });
  ok(Object.values(snap).every((r) => r.available && r.confinement === 'snap'), 'a snap (modules not knowable) ⇒ judged present, confinement said');
  const zero = rows({ exec: 'libreoffice', path: '/usr/bin/libreoffice', modules: { writer: false, calc: false, impress: false } });
  ok(Object.values(zero).every((r) => !r.available), 'a binary with no module ⇒ every row dimmed (the generic one too)');
}

console.log('§6 the closed install set + packageInstallPlan');
{
  ok(same(O.INSTALL_WHATS, [...O.OFFICE_ROW_IDS, O.FONTS_ID]) && same(I.INSTALL_WHATS, ['xpra', ...O.OFFICE_ROW_IDS, O.FONTS_ID]), 'the install set: xpra + one per LibreOffice row + the faces alone (B-04da ②)');
  ok(O.installSpecFor('rm -rf /') === null && O.installSpecFor('libreoffice-writer; reboot') === null && O.installSpecFor('xpra') === null, 'anything outside the closed set ⇒ no spec (a request never names a package)');
  const f = { platform: 'linux', apt: '/usr/bin/apt-get', sudo: true, distro: 'ubuntu', codename: 'resolute', prettyName: 'Ubuntu 26.04' };
  const p = I.installPlanFor('libreoffice-writer', f);
  ok(p.ok && p.source === 'apt' && p.canRun && p.what === 'libreoffice-writer' && same(p.packages, ['libreoffice-writer', 'fonts-crosextra-carlito', 'fonts-crosextra-caladea']), 'the Writer plan: the machine\'s own apt, the package + the two faces', p);
  ok(/^set -e\n/.test(p.script) && p.script.includes(`apt-get -o DPkg::Lock::Timeout=${M.APT_LOCK_WAIT_S} update`) && p.script.includes('DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea') && p.script.endsWith('command -v soffice'), 'the root script: set -e, apt waits for another apt\'s lock, one install line, the check last', p.script);
  ok(same(p.commands, ['sudo apt-get -o DPkg::Lock::Timeout=300 update', 'sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea', 'command -v soffice']) && same(M.installArgv(p), ['sudo', '-n', 'sh', '-c', p.script]), 'the commands a person copies (the check without sudo); the argv that runs it is sudo -n (never a password prompt)', p.commands);
  ok(I.installPlanFor('libreoffice-writer', undefined).code === 'no_facts' && I.installPlanFor('libreoffice-writer', { platform: 'darwin' }).code === 'no_x11' && I.installPlanFor('libreoffice-writer', { platform: 'linux', apt: null, prettyName: 'Arch Linux' }).code === 'no_apt' && /Arch Linux has no apt-get — install LibreOffice Writer/.test(I.installPlanFor('libreoffice-writer', { platform: 'linux', apt: null, prettyName: 'Arch Linux' }).error), 'refused by name before anything runs: no facts, macOS, a Linux without apt');
  const ns = I.installPlanFor('libreoffice-calc', { platform: 'linux', apt: '/x' });
  ok(ns.ok && !ns.canRun && ns.code === 'no_sudo' && ns.commands.length === 3, 'no passwordless sudo ⇒ the plan still returned, canRun false, no_sudo (the commands to copy)');
  ok(M.packageInstallPlan(f, { what: 'x', packages: ['ok', 'bad;name'], verify: 'command -v soffice' }).code === 'bad-request' && M.packageInstallPlan(f, { what: 'x', packages: ['ok'], verify: 'soffice; rm -rf /' }).code === 'bad-request' && M.packageInstallPlan(f, null).code === 'bad-request', 'a spec whose package or check is not the fixed shape never reaches a root line (bad-request)');
  ok(I.installPlanFor('nope', f).code === 'bad-request' && /one of xpra, libreoffice-writer/.test(I.installPlanFor('nope', f).error), 'an unknown install ⇒ bad-request naming the set');
  const xf = [undefined, { platform: 'linux', apt: '/x', aptXpra: '3.1', distro: 'ubuntu', codename: 'noble', root: true }, { platform: 'linux', apt: '/x', aptXpra: '6.5.3', sudo: true }];
  ok(xf.every((x) => same(I.installPlanFor('xpra', x), M.xpraInstallPlan(x)) && same(I.installPlanFor(undefined, x), M.xpraInstallPlan(x))), 'installPlanFor(xpra | absent) IS xpraInstallPlan (the xpra rung unchanged)');
}

console.log('§7 the launch request\'s `file` + relaunchBodyOf');
{
  const reg = M.DEFAULT_REGISTRY;
  const v = M.validateLaunchRequest({ appId: 'libreoffice-writer', file: '/home/u//r.docx' }, reg);
  ok(v.ok && v.launch.file === '/home/u/r.docx' && v.launch.row.id === 'libreoffice-writer', 'an office row + an absolute document ⇒ carried (folded) as launch.file', v);
  const refused = [
    [{ appId: 'xterm', file: '/x/r.docx' }, 'not-office-app'],
    [{ exec: '/usr/bin/soffice', file: '/x/r.docx' }, 'not-office-app'],
    [{ appId: 'libreoffice-writer', file: 'r.docx' }, 'relative-path'],
    [{ appId: 'libreoffice-writer', file: 'devbox: /x/r.docx' }, 'relative-path'],
    [{ appId: 'libreoffice-writer', file: '/x/r.txt' }, 'not-office-file'],
  ].map(([b, code]) => [b, code, M.validateLaunchRequest(b, reg)]).filter(([, code, r]) => r.ok || r.code !== code);
  ok(!refused.length, 'a file on a non-office row / a typed command / a relative path / a display string / a non-office file ⇒ refused by its code, never ignored', refused.map(([b, c, r]) => [b, c, r.code]));
  ok(same(M.relaunchBodyOf({ source: 'registry', appId: 'libreoffice-writer', office: 'writer', file: '/x/r.docx' }), { appId: 'libreoffice-writer', file: '/x/r.docx' }) && same(M.relaunchBodyOf({ source: 'registry', appId: 'xterm' }), { appId: 'xterm' }), 'a document\'s relaunch (Scale ▸) reopens its document; any other row as before');
}

console.log('§8 src/lib/file-changed.js — the signal on the page');
{
  const d = FC.fileChangedDetail({ type: 'file-changed', host: null, path: '/x/r.docx', mtime: 5, by: 'desktop-app', appId: 'da-1', label: 'r.docx' });
  ok(same(d, { host: null, path: '/x/r.docx', mtime: 5, by: 'desktop-app', label: 'r.docx', appId: 'da-1' }) && FC.fileChangedDetail({ type: 'file-changed' }) === null && FC.fileChangedDetail(null) === null, 'the broadcast → the event detail (none without a path)');
  ok(FC.sameFile(d, { host: null, path: '/x/r.docx' }) && FC.sameFile(d, { host: 'local', path: '//x/./r.docx' }) && FC.sameFile({ ...d, host: 'devbox' }, { host: 'devbox', path: '/x/r.docx' }), 'a match: the same machine (null / local / "" are this one) and the same FOLDED path (the explorer names a child of / as //name)');
  ok(!FC.sameFile(d, { host: 'devbox', path: '/x/r.docx' }) && !FC.sameFile({ ...d, host: 'devbox' }, { host: null, path: '/x/r.docx' }) && !FC.sameFile(d, { host: null, path: '/x/r.docx.bak' }), 'no match: the same path on another machine, another path');
  ok(FC.FILE_CHANGED_EVENT === 'vibespace:file-changed', 'the window event\'s name');
}

console.log('§9 WIRING PINS');
{
  const serve = read('src/desktop-serve.js'), keeper = read('src/server/desktop-app-keeper.js'), routes = read('src/routes/desktop-apps.js'), disp = read('src/desktop-display.js');
  const ops = read('src/lib/file-explorer-ops.js'), door = read('src/lib/open-with.js'), editor = read('src/lib/code-editor.js'), appjs = read('src/lib/app.js'), launcher = read('src/lib/desktop-app-launcher.js'), access = read('src/server/desktop-access.js');
  ok(serve.includes("O.openWithVerdict({ row, file: v.launch.file, machine: { hostId: 'local', fileHost: 'local', registry: reg } })") && serve.includes('row = reg.find((r) => r.id === ov.catalogId) || row;'), 'the MACHINE runs the verdict with ITS catalog and opens the FILE\'s module row');
  ok(serve.includes('const av = O.officeArgv(row, { file: doc ? doc.file : null, profileDir: pv.dir });') && serve.includes('args: browser ? browser.argv : office ? office.argv : (row.args || [])'), 'the machine\'s argv IS officeArgv\'s (the path last), recorded as the app\'s args');
  ok(serve.includes("M.profileDirVerdict(profileDirOf(id), { home: homeOf(), ownedRoot: logRoot, confinement: row.confinement || null, exec: row.exec })") && serve.includes('if (office) { rec.office = office.module; rec.profileDir = office.profileDir; }'), 'the session\'s own profile dir, judged by the browser rows\' verdict, retired by the same rule (rec.profileDir)');
  ok(serve.includes('if (rec.file) await noteFileEnd(rec, { clean });') && serve.includes('if (clean && rec.office && rec.profileDir && !rec.fileLockDone) await retireFileLock(rec);') && serve.includes('const v = O.staleLockVerdict(txt, rec.profileDir);') && /rec\.fileChanged = Number\.isFinite\(rec\.fileMtimeAtLaunch\) \? st\.mtimeMs !== rec\.fileMtimeAtLaunch : null;/.test(serve), 'every terminal path (teardown) records the after-edit fact on the machine that holds the file, and removes the document\'s lock only on its witness after a clean teardown');
  ok(serve.includes('if (row.office) return { ...O.officeRowFor(row, officeFactsOf(hostFacts, binOf)), args: [...(row.args || [])] };'), 'the catalog serves a LibreOffice row through officeRowFor (the binary AND the module)');
  ok(serve.includes('if (rec.browser || rec.office) {'), 'a LibreOffice relaunch stops FIRST (the document is locked by the running instance), its profile carried');
  ok(/for \(const b of \[\.\.\.bins, \.\.\.BROWSER_BINS, \.\.\.OFFICE\.OFFICE_EXECS\]\)/.test(disp) && disp.includes('const office = await officeFacts({ bins: out, now });'), 'hostFacts probes LibreOffice\'s binaries from the PURE list and reads its modules (officeFacts)');
  ok(routes.includes("const v = openWithVerdict({ row: asked, file: req.body.file, machine: { hostId: host, fileHost: LOCAL.has(fh) ? 'local' : fh, registry: null } });") && routes.includes("router.get('/api/desktop/open-with'"), 'the ROUTE runs the machine rule before any machine is asked; the verdict route answers the explorer\'s menu');
  ok(routes.includes("return streamInstall(req, res, host, (o) => ctx.access.installXpra(host, { ...o, expectDigest: shownDigest(req) }), xpraDone);") && routes.includes("(o) => ctx.access.installPackage(host, { ...o, what, expectDigest: shownDigest(req) })") && access.includes("async function installXpra(hostId, opts = {}) { return installPackage(hostId, { ...opts, what: I.DEFAULT_INSTALL }); }") && I.DEFAULT_INSTALL === 'xpra' && I.installRow(null) === M.XPRA_INSTALL, 'ONE install machinery: install-xpra and the generic install stream through streamInstall; installXpra IS installPackage(the default row = xpra — lane dc-apps-rows); both name the plan the dialog SHOWED (verify-r6 I1: planDigest)');
  ok(/planDigest: shownDigest \} : \{ host: m\.hostId, what, planDigest: shownDigest \}/.test(launcher) && /let shownDigest = r\.digest \|\| null;/.test(launcher) && /end\.code === 'plan_changed' && end\.plan && Array\.isArray\(end\.plan\.commands\)/.test(launcher), 'I1 WIRING: the install dialog sends the digest of the plan it shows, and a plan_changed answer replaces the commands above the button (nothing ran; the next press names the new plan)');
  ok(keeper.includes("broadcast?.({ type: 'file-changed', host, path: rec.file,") && /function notify\(\) \{\n[^\n]*desktop-apps-updated[^\n]*\n\s*signalFileChanges\(\);/.test(keeper), 'the hub broadcasts ONE file-changed per changed record, from every commit (notify)');
  ok(ops.includes("import { isOfficeFile } from '../office-open.js';") && ops.includes("const fullPath = this.currentPath + '/' + dataset.name;") && ops.includes('const q = this.app.officeVerdictFor(host, fullPath);') && ops.includes('items.push(...this.app.officeMenuItems(q.cached, { host, file: fullPath }));'), 'the EXPLORER row: the PURE isOfficeFile, the REAL path (currentPath + name — never the window\'s host-labelled title) and its host through the app mediator');
  ok(door.includes("body: JSON.stringify({ appId, file: fv.file, fileHost: h || 'local',") && door.includes('const fv = fileVerdict(file);') && door.includes("if (m && m.type === 'file-changed') relayFileChanged(m);") && door.includes('app.openWithDesktopApp = (opts) => openWithDesktopApp(app, opts);'), 'the DOOR: the file rule first, ONE POST carrying the file + the machine that holds it, the file-changed relay');
  ok(appjs.includes('installOpenWith(this);'), 'the App installs the door (the mediator)');
  ok(door.includes('/api/desktop/open-with?peek=1&path=') && door.includes('if (ok && !v.unchecked && CACHEABLE.has(') && routes.includes("if (req.query.peek === '1' && host !== 'local' && ctx.access && typeof ctx.access.connectedNow === 'function' && !ctx.access.connectedNow(host)) return res.json({ ...pre, host, unchecked: true });") && access.includes('function connectedNow(hostId) {'), 'a MENU never connects a machine: the explorer asks with peek=1, a paired machine not connected right now answers `unchecked` (never cached) — the click connects');
  ok(editor.includes("onFileChanged((d) => { if (sameFile(d, { host: this._host || null, path: this.filePath })) check(); }, { signal });"), 'the CODE EDITOR runs its freshness check on a matching signal, bound to its window\'s listener signal');
  ok(launcher.includes("if (doc) body = { appId: row.id, file: doc.path, fileHost: doc.host || 'local' };") && launcher.includes("const otherThanFile = !!doc && m.hostId !== (doc.host || 'local');") && launcher.includes('b.disabled = otherThanFile || !m.selectable;'), 'the launch dialog\'s FILE MODE: the card opens the document where it lives; every other machine greyed with the reason (machine-mismatch)');
  ok(launcher.includes("if (m.type === 'desktop-apps-updated' && overlay.isConnected) { if (data) { data.apps = m.apps; renderRunning(); } }") && launcher.includes('if (key === runKey) return;') && !/desktop-apps-updated[^\n]*\brender\(\)/.test(launcher), 'the launch dialog: a desktop-apps-updated broadcast re-renders the Running rows ONLY (keyed) — never the catalog under the pointer (a rebuild between pointerdown and pointerup ate the click)');
  ok(!/\.hidden\b/.test(read('src/lib/open-with.js')) && !/[\u{1F300}-\u{1FAFF}]/u.test(door + launcher), 'no global .hidden, no emoji in the new client code');
  // THE DOOR'S CALLERS — the Word viewer's "Open in LibreOffice" (file-viewer.js) goes through the PURE verdict: the
  // app is `catalogId` of openWithVerdict over the window's REAL path and the FILE's host; nothing in the viewer names
  // an exec, a catalog row or the launch route; LibreOffice absent ⇒ the explorer row's rows (app.officeOfferAt ⇒
  // officeMenuItems), asked BEFORE the door
  const viewerWired = (fv) => {
    const code = fv.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const calls = [...code.matchAll(/openWithDesktopApp\(([^)]*)\)/g)].map((m) => m[1]);
    const offer = code.indexOf('await app.officeOfferAt?.(anchor, { host: h, file: v.file })'), doorAt = code.indexOf('app.openWithDesktopApp({');
    return code.includes("import { openWithVerdict } from '../office-open.js';")
      && code.includes('const v = openWithVerdict({ file: filePath, machine: { hostId: h, fileHost: h } });') && code.includes('if (!v.ok) return null;')
      && calls.length === 1 && calls[0] === '{ catalogId: v.catalogId, file: v.file, host: h }'
      && offer > 0 && doorAt > offer
      && !/['"`](libreoffice(-writer|-calc|-impress)?|soffice)['"`]|--(writer|calc|impress)\b|\/api\/desktop\/(apps|open-with)/.test(code);
  };
  const viewer = read('src/lib/file-viewer.js');
  ok(viewerWired(viewer) && viewer.includes('office: FileViewer._officeOpener(app, filePath, host) })'), 'the Word VIEWER is the door\'s second caller: openWithVerdict over the window\'s real path + the FILE\'s host names the app (catalogId), ONE door call, the absent-machine offer asked first, no exec / catalog id / route spelled in the viewer');
  ok(!viewerWired(viewer.replace('{ catalogId: v.catalogId, file: v.file, host: h }', "{ catalogId: 'libreoffice-writer', file: v.file, host: h }")), 'CONTROL: a viewer that hard-codes the catalog id is refused by the census');
  ok(!viewerWired(viewer.replace('{ catalogId: v.catalogId, file: v.file, host: h }', '{ catalogId: v.catalogId, file: fileName, host: h }')), 'CONTROL: …and so is one that hands the door the display name instead of the verdict\'s path');
  ok(door.includes('const rows = officeMenuItems(app, v, { host: h, file });') && door.includes("app.officeOfferAt = (anchor, opts) => officeOfferAt(app, anchor, opts);") && door.includes("if (!v || v.ok !== false || (v.code !== 'app-absent' && v.code !== 'host_needs_daemon')) return false;"), 'the viewer\'s absent-machine offer IS the explorer row\'s rows (officeMenuItems — one spelling of the sentence + the install offer), shown only for app-absent / an agent too old');
}

console.log('§10 i18n — every new sentence has its zh + ja entry');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const lits = (src) => [...src.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const mine = new Set([...lits(read('src/lib/open-with.js')), ...lits(read('src/lib/desktop-app-launcher.js')).filter((s) => /LibreOffice|document|\{file\}|\{app\}|Install…|the file is on/.test(s))]);
  const has = (dict, k) => dict.includes(`  ${JSON.stringify(k)}:`);
  const miss = [...mine].filter((k) => !has(zh, k) || !has(ja, k));
  ok(mine.size >= 15 && !miss.length, `${mine.size} office sentences, each in zh AND ja`, miss);
}

console.log('§11 CONTROLS — a patched copy per rule; each the table catches');
{
  const src = read('src/office-open.js');
  const cut = (lines, tag) => { let out = src; for (const line of lines) { if (!out.includes(line)) throw new Error(`CONTROL setup: ${tag} — the line is not in src/office-open.js`); out = out.replace(line, ''); } return MUT.load('src/office-open.js', out, tag); };
  // each rule's line(s): the absolute-path rule is spelled TWICE on purpose (the explicit check, then the fold's belt) —
  // its control removes both, or it would prove nothing
  const rules = [
    ['the machine rule', "  if (where !== fileAt) return refuse('machine-mismatch',", /machine-mismatch/],
    ['the absolute-path rule', ["  if (!file.startsWith('/')) return refuse('relative-path',", "  if (!folded || folded === '/') return refuse('relative-path',"], /relative-path/],
    ['the extension rule', "  if (!module) return refuse('not-office-file',", /not-office-file/],
    ['the unreachable rule', "  if (m.reachable === false) return refuse('host-unreachable',", /host-unreachable/],
    ['the app rule', "  if (row != null && !OFFICE_ROW_IDS.includes(reqId)) return refuse('not-office-app',", /not-office-app/],
    ['the presence rule', "  if (!served || !served.available) return refuse('app-absent',", /app-absent/],
    ['the older-agent rule', "  if (!m.registry.some((r) => r && r.office)) return refuse('host_needs_daemon',", /host_needs_daemon/],
  ];
  // the lock witness: a copy that removes any lock of the right shape is caught by §4b's foreign rows
  const wline = src.split('\n').filter((l) => l.startsWith('  if (decodeUrl(last) !== decodeUrl(want)) return { remove: false,'));
  ok(wline.length === 1, 'CONTROL setup: the lock witness is spelled once');
  if (wline.length === 1) {
    const Ml = MUT.load('src/office-open.js', src.replace(wline[0] + '\n', ''), 'any-lock');
    ok(Ml.staleLockVerdict(',u,h,d,file:///home/u/.config/libreoffice/4;', '/srv/p').remove === true, 'CONTROL: without the witness the user\'s own LibreOffice lock would be removed (what §4b catches)');
  }
  for (const [name, line, code] of rules) {
    const heads = Array.isArray(line) ? line : [line];
    const fulls = heads.map((h) => src.split('\n').filter((l) => l.startsWith(h)));
    if (fulls.some((f) => f.length !== 1)) { ok(false, `CONTROL setup: ${name} is spelled once per line`, heads); continue; }
    const Mc = cut(fulls.map((f) => f[0] + '\n'), name.replace(/\W+/g, '-'));
    const caught = tableFails(Mc);
    ok(caught.length > 0 && caught.some((c) => code.test(JSON.stringify(c.want))), `CONTROL: without ${name} the table fails on its own row(s)`, caught.map((c) => c.name));
  }
  // the argv order: the path FIRST ⇒ the shape pin fails
  const argvLine = "  return { ok: true, code: null, error: null, argv: [...own, '--nologo', prof, ...(f ? [f] : [])] };";
  ok(src.includes(argvLine), 'CONTROL setup: the argv line is spelled once');
  const Mv = MUT.load('src/office-open.js', src.replace(argvLine, "  return { ok: true, code: null, error: null, argv: [...(f ? [f] : []), ...own, '--nologo', prof] };"), 'path-first');
  const bad = Mv.officeArgv(O.OFFICE_ROWS[0], { file: F, profileDir: '/p' }).argv;
  ok(bad[bad.length - 1] !== F, 'CONTROL: a copy that puts the path first fails the "path LAST" pin', bad);
  // the launch request: without the file-on-a-non-office-row check, xterm takes a document silently
  const dsrc = read('src/desktop-apps.js');
  const dline = "    if (hasFile && !O.isOfficeModule(row.office)) return { ok: false, error: `${row.label} does not open documents — LibreOffice does`, code: 'not-office-app' };\n";
  ok(dsrc.includes(dline), 'CONTROL setup: the launch request\'s file-on-a-non-office-row check is spelled once');
  const Md = MUT.load('src/desktop-apps.js', dsrc.replace(dline, ''), 'file-anywhere');
  const r = Md.validateLaunchRequest({ appId: 'xterm', file: '/x/r.docx' }, Md.DEFAULT_REGISTRY);
  ok(r.ok, 'CONTROL: without it a document rides an xterm launch unrefused (what §7 catches)', r);
}

console.log('§12 the routes over stubs (in-process express on 127.0.0.1:0 — the verdict before any machine, the install stream)');
{
  const express = require('express');
  const R = require(path.join(repo, 'src/routes/desktop-apps.js'));
  const seen = [];
  let regAvail = false;
  const registry = () => [{ id: 'xterm', available: true }, ...O.OFFICE_ROWS.map((r) => O.officeRowFor(r, { exec: 'libreoffice', path: '/usr/bin/libreoffice', modules: { writer: regAvail, calc: false, impress: false } }))];
  const kStub = { list: async (o) => { seen.push(['list', o && o.host]); return { apps: [], registry: registry() }; }, launch: async (b, o) => { seen.push(['launch', b, o]); return { id: 'da-x', ...b }; }, facts: async () => { seen.push(['facts']); } };
  const accStub = { connectedNow: (h) => h === 'dev-on', installBusy: () => null, call: async (h, op, p) => { seen.push(['call', h, op, p]); return { ok: true }; },
    installXpra: async (h, { onData }) => { seen.push(['installXpra', h]); onData(Buffer.from('+ xpra\n')); return { ok: true, hostId: h, plan: { source: 'apt' }, after: { xpra: '6.5.3' } }; },
    installPackage: async (h, { what, onData }) => { seen.push(['installPackage', h, what]); onData(Buffer.from('+ apt-get install -y libreoffice-writer\n')); return { ok: true, what, hostId: h, plan: { source: 'apt' }, reattached: false }; } };
  R.setup({ keeper: kStub, access: accStub, vnc: {} });
  const appx = express(); appx.use(express.json()); appx.use(R.router);
  const srv = await new Promise((r) => { const x = appx.listen(0, '127.0.0.1', () => r(x)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const J = async (u, o) => { const r = await fetch(base + u, o); const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = t; } return { status: r.status, body: b }; };
  const post = (u, body) => J(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const mm = await post('/api/desktop/apps', { file: F, fileHost: 'dev-a' });
    ok(mm.status === 409 && mm.body.code === 'machine-mismatch' && !seen.some((x) => x[0] === 'launch'), 'POST a document whose machine is not the chosen one ⇒ 409 machine-mismatch, the keeper never asked', mm.body);
    const na = await post('/api/desktop/apps', { appId: 'xterm', file: F });
    ok(na.status === 400 && na.body.code === 'not-office-app' && !seen.some((x) => x[0] === 'launch'), 'a document on a non-office app ⇒ 400 not-office-app, the keeper never asked');
    const fl = await post('/api/desktop/apps', { file: F, host: 'dev-a', fileHost: 'dev-a' });
    const ln = seen.find((x) => x[0] === 'launch');
    ok(fl.status === 200 && ln && ln[1].appId === 'libreoffice-writer' && ln[1].file === F && !('fileHost' in ln[1]) && !('host' in ln[1]) && ln[2] && ln[2].host === 'dev-a', 'no appId ⇒ the file\'s module row filled in; the body reaches the keeper without host / fileHost; the launch runs ON the file\'s machine', ln);
    seen.length = 0;
    const pk = await J(`/api/desktop/open-with?peek=1&host=dev-off&path=${encodeURIComponent(F)}`);
    ok(pk.body && pk.body.ok === true && pk.body.unchecked === true && !seen.some((x) => x[0] === 'list'), 'peek on a paired machine NOT connected ⇒ unchecked, the machine never asked (a menu never connects)', pk.body);
    const pk2 = await J(`/api/desktop/open-with?peek=1&host=dev-on&path=${encodeURIComponent(F)}`);
    ok(pk2.body && pk2.body.code === 'app-absent' && seen.some((x) => x[0] === 'list' && x[1] === 'dev-on') && pk2.body.remedy && pk2.body.remedy.what === 'libreoffice-writer', 'peek on a CONNECTED machine asks its catalog ⇒ app-absent + remedy', pk2.body);
    const loc = await J(`/api/desktop/open-with?path=${encodeURIComponent('devbox: /x/r.docx')}`);
    ok(loc.body && loc.body.code === 'relative-path' && loc.status === 200, 'a display string ⇒ relative-path, answered 200 (a question)');
    const bad = await post('/api/desktop/install', { host: 'local', what: 'rm -rf /' });
    ok(bad.status === 400 && bad.body.code === 'bad-request' && !seen.some((x) => x[0] === 'installPackage'), 'an install outside the closed set ⇒ 400 before anything runs');
    regAvail = false;
    const still = await post('/api/desktop/install', { host: 'local', what: 'libreoffice-writer' });
    const sl = String(still.body).trim().split('\n').map((l) => JSON.parse(l));
    ok(seen.some((x) => x[0] === 'installPackage' && x[2] === 'libreoffice-writer') && sl[0].log && sl[sl.length - 1].code === 'still-absent' && seen.some((x) => x[0] === 'facts'), 'the machine still does not serve the row after the install ⇒ ONE still-absent line (its facts re-read fresh first)', sl);
    regAvail = true;
    const done = await post('/api/desktop/install', { host: 'local', what: 'libreoffice-writer' });
    const dl = String(done.body).trim().split('\n').map((l) => JSON.parse(l));
    ok(dl[dl.length - 1].done === true && dl[dl.length - 1].available === true && dl[dl.length - 1].what === 'libreoffice-writer', 'the row served after the install ⇒ ONE done {what, available}', dl);
    const xp = await post('/api/desktop/install-xpra', { host: 'local' });
    const xl = String(xp.body).trim().split('\n').map((l) => JSON.parse(l));
    ok(xl[xl.length - 1].done === true && xl[xl.length - 1].installed === '6.5.3' && seen.some((x) => x[0] === 'installXpra'), 'install-xpra is unchanged (installXpra, `installed` = the version)');
  } finally { srv.close(); }
}

// ── verify-r6 I1: THE PLAN THAT RUNS IS THE PLAN THAT WAS SHOWN. The dialog shows GET install-plan's commands (run as
// root); the POST recomputed the plan from the machine's facts at the press — facts that moved in between (the package
// sources now offer an old xpra) ran the xpra.org key + repo + pin 1001 the owner never read. The REAL access layer over
// a stub device whose facts change between the two reads ──
console.log('§13 verify-r6 I1 — the install runs the plan the dialog showed, or nothing');
{
  const accRel = 'src/server/desktop-access.js';
  const i1 = async (ACC) => {
    let aptXpra = '6.1.0'; const runs = [];
    const dm = { status: () => ({ connected: true, info: { capabilities: ['desktop-serve'], platform: 'linux' } }),
      desktopServe: async () => ({ ok: true, facts: {}, install: { platform: 'linux', apt: '/usr/bin/apt-get', aptXpra, distro: 'ubuntu', like: ['debian'], codename: 'noble', sudo: true, xpra: null } }),
      runStream: async (cmd, args, { onData }) => { runs.push(args.join(' ')); onData(Buffer.from('ran\n')); return { code: 0 }; } };
    const hosts = { list: () => [{ id: 'dev', name: 'Dev', transport: 'dial', online: true }], linkState: () => 'online', connectedDevice: () => null, get: (id) => ({ id }), deviceBounded: async () => dm };
    const a = ACC.create({ hosts, local: () => null, install: false, log: { log() {}, warn() {} } });
    const shown = await a.installPlan('dev', 'xpra');
    aptXpra = '3.1.5'; // the machine's package sources changed after the dialog read them: apt ⇒ xpra.org
    const changed = await a.installXpra('dev', { expectDigest: shown.digest }).then(() => null, (e) => e);
    const runsAfterChanged = runs.length;
    const again = await a.installPlan('dev', 'xpra');
    const ok2 = await a.installXpra('dev', { expectDigest: again.digest }).then((r) => r, (e) => e);
    return { shown, changed, runsAfterChanged, again, ok2, runs: runs.length };
  };
  const o = await i1(require(path.join(repo, accRel)));
  ok(o.shown.plan.source === 'apt' && typeof o.shown.digest === 'string' && o.shown.digest.length === 32 && o.again.plan.source === 'xpra.org' && o.again.digest !== o.shown.digest, 'I1: GET install-plan carries the digest of the plan it shows; a machine whose facts moved answers another plan (apt ⇒ xpra.org) with another digest', { shown: o.shown.plan.source, again: o.again.plan.source });
  ok(o.changed && o.changed.code === 'plan_changed' && o.changed.plan && o.changed.plan.source === 'xpra.org' && o.changed.digest === o.again.digest && o.runsAfterChanged === 0 && /nothing ran/.test(o.changed.message), 'I1: Install pressed on the SHOWN apt plan while the machine now plans xpra.org ⇒ plan_changed with the NEW plan + digest, nothing ran as root (pre-fix: the xpra.org key / repo / pin ran unread)', o.changed && { code: o.changed.code, runs: o.runsAfterChanged });
  ok(o.ok2 && o.ok2.ok === true && o.runs === 1, 'I1: pressed again on the plan now shown ⇒ it runs (once)', o.ok2 && o.ok2.code);
  // CONTROL (i1): the access layer without the check runs the recomputed plan the dialog never showed
  const src = read(accRel);
  const mut = src.replace("        if (expectDigest != null && planDigest(plan) !== String(expectDigest)) {", '        if (false) {');
  ok(mut !== src, 'CONTROL (i1): the patch applies');
  const c = await i1(MUT.load(accRel, mut, 'i1-noshown'));
  ok(!c.changed && c.runsAfterChanged === 1, 'CONTROL (i1): without the check the press on the shown apt plan RUNS the xpra.org plan — the I1 cell goes red', { runs: c.runsAfterChanged });
  // the route streams the refusal with its plan + digest (the dialog redraws from them)
  const express = require('express');
  const RR = require(path.join(repo, 'src/routes/desktop-apps.js'));
  const seenD = [];
  RR.setup({ keeper: { list: async () => ({ apps: [], registry: [] }), facts: async () => {} }, access: { installBusy: () => null, installXpra: async (h, o) => { seenD.push(o.expectDigest); const e = new Error('what would run changed — nothing ran'); e.code = 'plan_changed'; e.plan = { source: 'xpra.org', commands: ['x'] }; e.digest = 'd2'; throw e; } }, vnc: {} });
  const ax = express(); ax.use(express.json()); ax.use(RR.router);
  const sv = await new Promise((r) => { const x = ax.listen(0, '127.0.0.1', () => r(x)); });
  try {
    const rr = await fetch(`http://127.0.0.1:${sv.address().port}/api/desktop/install-xpra`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'local', planDigest: 'd1' }) });
    const lines = (await rr.text()).trim().split('\n').map((l) => JSON.parse(l));
    ok(seenD[0] === 'd1' && lines.at(-1).code === 'plan_changed' && lines.at(-1).digest === 'd2' && lines.at(-1).plan.source === 'xpra.org', 'I1: the route hands the shown digest to the access layer and streams plan_changed WITH the new plan and digest', lines.at(-1));
  } finally { sv.close(); }
}

// ── B-04da: ending a session without losing an edit (④), the Start Center (⑤), the faces alone (②) ──
console.log('B-04da');
{
  const prof = '/srv/vs/data/desktop-apps/da-x/my profile';
  ok(same(O.officeQuitArgv(prof), ['-env:UserInstallation=file:///srv/vs/data/desktop-apps/da-x/my%20profile', '.uno:Quit']), '④ the quit hand-over = the session\'s OWN profile (the pipe the running LibreOffice listens on) + .uno:Quit (File ▸ Exit — its save prompt)', O.officeQuitArgv(prof));
  ok(O.officeQuitArgv(null) === null && O.officeQuitArgv('relative/p') === null, '④ no absolute profile ⇒ no hand-over (null — the caller refuses by name, never signals)');
  const sc = (o) => O.startCenterVerdict(o);
  ok(sc({ office: 'writer', file: '/d/a.docx', classInstance: ['libreoffice', 'libreoffice-startcenter'] }).end === true, '⑤ a FILE session whose main window is the Start Center ends');
  ok(sc({ office: 'writer', file: '/d/a.docx', classInstance: ['libreoffice', 'libreoffice-writer'] }).why === 'document' && sc({ office: 'any', file: null, classInstance: ['libreoffice', 'libreoffice-startcenter'] }).why === 'no-file' && sc({ office: null, file: '/d/a.docx', classInstance: ['libreoffice', 'libreoffice-startcenter'] }).why === 'not-office' && sc({ office: 'writer', file: '/d/a.docx', classInstance: null }).end === false, '⑤ CONTROLS: the document window, the generic row\'s own Start Center, a non-office app, no class ⇒ nothing ends');
  const row = O.OFFICE_ROWS.find((r) => r.office === 'writer');
  const facts = (fonts) => ({ exec: 'libreoffice', path: '/usr/bin/libreoffice', program: '/usr/lib/libreoffice/program', confinement: null, modules: { writer: true, calc: false, impress: false }, fonts });
  const r1 = O.officeRowFor(row, facts({ Carlito: false, Caladea: false }));
  ok(r1.available && same(r1.fontsMissing, ['Carlito', 'Caladea']) && r1.fontRemedy && r1.fontRemedy.what === O.FONTS_ID && same(r1.fontRemedy.packages, ['fonts-crosextra-carlito', 'fonts-crosextra-caladea']), '② LibreOffice present WITHOUT the faces ⇒ the row stays available and names them, the remedy installs the faces alone', r1);
  const r2 = O.officeRowFor(row, facts({ Carlito: true, Caladea: true })), r3 = O.officeRowFor(row, facts(null)), r4 = O.officeRowFor(row, facts({ Carlito: true, Caladea: false }));
  ok(same(r2.fontsMissing, []) && r2.fontRemedy === null && same(r3.fontsMissing, []) && same(r4.fontsMissing, ['Caladea']), '② CONTROLS: both faces ⇒ nothing said; not knowable (a snap, an old agent) ⇒ nothing said; one missing ⇒ that one', [r2.fontsMissing, r3.fontsMissing, r4.fontsMissing]);
  const spec = O.installSpecFor(O.FONTS_ID);
  ok(spec && same(spec.packages, ['fonts-crosextra-carlito', 'fonts-crosextra-caladea']) && O.INSTALL_WHATS.includes(O.FONTS_ID) && I.INSTALL_WHATS.includes(O.FONTS_ID), '② the faces alone are ONE closed install (installSpecFor, INSTALL_WHATS)', spec);
  const plan = I.installPlanFor(O.FONTS_ID, { platform: 'linux', apt: true, sudo: true });
  ok(plan.ok && /apt-get .*install -y fonts-crosextra-carlito fonts-crosextra-caladea/.test(plan.script), '② …its plan is apt over exactly those two packages', plan.script);
  const reg = [{ id: 'xterm', available: true }, ...O.OFFICE_ROWS.map((r) => O.officeRowFor(r, facts({ Carlito: false, Caladea: true })))];
  const v = O.openWithVerdict({ file: '/home/u/a.docx', machine: { hostId: 'local', registry: reg } });
  const v2 = O.openWithVerdict({ file: '/home/u/a.docx', machine: { hostId: 'local', registry: [{ id: 'xterm', available: true }, ...O.OFFICE_ROWS.map((r) => O.officeRowFor(r, facts({ Carlito: true, Caladea: true })))] } });
  ok(v.ok && same(v.fontsMissing, ['Carlito']) && v.fontRemedy && v.fontRemedy.what === O.FONTS_ID && v2.ok && v2.fontsMissing === undefined, '② the open-with verdict opens AND names the missing face (the menu offers it); with both faces it says nothing', [v, v2]);
}

console.log('§installs a NEW installable is ONE registration line of src/installs.js (lane dc-apps-rows, F-I1): a fake member through the real slot plan');
{
  const ISRC = fs.readFileSync(path.join(repo, 'src/installs.js'), 'utf8');
  const ANCHOR = '  ...O.INSTALL_ROWS, // §7.9 the LibreOffice set (src/office-open.js)\n';
  const LINE = "  Object.freeze({ id: 'acme', from: 'facts', spec: Object.freeze({ what: 'acme', label: 'Acme', packages: ['acme-tool'], verify: 'command -v acme' }), done: 'catalog' }),\n";
  ok(ISRC.includes(ANCHOR), '§installs the registration anchor is the INSTALLS list');
  const I2 = MUT.load('src/installs.js', ISRC.replace(ANCHOR, ANCHOR + LINE), 'fake-install');
  const fx = { platform: 'linux', apt: true, sudo: true };
  const p2 = I2.installPlanFor('acme', fx);
  ok(I2.INSTALL_WHATS.includes('acme') && I2.installRow('acme').done === 'catalog' && p2.ok && JSON.stringify(p2.packages) === '["acme-tool"]' && p2.script.includes('apt-get -o DPkg::Lock::Timeout=300 install -y acme-tool') && p2.canRun, '§installs the fake installable is planned by the ONE slot (packageInstallPlan over its spec, apt\'s lock wait) and listed — nothing else edited', p2);
  ok(I2.installRow(null).id === 'xpra' && JSON.stringify(I2.installPlanFor(undefined, fx)) === JSON.stringify(M.xpraInstallPlan(fx)) && I2.installRow('tightvnc').from === 'hello' && !I2.INSTALL_WHATS.includes('tightvnc'), '§installs the default row and the hello row are unchanged beside it');
  // the control: the OLD lookup (absent/xpra ⇒ the xpra plan, else the office spec table) restored — the fake member is refused (red)
  const NEW = "  return typeof row.plan === 'function' ? row.plan(f) : S.packageInstallPlan(f, row.spec);";
  ok(ISRC.includes(NEW), '§installs control anchor: the lookup asks the row');
  const Iold = MUT.load('src/installs.js', ISRC.replace(ANCHOR, ANCHOR + LINE).replace(NEW, "  if (w === 'xpra') return M.xpraInstallPlan(f);\n  const spec = O.installSpecFor(w);\n  if (!spec) return { ok: false, code: 'bad-request', error: 'unknown install' };\n  return S.packageInstallPlan(f, spec);"), 'old-lookup');
  ok(Iold.installPlanFor('acme', fx).code === 'bad-request', '§installs CONTROL: with the old id lookup the fake installable is refused bad-request (the row is what plans it)');
}
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 11 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
