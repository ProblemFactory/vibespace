#!/usr/bin/env node
// THE PHONE'S DOORS (lane phone-files-door, 2026-10-24 — the owner: 「我发现手机上好像不是很容易找到文件管理器」; the explorer's
// only phone door was the «+» sheet's Files row, behind a 500 ms press on a button whose tap opens New Session). Fast,
// in-process, PURE + a source census:
//   ① THE TWIN CENSUS — every desktop door the source declares (public/index.html's toolbar buttons, the rail's items in
//     src/lib/sidebar-rail.js) has a row in PURE src/phone-doors.js PHONE_TWINS; each phone twin's anchor is in its file and
//     not turned off on a phone; a deliberate «none» says why — RED CONTROLS: the BASE (its index.html and For-you page had
//     no files twin but the long-press sheet: both new twins missing), a door with no row, a twin turned off on a phone
//     (`when: (c) => !c.app.isMobile`), a «none» with no reason, a stale row, a new rail item nobody gave a twin
//   ② filesCardChips — home first, the last folder used, the home's folders with files, the mounted mounts, the other
//     folders, the recents; a path once; bounded; an unmounted mount / a dot-folder never
//   ③ crumbsOf — ~ for the home, / elsewhere, the folder itself last, a sibling sharing the home's prefix is no home
//   ④ B-d027 — the explorer's path bar resolves a RELATIVE name against the folder on show: path-candidates'
//     resolveRelative over the bases the field builds from the explorer (its folder, then ~) — RED CONTROL: the base's bar
//     (no bases: ~ only) leaves `payments` at ~/work unresolved
//   ⑤ wiring pins — the nav's 文件 beside ☰ (labelled for the first week through the rail's day-one record), MobileNav
//     installs it, the For-you page appends the card AFTER its list (the first screen is the attention list's), the explorer
//     passes its folder as the bar's base, builds the phone furniture only on a phone, the ‹ is the back gesture's home rule,
//     the card's chips and the nav reveal through app.goToWinId (no new revealWindow door), i18n zh / ja
// Run: node scripts/test-phone-doors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const P = require(path.join(REPO, 'src/phone-doors.js'));
const F = require(path.join(REPO, 'src/files-door.js'));
const PC = require(path.join(REPO, 'src/path-candidates.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

console.log('① the twin census — every desktop door has a phone twin');
const indexHtml = read('public/index.html'), railSrc = read('src/lib/sidebar-rail.js');
const doors = P.desktopDoors({ indexHtml, railSrc });
const files = [...new Set(P.PHONE_TWINS.flatMap((r) => (r.twins || []).map((t) => t.file)))];
const sources = Object.fromEntries(files.map((f) => [f, read(f)]));
const v = P.twinCensus({ doors, sources });
console.log(`    doors (${doors.length}): ${doors.join(' ')}`);
for (const r of P.PHONE_TWINS) console.log(`    ${r.door.padEnd(20)} → ${r.twins ? r.twins.map((t) => t.where).join(' · ') : 'none — ' + r.why}`);
ok(doors.length >= 20 && ['btn-file-explorer', 'btn-browser', 'btn-desktop', 'btn-desktop-apps', 'rail:channels', 'rail:browser', 'rail:settings'].every((d) => doors.includes(d)),
  `the census reads the doors from the source: the toolbar's buttons + the rail's items (${doors.length}) — Files / Web view / Desktop / Apps / Channels / Agent browser / Settings among them`, doors);
ok(v.ok, `every desktop door has a phone twin whose anchor is in its file and not turned off on a phone (${P.PHONE_TWINS.length} rows, ${P.PHONE_TWINS.reduce((a, r) => a + (r.twins || []).length, 0)} twins)`, v);
const filesRow = P.PHONE_TWINS.find((r) => r.door === 'btn-file-explorer');
ok(filesRow.twins.length === 3 && /mobile-nav-files/.test(filesRow.twins[0].anchor) && /filesCard/.test(filesRow.twins[1].anchor), 'Files has THREE phone twins: the nav 文件 (first), the For-you page\'s card, the «+» sheet row', filesRow.twins.map((t) => t.where));
{ // RED CONTROL — the base: the same census over the base's index.html (no nav 文件) and For-you page (no card)
  const baseIndex = indexHtml.replace(/\n\s*<button id="mobile-nav-files"[^\n]*/, '');
  const baseTodos = sources['src/lib/user-todos-panel.js'].replace(/\n[^\n]*home\.append\(filesCard\(app\)\);[^\n]*/, '');
  const b = P.twinCensus({ doors, sources: { ...sources, 'public/index.html': baseIndex, 'src/lib/user-todos-panel.js': baseTodos } });
  ok(baseIndex !== indexHtml && baseTodos !== sources['src/lib/user-todos-panel.js'] && !b.ok && b.broken.length === 2 && b.broken.every((x) => x.door === 'btn-file-explorer'),
    'RED CONTROL (the base, c1dfc1af): its nav and its For-you page had no files twin — both named broken; the long-press sheet row was the only one', b.broken.map((x) => x.where));
}
{ // RED CONTROL — a door with no row (the files row dropped)
  const b = P.twinCensus({ doors, sources, table: P.PHONE_TWINS.filter((r) => r.door !== 'btn-file-explorer') });
  ok(!b.ok && b.missing.join() === 'btn-file-explorer', 'RED CONTROL: a desktop door with no phone row is MISSING by name', b);
}
{ // RED CONTROL — a new rail item nobody gave a twin
  const rail2 = railSrc.replace("item('browser', ", "item('newdoor', tr('New door'), () => {}),\n        item('browser', ");
  const b = P.twinCensus({ doors: P.desktopDoors({ indexHtml, railSrc: rail2 }), sources });
  ok(rail2 !== railSrc && !b.ok && b.missing.join() === 'rail:newdoor', 'RED CONTROL: a NEW rail item with no phone twin is red until it has one', b.missing);
}
{ // RED CONTROL — a twin turned off on a phone
  const gm = sources['src/lib/gear-menu.js'];
  const gate = gm.replace("icon: I.cog, label: () => t('All Settings...')", "icon: I.cog, when: (c) => !c.app.isMobile, label: () => t('All Settings...')");
  const b = P.twinCensus({ doors, sources: { ...sources, 'src/lib/gear-menu.js': gate } });
  ok(gate !== gm && !b.ok && b.broken.length === 1 && b.broken[0].door === 'rail:settings' && /turned off on a phone/.test(b.broken[0].why), 'RED CONTROL: a twin whose row is turned off on a phone (`when: !c.app.isMobile`) is no twin', b.broken);
}
{ // RED CONTROL — a «none» with no reason; a stale row
  const t1 = P.PHONE_TWINS.map((r) => (r.door === 'btn-presets' ? { ...r, why: '' } : r));
  const b1 = P.twinCensus({ doors, sources, table: t1 });
  const b2 = P.twinCensus({ doors, sources, table: [...P.PHONE_TWINS, { door: 'btn-gone', twins: null, why: 'x' }] });
  ok(!b1.ok && b1.broken.some((x) => x.door === 'btn-presets' && /no reason/.test(x.why)) && !b2.ok && b2.stale.join() === 'btn-gone', 'RED CONTROLS: a «none» row must say why; a row for a door the source no longer has is stale', { b1: b1.broken, b2: b2.stale });
}
ok(P.PHONE_TWINS.filter((r) => r.twins === null).map((r) => r.door).join() === 'btn-presets,btn-add-grid', 'the only doors without a phone twin are the layout presets / grid (a phone shows one window at a time) — each with its reason');

console.log('② the 文件 card\'s chips');
const H = '/home/u';
const FOLDERS = [
  { name: 'Desktop', path: `${H}/Desktop`, files: 0 }, { name: 'work', path: `${H}/work`, files: 23 }, { name: 'notes', path: `${H}/notes`, files: 5 },
  { name: '.cache', path: `${H}/.cache`, files: 90 }, { name: 'Downloads', path: `${H}/Downloads`, files: 0 },
];
const MOUNTS = [{ name: 'team-s3', path: '/mnt/team-s3', mounted: true }, { name: 'old-nas', path: '/mnt/old-nas', mounted: false }];
const RECENT = [`${H}/work/payments`, `${H}/work`, H, '/srv/app'];
const c = F.filesCardChips({ home: H, folders: FOLDERS, recent: RECENT, mounts: MOUNTS });
const kinds = c.map((x) => x.kind + ':' + x.path.replace(H, '~'));
ok(kinds.join() === ['home:~', 'last:~/work/payments', 'files:~/work', 'files:~/notes', 'mount:/mnt/team-s3', 'folder:~/Desktop', 'folder:~/Downloads', 'recent:/srv/app'].join(),
  'home first → the last folder used → the folders holding files (most first) → the mounted mounts → the home\'s other folders → the other recents', kinds);
ok(!c.some((x) => /\.cache|old-nas/.test(x.path)) && new Set(c.map((x) => x.path)).size === c.length, 'a path once; a dot-folder and an unmounted mount never', c.map((x) => x.path));
const many = F.filesCardChips({ home: H, folders: FOLDERS, recent: Array.from({ length: 20 }, (_, i) => `/srv/p${i}`), mounts: MOUNTS });
ok(many.length === 1 + F.CARD_MAX && many[0].kind === 'home', `bounded: home + at most ${F.CARD_MAX} (${many.length})`);
ok(F.filesCardChips({ home: H }).map((x) => x.kind).join() === 'home', 'before the hub answers: the home chip alone (the card is never empty)');
ok(F.filesCardChips({}).length === 0 && F.filesCardChips({ home: `${H}/`, recent: [`${H}/`] }).length === 1, 'no home ⇒ nothing; a trailing slash is the same folder');

console.log('③ the breadcrumbs');
const cr = (p, h) => F.crumbsOf(p, h).map((x) => `${x.label}=${x.path}`).join(' ');
ok(cr(`${H}/work/payments`, H) === `~=${H} work=${H}/work payments=${H}/work/payments`, 'under the home: ~ › work › payments, each crumb its folder', cr(`${H}/work/payments`, H));
ok(cr(H, H) === `~=${H}` && cr('/srv/app/', H) === '/=/ srv=/srv app=/srv/app' && cr('/', H) === '/=/', 'the home itself is ~; outside it the root is /; a trailing slash is dropped');
ok(cr('/home/u2/x', H) === '/=/ home=/home u2=/home/u2 x=/home/u2/x' && cr('/x', '') === '/=/ x=/x' && F.crumbsOf('', H).length === 0, 'a sibling sharing the home\'s prefix (/home/u2) is no home; no home (a remote machine) ⇒ from /', cr('/home/u2/x', H));

console.log('④ B-d027 — a relative name in the explorer\'s bar resolves against the folder on show');
{
  const L = { home: H, dirs: { '~': { kids: ['work', 'notes'] }, '~/work': { kids: ['payments', 'deals'] }, '~/work/payments': { kids: ['src'] }, '~/notes': { kids: [] } } };
  // the bases the path field builds (path-field.js inputsNow): the field's own `bases` (the explorer's folder, tilde'd), then ~
  const fieldBases = (explorerFolder) => [...(explorerFolder ? [{ path: PC.toTilde(H, explorerFolder), label: 'this folder' }] : []), { path: '~', label: 'home' }];
  const r = PC.resolveRelative('payments', fieldBases(`${H}/work`), L);
  ok(r.resolved.length === 1 && r.resolved[0].path === '~/work/payments' && r.resolved[0].base === 'this folder' && r.line.key === 'resolved', '`payments` typed at ~/work ⇒ ~/work/payments (relative to this folder)', r);
  const base = PC.resolveRelative('payments', fieldBases(null), L);
  ok(!base.resolved.length && base.line.key !== 'resolved', `RED CONTROL (the base's bar: no bases, ~ only): \`payments\` at ~/work stays unresolved (${base.line.key})`, base.line);
  const abs = PC.resolveRelative('~/notes', fieldBases(`${H}/work`), L);
  ok(abs.resolved[0]?.path === '~/notes', 'an absolute / ~ path is unchanged by the base');
  const fe = read('src/lib/file-explorer.js');
  ok(/bases: \(\) => \(this\.currentPath \? \[\{ path: this\.currentPath, label: t\('this folder'\) \}\] : \[\]\),/.test(fe), 'the explorer\'s pathField passes its folder as base 1 (the field adds ~ last)');
}

console.log('⑤ wiring pins');
{
  const idx = indexHtml;
  const navAt = idx.indexOf('<button id="mobile-nav-files"'), menuAt = idx.indexOf('<button id="mobile-nav-menu"'), titleAt = idx.indexOf('<span id="mobile-nav-title"');
  ok(navAt > menuAt && navAt < titleAt && /<button id="mobile-nav-files" title="Files" aria-label="Files" data-i18n-attr="title,aria-label">/.test(idx) && /<span class="mnav-word" aria-hidden="true" data-i18n>Files<\/span><\/button>/.test(idx),
    'index.html: the nav\'s 文件 sits right after ☰ (before the title), named Files for a screen reader, its day-one word in a span');
  const mn = read('src/lib/mobile-nav.js');
  ok(/import \{ installNavFilesDoor \} from '\.\/phone-files\.js';/.test(mn) && /\n    installNavFilesDoor\(app\);\n/.test(mn), 'MobileNav installs the nav door (the phone\'s nav controller)');
  const pf = read('src/lib/phone-files.js');
  ok(/export function goPhoneHome\(app\) \{ if \(!app\.phoneHome\?\.show\?\.\(\)\) app\.sidebar\?\.toggle\?\.\(true\); \}/.test(pf) && read('src/lib/mobile-back.js').includes('window: () => { if (!home?.show?.()) sb.toggle(true); },'),
    'the explorer\'s ‹ is the back gesture\'s home rule (mobile-back.js close.window): the For-you page when it has rows, else the conversation list');
  ok(/if \(there\) \{ app\.goToWinId\(there\.id\); return there; \}/.test(pf) && !/\.revealWindow\(|\.focusWindow\(/.test(pf), 'the doors reveal an explorer through app.goToWinId (the counted door, test-architecture §62) — no new revealWindow / focusWindow site');
  ok(/const paint = \(\) => btn\.classList\.toggle\('labelled', dayOneWords\(\[DOOR\]\)\);/.test(pf) && /btn\.onclick = \(\) => \{ dayOneUsed\(DOOR\); paint\(\); openFilesDoor\(app\); \};/.test(pf),
    'the nav\'s word shows for the first week (or until used) — the rail\'s own day-one record (sidebar-rail.js dayOneWords / dayOneUsed over railLabels)');
  const sr = read('src/lib/sidebar-rail.js');
  ok(/export function dayOneWords\(doors\) \{\n  const v = railLabels\(\{ record: readRailRecord\(\), now: Date\.now\(\), doors \}\);\n  keepRailRecord\(v\.record\);\n  return v\.show;\n\}/.test(sr) && /export function dayOneUsed\(door\) \{ keepRailRecord\(railUsed\(readRailRecord\(\), door\)\); \}/.test(sr),
    'sidebar-rail.js lends its day-one record (one key, vs-rail-labels — scratch.mjs presets it done for every chrome suite)');
  const ut = read('src/lib/user-todos-panel.js');
  const rootAt = ut.indexOf("if (!root) { root = mk('div', 'ut-inbox ut-home');"), cardAt = ut.indexOf("if (!home.querySelector(':scope > .ph-files')) home.append(filesCard(app));");
  ok(rootAt > 0 && cardAt > rootAt && cardAt - rootAt < 600, 'the For-you page appends the 文件 card AFTER its list (the first screen stays the attention list\'s — test-mobile-gaps measures it)');
  const fe = read('src/lib/file-explorer.js');
  ok(/this\._phone = app\.isMobile \? explorerPhoneBits\(this\) : null;/.test(fe) && /if \(this\._phone\) toolbar\.prepend\(this\._phone\.back\);/.test(fe) && /this\._phone\?\.paint\(data\.path\);/.test(fe),
    'the explorer builds its phone furniture only on a phone: ‹ first in the toolbar, the crumbs painted on every navigation');
  ok(/newHere\.onclick = \(\) => \{ if \(ex\.currentPath\) app\.showNewSessionDialog\(\{ cwd: ex\.currentPath, hostId: ex\._host \|\| undefined \}\); \};/.test(pf),
    '«New session here» opens the New Session dialog with the folder on show (and its machine) — the dialog is not this lane\'s');
  const vc = read('public/viewers.css');
  ok(/\.file-phone-back, \.file-crumbs, \.file-new-here \{ display: none; \}/.test(vc) && /\.file-item \{ width: 100%; min-width: 0; min-height: 44px;/.test(vc) && /\.file-toolbar \.file-path-input \{[^}]*font-size: 16px;/.test(vc) && /\.file-crumbs \{[^}]*overflow-x: auto;/.test(vc),
    'viewers.css: the furniture hidden on a desktop; on a phone rows ≥ 44 px, the path bar at 16 px (no iOS focus zoom), the crumbs scroll sideways');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const KEYS = ['Files', 'Home', 'Back', 'this folder', 'New session here'];
  const miss = KEYS.filter((k) => !zh.includes(`  ${JSON.stringify(k)}:`) || !ja.includes(`  ${JSON.stringify(k)}:`));
  ok(miss.length === 0 && /"Files": "文件"/.test(zh), `i18n: every word the doors say is in zh + ja (${KEYS.length}; «文件»)`, miss);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
