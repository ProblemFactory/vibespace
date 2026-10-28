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
//   ⑧ desktopDoors — THE DESKTOP DOORS (lane desktop-doors-table, 2026-10-26: five hand-written lists; the phone sheet offered
//     Rename + Delete only, so a phone — no drag — could not reorder): every door, always, in ONE order; each door's rule
//     (delete needs two desktops, move up not the first, move down not the last, a gone desktop shuts all but new); the
//     tier changes only HOW a door is drawn (row / item / drag / off) — never its label, its rule, its why; doorItems' ONE
//     separator and whys; sheetItems = one row per desktop (its switch door's words) + the 'new' row; zh + ja.
//     ROUND 2 (主开发's acceptance): a desktop NO LONGER THERE draws every door greyed with the why that names it on the
//     DESK tier too (8c680dcf: the desk left every shut door out — an EMPTY menu); the why names the NAME the row showed,
//     never the id (no name ⇒ the nameless why); the Rename door carries its dialog's words; sheetItems' gone row
//   ⑨ THE SURFACE CENSUS — the manager's _deskItems run on its own source text for every surface that draws the doors (the
//     preview's right-click, a compact-list row's right-click / ⋯, the phone sheet's and the window switcher tab's long
//     press) over the first / a middle / the last / the only desktop: each draws exactly the table's 'item' doors with the
//     table's label, a shut one greyed WITH its why; each act on the manager's own handler through the done/after guard (a
//     cancelled Rename… brings nothing back); every call site of the builder named; no door word left in a surface file;
//     every «+» and every switching row says the table's words. RED CONTROL: the base's sheet long press (Rename · Delete,
//     hand-written) fails the census on every desktop — no Move up / Move down, «Rename» for 「Rename…」.
//     ROUND 2: a GONE desktop is a census case (every surface, both tiers: its doors greyed with its why by its name); THE
//     VERDICT AT THE ACT — a menu built, then the list loses the desktop or a neighbour before the press: the act refuses
//     with its why (a toast), runs nothing and never `after`, or acts on the neighbours as they are NOW; the Rename dialog
//     run on its own text: its words are the table's (t()), a desktop deleted while it is open is refused by its name; the
//     fence reads BARE door words too (title / label / confirmText / innerText / textContent — 8c680dcf: 3 hits).
//     ROUND 3: the fence reads a shut door's WHY words too (25151f0b: the sheet's tap and a row drop kept their own); the
//     Rename dialog says a rename made on another screen while it was open (the typed name lands, the one it replaces said)
//   ⑩ followDesktops — an OPEN list (the compact list, the sheet, the window switcher's tabs) follows a remote change: live
//     order and names, a new desktop drawn, a deleted one KEPT at its place greyed (never a row gone from under a finger or a
//     drag); its wiring: both remote roads redraw, the compact list keeps the drag's spring, the phone's two hear vs-desktops.
//     ROUND 3: the compact list is PATCHED in place (its _follow, keyed by data-desktop-id) — no road rebuilds it
//   ⑪ ROUND 3 (主开发's acceptance of 25151f0b) — THE LISTENER LIFECYCLE: untilGone run on its own source text (a fake observer:
//     a list's listeners live while it is in the page and are aborted the moment it leaves, by any road); the window
//     switcher's ONE close (its toggle, an outside tap, both row taps; its listeners on its signal) and the sheet's
//     controller; the compact list patched in place; every switch refusal through _doorRefused (one sayer: a compact row, a
//     sheet row, a tab, a drop on a gone row); the kb-bugfix INDEX line of round 2's law. RED CONTROL: 25151f0b's switcher
//     (a self-removing listener with no controller, three bare removes) fails the census.
//   ⑫ ROUND 4 (主开发's acceptance of daf19adf) — ONE PLACEMENT DOOR: the compact list is placed by PURE menuPlace over its own
//     box (`keep`: its top kept, capped at the viewport's foot; `maxW`) through ONE _placeList — at its open once its words
//     are painted and after every patch; the patch writes no box by hand. RED CONTROL: daf19adf's _follow (a hand-written
//     lift by the overflow, no floor, no cap) fails the census. (menuPlace's own table: test-desktop-small §2; the chrome leg:
//     test-desktop-small-chrome ⑲ r4.)
//   ⑬ ROUND 5 (主开发's acceptance of 5a98bf0f) — A SCROLLED LIST KEEPS ITS OFFSET: _placeList reads the offset before a style
//     is written, asks menuPlace with it (`scrolled`) and writes the verdict's `scroll` back, last. RED CONTROL: 5a98bf0f's
//     _placeList (the offset neither read nor kept — a lifted cap dropped it) fails the census. (menuPlace's rows + sweep:
//     test-desktop-small §2 / §7; the chrome leg: test-desktop-small-chrome ⑲ r5.)
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
  const keys = [...new Set([...seen, 'Desktops', 'Desktops — {name} ({k}/{n})', 'New desktop', '“{name}” is no longer there', 'Other desktops ({n})', ...M.DOORS.map((d) => d.label)])];
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
  ok(!/\brequire\(|^\s*import\s/m.test(pure) && /module\.exports = \{ TITLES_MAX, DOORS, DOOR_WHY, desktopRows, switchVerdict, rowWords, doorState, otherDesktopWindows, desktopDoors, doorItems, sheetItems, followDesktops \};/.test(pure), 'src/desktop-switch.js is PURE (imports nothing) and CommonJS (a root src/ module)');
  const sh = read('src/lib/desktop-switch-sheet.js');
  ok(/import \{ desktopRows, switchVerdict, sheetItems, followDesktops \} from '\.\.\/desktop-switch\.js';/.test(sh) && /const desktops = drawn \? followDesktops\(\{ drawn, desktops: dm\.desktops \}\) : dm\.desktops;/.test(sh) && /return desktopRows\(\{ desktops, activeId: dm\.activeDesktopId, windowsByDesktop, heldByDesktop \}\);/.test(sh) && /const items = sheetItems\(rows, \{ t \}\)\.map\(\(s\) => \(s\.door === 'new'/.test(sh) && !/rowWords/.test(sh),
    'the sheet reads the model — one count, one set of words (its rows are PURE sheetItems: rowWords + the table\'s doors)');
  ok(/const menu = showContextMenu\(/.test(sh) && /menu\.classList\.add\('mobile-sheet'\)/.test(sh) && !/createModalShell|document\.createElement\('dialog'\)/.test(sh),
    'the sheet is the product\'s own (showContextMenu + the phone\'s .mobile-sheet) — no new component');
  ok(/else placeOverColumn\(menu, ar\);/.test(sh) && /const w = Math\.max\(0, Math\.min\(480, right - \(colL \+ 4\)\)\);/.test(sh) && /menu\.style\.width = \(w \/ Z\) \+ 'px'; menu\.style\.minWidth = '0'; menu\.style\.maxWidth = 'none';/.test(sh),
    'the regular class places the sheet OVER THE CONVERSATION COLUMN with an explicit width (≤ 480 px, the column\'s less 4 px a side) — never its rows\' max-content width (主开发\'s 8fda0ac8 defect: ~1790 px, off the left edge; the geometry is test-duo-layout ⑧\'s)');
  ok(/const ctl = new AbortController\(\);/.test(sh) && /\}, \{ signal: ctl\.signal \}\);/.test(sh) && /openCtl\?\.abort\(\);/.test(sh), 'the rows\' long-press listeners hang on the sheet\'s own AbortController (a reopen aborts the last)');
  ok(/const v = switchVerdict\(\{ from: dm\.activeDesktopId, to: r\.id, name: r\.name, rows: sheetRows\(app\) \}\);/.test(sh) && /if \(v\.act === 'refused'\) return void dm\._doorRefused\(\{ id: r\.id, name: v\.name \}, 'switch'\);/.test(sh), 'a tap asks the verdict over the rows as they are NOW (a desktop deleted elsewhere is said — the table\'s why, r3 ④ — never switched to)');
  ok(/const after = \(\) => \(dm\.desktops\.some\(\(d\) => d\.id === desk\.id\) \? setTimeout\(\(\) => \{ if \(anchor\?\.isConnected\) openDesktopSheet\(app, anchor, \{ onSwitch \}\); \}, 0\) : onSwitch\(dm\.activeDesktopId\)\);/.test(sh),
    'a long press = the desktop\'s doors (⑨: THE builder, phone tier); once an act is done a delete re-shows the desktop on show (its windows moved to the next desktop), any other brings the sheet back on its new state');
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

console.log('⑧ desktopDoors — THE desktop doors, one table');
const IDS = 'switch,rename,delete,move-up,move-down,new';
const D4 = [{ id: 'd1', name: 'Desktop 1' }, { id: 'd2', name: 'Desk B' }, { id: 'd3', name: 'Reading' }, { id: 'd4', name: 'Taxes' }];
const by = (r) => Object.fromEntries(r.map((x) => [x.id, x]));
{
  const worlds = [{ desk: 'd1', desktops: D4 }, { desk: 'd2', desktops: D4 }, { desk: 'd4', desktops: D4 }, { desk: 'd1', desktops: D4.slice(0, 1) }, { desk: 'zz', desktops: D4 }, {}, { desk: 'd1', desktops: [null, 7, { name: 'x' }] }];
  ok(M.DOORS.map((d) => d.id).join() === IDS && worlds.every((w) => ['desk', 'phone'].every((tier) => [false, true].every((order) => M.desktopDoors({ ...w, tier, order }).map((r) => r.id).join() === IDS))), 'every door, always, in ONE order — whatever the desktop, the tier, the order flag (junk in: no throw)');
  const mid = by(M.desktopDoors({ desk: 'd2', desktops: D4 })), first = by(M.desktopDoors({ desk: 'd1', desktops: D4 })), last = by(M.desktopDoors({ desk: 'd4', desktops: D4 }));
  const only = by(M.desktopDoors({ desk: 'd1', desktops: D4.slice(0, 1) })), gone = by(M.desktopDoors({ desk: 'zz', name: 'Old desk', desktops: D4 })), nameless = by(M.desktopDoors({ desk: 'zz', desktops: D4 }));
  ok(Object.values(mid).every((r) => r.enabled && r.why === ''), 'a middle desktop: every door open');
  ok(!first['move-up'].enabled && first['move-up'].why === 'Already the first desktop' && first['move-down'].enabled && !last['move-down'].enabled && last['move-down'].why === 'Already the last desktop' && last['move-up'].enabled,
    'move up shut on the first desktop, move down shut on the last — each with its why', { first: first['move-up'], last: last['move-down'] });
  ok(!only.delete.enabled && only.delete.why === 'Your only desktop — it cannot be deleted' && only.rename.enabled && only.switch.enabled && only.new.enabled && !only['move-up'].enabled && !only['move-down'].enabled,
    'the only desktop: delete shut with its why (never the last desktop), rename / switch / new open', only);
  ok(['switch', 'rename', 'delete', 'move-up', 'move-down'].every((id) => !gone[id].enabled && gone[id].why === '“{name}” is no longer there' && gone[id].params.name === 'Old desk') && gone.new.enabled,
    'a desktop gone meanwhile (another device): all its doors shut, said by THE NAME ITS ROW SHOWED — never its id (r2 ③: 8c680dcf pinned the id «zz» here); new stays open', gone);
  ok(['switch', 'rename', 'delete', 'move-up', 'move-down'].every((id) => !nameless[id].enabled && nameless[id].why === 'This desktop is no longer there' && nameless[id].params.name === '') && JSON.stringify(nameless).indexOf('zz') < 0,
    'r2 ③: no name given — the nameless why; a raw id is never a word in a sentence', nameless.rename);
  ok(JSON.stringify(mid.rename.dialog) === JSON.stringify({ title: 'Rename Desktop', label: 'Desktop name', confirm: 'Rename', meanwhile: '“{was}” was renamed to “{now}” on another screen meanwhile — your name “{name}” replaces it' }) && ['switch', 'delete', 'move-up', 'move-down', 'new'].every((id) => mid[id].dialog === null),
    'r2 ④: the Rename door carries ITS DIALOG\'s words (t() keys) — the dialog reads them from the table (r3 ⑤: and what it says when another screen renamed the desktop meanwhile)', mid.rename);
  ok(mid.rename.label === 'Rename…' && mid.delete.label === 'Delete' && mid.delete.danger && mid['move-up'].label === 'Move up' && mid['move-down'].label === 'Move down' && mid.new.label === 'New desktop' && mid.switch.label === 'Switch desktop — {name}' && mid.switch.params.name === 'Desk B',
    'ONE label set: 『Rename…』 (the ellipsis rule — a dialog follows — on the phone too), Delete (danger), Move up / Move down, New desktop, the switch door by the desktop\'s name');
  const strip = (r) => JSON.stringify(r.map(({ draw, ...x }) => x));
  ok(worlds.every((w) => [false, true].every((order) => strip(M.desktopDoors({ ...w, order, tier: 'desk' })) === strip(M.desktopDoors({ ...w, order, tier: 'phone' })))),
    'the tier changes only HOW a door is drawn — never its label, its rule, its why');
  const draw = (o) => M.desktopDoors(o).map((r) => r.draw).join();
  ok(draw({ desk: 'd2', desktops: D4, tier: 'desk' }) === 'row,item,item,drag,drag,row' && draw({ desk: 'd2', desktops: D4, tier: 'desk', order: true }) === 'row,item,item,item,item,row',
    'desk: the preview tile reorders by its DRAG (order false), a compact-list row by its menu items (order true); the tile / row itself and the «+» are rows');
  ok(draw({ desk: 'd1', desktops: D4, tier: 'desk', order: true }) === 'row,item,item,off,item,row' && draw({ desk: 'd1', desktops: D4.slice(0, 1), tier: 'desk', order: true }) === 'row,item,off,off,off,row',
    'desk: a shut door is LEFT OUT of a desk menu (the compact row\'s menu stays what it was)');
  const goneMenu = (order) => M.doorItems(M.desktopDoors({ desk: 'zz', name: 'Old desk', desktops: D4, tier: 'desk', order }), { t: tt });
  const gm = goneMenu(false), gr = goneMenu(true);
  ok(gm.length > 0 && gm.map((x) => x.id).join() === 'rename,delete' && gr.filter((x) => !x.separator).map((x) => x.id).join() === 'rename,delete,move-up,move-down' && [...gm, ...gr].every((x) => x.separator || (!x.enabled && x.why === '“Old desk” is no longer there')),
    'r2 ①: a desktop NO LONGER THERE on the DESK tier — the preview\'s menu and a compact row\'s are NOT empty: every door greyed with the why that names it (8c680dcf: [] — showContextMenu opened an empty box)', { gm, gr });
  ok(draw({ desk: 'zz', name: 'Old desk', desktops: D4, tier: 'desk', order: true }) === 'row,item,item,item,item,row' && draw({ desk: 'zz', name: 'Old desk', desktops: D4, tier: 'desk' }) === 'row,item,item,drag,drag,row',
    'r2 ①: a desk menu leaves a shut door out only while its desktop is HERE (the first one\'s Move up, the only one\'s Delete) — a gone one\'s are drawn, on every tier');
  ok(draw({ desk: 'd1', desktops: D4, tier: 'phone' }) === 'row,item,item,item,item,row' && draw({ desk: 'd1', desktops: D4.slice(0, 1), tier: 'phone', order: true }) === 'row,item,item,item,item,row',
    'phone: every door drawn, a shut one too (greyed with its why); its order doors are items with or without `order` (a phone has no drag)');
  const it = M.doorItems(M.desktopDoors({ desk: 'd1', desktops: D4, tier: 'phone' }), { t: tt });
  ok(JSON.stringify(it.map((x) => (x.separator ? '|' : x.id + (x.enabled ? '' : '!' + x.why)))) === JSON.stringify(['rename', 'delete', '|', 'move-up!Already the first desktop', 'move-down']),
    'doorItems: the menu doors in order, the order doors after ONE separator, a shut one keeps its why', it);
  ok(M.doorItems(M.desktopDoors({ desk: 'd1', desktops: D4.slice(0, 1), tier: 'desk', order: true })).map((x) => x.label).join() === 'Rename…' && M.doorItems(null).length === 0,
    'doorItems: nothing drawn after the first group ⇒ no separator; junk ⇒ nothing');
  const si = M.sheetItems(rows, { t: tt });
  ok(si.length === rows.length + 1 && si.slice(0, -1).every((x, k) => x.door === 'switch' && x.id === rows[k].id && x.title === 'Switch desktop — ' + rows[k].name) && si[1].active && si[0].sub === 'Q3 decks · shell · refund retry · +1 more' && si[1].sub === 'payments · Files — 1 not opened on this screen yet' && JSON.stringify(si.at(-1)) === '{"door":"new","id":null,"label":"New desktop"}',
    'sheetItems: one row per desktop = its switch door (its title) with its words, then the \'new\' door — the sheet\'s DOM is drawn from these', si);
  const sg = M.sheetItems(M.desktopRows({ desktops: [{ id: 'd1', name: 'Desktop 1' }, { id: 'd9', name: 'Old desk', gone: true }], activeId: 'd1' }), { t: tt });
  ok(sg.length === 3 && !sg[0].gone && sg[0].count === '0 windows' && JSON.stringify(sg[1]) === JSON.stringify({ door: 'switch', id: 'd9', name: 'Old desk', active: false, count: '', sub: '“Old desk” is no longer there', title: '“Old desk” is no longer there', gone: true }),
    'r2 ①: sheetItems — a row deleted elsewhere while the sheet is open = its switch door SHUT: no count, its why (by the name it showed) on its second line and as its title', sg);
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...M.DOORS.map((d) => d.label), ...M.DOORS.flatMap((d) => (d.dialog ? Object.values(d.dialog) : [])), ...Object.values(M.DOOR_WHY)];
  const miss = keys.filter((k) => !zh.includes(`  ${JSON.stringify(k)}:`) || !ja.includes(`  ${JSON.stringify(k)}:`));
  ok(miss.length === 0 && keys.includes('Rename Desktop') && keys.includes('Desktop name'), `i18n: every door's label, every word of a door's dialog and every shut door's why is in zh + ja (${keys.length})`, miss);
}

console.log('⑨ THE SURFACE CENSUS — every surface draws the table');
{
  const dmSrc = read('src/lib/desktop-manager.js'), sh = read('src/lib/desktop-switch-sheet.js'), mn = read('src/lib/mobile-nav.js');
  const method = (name) => { const m = new RegExp(`\\n  ((?:async )?${name}\\([^\\n]*\\) \\{\\n[\\s\\S]*?\\n  \\})\\n`).exec(dmSrc); return m ? m[1] : null; };
  const deskItemsSrc = method('_deskItems'), doorLabelSrc = method('_doorLabel'), doorRefusedSrc = method('_doorRefused'), startRenameSrc = method('_startRename');
  ok(!!deskItemsSrc && !!doorLabelSrc && !!startRenameSrc, 'the manager\'s _deskItems (THE builder), _doorLabel and _startRename are found in src/lib/desktop-manager.js');
  ok(!!doorRefusedSrc, 'r2 ②: THE VERDICT AT THE ACT — the manager\'s _doorRefused is found (a door asked again of the table at the press)');
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tr = (x, p) => String(x).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? p[k] : m));
  const toasts = [];
  // a method's own text, its module-level names handed in (the page's translator, escHtml, the toast — recorded)
  const make = (src, fallback, deps = {}) => { const d = { desktopDoors: M.desktopDoors, doorItems: M.doorItems, t: tr, escHtml: esc, showToast: (m) => { toasts.push(m); }, ...deps }; const body = src || fallback; return new Function(...Object.keys(d), `return ${/^async /.test(body) ? 'async function ' + body.slice(6) : 'function ' + body}`)(...Object.values(d)); }; // eslint-disable-line no-new-func — the methods' own text
  const deskItems = make(deskItemsSrc, '_deskItems() { return []; }'), doorLabel = make(doorLabelSrc, "_doorLabel() { return ''; }"), doorRefused = make(doorRefusedSrc, '_doorRefused() { return false; }');
  const world = (desktops, renamed = true) => {
    const calls = [];
    const self = { _desktops: desktops.map((d) => ({ ...d })), _doorRefused: doorRefused, _startRename: (d) => { calls.push('rename ' + d.id); return Promise.resolve(renamed); }, deleteDesktop: (id) => { calls.push('delete ' + id); return Promise.resolve(); }, reorderDesktop: (a, b) => { calls.push('reorder ' + a + ' before ' + b); } };
    return { self, calls };
  };
  // ONE drawn menu against the table: exactly its 'item' doors, in its order, with its label; an open one acts, a shut one
  // is greyed WITH its why (the words on the row and its title) and acts on nothing
  const census = (items, doors) => {
    const want = M.doorItems(doors, { t: tr }).filter((x) => !x.separator), got = (items || []).filter((x) => x && !x.separator), bad = [];
    for (const w of want) {
      const g = got.find((x) => x.label === w.label);
      if (!g) { bad.push(`${w.id}: not drawn (want «${w.label}»)`); continue; }
      if (w.enabled && (g.disabled || typeof g.action !== 'function')) bad.push(`${w.id}: open in the table, not a live item`);
      if (!w.enabled && !(g.disabled && !g.action && String(g.labelHtml || '').includes(esc(w.why)) && g.title === w.why)) bad.push(`${w.id}: shut — not greyed with its why «${w.why}»`);
    }
    for (const g of got) if (!want.some((w) => w.label === g.label)) bad.push(`«${g.label}»: drawn — the table has no such door here`);
    if (got.map((x) => x.label).join(' · ') !== want.map((x) => x.label).join(' · ')) bad.push(`the order: ${got.map((x) => x.label).join(' · ')} ≠ ${want.map((x) => x.label).join(' · ')}`);
    return bad;
  };
  // r2 ①③: a desktop GONE meanwhile (another screen) is a case too — its row showed «Old desk»
  const CASES = [['the first', D4, 'd1'], ['a middle', D4, 'd2'], ['the last', D4, 'd4'], ['the only', D4.slice(0, 1), 'd1'], ['a gone', D4, 'zz']];
  const walk = (draw, tier, order) => CASES.flatMap(([label, desktops, id]) => {
    const { self } = world(desktops);
    const desk = self._desktops.find((d) => d.id === id) || { id, name: 'Old desk' };
    const b = census(draw(self, desk), M.desktopDoors({ desk: id, name: desk.name, desktops, order, tier }));
    return b.length ? [label + ': ' + b.join('; ')] : [];
  });
  const SURFACES = [
    ['the preview tile\'s right-click', 'desk', false, (self, desk) => deskItems.call(self, desk)],
    ['a compact-list row\'s right-click / ⋯', 'desk', true, (self, desk) => deskItems.call(self, desk, { order: true, after: () => {} })],
    ['the phone sheet\'s long press', 'phone', false, (self, desk) => deskItems.call(self, desk, { tier: 'phone', after: () => {} })],
    ['the window switcher tab\'s long press', 'phone', false, (self, desk) => deskItems.call(self, desk, { tier: 'phone', after: () => {} })],
  ];
  for (const [name, tier, order, draw] of SURFACES) {
    const bad = walk(draw, tier, order);
    ok(bad.length === 0, `${name} (${tier}${order ? ' + order' : ''}): exactly the table's doors with its labels, a shut one greyed with its why — first / middle / last / only / a GONE desktop (by the name its row showed)`, bad);
  }
  // every call site of THE builder — a surface that draws desktop doors and is not here keeps a list of its own
  const sites = [];
  for (const f of fs.readdirSync(path.join(REPO, 'src/lib')).filter((x) => x.endsWith('.js'))) for (const m of read('src/lib/' + f).matchAll(/^.*\b_deskItems\(.*$/gm)) sites.push(f + ': ' + m[0].trim().replace(/\s*\/\/.*$/, ''));
  const SITES = [
    "desktop-manager.js: const items = this._deskItems(desk);",
    "desktop-manager.js: const open = (x, y) => showContextMenu(x, y, this._deskItems(el._desk, { order: true, after: back }), 'context-menu', { up: y > window.innerHeight / 2 });",
    "desktop-manager.js: _deskItems(desk, { order = false, after = null, tier = 'desk' } = {}) {",
    "desktop-switch-sheet.js: showContextMenu(e.clientX, e.clientY, dm._deskItems(desk, { tier: 'phone', after }), 'context-menu', { extraClass: 'mdesk-doors' });",
    "mobile-nav.js: showContextMenu(e.clientX, e.clientY, dm._deskItems(desk, { tier: 'phone', after }), 'context-menu', { extraClass: 'mdesk-doors' });",
  ];
  ok(JSON.stringify(sites.sort()) === JSON.stringify([...SITES].sort()), `THE builder's call sites are the four surfaces: the preview (desk), a compact row (desk + order), the sheet and the window switcher's tab (phone) — ${sites.length}`, sites);
  // r2 ④: the fence reads BARE literals too — a door word, or a word of a door's dialog, in a title / label / confirmText /
  // innerText / textContent / placeholder of a surface file, t()-wrapped or not (8c680dcf: the Rename dialog's three)
  const WORDS = ['Switch desktop — {name}', 'Rename…', 'Rename', 'Rename Desktop', 'Desktop name', '“{was}” was renamed to “{now}” on another screen meanwhile — your name “{name}” replaces it', 'Delete', 'Move up', 'Move down', 'New desktop', 'Add desktop'];
  const tableWords = [...M.DOORS.map((d) => d.label), ...M.DOORS.flatMap((d) => (d.dialog ? Object.values(d.dialog) : []))];
  ok(tableWords.every((w) => WORDS.includes(w)), 'the fence\'s words cover the table\'s (every door\'s label, every word of a door\'s dialog)', tableWords.filter((w) => !WORDS.includes(w)));
  const alt = WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const FENCE = new RegExp(`\\bt\\((['"\`])(?:${alt})\\1|\\b(?:title|label|confirmText|innerText|textContent|placeholder)\\s*[:=]\\s*(['"\`])(?:${alt})\\2|'Add desktop'`, 'g');
  const hits = [];
  for (const f of ['src/lib/desktop-manager.js', 'src/lib/desktop-switch-sheet.js', 'src/lib/mobile-nav.js']) read(f).split('\n').forEach((line, k) => { for (const m of line.matchAll(FENCE)) hits.push(`${f.slice(8)}:${k + 1}: ${m[0]}`); });
  ok(hits.length === 0, `no surface keeps a hand-written door word — t()-wrapped OR BARE in a title / label / confirmText / innerText / textContent (${hits.length} hits)`, hits);
  // r3 ④: …nor a shut door's WHY words — they live in the table (DOOR_WHY) and reach a surface through _doorRefused /
  // _doorLabel only (25151f0b: the sheet's tap kept its own literal of the gone why, a row drop a «{name}» sentence of its
  // own). Comments aside, a why's words anywhere in a surface file's code are a second source.
  const FRAGS = Object.values(M.DOOR_WHY).map((w) => w.replace(/^“\{name\}”\s*/, '').split(' — ')[0]).filter((f, _, all) => !all.some((g) => g !== f && f.includes(g)));
  const codeLines = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).split('\n').map((l) => l.replace(/(^|[^:\\'"`])\/\/.*$/, '$1'));
  const whyHits = [];
  for (const f of ['src/lib/desktop-manager.js', 'src/lib/desktop-switch-sheet.js', 'src/lib/mobile-nav.js']) codeLines(read(f)).forEach((line, k) => { for (const w of FRAGS) if (line.includes(w)) whyHits.push(`${f.slice(8)}:${k + 1}: «${w}» in ${line.trim().slice(0, 90)}`); });
  ok(FRAGS.length === 4 && whyHits.length === 0, `no surface keeps a shut door's WHY words of its own — ${FRAGS.map((w) => '«' + w + '»').join(' ')} come from the table (${whyHits.length} hits)`, whyHits);
  ok(/addBtn\.title = this\._doorLabel\('new'\);/.test(dmSrc) && /items\.push\(\{ label: '\+ ' \+ this\._doorLabel\('new'\),/.test(dmSrc) && /addTab\.title = dm\._doorLabel\('new'\);/.test(mn) && /escHtml\(s\.label\)/.test(sh),
    'every «+» says the table\'s \'new\' door: the preview strip\'s (an untranslated literal before), the compact list\'s, the window switcher\'s, the sheet\'s last row');
  ok(/wrapper\.title = this\._doorLabel\('switch', desk\.id\);/.test(dmSrc) && /el\.title = this\._doorLabel\('switch', r\.id, r\.name\);/.test(dmSrc) && /tab\.title = dm\._doorLabel\('switch', desk\.id, desk\.name\);/.test(mn) && /title: s\.title,/.test(sh),
    'every row that switches says the table\'s switch door: the preview tile, a compact-list row, the window switcher\'s tab, a sheet row (a gone one: its why, by the name it showed)');
  ok(!/preview\.title = /.test(dmSrc), 'the preview\'s thumbnail keeps no title of its own — the tile\'s switch door covers it (its inner `desk.name` won the hover over the thumbnail)');
  const w0 = world(D4).self;
  ok(doorLabel.call(w0, 'new') === 'New desktop' && doorLabel.call(w0, 'switch', 'd2') === 'Switch desktop — Desk B' && doorLabel.call(w0, 'nope') === '', '_doorLabel reads the table (run on its own source text)');
  ok(doorLabel.call(w0, 'switch', 'zz', 'Old desk') === '“Old desk” is no longer there', 'r2 ①③: a row whose desktop is gone says the switch door\'s why, by the name it showed', doorLabel.call(w0, 'switch', 'zz', 'Old desk'));
  // the acts: the manager's own handlers, through the done/after guard, on the phone tier as on the desk
  const { self, calls } = world(D4); let afters = 0;
  const items = deskItems.call(self, self._desktops[1], { tier: 'phone', after: () => { afters++; } });
  for (const l of ['Rename…', 'Delete', 'Move up', 'Move down']) await items.find((x) => x.label === l)?.action?.();
  ok(JSON.stringify(calls) === JSON.stringify(['rename d2', 'delete d2', 'reorder d2 before d1', 'reorder d3 before d2']) && afters === 4,
    'each door acts on the manager\'s OWN handler (its dialog, its delete that moves the windows, its reorder that tells the hub) and runs `after` once done', { calls, afters });
  const w2 = world(D4, false); let a2 = 0;
  await deskItems.call(w2.self, w2.self._desktops[1], { tier: 'phone', after: () => { a2++; } }).find((x) => x.label === 'Rename…')?.action?.();
  ok(w2.calls.join() === 'rename d2' && a2 === 0, 'a cancelled Rename… (false) brings nothing back — the guard holds on the phone tier too (the base sheet\'s acts ran outside it)', { calls: w2.calls, a2 });
  // r2 ② THE VERDICT AT THE ACT — a menu is a picture of the list when it opened; another screen changes the list before the
  // press. 8c680dcf: each act ran on what the menu had bound (a gone id, a gone neighbour), returned undefined, and `after`
  // counted it done (the phone's sheet came back unchanged, nothing said)
  {
    const pressAll = async (items) => { const r = []; for (const l of ['Rename…', 'Delete', 'Move up', 'Move down']) r.push(await items.find((x) => x.label === l)?.action?.()); return r; };
    const w3 = world(D4); let a3 = 0; toasts.length = 0;
    const items3 = deskItems.call(w3.self, w3.self._desktops[2], { tier: 'phone', after: () => { a3++; } }); // «Reading» (d3): prev d2, next d4
    w3.self._desktops = w3.self._desktops.filter((d) => d.id !== 'd3'); // deleted on another screen
    const rets = await pressAll(items3);
    ok(w3.calls.length === 0 && a3 === 0 && rets.every((r) => r === false) && toasts.length === 4 && toasts.every((x) => x === '“Reading” is no longer there'),
      'r2 ②: the desktop deleted on another screen between the menu and the press — every act REFUSES: its why said by the name the row showed (a toast), nothing run, `after` never', { calls: w3.calls, afters: a3, rets, toasts: [...toasts] });
    const w4 = world(D4); let a4 = 0;
    const items4 = deskItems.call(w4.self, w4.self._desktops[2], { tier: 'phone', after: () => { a4++; } });
    w4.self._desktops = w4.self._desktops.filter((d) => d.id !== 'd2'); // its neighbour above deleted elsewhere
    await items4.find((x) => x.label === 'Move up')?.action?.();
    ok(JSON.stringify(w4.calls) === JSON.stringify(['reorder d3 before d1']) && a4 === 1, 'r2 ②: …its NEIGHBOUR deleted meanwhile — Move up moves it above the desktop that is above it NOW (never a reorder against a gone id)', { calls: w4.calls, afters: a4 });
    const w5 = world(D4); let a5 = 0; toasts.length = 0;
    const items5 = deskItems.call(w5.self, w5.self._desktops[2], { tier: 'desk', order: true, after: () => { a5++; } });
    w5.self._desktops = w5.self._desktops.filter((d) => d.id !== 'd4'); // now the last
    await items5.find((x) => x.label === 'Move down')?.action?.();
    ok(w5.calls.length === 0 && a5 === 0 && JSON.stringify(toasts) === JSON.stringify(['Already the last desktop']), 'r2 ②: …a door that has SHUT since (it is the last desktop now) says its why, the words its row would show — on the desk tier too', { calls: w5.calls, afters: a5, toasts: [...toasts] });
  }
  // r2 ②④ the Rename door's dialog, on its own source text: its words are the table's (t()), a desktop deleted WHILE it is
  // open is refused by its name — 8c680dcf: three bare English literals, and the typed name went to a gone id in silence
  {
    const runRename = async ({ gone = false, mark = false, elsewhere = null } = {}) => {
      const seen = { dialog: null, renamed: [], toasts: [] };
      const t1 = mark ? (x, p) => '‹' + tr(x, p) + '›' : tr, sink = (m) => { seen.toasts.push(m); };
      const self = { _desktops: D4.map((d) => ({ ...d })), renameDesktop: (id, n) => { seen.renamed.push(id + '=' + n); } };
      self._doorRefused = make(doorRefusedSrc, '_doorRefused() { return false; }', { t: t1, showToast: sink });
      const dlg = async (o) => { seen.dialog = o; if (gone) self._desktops = self._desktops.filter((d) => d.id !== 'd2'); if (elsewhere) self._desktops = self._desktops.map((d) => (d.id === 'd2' ? { ...d, name: elsewhere } : d)); return 'Taxes'; };
      seen.ret = await make(startRenameSrc, 'async _startRename() { return true; }', { t: t1, showToast: sink, showInputDialog: dlg }).call(self, { id: 'd2', name: 'Desk B' });
      return seen;
    };
    const m1 = await runRename({ mark: true });
    const d1 = m1.dialog || {};
    ok(m1.ret === true && JSON.stringify(m1.renamed) === JSON.stringify(['d2=Taxes']) && d1.title === '‹Rename Desktop›' && d1.label === '‹Desktop name›' && d1.confirmText === '‹Rename›' && d1.value === 'Desk B',
      'r2 ④: the Rename dialog\'s title / label / confirm go through t() — the table\'s words (zh + ja); the name typed lands', { ret: m1.ret, renamed: m1.renamed, dialog: d1 });
    const g1 = await runRename({ gone: true });
    ok(g1.ret === false && g1.renamed.length === 0 && JSON.stringify(g1.toasts) === JSON.stringify(['“Desk B” is no longer there']),
      'r2 ②: the desktop deleted on another screen WHILE the Rename dialog was open — the typed name is refused by the desktop\'s name (a toast), never dropped in silence; nothing comes back (false)', g1);
    // r3 ⑤ — renamed on ANOTHER screen while the dialog was open (25151f0b: the typed name overwrote it in silence)
    const e1 = await runRename({ elsewhere: 'Desk B2' });
    ok(e1.ret === true && JSON.stringify(e1.renamed) === JSON.stringify(['d2=Taxes']) && JSON.stringify(e1.toasts) === JSON.stringify(['“Desk B” was renamed to “Desk B2” on another screen meanwhile — your name “Taxes” replaces it']) && m1.toasts.length === 0,
      'r3 ⑤: renamed on ANOTHER screen while the Rename dialog was open — the typed name lands (the person\'s last act) and the name it replaces is SAID, never overwritten in silence; no rename elsewhere, nothing said', e1);
    const e2 = await runRename({ elsewhere: 'Taxes' });
    ok(e2.ret === true && JSON.stringify(e2.renamed) === JSON.stringify(['d2=Taxes']) && e2.toasts.length === 0, 'r3 ⑤: …renamed there to the very name typed here: nothing to say', e2);
  }
  { // RED CONTROL — the base's sheet long press, its own hand-written list (2.369.358: the phone's only doors)
    const BASE_SHEET = "const verbs = [{ label: t('Rename'), action: () => dm._startRename(desk) }];\n      if (dm.desktops.length > 1) verbs.push({ label: t('Delete'), style: 'color:var(--red, #e55)', action: async () => { await dm.deleteDesktop(desk.id); onSwitch(dm.activeDesktopId); } });\n      return verbs;";
    const base = new Function('t', 'dm', 'desk', 'onSwitch', BASE_SHEET); // eslint-disable-line no-new-func
    const bad = walk((s, desk) => base(tr, { ...s, desktops: s._desktops, activeDesktopId: 'd1' }, desk, () => {}), 'phone', false);
    ok(bad.length === CASES.length && bad.every((b) => /move-up: not drawn/.test(b) && /move-down: not drawn/.test(b) && /rename: not drawn \(want «Rename…»\)/.test(b)),
      'RED CONTROL: the base\'s sheet (Rename · Delete, hand-written) fails the census on every desktop — no Move up / Move down (a phone could not reorder), «Rename» for 「Rename…」', bad);
  }
}

console.log('⑩ followDesktops — an OPEN list follows a remote change (r2 ①)');
{
  const fd = typeof M.followDesktops === 'function' ? M.followDesktops : () => [];
  const drawn = [{ id: 'd1', name: 'Desktop 1' }, { id: 'd2', name: 'Desk B' }, { id: 'd3', name: 'Reading' }];
  const now = [{ id: 'd3', name: 'Reading list' }, { id: 'd1', name: 'Desktop 1' }, { id: 'd5', name: 'Taxes' }];
  const f1 = fd({ drawn, desktops: now });
  ok(JSON.stringify(f1) === JSON.stringify([{ id: 'd3', name: 'Reading list', gone: false }, { id: 'd2', name: 'Desk B', gone: true }, { id: 'd1', name: 'Desktop 1', gone: false }, { id: 'd5', name: 'Taxes', gone: false }]),
    'the live order and names, a desktop added elsewhere drawn, one deleted elsewhere KEPT AT ITS PLACE, gone — by the name it showed', f1);
  const f2 = fd({ drawn: f1, desktops: now.slice(0, 2) });
  ok(JSON.stringify(f2.map((x) => x.id + (x.gone ? '!' : ''))) === JSON.stringify(['d3', 'd2!', 'd1', 'd5!']), 'a second change keeps every gone row at its place (no row ever moves out from under a finger by a deletion)', f2);
  ok(JSON.stringify(fd({ desktops: D4 })) === JSON.stringify(D4.map((d) => ({ ...d, gone: false }))) && fd({}).length === 0 && fd({ drawn: [null, 7, { name: 'x' }], desktops: [null, { id: 'a' }] }).length === 1,
    'no drawn list (an open the person asked for) = the live list; junk in, nothing thrown');
  const dmSrc = read('src/lib/desktop-manager.js'), sh = read('src/lib/desktop-switch-sheet.js'), mn = read('src/lib/mobile-nav.js');
  const follow = (dmSrc.match(/\n  _followOpenLists\(before\) \{\n[\s\S]*?\n  \}\n/) || [''])[0];
  ok((dmSrc.match(/this\._renderSwitcher\(\);\n\s*this\._followOpenLists\(before\);/g) || []).length === 2 && (dmSrc.match(/const before = JSON\.stringify\(this\._desktops\.map\(\(d\) => \[d\.id, d\.name\]\)\);/g) || []).length === 2,
    'the manager redraws the open lists on BOTH roads a remote list arrives by (desktop-updated, the layout-sync meta) — after its own switcher');
  ok(/if \(list\?\._follow && btn\) list\._follow\(\);/.test(follow) && /window\.dispatchEvent\(new CustomEvent\('vs-desktops'\)\);/.test(follow) && /menu\._deskRows = rows\.filter\(/.test(dmSrc) && /const now = this\._desktopListRows\(menu\._deskRows\)/.test(dmSrc) && /el\.classList\.toggle\('dsc-gone', !!r\.gone\);/.test(dmSrc),
    'the compact list follows from the rows it shows (a gone row greyed) — patched in place, so a sprung one is still THE DRAG\'s list (r3 ②); the phone\'s two are told (vs-desktops)');
  ok(/window\.addEventListener\('vs-desktops', \(\) => \{/.test(sh) && /openDesktopSheet\(app, anchor, \{ onSwitch, drawn: rows \}\)/.test(sh) && /\}, \{ signal: ctl\.signal \}\);\n  return menu;/.test(sh) && /el\.classList\.toggle\('mdesk-gone', !!r\.gone\);/.test(sh) && /const desk = dm\.desktops\.find\(\(d\) => d\.id === r\.id\) \|\| \{ id: r\.id, name: r\.name \};/.test(sh) && !/if \(!desk\) return;/.test(sh),
    'the sheet follows while open (its own AbortController), a gone row greyed with its why; its long press asks the doors BY THE NAME the row showed — never a press that opens nothing');
  ok(/tabsDrawn = followDesktops\(\{ drawn: follow \? tabsDrawn : \[\], desktops: dm\.desktops \}\);/.test(mn) && /window\.addEventListener\('vs-desktops', \(\) => renderContent\(true\), \{ signal: ctl\.signal \}\);/.test(mn) && !/const desktops = dm\?\.desktops \|\| \[\];/.test(mn),
    'the window switcher\'s tabs read the list as it is at every render (it read it once, at open) and follow a remote change while open');
  { // RED CONTROL — an open list that is never told: the compact list keeps the row of a desktop deleted elsewhere as a live row
    const live = [{ id: 'd1', name: 'Desktop 1' }, { id: 'd3', name: 'Reading' }];
    const stale = drawn.map((d) => ({ ...d, gone: false })); // what 8c680dcf's open list kept showing
    const red = stale.find((x) => x.id === 'd2'), green = fd({ drawn, desktops: live }).find((x) => x.id === 'd2');
    ok(red && !red.gone && green && green.gone, 'RED CONTROL: a list that is not redrawn keeps «Desk B» as a LIVE row (its doors open on a gone desktop); the followed one marks it gone', { red, green });
  }
}

console.log('⑪ ROUND 3 — a list\'s listeners live while it is in the page; the compact list patched in place; ONE sayer of every switch refusal; the INDEX line');
{
  const sh = read('src/lib/desktop-switch-sheet.js'), mn = read('src/lib/mobile-nav.js'), dmSrc = read('src/lib/desktop-manager.js');
  // untilGone on its own source text — a fake observer, a fake list: aborted the moment the list leaves the page (by any
  // road — here a bare remove, the kind the phone's Back and a class change do), the observer disconnected with it
  const ug = (sh.match(/\nexport function untilGone\(el, ctl\) \{\n[\s\S]*?\n\}\n/) || [''])[0];
  ok(!!ug, 'r3 ①: the sheet module exports untilGone — THE abort-when-gone of a list\'s listeners (found in src/lib/desktop-switch-sheet.js)');
  if (ug) {
    const seen = { observed: null, disconnected: 0 }; let cb = () => {};
    class FakeMO { constructor(f) { cb = f; } observe(n, o) { seen.observed = { n, o }; } disconnect() { seen.disconnected++; } }
    const untilGone = new Function('MutationObserver', `return ${ug.trim().replace(/^export /, '')}`)(FakeMO); // eslint-disable-line no-new-func — its own text
    const body = { tag: 'body' }, el = { isConnected: true, parentNode: body }, ctl = new AbortController();
    const sig = untilGone(el, ctl);
    cb(); const keptWhileIn = !ctl.signal.aborted; // a change elsewhere in the page: the list still in it
    el.isConnected = false; cb(); // the list taken out — by whatever road
    ok(sig === ctl.signal && keptWhileIn && ctl.signal.aborted && seen.disconnected === 1 && seen.observed?.n === body && seen.observed.o.childList === true,
      'r3 ①: untilGone (its own text): a list\'s listeners live while it is in the page and are aborted the moment it leaves — by ANY road; the observer goes with them', { keptWhileIn, aborted: ctl.signal.aborted, seen: { disconnected: seen.disconnected, childList: seen.observed?.o?.childList } });
    const c2 = new AbortController(); untilGone({ isConnected: false }, c2);
    ok(c2.signal.aborted, 'r3 ①: …a list already out of the page: aborted at once (nothing hangs on it)');
  }
  // the window switcher: ONE close (abort + remove) — its toggle, an outside tap, both row taps call it; its two listeners
  // (the remote-change redraw, the outside-press watch) on its signal; a road that only removes it aborts them (untilGone)
  const sw = (mn.match(/\n  _showWindowSwitcher\(anchor = this\._titleEl\) \{\n[\s\S]*?\n  \}\n/) || [''])[0], item = (mn.match(/\n  _buildWindowItem\([^)]*\) \{\n[\s\S]*?\n  \}\n/) || [''])[0];
  const lifeCensus = (s, it) => {
    const bad = [];
    if (!/const close = \(\) => \{ ctl\.abort\(\); pop\.remove\(\); \};/.test(s)) bad.push('no ONE close (abort + remove)');
    if (!/if \(existing\) \{ existing\._close\(\); return; \}/.test(s)) bad.push('the title toggle removes the list without its close');
    if (!/untilGone\(pop, ctl\);/.test(s)) bad.push('a road that only removes the node (Back, a class change) leaves the listeners');
    if (!/window\.addEventListener\('vs-desktops', [^\n]*\{ signal: ctl\.signal \}\);/.test(s)) bad.push('the vs-desktops listener is not on the list\'s signal');
    if (!/onOutsidePress\(pop, close, \{[^\n]*signal: ctl\.signal \}\);/.test(s)) bad.push('an outside tap does not call the close (its watch outlives the list)');
    const removes = (s.match(/\bpop\.remove\(\)/g) || []).length + (it.match(/\bpop\.remove\(\)/g) || []).length;
    if (removes !== 1) bad.push(`${removes} bare pop.remove() — the close must be the only one`);
    if (!/item\.onclick = \(\) => \{ close\(\); wm\.revealWindow\(win\.id\); \};/.test(it) || !/item\.onclick = \(\) => \{ close\(\); wm\.revealWindow\(win\.id\); \};/.test(s)) bad.push('a row tap does not call the close');
    return bad;
  };
  const swBad = lifeCensus(sw, item);
  ok(!!sw && !!item && swBad.length === 0, 'r3 ①: the window switcher has ONE close — its title toggle, an outside tap and both row taps call it; its vs-desktops listener and outside-press watch hang on its signal; a road that only removes it aborts them too', swBad);
  ok(/const menu = showContextMenu\(regular \? ar\.left : 0, regular \? ar\.top : 0, items\);\n  menu\.classList\.add\('mdesk-menu'\);\n  untilGone\(menu, ctl\);/.test(sh) && /\}, \{ signal: ctl\.signal \}\);\n  return menu;/.test(sh) && /\}, \{ signal: ctl\.signal \}\);\n  \}\);/.test(sh),
    'r3 ①: the sheet\'s listeners (its rows\' long press, its vs-desktops) hang on its controller, aborted on EVERY road that takes it out (an outside press, Esc, a row\'s tap, the doors\' menu, the next open — 25151f0b: only the next open)');
  { // RED CONTROL — 25151f0b's switcher: a self-removing listener with no controller, three bare removes
    const I2 = item.replace('item.onclick = () => { close(); wm.revealWindow(win.id); };', 'item.onclick = () => { pop.remove(); wm.revealWindow(win.id); };');
    const S2 = sw.replace(/    const ctl = new AbortController\(\);\n    const close = [^\n]*\n    pop\._close = close;\n/, '').replace('if (existing) { existing._close(); return; }', 'if (existing) { existing.remove(); return; }').replace('    untilGone(pop, ctl);\n', '')
      .replace("window.addEventListener('vs-desktops', () => renderContent(true), { signal: ctl.signal });", "const follow = () => { if (!pop.isConnected) { window.removeEventListener('vs-desktops', follow); return; } renderContent(true); };\n    window.addEventListener('vs-desktops', follow);")
      .replace(/onOutsidePress\(pop, close, \{([^\n]*), signal: ctl\.signal \}\);/, 'onOutsidePress(pop, () => pop.remove(), {$1 });').replace('item.onclick = () => { close(); wm.revealWindow(win.id); };', 'item.onclick = () => { pop.remove(); wm.revealWindow(win.id); };');
    const red = lifeCensus(S2, I2);
    ok(S2 !== sw && red.length === 7, `RED CONTROL: 25151f0b's switcher fails the census (${red.length}: ${red.join(' · ')})`, red);
  }
  // r3 ②: the compact list follows IN PLACE — _followOpenLists never rebuilds it; its _follow patches rows keyed by their desktop id
  const follow = (dmSrc.match(/\n  _followOpenLists\(before\) \{\n[\s\S]*?\n  \}\n/) || [''])[0], open = (dmSrc.match(/\n  _openDesktopList\(anchor\) \{\n[\s\S]*?\n  \}\n/) || [''])[0];
  ok(/if \(list\?\._follow && btn\) list\._follow\(\);/.test(follow) && !/_openDesktopList\(/.test(follow) && /menu\._follow = \(\) => \{/.test(open) && /menu\.querySelectorAll\(':scope > \[data-desktop-id\]'\)/.test(open) && /if \(el !== at\) menu\.insertBefore\(el, at\);/.test(open) && /this\._paintListRow\(el, row\);/.test(open) && /this\._deskItems\(el\._desk, /.test(dmSrc) && /this\.dropOnRow\(winId, el\._desk\.id, el\._desk\.name\);/.test(dmSrc),
    'r3 ②: a remote change PATCHES the open compact list — keyed by data-desktop-id: each row re-worded, a new row added at its place, a moved one moved alone; its doors and its drop read the row as it shows now — never rebuilt (25151f0b: a new popover, the node under the pointer gone)');
  // r3 ④: ONE sayer of every switch refusal — the table's why through _doorRefused (a drop: its why + where the window stays)
  ok(/if \(this\._doorRefused\(shown, 'switch'\)\) return;/.test(open) && /if \(v\.act === 'refused'\) return void dm\._doorRefused\(\{ id: r\.id, name: v\.name \}, 'switch'\);/.test(sh) && /tab\.onclick = desk\.gone \? \(\) => dm\._doorRefused\(desk, 'switch'\)/.test(mn) && /showToast\(t\('\{why\} — the window stays where it is', \{ why: this\._doorLabel\('switch', deskId, name\) \}\)/.test(dmSrc),
    'r3 ④: every switch refusal says THE table\'s why — a compact row, a sheet row, a tab (through _doorRefused), a drop on a gone row (its why + where the window stays)');
  // r3 ③: the kb-bugfix INDEX carries round 2's law (an essay bullet alone is not the index)
  const kb = read('docs/kb-bugfix-invariants.md'), idx = (kb.split(/^## INDEX\b.*$/m)[1] || '').split(/^## /m)[0];
  const law = idx.split('\n').filter((l) => /a door is judged when it is pressed, and a list that is open says what changed under it/.test(l));
  ok(law.length === 1 && /^- \(2026-10-26\) /.test(law[0]) && law[0].length <= 300, 'r3 ③: the kb-bugfix INDEX head has ONE line (dated 2026-10-26, ≤ 300 chars) for round 2\'s law «a door is judged when it is pressed, and a list that is open says what changed under it»', law);
}

console.log('⑫ ROUND 4 — ONE placement door: the compact list placed by PURE menuPlace at its open and after every patch');
{
  const dmSrc = read('src/lib/desktop-manager.js');
  const open = (dmSrc.match(/\n  _openDesktopList\(anchor\) \{\n[\s\S]*?\n  \}\n/) || [''])[0], place = (dmSrc.match(/\n  _placeList\(menu, stood = menu\.getBoundingClientRect\(\)\) \{\n[\s\S]*?\n  \}\n/) || [''])[0];
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
  const placeCensus = (o, p, whole) => {
    const bad = [], fol = (o.match(/\n    menu\._follow = \(\) => \{\n[\s\S]*?\n    \};\n/) || [''])[0];
    if (!/const at = menuPlace\(\{ x: b\.left, y: stood\.top, w: b\.width, h, vw: window\.innerWidth, vh: window\.innerHeight, keep: stood\.height[,} ]/.test(p)) bad.push('no _placeList asking menuPlace over the list\'s own box (keep)');
    if (!/menu\.style\.maxHeight = at\.maxH == null \? '' : \(at\.maxH \/ Z\) \+ 'px'; menu\.style\.overflowY = at\.maxH == null \? '' : 'auto';/.test(p) || !/menu\.style\.maxWidth = at\.maxW == null \? '' : \(at\.maxW \/ Z\) \+ 'px';/.test(p)) bad.push('the verdict\'s caps (maxH + overflow-y, maxW) not written');
    if (!/rows\.forEach\(\(row, k\) => \{ if \(els\[k\]\) this\._paintListRow\(els\[k\], row\); \}\);\n    this\._placeList\(menu\);/.test(o)) bad.push('the open not placed once its words are painted');
    if (!/const stood = menu\.getBoundingClientRect\(\);/.test(fol) || !/\n      this\._placeList\(menu, stood\);[^\n]*\n    \};\n$/.test(fol)) bad.push('a patch not placed again, last, with the box as it stood');
    if (/\.style\.(top|left|maxHeight|maxWidth)\s*=/.test(code(fol))) bad.push('the patch writes the box by hand');
    const calls = (code(whole).match(/\bmenuPlace\(/g) || []).length;
    if (calls !== 1) bad.push(`${calls} menuPlace calls in desktop-manager.js — ONE door (_placeList)`);
    return bad;
  };
  const bad = placeCensus(open, place, dmSrc);
  ok(!!open && !!place && bad.length === 0, 'r4: ONE placement door — _placeList asks PURE menuPlace over the list\'s own box (its top kept, capped at the foot and scrolling, never wider than the viewport) at the open once its words are painted and after every patch; the patch writes no box by hand', bad);
  { // RED CONTROL — daf19adf's list: the open placed by showContextMenu alone (its rows' words unwritten), the patch lifting it by hand
    const O2 = open.replace('    this._placeList(menu); // its words painted', '    // its words painted').replace(/      const stood = menu\.getBoundingClientRect\(\);[^\n]*\n/, '')
      .replace(/      this\._placeList\(menu, stood\);[^\n]*\n/, "      const b = menu.getBoundingClientRect(), Z = uiScale();\n      if (b.bottom > window.innerHeight - 4) menu.style.top = (parseFloat(menu.style.top) - (b.bottom - (window.innerHeight - 4)) / Z) + 'px';\n      if (b.right > window.innerWidth - 4) menu.style.left = Math.max(4 / Z, parseFloat(menu.style.left) - (b.right - (window.innerWidth - 4)) / Z) + 'px';\n");
    const red = placeCensus(O2, '', dmSrc.replace(place, '\n').replace(open, O2));
    ok(O2 !== open && red.length === 6, `RED CONTROL: daf19adf's list fails the census (${red.length}: ${red.join(' · ')})`, red);
  }
}

console.log('⑬ ROUND 5 — a scrolled list keeps its offset: its cap lifts only as far as its rows stay');
{
  const dmSrc = read('src/lib/desktop-manager.js');
  const place = (dmSrc.match(/\n  _placeList\(menu, stood = menu\.getBoundingClientRect\(\)\) \{\n[\s\S]*?\n  \}\n/) || [''])[0];
  const offsetCensus = (p) => {
    const bad = [];
    if (!/^    const Z = uiScale\(\), s = menu\.scrollTop;/.test(p.split('\n')[2] || '')) bad.push('the offset not read first (before a style is written)');
    if (!/, keep: stood\.height, scrolled: s \* k \}\);/.test(p)) bad.push('menuPlace not told the offset (scrolled)');
    if (!/\n    if \(at\.scroll != null\) menu\.scrollTop = at\.scroll \/ k;[^\n]*\n  \}\n$/.test(p)) bad.push('the verdict\'s offset not written back, last');
    return bad;
  };
  const bad = offsetCensus(place);
  ok(!!place && bad.length === 0, 'r5: _placeList reads the list\'s offset before a style is written, asks menuPlace with it and writes the verdict\'s offset back, last — a scrolled list\'s cap lifts only as far as its rows stay where they stood', bad);
  { // RED CONTROL — 5a98bf0f's _placeList: the offset neither read, nor asked for, nor written back
    const P2 = place.replace(/    const Z = uiScale\(\), s = menu\.scrollTop;[^\n]*\n/, '    const Z = uiScale();\n').replace(', keep: stood.height, scrolled: s * k });', ', keep: stood.height });').replace(/    if \(at\.scroll != null\) menu\.scrollTop = at\.scroll \/ k;[^\n]*\n/, '');
    const red = offsetCensus(P2);
    ok(P2 !== place && red.length === 3, `RED CONTROL: 5a98bf0f's _placeList fails the census (${red.length}: ${red.join(' · ')})`, red);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
