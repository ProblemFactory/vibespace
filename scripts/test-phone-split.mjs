#!/usr/bin/env node
// THE PHONE'S SIDE BY SIDE (lane phone-six, 2026-10-26 — userW's wish, the owner's framing 「不是窗口，只能支持左右分屏」) and
// THE TURN (the same lane's item 4 — 「每次旋转完屏幕之后都会把侧边栏默认打开」). Fast, in-process: PURE src/phone-split.js +
// a source census of its client (src/lib/phone-split-view.js) and of the roads that use it.
//   ① THE RULE OF WHEN — splitVerdict: two panes stand side by side only where each keeps MIN_PANE (350 px, MEASURED:
//     a chat's 16 px composer from 290 px, a terminal's 40 columns at the phone's 14 px font from 350 px — the lane report's
//     table) + the 8 px divider: 708 px of room. A landscape phone (844 − the 56 px bar) splits; a portrait phone says
//     «Rotate to split» (the same screen turned clears it), a narrow one «Too narrow to split»; a portrait tablet splits
//   ② THE PAIR — pairFor: «Split» beside a window puts it beside the window on show (fresh: shown left, it right; in a
//     split the shown pane keeps its side, the other is replaced); a window of the shown frame (itself, a tab of its group)
//     is no second pane
//   ③ COLLAPSE / RESTORE — splitLayout: a room under the bound shows the pane on show alone and KEEPS the pair; the room
//     back restores it; a window outside the pair on show ends it; a pane's window gone ends it; closePane hands the other
//   ④ THE TURN — turnOf tells a rotation (the same screen: its area kept, swapped or not) from a fold (another screen);
//     listOnTurn keeps the person's list on a rotation inside the phone tier, and leaves a fold / a tier change to the class
//   ⑤ RED CONTROLS (patched copies of the module): a bound without the divider, a turn by the orientation alone (the Duo's
//     fold reads as a rotation), a collapse that drops the pair, a carry on a fold
//   ⑥ wiring pins — the client keeps the pair in sessionStorage only (this tab's: never localStorage, never the layout
//     record), MobileNav installs it and applies it on every title update, the switcher row's door keeps its words when it
//     refuses (and says them on a press), viewport-switch carries the list on a rotation, the window manager draws a split's
//     other pane (no hidden-tab suspension), the pane's ✕ is no drag handle, the stylesheet's block is a phone's, the doors
//     census has the split's row, i18n zh / ja
//   ⑦ ROUND 2 (the acceptance of 6f4f858c): PURE src/phone-head.js — headName (a path-shaped name is its last segment), the
//     8 em the name keeps, the yield ladder; RED controls (the round-1 whole-path name, the 3.5 em floor); pins: the room
//     the panes may use is the window area now (the list column shown collapses the split), no dead pair (a minimized
//     window restored before the pair is kept, a pane's window minimized / closed / moved drops it, said), one tap = one act
//     on a pane's head, the head and the window's own head name with headName, the stylesheet's ladder, i18n
//   ⑨ THE SWITCHER ROW YIELDS (主开发 2026-11-17, ruling B on the row): ROW_YIELD_LADDER / rowParts (PURE) with RED controls (the
//     chip before the Split door; no compact step), fitSwitcherRow over the real layout (the ⋯ and the ✕ never yield), the
//     yielded rows in the window menu (a refused Split OFF with its why; the billing row), the registry's row, i18n
// Run: node scripts/test-phone-split.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SRC = path.join(REPO, 'src/phone-split.js');
const S = require(SRC);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error(`ok: the condition goes FIRST, the name second (got a ${typeof n} for the name)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const HEAD_SRC = path.join(REPO, 'src/phone-head.js');
/** A patched copy of a module (a RED control; src/phone-split.js unless named): `from` must occur exactly once. */
const mutant = (from, to, file = SRC) => {
  const src = fs.readFileSync(file, 'utf8');
  if (src.split(from).length !== 2) throw new Error('mutant anchor not unique: ' + from.slice(0, 70));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-phone-split-'));
  const f = path.join(dir, path.basename(file));
  fs.writeFileSync(f, src.replace(from, to));
  try { return require(f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

console.log('① the rule of when — 2 × MIN_PANE + the divider');
ok(S.MIN_PANE === 350 && S.SPLIT_DIVIDER === 8 && S.splitBound() === 708, 'MIN_PANE 350 (measured: the terminal\'s 40 columns at 14 px; a chat needs 290) + an 8 px divider = 708 px of room', { MIN_PANE: S.MIN_PANE, d: S.SPLIT_DIVIDER, bound: S.splitBound() });
const V = (room, turnedRoom = null) => S.splitVerdict({ room, turnedRoom });
ok(V(708).ok && !V(707).ok, 'the edge: 708 px splits, 707 does not', [V(708), V(707)]);
ok(V(844 - 56).ok && V(951 - 56).ok, 'a landscape phone (844 − the 56 px bar = 788) and the Duo\'s inner landscape (895) split');
ok(V(390, 844 - 56).why === 'rotate' && V(390, 844 - 56).words === 'Rotate to split' && V(669, 867 - 56).why === 'rotate', 'a portrait phone (390) and the Duo\'s inner portrait (669) say «Rotate to split» — the same screen turned clears the bound', [V(390, 788), V(669, 811)]);
ok(V(320, 568 - 56).why === 'narrow' && V(320, 568 - 56).words === 'Too narrow to split' && V(390, null).why === 'narrow', 'a phone too small even turned (568 − 56 = 512) — and an unknown turn — say «Too narrow to split»', V(320, 512));
ok(V(820).ok && V(768).ok, 'a portrait tablet whose width clears it (820, 768) splits — the rule reads the room, never «portrait»');
ok(Object.values(S.SPLIT_WORDS).every((w) => typeof w === 'string' && w) && !V(390, 788).ok && !!V(390, 788).words, 'a refusal keeps its words and its reason (the door is never greyed out of its words)');

console.log('② the pair — «Split» beside a window puts it beside the window on show');
const frames = { a: 'a', b: 'b', c: 'c', g1: 'g', g2: 'g', g: 'g' };
const frameOf = (id) => frames[id] || null;
ok(JSON.stringify(S.pairFor({ shown: 'a', pick: 'b', frameOf })) === '["a","b"]', 'fresh: the window on show left, the picked one right');
ok(S.pairFor({ shown: 'a', pick: 'a', frameOf }) === null && S.pairFor({ shown: 'g1', pick: 'g2', frameOf }) === null, 'the window on show itself, or a tab of its own group, is no second pane (one frame)');
ok(JSON.stringify(S.pairFor({ shown: 'g2', pick: 'b', frameOf })) === '["g","b"]', 'a tab group pairs as its frame (the host)');
ok(JSON.stringify(S.pairFor({ shown: 'b', pick: 'c', pair: ['a', 'b'], frameOf })) === '["c","b"]' && JSON.stringify(S.pairFor({ shown: 'a', pick: 'c', pair: ['a', 'b'], frameOf })) === '["a","c"]', 'in a split the pane on show keeps its side, the picked window replaces the other');
ok(S.pairFor({ shown: null, pick: 'b', frameOf }) === null && S.pairFor({ shown: 'a', pick: 'zz', frameOf }) === null, 'no window on show / an unknown window ⇒ no pair');

console.log('③ collapse / restore');
const L = (o) => S.splitLayout({ pair: ['a', 'b'], shown: 'a', alive: ['a', 'b', 'c'], room: 788, ...o });
ok(L({}).mode === 'split' && JSON.stringify(L({}).pair) === '["a","b"]' && L({}).focus === 'a' && L({ shown: 'b' }).focus === 'b', 'room, both alive, a pane on show ⇒ the split, focused on the pane on show');
const narrow = L({ room: 390 });
ok(narrow.mode === 'single' && narrow.keep === true && narrow.why === 'room', 'a room under the bound (turned to portrait, the list column shown) ⇒ one pane, the pair KEPT', narrow);
ok(L({ room: 788 }).mode === 'split', '…and the room back restores it');
ok(L({ shown: 'c' }).keep === false && L({ shown: 'c' }).why === 'other', 'a window outside the pair on show ⇒ the split is over');
ok(L({ alive: ['a', 'c'] }).keep === false && L({ alive: ['a', 'c'] }).why === 'gone', 'a pane\'s window gone ⇒ the split is over');
ok(S.splitLayout({ pair: null, shown: 'a', alive: ['a'], room: 900 }).why === 'none' && S.splitLayout({ pair: ['a', 'a'], shown: 'a', alive: ['a'], room: 900 }).why === 'none', 'no pair (or a degenerate one) ⇒ one window');
ok(S.closePane(['a', 'b'], 'a') === 'b' && S.closePane(['a', 'b'], 'b') === 'a' && S.closePane(['a', 'b'], 'z') === null && S.closePane(null, 'a') === null, 'a pane\'s ✕ hands the screen to the other pane');

console.log('④ the turn — a rotation keeps the list, a fold is a fresh load\'s');
const v = (w, h, sw = w, sh = h) => ({ w, h, sw, sh });
ok(S.turnOf(v(390, 844), v(844, 390)) === 'rotation', 'Android / Chrome: the screen swaps with the viewport (390×844 → 844×390) ⇒ a rotation');
ok(S.turnOf(v(390, 664, 390, 844), v(844, 340, 390, 844)) === 'rotation', 'iOS: screen.width / height never swap (390×844 on both sides), Safari\'s bars change the heights ⇒ a rotation');
ok(S.turnOf(v(382, 580), v(951, 585)) === 'fold' && S.turnOf(v(669, 867), v(951, 585)) === 'fold', 'the Duo\'s cover → its inner display, inner portrait → inner landscape as test-duo-layout emulates them (another screen) ⇒ a fold');
ok(S.turnOf(v(390, 844), v(390, 500)) === 'none' && S.turnOf(v(844, 390), v(951, 585)) === 'none' && S.turnOf(null, v(1, 2)) === 'none', 'the orientation held (a keyboard, a fold within landscape) ⇒ none');
ok(S.listOnTurn({ turn: 'rotation', prevPhone: true, nextPhone: true, wasShown: false }) === false && S.listOnTurn({ turn: 'rotation', prevPhone: true, nextPhone: true, wasShown: true }) === true, 'a rotation inside the phone tier keeps the list: closed stays closed, open stays open');
ok([['fold', true, true], ['none', true, true], ['rotation', false, true], ['rotation', true, false]].every(([turn, prevPhone, nextPhone]) => S.listOnTurn({ turn, prevPhone, nextPhone, wasShown: false }) === null) && S.listOnTurn({ turn: 'rotation', prevPhone: true, nextPhone: true }) === null,
  'a fold, no turn, a tier change (phone ↔ not), an unknown list ⇒ null: the class\'s own rule (a fresh load\'s)');

console.log('⑤ RED CONTROLS (patched copies of src/phone-split.js)');
{
  const m = mutant('const splitBound = (minPane = MIN_PANE, divider = SPLIT_DIVIDER) => 2 * minPane + divider;', 'const splitBound = (minPane = MIN_PANE, divider = SPLIT_DIVIDER) => 2 * minPane;');
  ok(m.splitVerdict({ room: 702 }).ok === true && S.splitVerdict({ room: 702 }).ok === false, 'RED CONTROL: a bound without the divider lets 702 px split (two 347 px panes — under MIN_PANE); the module refuses it');
}
{
  const m = mutant("  if (!a || !b) return 'fold';\n  return Math.abs(a - b) <= 0.02 * Math.max(a, b) ? 'rotation' : 'fold';", "  return 'rotation';");
  ok(m.turnOf(v(382, 580), v(951, 585)) === 'rotation' && S.turnOf(v(382, 580), v(951, 585)) === 'fold', 'RED CONTROL: a turn read from the orientation alone calls the Duo\'s fold a rotation (its list would follow the cover\'s drawer); the module calls it a fold');
}
{
  const m = mutant("return { mode: 'single', keep: true, why: 'room' };", "return { mode: 'single', keep: false, why: 'room' };");
  ok(m.splitLayout({ pair: ['a', 'b'], shown: 'a', alive: ['a', 'b'], room: 390 }).keep === false && L({ room: 390 }).keep === true, 'RED CONTROL: a collapse that drops the pair cannot restore after the turn back; the module keeps it');
}
{
  const m = mutant("if (turn !== 'rotation' || !prevPhone", "if (!prevPhone");
  ok(m.listOnTurn({ turn: 'fold', prevPhone: true, nextPhone: true, wasShown: true }) === true && S.listOnTurn({ turn: 'fold', prevPhone: true, nextPhone: true, wasShown: true }) === null, 'RED CONTROL: a carry on a fold would open the Duo\'s cover drawer over the conversation after an unfold-fold; the module leaves a fold to the class');
}

console.log('⑥ wiring pins');
{
  const sv = read('src/lib/phone-split-view.js'), mn = read('src/lib/mobile-nav.js'), vs = read('src/lib/viewport-switch.js'), w = read('src/lib/window.js'), css = read('public/style.css');
  ok(/import \{ splitVerdict, splitLayout, pairFor, closePane \} from '\.\.\/phone-split\.js';/.test(sv) && /const SPLIT_KEY = 'vibespace\.phoneSplit';/.test(sv) && /sessionStorage\.setItem\(SPLIT_KEY, JSON\.stringify\(pairs\)\)/.test(sv) && !/localStorage|layoutManager|scheduleAutoSave|captureState|gridBounds/.test(sv),
    'the client: the PURE verdicts; the pair in sessionStorage under vibespace.phoneSplit — never localStorage, never the layout record, never a geometry (a LAYOUT of two phone windows, not the window manager)');
  ok(/import \{ installPhoneSplit \} from '\.\/phone-split-view\.js';/.test(mn) && /\n    this\.split = installPhoneSplit\(app\);/.test(mn) && /\n    this\.updateDesktopsDoor\(\);\n    this\.split\?\.apply\(\);/.test(mn), 'MobileNav installs it and applies it on every title update (every window change, a desktop change, a class switch)');
  ok(/const sv = this\.split\?\.offer\(win\.id\);/.test(mn) && /splitBtn\.textContent = t\(sv\.words\);/.test(mn) && /if \(!sv\.ok\) \{ showToast\(t\(sv\.words\)\); return; \}/.test(mn) && /this\.split\.open\(win\.id\);/.test(mn),
    'the switcher row\'s door: «Split», or its refusal\'s words on the button and again in a toast on a press (never greyed)');
  ok(/if \(!v\.ok\) \{ showToast\(t\(v\.words\)\); return false; \}/.test(sv) && /new ResizeObserver\(\(\) => apply\(\)\)\.observe\(document\.getElementById\('workspace'\)\)/.test(sv), 'open() refuses by name; a resize of the window area (a turn, the list column) re-applies the rule');
  ok(/import \{ turnOf, listOnTurn \} from '\.\.\/phone-split\.js';/.test(vs) && /const keep = listOnTurn\(\{ turn, prevPhone: isPhoneClass\(prevVc\), nextPhone: isPhoneClass\(app\._vc\), wasShown \}\);/.test(vs) && /if \(keep !== null\) setListShown\(app, keep\);\n    else if \(portrait !== null && p !== portrait\) app\.sidebar\?\.restoreListHidden\?\.\(\);/.test(vs),
    'viewport-switch: the list read BEFORE the switch, carried on a rotation; a fold keeps the orientation\'s own start (SPEC-v3 §4 / §7)');
  ok(/active: !!\(top\.element\?\.classList\?\.contains\('window-active'\) \|\| top\.element\?\.classList\?\.contains\('phone-pane'\)\)/.test(w) && /e\.target\.closest\('\.phone-pane-close'\)\)\);/.test(w), 'window.js: a split\'s other pane is drawn (no hidden-tab suspension of its view); its ✕ is no drag handle (the title bar would capture the press)');
  const blk = css.slice(css.indexOf('SIDE BY SIDE ON A PHONE'));
  ok(css.includes('SIDE BY SIDE ON A PHONE') && /@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{\n  html\.vs-split \.window\.phone-pane\[data-pane\] \{ display: flex !important; position: absolute !important;/.test(blk) && /left: calc\(50% \+ 4px\) !important;/.test(blk) && /width: 44px; height: 44px;/.test(blk) && !/resize|cursor: col-resize|pointermove/.test(blk),
    'style.css: the split is a phone block (the phone media), two absolute panes at 50 % with the 8 px divider between, a 44 px ✕ — no drag, no resize handle');
  const D = require(path.join(REPO, 'src/phone-doors.js'));
  const row = D.PHONE_TWINS.find((r) => r.door === 'win:split');
  ok(!!row && row.twins?.length === 1 && row.twins[0].file === 'src/lib/mobile-nav.js' && mn.includes(row.twins[0].anchor) && D.desktopDoors({ indexHtml: '', railSrc: '', tabGroupSrc: read('src/lib/tab-group.js') }).includes('win:split'),
    'the doors census: the desktop\'s split (a tab group\'s ⧉ in tab-group.js) has its phone twin — the switcher\'s «Split» (src/phone-doors.js)', row);
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const KEYS = ['Split', 'Rotate to split', 'Too narrow to split', 'Close the split', 'No window'];
  const miss = KEYS.filter((k) => !zh.includes(`  ${JSON.stringify(k)}:`) || !ja.includes(`  ${JSON.stringify(k)}:`));
  ok(miss.length === 0 && /"Rotate to split": "横屏后可分屏"/.test(zh) && /"Split": "分屏"/.test(zh) && /"No window": "无窗口"/.test(zh), `i18n: every word the split and the title say is in zh + ja (${KEYS.length}; «分屏», «横屏后可分屏», «无窗口»)`, miss);
}

console.log('⑦ round 2 — the head\'s name (PURE src/phone-head.js), the room beside the list column, one tap = one act, no dead pair');
const H = fs.existsSync(HEAD_SRC) ? require(HEAD_SRC) : null;
ok(!!H, 'PURE src/phone-head.js — the head\'s name');
if (H) {
  const cases = [['/tmp/vs-phone-six-home-1673215', 'vs-phone-six-home-1673215'], ['…ix-home/projects/deep', 'deep'], ['my-mac: /Users/x/proj', 'proj'], ['~/proj', 'proj'], ['/tmp/dir/', 'dir'], ['C:\\Users\\x\\Docs', 'Docs'],
    ['/', '/'], ['~', '~'], ['Session 3 — /tmp/x', 'Session 3'], ['a/b test', 'a/b test'], ['https://x.y/z', 'https://x.y/z'], ['', ''], [null, '']];
  const bad = cases.filter(([i, o]) => H.headName(i) !== o).map(([i, o]) => ({ i, want: o, got: H.headName(i) }));
  ok(!bad.length, `headName: a PATH-shaped name (a files window's folder — «/…», «~/…», «…/…» after frontTruncate, «C:\\…», after a «machine: ») is its LAST segment; a conversation's «name — cwd» its name; anything else itself (${cases.length} cases)`, bad);
  ok(H.NAME_FLOOR_EM === 8 && H.nameNeed(300, 14) === 112 && H.nameNeed(75, 14) === 75 && H.nameFits(111.6, 300, 14) && !H.nameFits(104, 300, 14) && H.nameFits(75, 75, 14),
    'the name keeps 8 em (112 px at the head\'s 14 px) or its whole width when shorter; 104 px of a long name does not fit (the 669 portrait after \'win\' — measured)');
  ok(JSON.stringify(H.YIELD_LADDER) === '["","win","badges","gear","icon"]', 'the yield ladder: every button → the window\'s extras leave (the switcher row\'s ✕ closes, ⋯ the live view) → the For-you numbers collapse to ONE (master\'s .mnav-one; the regular class keeps five while the name fits) → ⚙ folds into ⋯ (the Desktops door and ⋯ stay — the sheets the bar folds into) → the type icon + the count');
  const m1 = mutant("  if (!PATH_RE.test(s) || !/[\\\\/]/.test(s)) return s;\n", '  return s;\n', HEAD_SRC);
  ok(m1.headName('/tmp/vs-phone-six-home-1673215') === '/tmp/vs-phone-six-home-1673215' && H.headName('/tmp/vs-phone-six-home-1673215') === 'vs-phone-six-home-1673215',
    'RED CONTROL: the round-1 rule (the part before « — », whole) names a files window by its path — at 669 px «/tm…», three glyphs of nothing; the module names the folder');
  const m2 = mutant('return Math.min(Math.max(0, Number(full) || 0), floorEm * (Number(em) || 0));', 'return Math.min(Math.max(0, Number(full) || 0), 3.5 * (Number(em) || 0));', HEAD_SRC);
  ok(H.nameFits(96, 300, 14, 96) && !H.nameFits(94, 300, 14, 96) && H.nameFits(79, 79, 14, 96) && !H.nameFits(104, 300, 14), 'the ladder\'s minimum is THE RELEASE\'S when measured (主开发 09:33Z: six CJK / twelve Latin glyphs + «…» — the 700 px tablet keeps its five): 96 px fits, 94 does not, a 79 px name whole fits; 8 em without it');
  ok(/probe\.textContent = navTitleMinText\(name\); el\.appendChild\(probe\); const minPx = probe\.getBoundingClientRect\(\)\.width; probe\.remove\(\);/.test(read('src/lib/mobile-nav.js')) && /if \(nameFits\(el\.getBoundingClientRect\(\)\.width, el\.scrollWidth, em, minPx\) && barFits\(lastRight\(nav\), nav\.getBoundingClientRect \? nav\.getBoundingClientRect\(\)\.right : Infinity\)\) \{ this\._paintState\(\); return; \}/.test(read('src/lib/mobile-nav.js')), 'the head measures that minimum in its own font and the ladder reads it');
  ok(m2.nameFits(54, 300, 14) === true && H.nameFits(54, 300, 14) === false, 'RED CONTROL: round 1\'s 3.5 em floor calls 54 px («/tm…») enough; the module wants 8 em');
  // (lane mask-value-shape, the strip's step two — the hosted test-duo-layout: at 669 × 867 the top bar's magnifier pushed ⚙ off
  // the screen while the name still fit) the ladder also yields while the ROW overflows its bar: every button stays on screen
  ok(H.barFits(348, 348) && H.barFits(349, 348) && !H.barFits(392, 348) && !H.barFits(350, 348), `the bar holds its buttons: a row as wide as its box (or within a px) fits, 44 px more does not (${[H.barFits(348, 348), H.barFits(349, 348), H.barFits(392, 348)].join('/')})`);
  // ⑦b THE STATE WORD SHOWS WHOLE OR AS ITS DOT ALONE (主开发 r1344 — the release at 669 px beside the list column drew «工…» for
  // «工作中», 4 of its 43 px, beside a long name): PURE stateForm, the painter RUN over a stand-in, its wiring
  ok(H.stateForm(43, 43) === 'whole' && H.stateForm(42.995, 43) === 'whole' && H.stateForm(42.6, 43) === 'dot' && H.stateForm(4, 43) === 'dot' && H.stateForm(0, 0) === 'none' && H.stateForm(60, 0) === 'none',
    'stateForm: a word whose room holds its whole run is drawn whole; short of it by any fraction (an ellipsis is drawn on any overflow) its dot alone; no word, nothing');
  const m3 = mutant("  return (Number(got) || 0) + 0.01 >= n ? 'whole' : 'dot';\n", "  return 'whole';\n", HEAD_SRC);
  ok(m3.stateForm(4, 43) === 'whole' && H.stateForm(4, 43) === 'dot', 'RED CONTROL: the release\'s form (the word takes whatever room it is given) calls 4 of 43 px whole — «工…»; the module draws its dot');
  const m4 = mutant("  return (Number(got) || 0) + 0.01 >= n ? 'whole' : 'dot';\n", "  return (Number(got) || 0) + 0.5 >= n ? 'whole' : 'dot';\n", HEAD_SRC);
  ok(m4.stateForm(42.6, 43) === 'whole' && H.stateForm(42.6, 43) === 'dot', 'RED CONTROL: the first cut\'s half-pixel slack calls 42.6 of 43 px whole — an ellipsis there; the module draws its dot');
  const mnSrc = read('src/lib/mobile-nav.js'), pAt = mnSrc.indexOf('  _paintState() {'), pEnd = mnSrc.indexOf('\n  }\n', pAt) + 4, PAINT_SRC = mnSrc.slice(pAt, pEnd);
  // _paintState sliced from mobile-nav.js and RUN over a stand-in that answers as the browser does: its box (padding 4 px
  // included) and its word's run — and, while it wears the dot, the dot's 8 px box and no run (its font is 0)
  const painter = (form, src = PAINT_SRC) => {
    const el = { textContent: '', box: 0, need: 0, display: 'inline', dataset: {}, attrs: {}, set title(v) { this.attrs.title = v; }, get title() { return this.attrs.title; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getBoundingClientRect() { return { width: this.dataset.form === 'dot' ? 8 : this.box }; } };
    const doc = { createRange: () => ({ selectNodeContents(n) { this.n = n; }, getBoundingClientRect() { return { width: this.n.dataset.form === 'dot' ? 0 : this.n.need }; } }) };
    const o = new Function('stateForm', 'document', 'getComputedStyle', 'return { ' + src.trim() + ' };')(form, doc, (e) => ({ display: e.display, paddingLeft: '4px', paddingRight: '0px' }));
    o.bar = { state: el };
    return (s) => { Object.assign(el, s); o._paintState(); return { form: el.dataset.form || '', role: el.attrs.role || '', label: el.attrs['aria-label'] || '', title: el.attrs.title || '' }; };
  };
  const run = painter(H.stateForm);
  const cut = run({ textContent: '工作中', box: 8, need: 43 }), back = run({ box: 64, need: 47 }), sub = run({ box: 46.6, need: 43 }), none = run({ textContent: '', box: 60, need: 0 }), hid = run({ textContent: '空闲', display: 'none', box: 0, need: 30 });
  ok(pAt > 0 && cut.form === 'dot' && cut.role === 'img' && cut.label === '工作中' && cut.title === '工作中', 'the painter, RUN: «工作中» with 4 of its 43 px is drawn as its DOT, the word its accessible name and its title', cut);
  ok(!back.form && !back.role && !back.label && !back.title && sub.form === 'dot' && !none.form && !hid.form, 'the painter, RUN: given its room the word is whole again (the dot\'s name and title gone); 42.6 of 43 px is its dot (no rounding); no word, or a hidden one, draws nothing', { back, sub, none, hid });
  const cutOld = painter(m3.stateForm)({ textContent: '工作中', box: 8, need: 43 });
  ok(!cutOld.form, 'RED CONTROL: the painter over the release\'s form keeps «工作中» as a word in 4 px — the cut the law forbids', cutOld);
  // ORDER (the read's 6): the word is measured AFTER its dot is taken off — measured while it still wears the dot, it reads the
  // dot's 8 px against no run and lets the word back in, cut
  const early = PAINT_SRC.replace('    delete s.dataset.form;\n', '').replace("    let form = 'none';\n", "    let form = 'none';\n    const was = s.dataset.form;\n");
  const swapped = early.replace("    if (form === 'dot')", "    delete s.dataset.form;\n    if (form === 'dot')");
  const runSw = painter(H.stateForm, swapped); runSw({ textContent: '工作中', box: 8, need: 43 }); const wrong = runSw({ box: 8, need: 43 });
  run({ textContent: '工作中', display: 'inline', box: 8, need: 43 }); const right = run({ box: 8, need: 43 });   // from a dot already drawn, as the browser re-decides
  ok(swapped !== PAINT_SRC && right.form === 'dot' && wrong.form !== 'dot', 'RED CONTROL: the same painter measuring BEFORE it takes the dot off reads the dot\'s box and draws the word back, cut — the module measures after', { right, wrong });
  const ph = mnSrc.slice(mnSrc.indexOf('  _paintHead() {'), mnSrc.indexOf('  _paintState() {')), fb = mnSrc.slice(mnSrc.indexOf('  _fitBar() {'), mnSrc.indexOf('\n  }\n', mnSrc.indexOf('  _fitBar() {'))), tb = read('src/lib/trailing-bar.js'), cssS = read('public/style.css');
  const pStart = cssS.indexOf('.mnav-state { display: none; }\n@media (orientation: portrait) {'), pStop = cssS.indexOf('/* Mobile terminal key toolbar', pStart), dotAt = cssS.indexOf('html[data-vc="regular"] #mobile-nav .mnav-state[data-form="dot"] { flex: none; width: 8px; height: 8px;');
  ok((ph.match(/this\._paintState\(\);/g) || []).length === 3 && ph.includes("if (st) { if ((st.textContent || '').trim()) st.dataset.form = 'dot'; else delete st.dataset.form; }")
    && fb.includes("if (this.app.viewportClass?.() === 'regular') this._paintState();")
    && tb.includes('return { update, onList, el: nav, state: stateEl, ') && tb.includes("if (moved || had !== !!stateEl.textContent.trim()) app._mobileNav?._paintHead?.(); else app._mobileNav?._paintState?.();")
    && tb.includes('.mnav-state[data-form="dot"]\');') && pStart > 0 && dotAt > pStart && dotAt < pStop,
    'the wiring: the head paints its state on every way out (the dot\'s room held while the ladder measures the name, none for no word); a bar refit re-decides it (a button\'s width moved); a word that appears or leaves re-runs the head, a changed word re-decides; the dot says its word on a long press; the dot is drawn inside the portrait block (the regular class only)');
}
{
  const sv = read('src/lib/phone-split-view.js'), mn = read('src/lib/mobile-nav.js'), w = read('src/lib/window.js'), css = read('public/style.css');
  ok(/const room = \(\) => document\.getElementById\('workspace'\)\?\.offsetWidth \|\| 0;/.test(sv) && /const verdict = \(\) => splitVerdict\(\{ room: room\(\) \+ listColumn\(\), turnedRoom: turnedRoom\(\) \}\);/.test(sv) && /const v = splitLayout\(\{ pair: pairs\[d\] \|\| null, shown: frameOf\(app\.wm\.activeWindowId\), alive: alive\(\), room: room\(\) \}\);/.test(sv) && !/r \+= document\.getElementById\('sidebar'\)/.test(sv),
    'the room the panes may use is the window area NOW (the list column shown takes its width ⇒ the split collapses, the pair kept; hidden ⇒ it returns); only «Split»\'s own verdict counts the column its press hides');
  const iRev = sv.indexOf("if (app.wm.windows.get(frameOf(id))?.isMinimized) app.wm.revealWindow(id);"), iKeep = sv.indexOf('pairs[desk()] = pair; save();');
  ok(iRev > 0 && iKeep > iRev && /if \(pairs\[d\] && app\._mobileNav\?\._shownBooted && deadIn\(pairs\[d\], d\)\) \{\n      delete pairs\[d\]; save\(\);\n      showToast\(t\('The split ended: one of its windows was minimized, closed or moved to another desktop'\)/.test(sv) && /if \(!w\) return seen\.has\(id\);\n    return !!w\.isMinimized \|\| /.test(sv),
    'no dead pair: «Split» beside a minimized window restores it BEFORE the pair is kept; a pane\'s window minimized / closed after it stood / moved away drops the pair at apply() with a toast (a window not built yet is none of these)');
  ok(/addEventListener\('pointerdown', \(e\) => \{ const w = e\.target\.closest\?\.\('\.window\.phone-pane'\); pressedAside = !!w && !w\.classList\.contains\('window-active'\); \}, true\);/.test(mn) && /if \(pressedAside\) \{ pressedAside = false; return; \}/.test(mn),
    'one tap = one act: the press on the pane NOT on show (read in the capture phase, before the press focuses it) only makes it the one on show — the switcher opens from the head of the pane on show');
  ok(/import \{ headName, nameFits, (?:barFits, )?stateForm, YIELD_LADDER(?:, ROW_YIELD_LADDER, rowParts)? \} from '\.\.\/phone-head\.js';/.test(mn) && /const name = win \? \(headName\(win\.title\) \|\| windowKindWords\(win\.type\)\) : t\('No window'\);/.test(mn) && /el\.title = !home && full !== name \? full : t\('Switch window'\);/.test(mn) && /new ResizeObserver\(\(\) => this\._paintHead\(\)\)\.observe\(document\.getElementById\('mobile-nav'\)\)/.test(mn)
    && /titleSpan\.dataset\.name = headName\(title\);/.test(w) && /win\.titleSpan\.dataset\.name = headName\(t\);/.test(w)
    && /#mobile-nav\[data-yield\] :is\(#mobile-nav-viewer-close, #mobile-nav-artifacts, #mobile-nav-live\) \{ display: none !important; \}/.test(css) && /#mobile-nav:is\(\[data-yield="gear"\], \[data-yield="icon"\]\):has\(#mobile-nav-more\.on\) #mobile-nav-gear:not\(\.vault-locked\) \{ display: none !important; \}/.test(css)
    && /registerMenuItem\(\{ menu: 'window', group: '9_bar', order: 10, id: 'window\/bar-gear', when: gearFolded, label: \(\) => t\('Global settings'\), run: \(c\) => c\.app\._pressGlobalSettings\(document\.getElementById\('mobile-nav-more'\)\) \}\);/.test(read('src/lib/trailing-bar.js')),
    'the head: MobileNav names with headName (the whole title in the title attribute), re-fits on every width change of the bar; the window\'s own head (landscape, a pane) names with it too; the stylesheet folds the ladder\'s steps (⚙ never with the locked vault\'s mark), and a folded ⚙ is ⋯\'s «Global settings» row');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js'), K = 'The split ended: one of its windows was minimized, closed or moved to another desktop';
  ok(zh.includes(`  ${JSON.stringify(K)}: "分屏已结束`) && ja.includes(`  ${JSON.stringify(K)}:`), 'i18n: the split\'s end is said in zh + ja');
}

// ⑧ THE TWO CSS LAWS OF THIS PIECE, read as RULES (the reader's list 2026-11-13: dropping either left every fast suite green)
console.log('⑧ the finger\'s 16 px fields and the tab name\'s floor, as rules');
{
  const css = read('public/style.css');
  // the block a rule lives in: the innermost @media that opens before it and has not closed
  const blockOf = (raw, needle) => { const text = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).replace(/'[^'\n]*'|"[^"\n]*"/g, (m) => m.replace(/[{}]/g, ' ')); const at = raw.indexOf(needle); if (at < 0) return null; let depth = 0, open = []; for (let i = 0; i < at; i++) { if (text[i] === '{') { const head = text.slice(text.lastIndexOf('}', i) + 1, i).trim(); open.push(head); depth++; } else if (text[i] === '}') { open.pop(); depth--; } } return open.filter((h) => h.startsWith('@media')).pop() || null; };
  const FIELDS = 'textarea, select, [contenteditable]:not([contenteditable="false"]) { font-size: max(16px, 1em) !important; }';
  const fieldsAt = (c) => blockOf(c, FIELDS);
  ok(/^@media \(hover: none\) and \(pointer: coarse\)$/.test(fieldsAt(css) || '') && /input:not\(\[type="checkbox"\], \[type="radio"\][^)]*\),\s*\n\s*textarea, select, \[contenteditable\]/.test(css),
    '⑧ on a FINGER every field — input (but the button-like types), textarea, select, an editable box — reads at least 16 px (iOS zooms to a smaller one and never zooms back; userW 2026-10-26)');
  ok(!fieldsAt(css.replace(FIELDS, FIELDS.replace('max(16px, 1em) !important', 'inherit'))), '⑧ CONTROL: the reader\'s F1 (the 16 px dropped) is red');
  const TABS = ':is(.window.window-active, .window.phone-pane) > .window-titlebar .tab-item > .tab-label { flex: 0 1 auto; min-width: 4em; }';
  ok(/^@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\)$/.test(blockOf(css, TABS) || ''), '⑧ on a phone every tab keeps its name a 4 em floor (the strip scrolls before a name drops under it — the recovery reader\'s law)');
  ok(!blockOf(css.replace(TABS, TABS.replace(' min-width: 4em;', '')), TABS), '⑧ CONTROL: the reader\'s T1 (the floor dropped) is red');
}

console.log('⑨ the switcher row yields (主开发 2026-11-17, ruling B on the row — the .407 move\'s meeting: a bill chip, the Split door, the ⋯ and the ✕ left a long name 0 px at 320)');
{
  const ladderOk = (HH) => !!HH && JSON.stringify(HH.ROW_YIELD_LADDER) === '["","compact","split","chip"]'
    && JSON.stringify(['', 'compact', 'split', 'chip', 'nope'].map((s) => HH.rowParts(s))) === JSON.stringify([{ chip: 'full', split: true }, { chip: 'compact', split: true }, { chip: 'compact', split: false }, { chip: null, split: false }, { chip: 'full', split: true }]);
  ok(ladderOk(H), 'ROW_YIELD_LADDER: the chip\'s long form → its compact form → the Split door into the ⋯ menu → the chip into the ⋯ menu; rowParts says what each step draws (an unknown step draws everything)', H && H.ROW_YIELD_LADDER);
  ok(!ladderOk(mutant("const ROW_YIELD_LADDER = ['', 'compact', 'split', 'chip'];", "const ROW_YIELD_LADDER = ['', 'compact', 'chip', 'split'];", HEAD_SRC)), 'CONTROL: the chip yielding before the Split door is refused (主开发\'s order)');
  ok(!ladderOk(mutant("return { chip: i >= 3 ? null : i >= 1 ? 'compact' : 'full', split: i < 2 };", "return { chip: i >= 3 ? null : 'full', split: i < 2 };", HEAD_SRC)), 'CONTROL: a ladder that skips the chip\'s compact form is refused');
  const MN = read('src/lib/mobile-nav.js'), TB = read('src/lib/taskbar.js');
  const at = MN.indexOf('function fitSwitcherRow('), fit = at < 0 ? '' : MN.slice(at, MN.indexOf('\n}\n', at));
  ok(/for \(const s of ROW_YIELD_LADDER\)/.test(fit) && /if \(nameFits\(label\.getBoundingClientRect\(\)\.width, fullPx, 0, minPx\) && centreIn\(\)\) break;/.test(fit) && /const centreIn = \(\) => \{ const lb = label\.getBoundingClientRect\(\), rb = item\.getBoundingClientRect\(\), c = rb\.left \+ rb\.width \/ 2; return lb\.left <= c && lb\.right >= c; \};/.test(fit) && /probe\.textContent = titleMinText\(text\)/.test(fit) && !/moreBtn|closeBtn|mobile-win-more/.test(fit),
    'fitSwitcherRow walks the ladder in the REAL layout until the name keeps its readable minimum (titleMinText) AND holds the row\'s centre (⑥c\'s law); the ⋯ and the ✕ are never among what yields');
  ok(/requestAnimationFrame\(\(\) => fitSwitcherRow\(item, label, billChip, splitBtn\)\)/.test(MN) && !/fitRowPill/.test(MN), 'every switcher row is fitted, with or without a chip (the chip-only fit is gone)');
  ok(/\{ label: t\('Split'\), off: t\(sv\.words\) \}/.test(MN) && /label: t\('Billing: \{name\}', \{ name: forms\.tip \}\), action: \(\) => this\.app\.showBillingSwitcher\?\.\(win\.id, moreBtn\)/.test(MN) && (MN.match(/rowYielded: yielded\(\)/g) || []).length === 2,
    'what yielded is in the window\'s menu under the row\'s words — the Split door (a refused one OFF with its why on its row), the billing row (the same switch door); the ⋯ AND the long press carry it');
  ok(/registerMenuItem\(\{ menu: M, group: 'navigation', order: 1, id: 'window\/phone-row-yielded', when: \(c\) => !!c\.rowYielded\?\.length, expand: \(c\) => c\.rowYielded \}\);/.test(TB), 'the window menu takes the yielded rows through its own registry, first');
  const ST = read('public/style.css');
  const menuFits = (css) => /\.taskbar-context-menu \{ width: max-content; max-width: calc\(100vw - 8px\); \}/.test(css) && /\.taskbar-context-menu-item\.disabled:has\(> \.door-why\) \{ flex-direction: column;/.test(css) && /\.taskbar-context-menu-item\.disabled \.door-label \{ white-space: nowrap; \}/.test(css);
  ok(menuFits(ST), 'the window menu a row\'s ⋯ opens near the right edge keeps its natural width (menuPlace slides it left — at 320 it shrank to 104 px, «分 / 屏» one glyph a line) and an OFF row stacks its why under its words');
  ok(!menuFits(ST.replace('.taskbar-context-menu { width: max-content; max-width: calc(100vw - 8px); }', '')), 'CONTROL: the menu without its natural width is refused');
  ok(/"Billing: \{name\}": "计费：\{name\}"/.test(read('src/lib/i18n-zh.js')) && /"Billing: \{name\}": "課金：\{name\}"/.test(read('src/lib/i18n-ja.js')), 'the billing row\'s words in zh / ja');
}

// ⑧ THE PHONE BAR'S SEARCH DOOR AND ITS METHOD TRAVEL TOGETHER. Written for the restack onto 2.369.410 (lane bl-chat-a, a hand;
// 主开发 20:03Z), when the chat status strip's step two had left with the door; restated by lane mask-value-shape for 2.369.414,
// when the step two brings the door (#mobile-nav-search, its toggle in updateTitle) back WITH its method (mobile-nav.js
// _shownChat). Two legs: (a) the phone title PAINTS on the page's bar WITH the door (the real updateTitle / _paintHead /
// _titleWin / _shownChat, compiled from mobile-nav.js over stand-ins; a page with exactly index.html's element ids) and nothing
// throws; (b) a CENSUS that can fail: every `this._x(` the module calls is a method its class makes, every getElementById('<id>')
// names an element the page or the module makes. RED controls (scripts/scratch.mjs anchored), each proving its plant first: the
// method cut out of the class — the door's line then throws, and the census names it.
console.log('⑧ the phone bar\'s search door comes with its method: the title paints, and the module names nothing the page lacks');
{
  const { anchored } = await import('./scratch.mjs');
  const MN = read('src/lib/mobile-nav.js'), PAGE = read('public/index.html');
  const sliceOf = (src, name) => { const a = src.indexOf(`\n  ${name}(`); const b = a < 0 ? -1 : src.indexOf('\n  }\n', a); return a < 0 || b < 0 ? null : src.slice(a + 1, b + 4); };
  const MIN_OF = (/^const minimizedOf = [^\n]+$/m.exec(MN) || [null])[0];
  const SHOWN = sliceOf(MN, '_shownChat');
  const paint = (src, ids) => {
    const Probe = new Function('t', 'headName', 'nameFits', 'barFits', 'YIELD_LADDER', 'navTitleMinText', 'windowTypeIcon', 'document', 'getComputedStyle', 'windowWords', 'windowKindWords', 'stateForm',   // + the two window-types names the head reads (lane ui-plain-words closure F13)
      `${MIN_OF}\nreturn class Probe {\n${sliceOf(src, 'updateTitle')}\n${sliceOf(src, '_paintHead')}\n${sliceOf(src, '_paintState') || ''}\n${sliceOf(src, '_titleWin')}\n${sliceOf(src, '_shownChat') || ''}\n};`);
    const nav = { dataset: {}, style: {} };
    const doc = { getElementById: (id) => (ids.has(id) ? (id === 'mobile-nav' ? nav : { classList: { toggle() { } }, dataset: {} }) : null), createElement: () => ({ style: {}, getBoundingClientRect: () => ({ width: 10 }), remove() { } }) };
    const P = Probe((x) => x, H ? H.headName : (x) => x, () => true, H ? H.barFits : () => true, ['', 'x'], (x) => x, () => '', doc, () => ({ fontSize: '14px', flexDirection: 'row' }), (w) => String(w.title || ''), () => 'Window', H ? H.stateForm : () => 'none');
    const el = { textContent: '', title: '', classList: { toggle() { } }, removeAttribute() { }, setAttribute() { }, appendChild() { }, getBoundingClientRect: () => ({ width: 200 }), scrollWidth: 200 };
    const win = { id: 1, title: 'Fix the login page — /w/demo', element: { classList: { contains: () => false } } };
    const p = Object.assign(Object.create(P.prototype), { _noteShown() { }, _titleEl: el, _shown: {}, bar: null, split: null, updateDesktopsDoor() { },
      app: { wm: { windows: new Map([[1, win]]), activeWindowId: 1 }, viewportClass: () => 'compact', phoneHome: { shown: () => false }, desktopManager: { activeDesktopId: '' } } });
    try { p.updateTitle(); return { threw: null, title: el.textContent }; } catch (e) { return { threw: String(e && e.message), title: el.textContent }; }
  };
  const PAGE_IDS = new Set([...PAGE.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  ok(!!sliceOf(MN, 'updateTitle') && !!MIN_OF && !!sliceOf(MN, '_paintHead') && !!sliceOf(MN, '_titleWin') && !!SHOWN, 'the four methods and minimizedOf are read whole out of mobile-nav.js');
  ok(PAGE_IDS.has('mobile-nav-search') && /document\.getElementById\('mobile-nav-search'\)[^\n]*this\._shownChat\(\)\?\._search/.test(sliceOf(MN, 'updateTitle') || ''), 'the page draws the door (#mobile-nav-search) and updateTitle toggles it on the conversation on show (this._shownChat()._search)');
  const a = paint(MN, PAGE_IDS);
  console.log(`  (a) painted: ${JSON.stringify(a)}`);
  ok(a.threw === null && a.title.startsWith('Fix the login page'), `(a) the phone title paints on the bar WITH its search door and nothing throws («${a.title}»)`, a);
  const noMethod = anchored(MN, SHOWN || '\u0000', '', 'the search door\'s method cut out of mobile-nav.js');
  const ra = paint(noMethod, PAGE_IDS);
  ok(!!ra.threw && /_shownChat/.test(ra.threw), `CONTROL (a): the door's line with its method cut out throws — the leg can go RED («${ra.threw}»)`, ra);
  const census = (src) => {
    const made = new Set([...src.matchAll(/^  (?:async |static |get |set )?(_?[A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]).concat([...src.matchAll(/this\.(_[A-Za-z0-9_$]+)\s*=(?!=)/g)].map((m) => m[1])));
    const calls = [...new Set([...src.matchAll(/this\.(_[A-Za-z0-9_$]+)\(/g)].map((m) => m[1]))];
    const ids = [...new Set([...src.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))];
    const inPage = (id) => PAGE_IDS.has(id) || src.includes(`id="${id}"`) || src.includes(`.id = '${id}'`) || src.includes(`id: '${id}'`);
    return { calls: calls.length, ids: ids.length, notMade: calls.filter((c) => !made.has(c)), notOnPage: ids.filter((id) => !inPage(id)) };
  };
  const c = census(MN);
  ok(c.calls > 10 && c.ids > 5 && c.notMade.length === 0 && c.notOnPage.length === 0, `(b) mobile-nav.js calls only methods its class makes and names only elements the page makes (${c.calls} private calls, ${c.ids} element ids)`, c);
  const rc = census(noMethod);
  ok(rc.notMade.includes('_shownChat'), `CONTROL (b): the door's method cut out — the census names the call nobody makes (${JSON.stringify({ notMade: rc.notMade })})`, rc);
}

// ⑨ lane ui-plain-words closure F13 ON PHONE-SIX'S PAINTER (the move -moved2; 主开发 2026-11-19 01:13Z, a MUST): a window with no
// title is named by its KIND's words, never the bare «Window». The product's two lines run here — the painter sliced as ⑧ slices
// it, handed the REAL windowWords / windowKindWords of src/lib/window-types.js (imported in plain node, a kind registered for the
// leg), the REGULAR class, an empty-titled window of that kind: the head's text (its short name) is the kind's words, and its full
// name — the head's hover / accessible name — is too (read where the painter writes it: the icon step's aria-label). A control
// for each of the two lines, built through scripts/scratch.mjs anchored() (the line put back to the bare word): the leg reads Window.
console.log('⑨ closure F13 on phone-six\'s painter: a title-less window is named by its kind, never «Window» (the real window-types)');
{
  const { anchored } = await import('./scratch.mjs');
  const WT = await import('../src/lib/window-types.js');
  const KIND = 'f13-leg-kind', KIND_LABEL = 'Machine files';
  WT.registerWindowType({ type: KIND, icon: '', label: KIND_LABEL, action: 'openF13LegKind', replay: () => { } });
  const KW = WT.windowKindWords(KIND);
  const MN = read('src/lib/mobile-nav.js');
  const sliceOf = (src, name) => { const a = src.indexOf(`\n  ${name}(`); const b = a < 0 ? -1 : src.indexOf('\n  }\n', a); return a < 0 || b < 0 ? null : src.slice(a + 1, b + 4); };
  const MIN_OF = (/^const minimizedOf = [^\n]+$/m.exec(MN) || [null])[0];
  // fits: true ⇒ the head keeps its words (the first step of the ladder fits); false ⇒ the ladder ends at the icon, whose
  // accessible name is the window's FULL name (el.setAttribute('aria-label', full))
  const paint = (src, fits) => {
    const Probe = new Function('t', 'headName', 'nameFits', 'barFits', 'YIELD_LADDER', 'navTitleMinText', 'windowTypeIcon', 'document', 'getComputedStyle', 'windowWords', 'windowKindWords', 'stateForm',
      `${MIN_OF}\nreturn class Probe {\n${sliceOf(src, 'updateTitle')}\n${sliceOf(src, '_paintHead')}\n${sliceOf(src, '_paintState') || ''}\n${sliceOf(src, '_titleWin')}\n};`);
    const nav = { dataset: {}, style: {} };
    const doc = { getElementById: (id) => (id === 'mobile-nav' ? nav : null), createElement: () => ({ style: {}, getBoundingClientRect: () => ({ width: 10 }), remove() { } }) };
    const P = Probe((x) => x, H ? H.headName : (x) => x, () => fits, H ? H.barFits : () => true, ['', 'x'], (x) => x, () => '', doc, () => ({ fontSize: '14px', flexDirection: 'row' }), WT.windowWords, WT.windowKindWords, H ? H.stateForm : () => 'none');
    const attrs = {};
    const el = { textContent: '', title: '', innerHTML: '', classList: { toggle() { } }, removeAttribute(k) { delete attrs[k]; }, setAttribute(k, v) { attrs[k] = v; }, appendChild() { }, getBoundingClientRect: () => ({ width: 200 }), scrollWidth: 200 };
    const win = { id: 1, title: '', type: KIND, element: { classList: { contains: () => false } } };
    const p = Object.assign(Object.create(P.prototype), { _noteShown() { }, _titleEl: el, _shown: {}, bar: null, split: null, updateDesktopsDoor() { },
      app: { wm: { windows: new Map([[1, win]]), activeWindowId: 1 }, viewportClass: () => 'regular', phoneHome: { shown: () => false }, desktopManager: { activeDesktopId: '' } } });
    try { p.updateTitle(); return { threw: null, text: el.textContent, title: el.title, label: attrs['aria-label'] || null }; } catch (e) { return { threw: String(e && e.message), text: el.textContent, title: el.title, label: attrs['aria-label'] || null }; }
  };
  ok(KW === KIND_LABEL && KW !== 'Window', `the kind registered for the leg names itself by its words («${KW}»)`, KW);
  const kept = paint(MN, true), icon = paint(MN, false);
  ok(kept.threw === null && kept.text === KW && kept.title !== 'Window', `⑨ the head of an empty-titled «${KIND}» window reads its kind's words in the regular class («${kept.text}»; its hover «${kept.title}»)`, kept);
  ok(icon.threw === null && icon.label === KW, `⑨ …and its full name — the head's accessible name when it folds to the icon — is the kind's words too («${icon.label}»)`, icon);
  const FULL = "    const full = win ? windowWords(win) : t('No window');\n";
  const NAME = "    const name = win ? (headName(win.title) || windowKindWords(win.type)) : t('No window');\n";
  const fullBare = anchored(MN, FULL, "    const full = win ? (String(win.title || '').split(' — ')[0].trim() || t('Window')) : t('No window');\n", 'F13 full name put back to the bare word');   // stale-pins: kept — the RED control plants the bare word back
  const nameBare = anchored(MN, NAME, "    const name = win ? (headName(win.title) || t('Window')) : t('No window');\n", 'F13 short name put back to the bare word');   // stale-pins: kept — the RED control plants the bare word back
  const rf = paint(fullBare, false), rfk = paint(fullBare, true);
  ok(rf.threw === null && rf.label === 'Window' && rfk.title === 'Window', `⑨ CONTROL: the full-name line put back to the bare word ⇒ the leg reads Window (its accessible name «${rf.label}», its hover «${rfk.title}»)`, { rf, rfk });
  const rn = paint(nameBare, true);
  ok(rn.threw === null && rn.text === 'Window', `⑨ CONTROL: the short-name line put back to the bare word ⇒ the leg reads Window (the head's text «${rn.text}»)`, rn);
}

// ⑩ THE BAR'S ⋯ STANDS ONLY WHEN IT HOLDS A ROW (主开发 2026-11-18 23:09Z, the 2.369.411 checkpoint's find: trailing-bar.js put ⋯
// on for EVERY window, and in the regular class a files window's menu holds no row — its ⋯ opened an empty menu). PURE
// phone-head.js moreHolds (the folded ⚙'s own row is no reason to stand) + the wiring: the bar asks taskbar.js windowMenuHolds
// (the menu's own ctx and registry — test-phone-refusal-wrap ⑥ runs it), a press on a ⋯ whose rows left opens nothing, its coming
// or going re-fits the head, the list's merge re-judges it, and ⚙ folds only into a ⋯ that stands. RED: the folded ⚙'s row counted.
console.log('⑩ the bar\'s ⋯ stands only when the window\'s menu holds a row');
{
  const GEAR = { id: 'window/bar-gear', label: 'Global settings' }, SEP = { separator: true };
  ok(H.FOLDED_GEAR_ROW === 'window/bar-gear' && H.moreHolds([]) === false && H.moreHolds([SEP]) === false && H.moreHolds([SEP, GEAR, SEP]) === false && H.moreHolds(null) === false,
    'PURE moreHolds: no row, a separator, the folded ⚙\'s «Global settings» alone, no list — ⋯ does not stand');
  // (lane mask-value-shape) the search door folded into ⋯ never makes ⋯ stand either — a view-only window whose ⋯ holds nothing
  // keeps its search on the bar (the stylesheet folds it only into a ⋯ that stands)
  ok(H.FOLDED_SEARCH_ROW === 'window/bar-search' && H.moreHolds([{ id: 'window/bar-search', label: 'Search this conversation' }]) === false && H.moreHolds([{ id: 'window/bar-search' }, { id: 'window/rename', label: 'Rename' }]) === true && /id: 'window\/bar-search', when: searchFolded,/.test(read('src/lib/trailing-bar.js')) && /#mobile-nav\[data-yield\]:has\(#mobile-nav-more\.on\) #mobile-nav-search \{ display: none !important; \}/.test(read('public/style.css')), 'the folded search row is not a row that makes ⋯ stand; the search door folds only into a ⋯ that stands');
  ok(H.moreHolds([{ id: 'window/session-rename', label: 'Rename…' }]) === true && H.moreHolds([GEAR, { label: 'Download' }]) === true && H.moreHolds([{ caption: 'a word' }]) === true,
    'PURE moreHolds: a row of its own (a conversation\'s Rename…, a Download beside the folded ⚙, a caption) — ⋯ stands');
  const m3 = mutant('items.some((it) => !!it && !it.separator && it.id !== FOLDED_GEAR_ROW && it.id !== FOLDED_SEARCH_ROW)', 'items.some((it) => !!it && !it.separator && it.id !== FOLDED_SEARCH_ROW)', HEAD_SRC);
  ok(m3.moreHolds([SEP, GEAR]) === true && H.moreHolds([SEP, GEAR]) === false,
    'RED CONTROL: the folded ⚙\'s row counted ⇒ a files window\'s ⋯ stands to hold only ⚙ — the step that was to give the name room takes it back');
  // (lane mask-value-shape) its twin: the folded search row counted ⇒ ⋯ stands to hold only search — no room given
  const SEARCH = { id: 'window/bar-search', label: 'Search this conversation' };
  const m4 = mutant('items.some((it) => !!it && !it.separator && it.id !== FOLDED_GEAR_ROW && it.id !== FOLDED_SEARCH_ROW)', 'items.some((it) => !!it && !it.separator && it.id !== FOLDED_GEAR_ROW)', HEAD_SRC);   // stale-pins: kept — the RED control plants the old line (the search row counted)
  ok(m4.moreHolds([SEP, SEARCH]) === true && H.moreHolds([SEP, SEARCH]) === false,
    'RED CONTROL: the folded search row counted ⇒ ⋯ stands to hold only search — the step that was to give the name room takes it back');
  const TBAR = read('src/lib/trailing-bar.js'), TBK = read('src/lib/taskbar.js'), SBR = read('src/lib/sidebar.js'), css = read('public/style.css');
  const merge = SBR.slice(SBR.indexOf('  _mergeAndRender() {'), SBR.indexOf('\n  }\n', SBR.indexOf('  _mergeAndRender() {')));
  ok(/const holds = !!w && \(regular\(\) \|\| !!columnShape\(\)\) && windowMenuHolds\(app, w\.id\), moved = holds !== more\.classList\.contains\('on'\);[^\n]*\n    more\.classList\.toggle\('on', holds\);/.test(TBAR) && !/more\.classList\.toggle\('on', !!w\);/.test(TBAR)   // stale-pins: kept — a deliberate absence check: the old line must stay gone
    && /if \(!windowMenuHolds\(app, w\.id\)\) \{ update\(\); return; \}/.test(TBAR) && /if \(moved \|\| had !== !!stateEl\.textContent\.trim\(\)\) app\._mobileNav\?\._paintHead\?\.\(\);/.test(TBAR),
    'the bar: ⋯ is on only while the window\'s menu holds a row (never «on for every window»), judged only in the regular class (where it is drawn); a press after its rows left opens nothing and the bar follows; its coming or going re-fits the head');
  ok(/export function windowMenuHolds\(app, id\) \{\n  return moreHolds\(windowMenuRows\(app, id\)\);/.test(TBK) && /return ctx \? contribMenuItems\('window', ctx\) : null;/.test(TBK) && /const ctx = windowMenuCtx\(app, id, \{ closeLabel, switchSubmenu, group, rowYielded \}\);/.test(TBK),
    'ONE reader: the question and the menu share windowMenuCtx and the window registry');
  ok(merge.includes('this.app.syncSessionIdentity?.(this._allSessions);') && merge.includes('this.app?._mobileNav?.bar?.onList?.();') && !merge.includes('this.app?._mobileNav?.bar?.update?.();')
    && /if \(key === listSeen\) return;\n    listSeen = key;\n    update\(\);/.test(TBAR) && /const key = JSON\.stringify\(\[w\?\.id \|\| null, regular\(\), s && \[s\.webuiId, s\.sessionId, s\.status, s\.browserKey, s\.host, s\.browserProfileActive, !!s\.browserInput\], /.test(TBAR) && /return \{ update, onList, el: nav, state: stateEl, windowMenuAt, fitColumn: \(\) => fitColumn\(nav\) \};/.test(TBAR),
    'every merge of the list asks the bar (a conversation\'s menu holds its rows once its session is in the list) — and the bar updates only when the window on show\'s own session facts moved (the reading w7vpg6swt: a 5 s poll that moved nothing runs no registry)');
  ok(/winInfo\._desktopAppCaps = rec\.caps \|\| null;[^\n]*\n    app\._mobileNav\?\.bar\?\.update\?\.\(\);/.test(read('src/lib/desktop-app-window.js')) && /winInfo\._fileDownload = target;\n  globalThis\.app\?\._mobileNav\?\.bar\?\.update\?\.\(\);/.test(read('src/lib/file-download.js')),
    'the rows that land after the bar was drawn ask it at once: a desktop app\'s caps and state (its render), a viewer\'s Download (wireFileDownload)');
  ok(!/#mobile-nav:is\(\[data-yield="gear"\], \[data-yield="icon"\]\) #mobile-nav-gear/.test(css) && /:has\(#mobile-nav-more\.on\) #mobile-nav-gear:not\(\.vault-locked\)/.test(css),   // stale-pins: kept — a deliberate absence check: the old line must stay gone
    'the stylesheet: ⚙ folds only into a ⋯ that stands (where ⋯ holds nothing the \'gear\' step gives nothing and ⚙ stays)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
