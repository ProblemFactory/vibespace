#!/usr/bin/env node
// THE VIEWPORT CLASS (lane duo-build-1, 2026-10-25 — the iPhone Duo on the owner's simulator: a fold from the 951 px inner
// display to the 382 px cover kept the desktop's rail and chat-window geometry, B-1d40 / B-f5ec). Fast, in-process, PURE +
// wiring pins:
//   ① viewportClassOf — the class of each Duo viewport (WebKit 27.1's table) and of today's phone / desktop: < 769 px is
//     the phone page, ≥ 769 the window manager, a hidden page (width 0) keeps the class it had
//   ② the ONE line — VC_WATCH_QUERIES' phone query IS the stylesheets' `(max-width: 768px)` (the CSS and the JS can never
//     disagree about which page this is); the regular class's lines are named once (SPEC-v3 §1.2), between the two
//   ③ switchVerdict — the same class: nothing; across the phone line: the tier switch (phone ⇄ desktop paths)
//   ④ wiring pins — app.isMobile is the class's answer (never a boot-time matchMedia); the switch watches every query,
//     settles VC_SETTLE_MS, makes the sidebar / nav / windows what a fresh load builds; the window manager refits and the
//     rail leaves with its words — RED CONTROL: the base's frozen `this.isMobile = window.matchMedia(...)` is caught
//   ⑤ THE SYSTEM's EDGES (B-78db): cover for the home-screen copy only; the Duo's side column by its insets; every edge its inset;
//     RED CONTROL: the release's stylesheet (the trailing bar at right 0, no inset)
// Run: node scripts/test-viewport-class.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const V = require(path.join(REPO, 'src/viewport-class.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('① viewportClassOf');
{
  // WebKit 27.1's iPhone Duo table (SPEC-v3 §1.1) + today's phones and desktops
  const rows = [
    [{ width: 382, coarse: true }, 'compact', 'the Duo cover, portrait 382×580'],
    [{ width: 594, coarse: true }, 'compact', 'the Duo cover, landscape 594×368'],
    [{ width: 385, coarse: true }, 'compact', 'Split View half 385×571'],
    [{ width: 669, coarse: true }, 'regular', 'the Duo inner portrait 669×867 (slice 2: the regular class)'],
    [{ width: 951, coarse: true }, 'regular', 'the Duo inner landscape 951×585 (slice 2: the regular class — no longer the window manager)'],
    [{ width: 639, coarse: true }, 'compact', 'a finger at 639 px: the phone page (the regular line is 640)'],
    [{ width: 640, coarse: true }, 'regular', 'a finger at 640 px: regular'],
    [{ width: 744, coarse: true }, 'regular', 'an iPad mini in portrait 744 (SPEC-v3 §1.2: an improvement the owner confirms)'],
    [{ width: 932, coarse: true }, 'regular', 'a large phone in landscape 932'],
    [{ width: 1023, coarse: true }, 'regular', 'a finger at 1023 px: regular'],
    [{ width: 1024, coarse: true }, 'desktop', 'a finger at 1024 px: the window manager (an iPad in landscape stays today\'s)'],
    [{ width: 951, coarse: false }, 'desktop', 'a MOUSE at 951 px: the window manager (the class reads the pointer, never the device)'],
    [{ width: 669, coarse: false }, 'compact', 'a mouse at 669 px: the phone page'],
    [{ width: 390, coarse: true }, 'compact', 'a phone 390×844'],
    [{ width: 768, coarse: false }, 'compact', 'the line itself: 768 is the phone page'],
    [{ width: 769, coarse: false }, 'desktop', '769 is the window manager'],
    [{ width: 1280, coarse: false }, 'desktop', 'a laptop 1280×800'],
  ];
  for (const [inp, want, what] of rows) ok(V.viewportClassOf(inp) === want, `${what} ⇒ ${want}`, V.viewportClassOf(inp));
  ok(V.viewportClassOf({ width: 0, prev: 'compact' }) === 'compact' && V.viewportClassOf({ width: 0, prev: 'desktop' }) === 'desktop', 'a hidden page (width 0) keeps the class it had — never a switch on a measurement that is not one');
  ok(V.viewportClassOf({}) === 'desktop' && V.viewportClassOf({ width: NaN }) === 'desktop', 'no measurement and no class yet ⇒ the desktop (the boot default of a page that measures nothing)');
  ok(V.isPhoneClass('compact') && V.isPhoneClass('regular') && !V.isPhoneClass('desktop') && !V.isPhoneClass(null), 'isPhoneClass: compact AND regular run the phone paths, desktop the window manager');
  ok(V.listIsColumn('regular') && !V.listIsColumn('compact') && !V.listIsColumn('desktop'), 'listIsColumn: only the regular class keeps the list as a column (never an overlay)');
}

console.log('② the ONE line');
{
  ok(['(max-width: 768px)', '(min-width: 640px)', '(max-width: 1023px)', '(pointer: coarse)', '(orientation: portrait)'].every((q) => V.VC_WATCH_QUERIES.includes(q)), 'the watched queries: every line of the class, the pointer and the orientation', V.VC_WATCH_QUERIES);
  ok(V.VC_PHONE_MEDIA === '(max-width: 768px), (pointer: coarse) and (max-width: 1023px)', 'VC_PHONE_MEDIA = compact ∪ regular as ONE media-query list (a mouse below 769, a finger below 1024)', V.VC_PHONE_MEDIA);
  const css = ['public/style.css', 'public/chat.css', 'public/viewers.css'].map(read).join('\n');
  const phoneBlocks = css.split('@media ' + V.VC_PHONE_MEDIA + ' {').length - 1, bare = css.split('@media (max-width: 768px) {').length - 1;
  ok(phoneBlocks >= 50 && bare === 0, `every phone block of the stylesheets is the class's media list (${phoneBlocks}), none the bare 768 line (${bare}) — the regular class gets the phone's pieces`);
  ok(bare === 0 && ('@media (max-width: 768px) {\n'.split('@media ' + V.VC_PHONE_MEDIA + ' {').length - 1) === 0, 'RED CONTROL: the base\'s bare (max-width: 768px) block is not the class\'s list');
  const libs = fs.readdirSync(path.join(REPO, 'src/lib')).filter((x) => x.endsWith('.js'));
  const strays = libs.filter((x) => /matchMedia\(\s*'\(max-width: 768px\)'/.test(read('src/lib/' + x)) || /innerWidth\s*<=\s*768/.test(read('src/lib/' + x)));
  ok(strays.length === 0, `no matchMedia / innerWidth spells the 768 line by hand in src/lib (${libs.length} files) — VC_PHONE_MEDIA / app.isMobile`, strays);
  ok(V.VC_COARSE_REGULAR_MIN === 640 && V.VC_COARSE_DESKTOP_MIN === 1024 && V.VC_COARSE_REGULAR_MIN < V.VC_FINE_DESKTOP_MIN && V.VC_FINE_DESKTOP_MIN < V.VC_COARSE_DESKTOP_MIN,
    'SPEC-v3 §1.2\'s three lines are named once here: 640 (coarse regular) < 769 (fine desktop) < 1024 (coarse desktop)');
  ok(V.VC_SETTLE_MS === 120 && V.VIEWPORT_CLASSES.join() === 'compact,regular,desktop', 'a crossing settles 120 ms (SPEC-v3 §1.2); the classes: compact, regular, desktop');
}

console.log('③ switchVerdict');
{
  ok(V.switchVerdict('desktop', 'desktop').act === 'none' && V.switchVerdict('compact', null).act === 'none', 'the same class (or no answer): nothing');
  const f = V.switchVerdict('desktop', 'compact'), u = V.switchVerdict('compact', 'desktop');
  ok(f.act === 'tier' && f.phone === true && u.act === 'tier' && u.phone === false, 'a fold across the line: the tier switch to the phone; an unfold: back to the window manager', [f, u]);
  const c = V.switchVerdict('regular', 'compact'), r = V.switchVerdict('compact', 'regular');
  ok(c.act === 'restyle' && r.act === 'restyle' && c.phone && r.phone, 'the Duo\'s own fold (regular ⇄ compact): a restyle — the same phone pieces, another arrangement', [c, r]);
}

console.log('④ wiring pins');
{
  const app = read('src/lib/app.js'), sw = read('src/lib/viewport-switch.js'), win = read('src/lib/window.js'), sb = read('src/lib/sidebar.js'), rail = read('src/lib/sidebar-rail.js');
  const frozen = (src) => /this\.isMobile\s*=\s*window\.matchMedia\(/.test(src);
  ok(!frozen(app) && /this\._vc = readViewportClass\(\);\s*\n\s*this\.isMobile = isPhoneClass\(this\._vc\);/.test(app), 'app.isMobile is the class\'s answer at boot — never a frozen matchMedia');
  ok(frozen(`    this.isMobile = window.matchMedia('(max-width: 768px)').matches;`), 'RED CONTROL: the base\'s frozen boot-time line is caught by the pin');
  ok(/this\._viewportSwitch = installViewportSwitch\(this\);/.test(app) && /viewportClass\(\) \{ return this\._vc; \}/.test(app), 'the App installs the switch and answers viewportClass()');
  ok(/for \(const q of VC_WATCH_QUERIES\)/.test(sw) && /setTimeout\(settle, VC_SETTLE_MS\)/.test(sw) && /addEventListener\('resize', kick\)/.test(sw), 'the switch watches every query + resize and settles VC_SETTLE_MS before it acts');
  ok(/switchVerdict\(prev, next\)/.test(sw) && /app\.isMobile = isPhoneClass\(next\)/.test(sw) && /dataset\.vc = next/.test(sw), 'a switch moves app.isMobile and <html data-vc> together, by switchVerdict');
  ok(/app\.sidebar\?\.setPhoneMode\?\.\(true\)/.test(sw) && /app\.sidebar\?\.setPhoneMode\?\.\(false\)/.test(sw) && /app\.wm\?\.refitForViewport\?\.\(true\)/.test(sw) && /app\.wm\?\.refitForViewport\?\.\(false\)/.test(sw), 'both ways: the sidebar mode and the windows\' refit');
  ok(/new MobileNav\(app\)/.test(sw) && /installMobileBack\(app\)/.test(sw) && /installSessionPalette\(app\)/.test(sw), 'what only a boot built is built at the first crossing (the nav, the back gesture, the palette)');
  ok(/refitForViewport\(phone\) \{/.test(win) && /this\._focusMostRecent\(\)/.test(win.slice(win.indexOf('refitForViewport(phone) {'))) && /w\.onResize\(\)/.test(win.slice(win.indexOf('refitForViewport(phone) {'), win.indexOf('_scheduleReflowWindows() {'))), 'the window manager refits: the phone shows one window, every view re-measures');
  ok(/setPhoneMode\(phone\) \{[\s\S]{0,400}this\._removeRail\?\.\(\); else this\._railInit\?\.\(\);/.test(sb), 'the sidebar removes the rail on the phone and builds it on the desktop');
  ok(/classList\.remove\('rail-on', 'rail-collapsed', 'rail-labelled'\)/.test(rail) && /if \(!this\._railApplySetting\)/.test(rail), 'the rail leaves with its words (B-f5ec: the labelled strip stayed on the cover); its setting listeners are wired once');
  ok(/app\.sidebar\?\.setRegularMode\?\.\(next === 'regular'\)/.test(sw) && /if \(app\._vc === 'regular'\) \{ try \{ app\.sidebar\?\.setRegularMode\?\.\(true\)/.test(sw), 'slice 2: the list column\'s mode follows every switch AND a page born regular');
  ok(/if \(this\._regularMode\) \{ if \(force === true\) this\.setListHidden\(false\); return; \}/.test(sb), 'slice 2: in the regular class the phone\'s «close the drawer» never closes the list column (only an explicit show shows a hidden one)');
  const bar = read('src/lib/trailing-bar.js');
  ok(['Task Groups', 'Files', 'Channels', 'Agent browser', 'Background Work'].every((l) => bar.includes(`label: '${l}'`)) && (bar.match(/\{ id: '[a-z]+', label:/g) || []).length === 5, 'slice 2b: the trailing bar\'s bottom section = the owner\'s five global destinations, in this order, then ⚙');
  const ci = read('src/lib/chat-input.js'), door = ci.slice(ci.indexOf('  focus() {'), ci.indexOf('  focus() {') + 900);
  ok(/if \(keyboardOwned\(\)\) return;[\s\S]*if \(isTouchDevice\(\)\) return;\s*\n\s*if \(this\._textarea\) this\._textarea\.focus\(\);/.test(door), 'slice 1: the composer\'s focus door stands down on a touch screen (no keyboard on load) — before it focuses the box');
}

console.log('⑤ the system\'s edges (B-78db, 主开发 r3933): cover for the home-screen copy, the Duo\'s side column, every edge its inset');
{
  const { pathToFileURL } = await import('node:url');
  const SC = await import(pathToFileURL(path.join(REPO, 'src/lib/side-column.js')).href);
  const fake = (standalone, mq = false, content = 'width=device-width, initial-scale=1.0') => {
    const meta = { c: content, getAttribute() { return this.c; }, setAttribute(k, v) { this.c = v; } };
    const doc = { documentElement: { dataset: {} }, querySelector: (q) => (q === 'meta[name="viewport"]' ? meta : null) };
    const win = { navigator: { standalone }, matchMedia: () => ({ matches: mq }) };
    return { meta, doc, win };
  };
  const tab = fake(false), home = fake(true), homeMq = fake(undefined, true), again = fake(true, false, 'width=device-width, viewport-fit=cover');
  const r = [SC.coverIfStandalone(tab.doc, tab.win), SC.coverIfStandalone(home.doc, home.win), SC.coverIfStandalone(homeMq.doc, homeMq.win), SC.coverIfStandalone(again.doc, again.win)];
  ok(!r[0] && tab.meta.c === 'width=device-width, initial-scale=1.0' && r[1] && /, viewport-fit=cover$/.test(home.meta.c) && home.doc.documentElement.dataset.standalone === '1' && r[2] && /viewport-fit=cover/.test(homeMq.meta.c) && r[3] && again.meta.c.split('viewport-fit').length === 2,
    '⑤ viewport-fit=cover is set for the HOME-SCREEN copy only (navigator.standalone, or display-mode standalone) — a Safari tab keeps «contain»; set once', { tab: tab.meta.c, home: home.meta.c, mq: homeMq.meta.c, again: again.meta.c });
  const cols = [[{ left: 0, right: 84 }, 'right', 'the Duo, either display (the simulator: right 84, left 0)'], [{ left: 0, right: 80 }, 'right', 'the floor of the heuristic'],
    [{ left: 59, right: 59 }, null, 'a notched iPhone held landscape (the same inset on both sides)'], [{ left: 0, right: 59 }, null, 'a sensor housing on one side, under 80'], [{ left: 0, right: 0 }, null, 'a Safari tab / no inset'], [{ left: 84, right: 84 }, null, 'insets on both sides']];
  const bad = cols.filter(([i, want]) => SC.sideColumnOf(i) !== want);
  ok(bad.length === 0, `⑤ the side column by its insets (a heuristic, named as one: a trailing inset ≥ ${SC.SIDE_COLUMN_MIN} with no leading inset) — ${cols.map(([, w, why]) => `${why} → ${w || 'the safe default'}`).join('; ')}`, bad);
  const CSS = read('public/style.css');
  const edgesOk = (css) => {
    const i = css.indexOf('THE SYSTEM\'s EDGES (B-78db');
    const block = i < 0 ? '' : css.slice(i);
    return {
      compact: /html\[data-vc="compact"\] #main-wrapper \{ margin-left: env\(safe-area-inset-left, 0px\) !important; margin-right: env\(safe-area-inset-right, 0px\) !important; \}/.test(block)
        && /html\[data-vc="compact"\] #mobile-nav \{ padding-top: env\(safe-area-inset-top, 0px\); \}/.test(block),
      sheets: ['.context-menu.mobile-sheet', '.ns-tg-menu.ns-tg-sheet', '.desktop-picker.desktop-picker-sheet', '.bprof-pk-sheet', '.usage-popup', '.global-settings-popover'].every((s) => block.includes(`html[data-vc="compact"] ${s}`)),
      safeDefault: /html\[data-vc="regular"\] #mobile-nav \{ width: calc\(56px \+ env\(safe-area-inset-right, 0px\)\); padding-right: calc\(6px \+ env\(safe-area-inset-right, 0px\)\); \}/.test(block)
        && /html\[data-vc="regular"\] #main-wrapper \{ margin-right: calc\(56px \+ env\(safe-area-inset-right, 0px\)\) !important; \}/.test(block),
      column: /html\[data-vc="regular"\]\[data-sidecol\] #mobile-nav \{ width: max\(56px, env\(safe-area-inset-right, 0px\)\); padding-right: 6px; padding-top: var\(--sidecol-top, 112px\); \}/.test(block)
        && /html\[data-vc="regular"\]\[data-sidecol\] #main-wrapper \{ margin-right: max\(56px, env\(safe-area-inset-right, 0px\)\) !important; \}/.test(block),
      listFoot: /html\[data-vc="regular"\] \.sidebar \{ padding-bottom: env\(safe-area-inset-bottom, 0px\); \}/.test(block),
      last: i > 0 && !/\n[^\n]*#mobile-nav[^\n]*\{[^}]*\bwidth:\s*56px/.test(block),   // the block stands LAST: nothing after it puts the bar back at 56 px
    };
  };
  const E = edgesOk(CSS);
  ok(Object.values(E).every(Boolean), '⑤ every edge takes its inset: the compact content and top bar, the list overlay and the six full-width sheets clear of the side insets; the trailing bar\'s safe default (its ground into the inset, its buttons clear); on the Duo\'s column the bar INSIDE it, as wide as it, its buttons from 112 px (76 measured + 36 for a Live Activity); the list column\'s foot clear of the home indicator', E);
  const R = edgesOk(CSS.slice(0, CSS.indexOf('\n/* ── THE SYSTEM\'s EDGES (B-78db')));
  ok(!R.safeDefault && !R.column && !R.compact, '⑤ RED CONTROL: the release\'s stylesheet (the trailing bar at right 0, 56 px, no inset) is caught — under cover its buttons would stand inside the system\'s column', R);
  const CLIENT = read('src/client.js');
  ok(/try \{ installSideColumn\(\); \} catch \{ \}/.test(CLIENT) && CLIENT.indexOf('installSideColumn();') < CLIENT.indexOf('const exitHop = continueExit();') && !/viewport-fit/.test(read('public/index.html')),
    '⑤ the client sets cover and reads the column BEFORE the app lays out (src/client.js, at the top); public/index.html carries no viewport-fit (a Safari tab stays «contain»)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
