#!/usr/bin/env node
// THE DESKTOP SWITCH (lane desktop-switch-phone, 2026-10-25 — userW on the Duo's inner display: «如何在这个界面下切换桌面？»; the
// virtual-desktop switcher lived only in the taskbar's corner, and neither phone class shows the taskbar). Fast, in-process,
// PURE + a source census:
//   ① desktopRows — the manager's order, the active mark, the count = built + held (an array or a number), ≤ 3 titles top of
//     the stack first over built ∪ held, the held count; junk in, nothing thrown
//   ② switchVerdict — the desktop on show ⇒ none, a desktop gone meanwhile ⇒ refused BY THE NAME THE ROW SHOWED, else switch
//   ③ rowWords — «1 window» / «{n} windows», the titles line with «+{n} more», the held line; every key in zh + ja
//   ④ doorState — the badge only with two or more desktops; k of n and the active name
//   ⑤ otherDesktopWindows — every desktop but the active one, the manager's order, top of the stack first, built and held
//     flagged, a window of a desktop the manager does not know is nobody's
//   ⑥ wiring pins — the sheet reads the model (no second count), reuses the product's sheet (showContextMenu + .mobile-sheet,
//     no new component), its rows' long-press listeners on its own AbortController, the nav's door reads doorState, the ⧉
//     list's group reads otherDesktopWindows and goes through THE door (wm.revealWindow), the PURE module imports nothing;
//     RED CONTROLS: a model that counts only the built windows (a fresh-load desktop reads 0), a verdict that switches to a
//     gone desktop, a door with a badge on one desktop
//   ⑦ §6b guard 10 across a switch — MobileNav._noteShown run on its own source text: the in-between (the new desktop
//     active, the old desktop's window still the active window) notes nothing; RED CONTROL: the method without the guard
//     notes the old desktop's window as the new desktop's window on show
// Run: node scripts/test-desktop-switch.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const M = require(path.join(REPO, 'src/desktop-switch.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const D = [{ id: 'd1', name: 'Desktop 1' }, { id: 'd2', name: 'Desk B' }, { id: 'd3', name: 'Reading' }];

console.log('① desktopRows — one row per desktop, in the manager\'s order');
const rows = M.desktopRows({ desktops: D, activeId: 'd2',
  windowsByDesktop: { d1: [{ title: 'refund retry', z: 5 }, { title: 'Q3 decks', z: 9 }, { title: 'notes', z: 1 }, { title: 'shell', z: 7 }], d2: [{ title: 'Files', z: 3 }] },
  heldByDesktop: { d2: [{ title: 'payments', z: 8 }], d3: 2 } });
ok(rows.map((r) => r.id).join() === 'd1,d2,d3' && rows.map((r) => r.name).join() === 'Desktop 1,Desk B,Reading', 'the manager\'s order and names', rows);
ok(rows.filter((r) => r.active).map((r) => r.id).join() === 'd2', 'exactly the active desktop is marked');
ok(rows[0].windows === 4 && rows[1].windows === 2 && rows[2].windows === 2, 'the count = the windows built there + the held record\'s unbuilt entries (an array or a bare number)', rows.map((r) => r.windows));
ok(JSON.stringify(rows[0].titles) === '["Q3 decks","shell","refund retry"]' && rows[0].titles.length === M.TITLES_MAX, 'at most three titles, top of the stack first', rows[0].titles);
ok(JSON.stringify(rows[1].titles) === '["payments","Files"]' && rows[1].held === 1 && rows[2].held === 2 && rows[2].titles.length === 0, 'a held entry\'s title counts in the stack order; the held count is its own field', rows.slice(1));
ok(M.desktopRows({}).length === 0 && M.desktopRows({ desktops: [null, { name: 'x' }, { id: 'a' }], windowsByDesktop: null, heldByDesktop: { a: -3 } }).map((r) => [r.id, r.name, r.windows].join()).join('|') === 'a,a,0', 'junk in: no throw, a desktop without an id is no row, a nameless one is named by its id, a negative held is 0');
{ // RED CONTROL — the count the base's phone tab printed beside a held-only desktop when only built windows count
  const builtOnly = (o) => M.desktopRows({ ...o, heldByDesktop: {} });
  const r = builtOnly({ desktops: D, activeId: 'd1', windowsByDesktop: {}, heldByDesktop: { d3: 2 } });
  ok(r[2].windows === 0 && rows[2].windows === 2, 'RED CONTROL: a model that counts only built windows reads a fresh-load desktop as EMPTY (0 where the record holds 2)', [r[2].windows, rows[2].windows]);
}

console.log('② switchVerdict — a tap on a row');
ok(M.switchVerdict({ from: 'd2', to: 'd2', rows }).act === 'none', 'the desktop on show ⇒ none');
ok(JSON.stringify(M.switchVerdict({ from: 'd2', to: 'd1', rows })) === '{"act":"switch","to":"d1"}', 'another desktop ⇒ switch to it');
const gone = M.switchVerdict({ from: 'd2', to: 'd3', name: 'Reading', rows: rows.filter((r) => r.id !== 'd3') });
ok(gone.act === 'refused' && gone.why === 'unknown' && gone.name === 'Reading', 'a desktop deleted meanwhile (another device) ⇒ refused, said by the name the row showed', gone);
ok(M.switchVerdict({}).act === 'refused' && M.switchVerdict({ to: 'zz', rows }).name === 'zz', 'no target / an unknown id with no name ⇒ refused, named by its id');
{ // RED CONTROL — a verdict that trusts the tapped row
  const naive = ({ from, to }) => (to === from ? { act: 'none' } : { act: 'switch', to });
  ok(naive({ from: 'd2', to: 'd3' }).act === 'switch' && gone.act === 'refused', 'RED CONTROL: a verdict that trusts the row it rendered switches to a desktop that is gone');
}

console.log('③ rowWords — the row\'s words');
const seen = [];
const tt = (s, p) => { seen.push(s); return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? p[k] : m)); };
const w0 = M.rowWords(rows[0], { t: tt }), w1 = M.rowWords(rows[1], { t: tt }), w2 = M.rowWords(rows[2], { t: tt });
ok(w0.count === '4 windows' && w0.titles === 'Q3 decks · shell · refund retry · +1 more' && w0.held === '', 'four built: «4 windows», three titles · «+1 more»', w0);
ok(w1.count === '2 windows' && w1.titles === 'payments · Files' && w1.held === '1 not opened on this screen yet', 'a held entry: its title in the line and the held line', w1);
ok(w2.count === '2 windows' && w2.titles === '' && w2.held === '2 not opened on this screen yet', 'held only (a desktop this page never opened): no titles it does not know, the held line', w2);
ok(M.rowWords({ windows: 1, titles: ['x'] }, { t: tt }).count === '1 window' && M.rowWords({ windows: 0 }).count === '0 windows', '«1 window» singular; the default translator fills the English template');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...new Set([...seen, 'Desktops', 'Desktops — {name} ({k}/{n})', 'New desktop', '“{name}” is no longer there', 'Other desktops ({n})', 'Rename', 'Delete'])];
  const miss = keys.filter((k) => !zh.includes(`  ${JSON.stringify(k)}:`) || !ja.includes(`  ${JSON.stringify(k)}:`));
  ok(miss.length === 0, `i18n: every word of the sheet, the door and the ⧉ group is in zh + ja (${keys.length})`, miss);
}

console.log('④ doorState — the door\'s badge and label');
ok(JSON.stringify(M.doorState(rows)) === '{"k":2,"n":3,"name":"Desk B","badge":"2"}', 'three desktops, the second on show ⇒ badge «2», «Desk B (2/3)»');
ok(M.doorState([{ id: 'a', name: 'Only', active: true }]).badge === '' && M.doorState([{ id: 'a', name: 'Only', active: true }]).k === 1, 'ONE desktop ⇒ no badge (no choice to show), the label still names it (1/1)');
ok(M.doorState([]).k === 0 && M.doorState(null).badge === '', 'no desktops known (before the boot read) ⇒ k 0, no badge');
{ // RED CONTROL — a badge that counts desktops instead of naming the active one
  const wrong = (r) => ({ badge: String(r.length) });
  ok(wrong(rows).badge === '3' && M.doorState(rows).badge === '2', 'RED CONTROL: a badge of the desktop COUNT says 3 where the person is on the 2nd');
}

console.log('⑤ otherDesktopWindows — the ⧉ list\'s «Other desktops» rows');
const others = M.otherDesktopWindows({ desktops: D, activeId: 'd1',
  built: [{ id: 'w1', title: 'refund retry', desk: 'd1', z: 5 }, { id: 'w2', title: 'Files', desk: 'd2', z: 3 }, { id: 'w9', title: 'stray', desk: 'gone', z: 99 }],
  held: [{ id: 'h1', title: 'payments', desk: 'd2', z: 8 }, { id: 'h2', title: '', desk: 'd3', z: 1 }] });
ok(others.map((r) => r.id).join() === 'h1,w2,h2', 'every desktop but the active one, the manager\'s order, top of the stack first; a desktop the manager does not know is nobody\'s', others);
ok(others[0].deskName === 'Desk B' && others[0].built === false && others[1].built === true && others[2].title === 'h2', 'each row names its desktop; built / held flagged; an untitled entry is named by its id', others);
ok(M.otherDesktopWindows({ desktops: D, activeId: 'd1' }).length === 0 && M.otherDesktopWindows({}).length === 0, 'nothing elsewhere ⇒ no group');

console.log('⑥ wiring pins');
{
  const pure = read('src/desktop-switch.js');
  ok(!/\brequire\(|^\s*import\s/m.test(pure) && /module\.exports = \{ TITLES_MAX, desktopRows, switchVerdict, rowWords, doorState, otherDesktopWindows \};/.test(pure), 'src/desktop-switch.js is PURE (imports nothing) and CommonJS (a root src/ module)');
  const sh = read('src/lib/desktop-switch-sheet.js');
  ok(/import \{ desktopRows, switchVerdict, rowWords \} from '\.\.\/desktop-switch\.js';/.test(sh) && /return desktopRows\(\{ desktops: dm\.desktops, activeId: dm\.activeDesktopId, windowsByDesktop, heldByDesktop \}\);/.test(sh) && /const w = rowWords\(r, \{ t \}\);/.test(sh),
    'the sheet reads the model — one count, one set of words (no second count in the bundle)');
  ok(/const menu = showContextMenu\(/.test(sh) && /menu\.classList\.add\('mobile-sheet'\)/.test(sh) && !/createModalShell|document\.createElement\('dialog'\)/.test(sh),
    'the sheet is the product\'s own (showContextMenu + the phone\'s .mobile-sheet) — no new component');
  ok(/else placeOverColumn\(menu, ar\);/.test(sh) && /const w = Math\.max\(0, Math\.min\(480, right - \(colL \+ 4\)\)\);/.test(sh) && /menu\.style\.width = \(w \/ Z\) \+ 'px'; menu\.style\.minWidth = '0'; menu\.style\.maxWidth = 'none';/.test(sh),
    'the regular class places the sheet OVER THE CONVERSATION COLUMN with an explicit width (≤ 480 px, the column\'s less 4 px a side) — never its rows\' max-content width (主开发\'s 8fda0ac8 defect: ~1790 px, off the left edge; the geometry is test-duo-layout ⑧\'s)');
  ok(/const ctl = new AbortController\(\);/.test(sh) && /\}, \{ signal: ctl\.signal \}\);/.test(sh) && /openCtl\?\.abort\(\);/.test(sh), 'the rows\' long-press listeners hang on the sheet\'s own AbortController (a reopen aborts the last)');
  ok(/const v = switchVerdict\(\{ from: dm\.activeDesktopId, to: r\.id, name: r\.name, rows: sheetRows\(app\) \}\);/.test(sh) && /if \(v\.act === 'refused'\) \{ showToast\(/.test(sh), 'a tap asks the verdict over the rows as they are NOW (a desktop deleted elsewhere is said, never switched to)');
  ok(/label: t\('Rename'\), action: \(\) => dm\._startRename\(desk\)/.test(sh) && /await dm\.deleteDesktop\(desk\.id\);/.test(sh), 'a long press = the manager\'s own Rename / Delete (its dialog; its delete moves the windows to the next desktop)');
  const mn = read('src/lib/mobile-nav.js');
  ok(/openDesktopSheet\(this\.app, b, \{ onSwitch: \(id\) => this\.switchDesktop\(id\) \}\)/.test(mn) && /const s = doorState\(/.test(mn), 'the nav\'s Desktops button opens THE sheet; its badge / label are doorState\'s');
  const tb = read('src/lib/taskbar.js');
  ok(/return otherDesktopWindows\(\{ desktops: dm\.desktops, activeId: dm\.activeDesktopId, built, held \}\);/.test(tb) && /if \(r\.built\) \{ app\.wm\.revealWindow\(r\.id\); return; \}/.test(tb) && /if \(app\.wm\.windows\.has\(r\.id\)\) \{ app\.wm\.revealWindow\(r\.id\); return; \}/.test(tb),
    'the ⧉ list\'s «Other desktops» rows are the model\'s and go through THE door (wm.revealWindow switches the desktop first)');
  ok(/if \(activeDesk && win\._desktopId && win\._desktopId !== activeDesk\) continue;/.test(tb) && /let otherDesksOpen = false;/.test(tb), 'the ⧉ list\'s active-desktop filter stays the default view; the group starts folded');
  const dm = read('src/lib/desktop-manager.js');
  ok(/\n  _renderSwitcher\(\) \{\n    this\.app\._mobileNav\?\.updateDesktopsDoor\?\.\(\);/.test(dm) && !/openDesktopSheet/.test(dm) && (dm.match(/desktop-switch-sheet/g) || []).length === 1 && /^import \{ sheetRows \} from '\.\/desktop-switch-sheet\.js';/m.test(dm), 'the switcher\'s home stays the taskbar (desktop-manager.js); it only tells the door (int358: it reads the sheet\'s ROWS — sheetRows, its compact list\'s one source — and never opens the sheet)');
}

console.log('⑦ §6b guard 10 across a switch — MobileNav._noteShown, run on the real source text');
{
  const mn = read('src/lib/mobile-nav.js');
  const m = /\n  _noteShown\(\) \{\n([\s\S]*?)\n  \}\n/.exec(mn);
  ok(!!m, 'the method is found in src/lib/mobile-nav.js');
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const run = (body) => {
    const noteShown = new Function(body); // eslint-disable-line no-new-func — the method's own text, `this` bound below
    const self = { _shownBooted: true, _shown: { d1: 'w1' }, app: { desktopManager: { activeDesktopId: 'd2' }, wm: { activeWindowId: 'w1', windows: new Map([['w1', { _desktopId: 'd1' }], ['w2', { _desktopId: 'd2' }]]) } } };
    noteShown.call(self); // the in-between: the new desktop d2 active, d1's window w1 still the active window
    const between = { ...self._shown };
    self.app.wm.activeWindowId = 'w2'; noteShown.call(self); // the switch's own focus lands on d2's window
    return { between, after: { ...self._shown } };
  };
  const real = run(m ? m[1] : '');
  ok(!('d2' in real.between) && real.after.d2 === 'w2' && real.after.d1 === 'w1', 'a switch\'s in-between notes NOTHING for the new desktop; its own window, once focused, is noted', real);
  const guardLine = '    if (desk && w?._desktopId && w._desktopId !== desk) return; // a switch\'s in-between: the old desktop\'s window is still the active one\n';
  const red = run(m ? m[1].replace(guardLine, '') : '');
  ok(m && m[1].includes(guardLine) && red.between.d2 === 'w1', 'RED CONTROL: the method without the guard (the base) notes desktop 1\'s window as desktop 2\'s window on show — a reload would then show a window of another desktop', red);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
