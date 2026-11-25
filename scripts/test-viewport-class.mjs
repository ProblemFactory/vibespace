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
//   ⑤b THE COLUMN (B-78db slice 1b): global things only, the conversation's at the bottom; the law — it never overflows — at the
//     simulator's real column heights; RED CONTROLS: the release's eleven overflow, the slice-1 stylesheet, a bar without the law's call
//   ⑤c THE FOUR EDGES, EVERY iPHONE SHAPE (B-78db slice 2): the audit's cures pinned, the audit's table in kb-features; RED CONTROL:
//     the stylesheets before the block
//   ⑤e THE SIMULATOR'S FAULTS (r4463): the launch's ground from one cookie the index route writes; the home-screen copy's chrome in ONE
//     fixed container; RED CONTROLS: 26d571cdb's route and stylesheet
//   ⑤d THE LAUNCH FOR EVERY THEME (line 914's cure): the default status bar style; the inline ground goes with the splash;
//     RED CONTROLS: 17c6dd081's meta and its client
//   ⑤f THE LAUNCH IMAGE (主开发 r4481): src/launch-image.js's PNGs read back by the suite's own reader (every CRC, every pixel the
//     colour), its sizes, hostile colours, the links in ONE colour, the route and the index route's wiring; RED CONTROLS: a bad
//     chunk, a wrong colour, effa5382a's route
//   ⑤g THE SYSTEM's COLUMN ON THE LEFT (主开发 r4481 — the outer display held landscape): the bar moves into it, the list column and
//     the conversation after it, ☰ / the For-you tray / the head's ✕ and ⋯ follow; a long press's tip on the conversation's side;
//     RED CONTROL: effa5382a's stylesheet (no column on the left)
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
  ok(!r[0] && tab.meta.c === 'width=device-width, initial-scale=1.0' && r[1] && /, viewport-fit=cover$/.test(home.meta.c) && home.doc.documentElement.dataset.standalone === '1' && !r[2] && homeMq.meta.c === 'width=device-width, initial-scale=1.0' && r[3] && again.meta.c.split('viewport-fit').length === 2,
    '⑤ viewport-fit=cover is set for an iPHONE\'s or iPAD\'s HOME-SCREEN copy only (navigator.standalone — 主开发 r4115: an Android or a desktop installed copy, display-mode standalone, stays as at the release) — a Safari tab keeps «contain»; set once', { tab: tab.meta.c, home: home.meta.c, mq: homeMq.meta.c, again: again.meta.c });
  const cols = [[{ left: 0, right: 84 }, 'right', 'the Duo, either display (the simulator: right 84, left 0)'], [{ left: 0, right: 80 }, 'right', 'the floor of the heuristic'], [{ left: 0, right: 79 }, null, 'one under the floor (r4115 (e): the edge)'],
    [{ left: 59, right: 59 }, null, 'a notched iPhone held landscape (the same inset on both sides)'], [{ left: 0, right: 59 }, null, 'a sensor housing on one side, under 80'], [{ left: 0, right: 0 }, null, 'a Safari tab / no inset'], [{ left: 84, right: 84 }, null, 'insets on both sides'],
    [{ left: 84, right: 0 }, 'left', 'the outer display held landscape (主开发 r4481: left 84, right 0)'], [{ left: 80, right: 0 }, 'left', 'the floor, on the left'], [{ left: 79, right: 0 }, null, 'one under the floor, on the left'], [{ left: 59, right: 0 }, null, 'a sensor housing on the left, under 80']];
  const bad = cols.filter(([i, want]) => SC.sideColumnOf(i) !== want);
  ok(bad.length === 0, `⑤ the side column by its insets (a heuristic, named as one: an inset ≥ ${SC.SIDE_COLUMN_MIN} on ONE side with none on the other, its side the verdict) — ${cols.map(([, w, why]) => `${why} → ${w || 'the safe default'}`).join('; ')}`, bad);
  const CSS = read('public/style.css');
  const edgesOk = (css) => {
    const i = css.indexOf('THE SYSTEM\'s EDGES (B-78db');
    const block = i < 0 ? '' : css.slice(i);
    return {
      compact: /html\[data-vc="compact"\] #main-wrapper \{ margin-left: env\(safe-area-inset-left, 0px\) !important; margin-right: env\(safe-area-inset-right, 0px\) !important; \}/.test(block)
        && /html\[data-vc="compact"\] #mobile-nav \{ height: calc\(44px \+ env\(safe-area-inset-top, 0px\)\); padding-top: env\(safe-area-inset-top, 0px\); \}/.test(block),
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

console.log('⑤b the column holds global things only, and never overflows (B-78db slice 1b, 主开发 r3948 3 (a) / r3949)');
{
  const { pathToFileURL } = await import('node:url');
  const SC = await import(pathToFileURL(path.join(REPO, 'src/lib/side-column.js')).href);
  // THE LAW at the simulator's real columns (int359/duo-probe/RESULT.md): inner 648 tall, outer 657, bottom inset 34 on both; the
  // top room COLUMN_TOP (inner 76 + 36, outer 130 + 36); every button 44, the gap between two 6, the gap element at its least 8
  const col = (shape, extra = []) => [...SC.COLUMN_BUTTONS[shape].slice(0, -1), ...extra].map((key) => ({ key, px: 44 })).concat([{ key: 'gap', px: 8 }, { key: 'gear', px: 44 }]);
  const roomOf = (h, shape) => h - SC.COLUMN_TOP[shape] - 34;
  const inner = SC.columnFit({ room: roomOf(648, 'inner'), items: col('inner'), gap: 6, yields: SC.COLUMN_YIELDS.inner });
  const outer = SC.columnFit({ room: roomOf(657, 'outer'), items: col('outer'), gap: 6, yields: SC.COLUMN_YIELDS.outer });
  ok(inner.fits && !inner.yielded.length && inner.need === 308 && outer.fits && !outer.yielded.length && outer.need === 408,
    `⑤b at the real columns every default button stands: inner ${inner.need} of ${roomOf(648, 'inner')} px (For you · Task Groups · Files · Channels · Desktops · ⚙), outer ${outer.need} of ${roomOf(657, 'outer')} px (☰ · For you · + · Task Groups · Files · Channels · Desktops · ⚙)`, { inner, outer });
  // RED CONTROL: the release's column — the owner's picture (11 buttons, ⚙ cut at the bottom) — overflows the same room; the law yields
  const release = col('inner', ['artifacts', 'more', 'browser', 'jobs', 'search']);
  const rel = SC.columnFit({ room: roomOf(648, 'inner'), items: release, gap: 6, yields: [] });
  const relLaw = SC.columnFit({ room: roomOf(648, 'inner'), items: release, gap: 6, yields: SC.COLUMN_YIELDS.inner });
  ok(!rel.fits && rel.need === 558 && roomOf(648, 'inner') === 502 && relLaw.fits && relLaw.yielded.join() === 'desktops,channels',
    `⑤b RED CONTROL: the release's eleven at the inner column need ${rel.need} px of ${roomOf(648, 'inner')} — the overflow the owner saw (⚙ cut); the law alone would take ${relLaw.yielded.join(' · ')} out and keep the conversation's five — r3949 takes THOSE out instead`, { rel, relLaw });
  // a zoomed page / a short column: the stated order, the fewest yields
  const z = SC.columnFit({ room: 300, items: col('outer'), gap: 6, yields: SC.COLUMN_YIELDS.outer });
  const z2 = SC.columnFit({ room: 210, items: col('inner'), gap: 6, yields: SC.COLUMN_YIELDS.inner });
  ok(z.fits && z.yielded.join() === 'desktops,channels,files' && z.need === 258 && z2.fits && z2.yielded.join() === 'desktops,channels' && z2.need === 208,
    `⑤b a short column yields in the stated order, the fewest that fit: outer at 300 px → ${z.yielded.join(' · ')} (${z.need}); inner at 210 px → ${z2.yielded.join(' · ')} (${z2.need})`, { z, z2 });
  const floor = SC.columnFit({ room: 58, items: col('outer'), gap: 6, yields: SC.COLUMN_YIELDS.outer }), under = SC.columnFit({ room: 57, items: col('outer'), gap: 6, yields: SC.COLUMN_YIELDS.outer });
  ok(floor.fits && floor.shown.join() === 'gap,gear' && !under.fits && under.shown.join() === 'gap,gear', '⑤b ⚙ never yields (every other row is reached through it): its floor is 58 px (⚙ 44 + the gap 8 + 6) — below it the verdict says «does not fit», never a lie', { floor, under });
  const ys = [...SC.COLUMN_YIELDS.inner, ...SC.COLUMN_YIELDS.outer, ...SC.COLUMN_YIELDS.bar];   // r4185: the bar's yields need their rows too
  ok(!ys.includes('gear') && ['inner', 'outer'].every((k) => SC.COLUMN_BUTTONS[k].at(-1) === 'gear' && SC.COLUMN_YIELDS[k].every((y) => SC.COLUMN_BUTTONS[k].includes(y)) && SC.COLUMN_BUTTONS[k].slice(0, -1).every((b) => SC.COLUMN_YIELDS[k].includes(b))),
    '⑤b the order is total: every column button but ⚙ is named in its display\'s yield order, ⚙ last and never yielding', SC.COLUMN_YIELDS);
  // r4185 (for «.420»): THE BAR's OWN YIELD — the regular class's trailing bar held landscape with NO column. At 844×390 (the
  // bottom inset 21) and 667×375 (none) its room is 361 / 359 px; with a chat on show its doors are Artifacts · search · ⋯ | gap |
  // Desktops · For you · Task Groups · Files · Channels · Agent browser · Background Work · ⚙ (558 px — the release's overflow)
  const barItems = ['artifacts', 'search', 'more'].map((key) => ({ key, px: 44 })).concat([{ key: 'gap', px: 8 }],
    ['desktops', 'todos', 'tasks', 'files', 'channels', 'browser', 'jobs', 'gear'].map((key) => ({ key, px: 44 })));
  const b390 = SC.columnFit({ room: 390 - 8 - 21, items: barItems, gap: 6, yields: SC.COLUMN_YIELDS.bar });
  const b375 = SC.columnFit({ room: 375 - 16, items: barItems, gap: 6, yields: SC.COLUMN_YIELDS.bar });
  const bRel = SC.columnFit({ room: 361, items: barItems, gap: 6, yields: [] });
  ok(b390.fits && b390.yielded.join() === 'jobs,browser,desktops,channels' && b390.need === 358 && b375.fits && b375.yielded.join() === b390.yielded.join()
    && !bRel.fits && bRel.need === 558 && !SC.COLUMN_YIELDS.bar.some((k) => ['artifacts', 'search', 'more', 'live', 'close', 'gear'].includes(k)),
    `⑤b the bar's own yield (r4185): at 844×390 and 667×375 it yields ${b390.yielded.join(' · ')} (${b390.need} of 361 / 359 px); never a conversation door, never ⚙ — RED CONTROL: the release's bar needs ${bRel.need}`, { b390, b375, bRel });
  const doc = (vc, sidecol) => ({ documentElement: { dataset: { vc, ...(sidecol ? { sidecol } : {}) } } });
  const win = (land) => ({ matchMedia: () => ({ matches: land }) });
  const shapes = [SC.columnShape(doc('compact', 'right'), win(false)), SC.columnShape(doc('regular', 'right'), win(true)), SC.columnShape(doc('regular', 'right'), win(false)), SC.columnShape(doc('regular'), win(true)), SC.columnShape(doc('compact'), win(false)), SC.columnShape(doc('desktop', 'right'), win(true))];
  ok(shapes.join() === 'outer,inner,,,,', '⑤b the column\'s shape: the outer display (compact + the column), the inner held landscape (regular + the column); a portrait regular page, no column, a desktop: none', shapes);
  const yShapes = [SC.yieldShape(doc('regular'), win(true)), SC.yieldShape(doc('regular', 'right'), win(true)), SC.yieldShape(doc('regular'), win(false)), SC.yieldShape(doc('compact'), win(true)), SC.yieldShape(doc('desktop'), win(true))];
  ok(yShapes.join() === 'bar,inner,,,', '⑤b where the law runs: the regular class held landscape with no column is the BAR; the column keeps its own shape; a portrait page, a compact page with no column, a desktop: nowhere', yShapes);

  const CSS = read('public/style.css'), i = CSS.indexOf('THE COLUMN HOLDS GLOBAL THINGS ONLY, AND NEVER OVERFLOWS'), B = i < 0 ? '' : CSS.slice(i);
  const outIn = /html\[data-vc="regular"\]\[data-sidecol\] #mobile-nav :is\(#mobile-nav-artifacts, #mobile-nav-live, #mobile-nav-search, #mobile-nav-dest-browser, #mobile-nav-dest-jobs\) \{ display: none !important; \}/.test(B);
  const outOut = /html\[data-vc="compact"\]\[data-sidecol\] #mobile-nav :is\(#mobile-nav-title, #mobile-nav-state, #mobile-nav-search, #mobile-nav-close, #mobile-nav-overflow, #mobile-nav-usage, #mobile-nav-vault, #mobile-nav-artifacts, #mobile-nav-live, #mobile-nav-dest-browser, #mobile-nav-dest-jobs\) \{ display: none !important; \}/.test(B);
  const head = ['regular', 'compact'].every((vc) => B.includes(`html[data-vc="${vc}"][data-sidecol][data-onshow="chat"] #mobile-nav #mobile-nav-more { display: none !important; }`) && B.includes(`html[data-vc="${vc}"][data-sidecol] #mobile-nav :is(#mobile-nav-viewer-close, #mobile-nav-more).on {`));
  ok(outIn && outOut && head, '⑤b OUT of the column on both displays: Artifacts, the live view, this conversation\'s search, Agent browser, Background Work (and on the outer the name row\'s controls, the width-fold ⋯, Usage, the lock); a chat\'s ⋯ is its strip\'s; a viewer\'s ✕ and a terminal\'s ⋯ stand at the head\'s end', { outIn, outOut, head });
  const innerOrder = ['#mobile-nav-todos', '#mobile-nav-dest-tasks', '#mobile-nav-files', '#mobile-nav-dest-channels', '#mobile-nav-desktops'].map((id, k) => new RegExp(`html\\[data-vc="regular"\\]\\[data-sidecol\\] (#mobile-nav )?${id} \\{ order: ${11 + k}; \\}`).test(B)).every(Boolean);
  const outerOrder = ['#mobile-nav-menu', '#mobile-nav-todos', '#mobile-nav-new', '#mobile-nav-dest-tasks', '#mobile-nav-files', '#mobile-nav-dest-channels', '#mobile-nav-desktops'].map((id, k) => new RegExp(`html\\[data-vc="compact"\\]\\[data-sidecol\\] (#mobile-nav )?${id} \\{ order: ${1 + k}[;]`).test(B)).every(Boolean);
  ok(innerOrder && outerOrder && /html\[data-vc="compact"\]\[data-sidecol\] #mobile-nav-gear \{ order: 20; \}/.test(B) && /html\[data-vc="regular"\]\[data-sidecol\] #mobile-nav \.mnav-gap \{ order: 19; \}/.test(B),
    '⑤b IN the column, in COLUMN_BUTTONS\' order: inner For you · Task Groups · Files · Channels · Desktops · ⚙ last; outer ☰ · For you · + · Task Groups · Files · Channels · Desktops · ⚙ last', { innerOrder, outerOrder });
  const tops = new RegExp(`padding: var\\(--sidecol-top, ${SC.COLUMN_TOP.outer}px\\) 0 max\\(8px, env\\(safe-area-inset-bottom, 0px\\)\\) !important;`).test(B) && CSS.includes(`padding-top: var(--sidecol-top, ${SC.COLUMN_TOP.inner}px);`);
  ok(tops && /html\[data-vc="compact"\]\[data-sidecol\] #mobile-nav \{\s*position: fixed !important; top: 0; right: 0; bottom: 0; left: auto; width: max\(56px, env\(safe-area-inset-right, 0px\)\);[^}]*flex-direction: column;/.test(B) && /html\[data-vc\] #mobile-nav > :is\(#mobile-nav-menu, #mobile-nav-todos, #mobile-nav-new, #mobile-nav-files, #mobile-nav-desktops, \.mnav-dest\)\.col-yield \{ display: none !important; \}/.test(B)
    && /html\[data-vc="compact"\]\[data-sidecol\] \.window\.window-active > \.window-titlebar \{\s*display: flex !important;/.test(B),
    `⑤b the outer column: the bar fixed in the column under its top room (${SC.COLUMN_TOP.outer} — the module's number, the inner ${SC.COLUMN_TOP.inner} too), the bottom inset counted, a yielded button hidden, the window's own head the name's row`);
  // r4185: a yielded For you must HIDE — the hide rule outranks the regular class's For-you rule (two ids, !important); the old
  // class-only rule did not (line 914's latent miss). Specificity of these simple forms, :is() as its heaviest argument
  const spec = (sel) => { let ids = 0, cls = 0, typ = 0; const one = (x) => { ids += (x.match(/#[\w-]+/g) || []).length; cls += (x.match(/\.[\w-]+|\[[^\]]+\]|:(?!is\()[\w-]+/g) || []).length; typ += (x.match(/(^|[\s>])[a-z]+(?=[\[.#:\s]|$)/g) || []).length; };
    const isArgs = sel.match(/:is\(([^)]*)\)/); const rest = sel.replace(/:is\([^)]*\)/, ''); one(rest);
    if (isArgs) { const best = isArgs[1].split(',').map((a) => a.trim()).map((a) => [(a.match(/#/g) || []).length, (a.match(/[.[]/g) || []).length]).sort((p, q) => q[0] - p[0] || q[1] - p[1])[0]; ids += best[0]; cls += best[1]; }
    return [ids, cls, typ]; };
  const beats = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
  const FORYOU = 'html[data-vc="regular"] #mobile-nav #mobile-nav-todos', HIDE = 'html[data-vc] #mobile-nav > :is(#mobile-nav-menu, #mobile-nav-todos, #mobile-nav-new, #mobile-nav-files, #mobile-nav-desktops, .mnav-dest).col-yield', OLDHIDE = 'html[data-sidecol] #mobile-nav > .col-yield';  // stale-pins: kept — OLDHIDE is a red control's form: line 914's class-only rule
  ok(CSS.includes(FORYOU + ' {') && CSS.includes(HIDE + ' { display: none !important; }') && beats(spec(HIDE), spec(FORYOU)) && !beats(spec(OLDHIDE), spec(FORYOU)),
    `⑤b a yielded For you HIDES: the hide rule ${JSON.stringify(spec(HIDE))} outranks the regular class's For-you rule ${JSON.stringify(spec(FORYOU))} — RED CONTROL: line 914's class-only rule ${JSON.stringify(spec(OLDHIDE))} lost to it`);
  const R = CSS.slice(0, i);
  ok(i > 0 && !/data-sidecol\] #mobile-nav :is\(#mobile-nav-artifacts/.test(R) && !/col-yield/.test(R), '⑤b RED CONTROL: the stylesheet before this block (slice 1) keeps the conversation\'s buttons in the column and knows no yield');

  const BAR = read('src/lib/trailing-bar.js'), MN = read('src/lib/mobile-nav.js'), CSB = read('src/lib/chat-status-bar.js');
  const rows = (BAR.match(/for \(const \[i, k\] of \[([^\]]+)\]\.entries\(\)\) \{\s*\n\s*registerMenuItem\(\{ menu: 'gear', group: '0_column'/) || [])[1] || '';
  const rowKeys = rows.split(',').map((x) => x.trim().replace(/'/g, ''));
  ok(ys.every((k) => rowKeys.includes(k)) && /when: \(\) => COLUMN_YIELDED\.has\(k\)/.test(BAR) && /run: \(\) => document\.getElementById\(COLUMN_EL\[k\]\)\?\.click\(\)/.test(BAR),
    `⑤b every button that may yield has its row of Global settings, shown only while it is out of the column, its press the button's own (${rowKeys.join(' · ')})`, rowKeys);
  const updateOf = (bar) => { const a = bar.indexOf('  function update() {'), b = bar.indexOf('\n  update();', a); return a > 0 && b > a ? bar.slice(a, b) : ''; };
  const fitWired = (bar) => updateOf(bar).includes('\n    fitColumn(nav);\n') && /new ResizeObserver\(\(\) => fitColumn\(nav\)\)\.observe\(nav\)/.test(bar);
  ok(fitWired(BAR) && /this\.bar\?\.fitColumn\?\.\(\);/.test(MN) && !fitWired(BAR.replace('\n    fitColumn(nav);\n', '\n')),
    '⑤b the law runs at every update of the bar, at every size of the column and after every pass of the bar\'s buttons (RED CONTROL: a bar without the update\'s call is caught)');
  ok(/this\.app\.viewportClass\?\.\(\) === 'compact' && !columnShape\(\) && nav\.getClientRects\(\)\.length\) \{/.test(MN) && /const v = nb > 0 && !columnShape\(\) \?/.test(MN) && /if \(columnShape\(\) !== 'outer'\) return;\s*\n\s*if \(pressedAside\) \{ pressedAside = false; return; \}[^\n]*\n\s*const head = e\.target\.closest\?\.\('\.window\.window-active > \.window-titlebar'\);/.test(MN),
    '⑤b the outer column: no width fold of the compact bar there (its law is the height\'s), no sheet top from a bar that is no top row, the head\'s tap opens the switcher');
  const door = CSB.slice(CSB.indexOf("const setEl = e.target.closest('.chat-status-settings');"), CSB.indexOf('// ── the doors end ──'));
  ok(/const mineWin = columnShape\(\) \?/.test(door) && /act\('chat-status-col-search', t\('Search this conversation'\), \(\) => view\._search\.open\(\)\)/.test(door) && /if \(held\) act\('chat-status-col-window', t\('This window'\), \(\) => this\._app\?\._mobileNav\?\.bar\?\.windowMenuAt\?\.\(held\.id, setEl\)\)/.test(door) && /held = this\._app\?\.wm\?\.windows\?\.get\?\.\(mineWin\[0\]\);/.test(door) && /windowMenuAt, fitColumn/.test(BAR),
    '⑤b AT THE BOTTOM: in the column, the strip\'s «Conversation settings» door ends with this conversation\'s search and its window\'s menu (opened above the door)');
  ok(/const navR = nav && typeof nav\.getClientRects === 'function' && nav\.getClientRects\(\)\.length && nav\.getBoundingClientRect\(\)\.width >= nav\.getBoundingClientRect\(\)\.height \? nav\.getBoundingClientRect\(\) : null;/.test(CSB),
    '⑤b the strip\'s panels take their room under a TOP bar only — a vertical bar (the column; the trailing bar) is no ceiling (test-duo-layout ④b found the door\'s last rows under a 120 px panel\'s fold)');
  ok(/if \(held && columnShape\(\) === 'outer' && this\._app\?\.wm\) act\('chat-status-col-close', t\('Close window'\), \(\) => this\._app\.wm\.requestClose\(held\.id\)\);/.test(CSB)
    && /if \(columnShape\(\) !== 'outer'\) return;\n      if \(pressedAside\) \{ pressedAside = false; return; \}/.test(MN),
    '⑤b the outer display: the window on show closes from its own «Close window» row (two presses, the compact ✕\'s act); its head\'s tap after a press that only chose a pane opens nothing more');
}

console.log('⑤c the four edges, every iPhone shape (B-78db slice 2 — the audit of the 32 edge-pinned rules)');
{
  const CSS = read('public/style.css'), CHAT = read('public/chat.css');
  const i = CSS.indexOf('THE FOUR EDGES, EVERY iPHONE SHAPE (B-78db slice 2'), j = CHAT.indexOf('THE FOUR EDGES (B-78db slice 2');
  const edges4 = (css, chat) => {
    const B = css.slice(css.indexOf('THE FOUR EDGES, EVERY iPHONE SHAPE')), C = chat.slice(chat.indexOf('THE FOUR EDGES (B-78db slice 2'));
    const pad4 = 'padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);';
    return {
      layers: css.includes('THE FOUR EDGES, EVERY iPHONE SHAPE') && B.includes(`.dialog-overlay, #welcome.onboarding, .palette-overlay { box-sizing: border-box; ${pad4} }`) && B.includes('.dialog-overlay > .dialog { max-width: 100% !important; }')
        && B.includes('.dialog-overlay > .dialog:is(.pf-picker, .desktop-adopt) { height: 100% !important; max-height: 100% !important; }') && B.includes('.palette { max-width: 100%; }'),
      list: /html\[data-vc="regular"\] \.sidebar \{ padding-top: env\(safe-area-inset-top, 0px\); padding-left: env\(safe-area-inset-left, 0px\); \}/.test(B) && /html\[data-vc="regular"\] #list-column-toggle \{ top: env\(safe-area-inset-top, 0px\); \}/.test(B)
        && /html:not\(\[data-fold="book"\]\)\[data-vc="regular"\]\[data-standalone\]\.vs-list-hidden #main-wrapper \{ margin-left: env\(safe-area-inset-left, 0px\) !important; \}/.test(B)
        && !/html\[data-vc="regular"\]\.vs-list-hidden #main-wrapper \{ margin-left: env\(/.test(B),   // stale-pins: kept — a deliberate absence: f4499e926's unscoped form outranked the book pose's margin
      bars: /html\[data-vc="regular"\]:not\(\[data-sidecol\]\) #mobile-nav \{ padding-top: max\(8px, env\(safe-area-inset-top, 0px\)\); \}/.test(B) && /html\[data-vc="regular"\] #mobile-nav \{ height: calc\(44px \+ env\(safe-area-inset-top, 0px\)\); padding-top: env\(safe-area-inset-top, 0px\); \}/.test(B)
        && /html\[data-vc="regular"\]\[data-fold="laptop"\] #mobile-nav \{ padding-right: calc\(6px \+ env\(safe-area-inset-right, 0px\)\); \}/.test(B),
      chat: chat.includes('THE FOUR EDGES (B-78db slice 2') && C.includes(`.chat-img-overlay { box-sizing: border-box; ${pad4} }`) && /\.voice-preview-back \{ padding: calc\(12px \+ env\(safe-area-inset-top, 0px\)\)/.test(C)
        && /\.chat-status-dropdown\.chat-artifacts-panel \{ padding-left: env\(safe-area-inset-left, 0px\); padding-right: env\(safe-area-inset-right, 0px\); \}/.test(C),
      last: !/\n[^\n]*#mobile-nav[^\n]*\{[^}]*\bpadding-top:\s*8px/.test(B),
    };
  };
  const E = edges4(CSS, CHAT);
  ok(i > 0 && j > 0 && Object.values(E).every(Boolean), '⑤c every iPhone shape\'s edges: the full-screen layers (dialogs, the tour, the palette, a picture, the voice preview, the Artifacts sheet) inside the four insets; the regular class\'s list column and its ☰ clear of a top and a leading inset; the trailing bar under a top inset, the portrait top bar under a status bar, the laptop bar clear of a trailing inset', E);
  const R = edges4(CSS.slice(0, i), CHAT.slice(0, j));
  ok(!R.layers && !R.list && !R.bars && !R.chat, '⑤c RED CONTROL: the stylesheets before the block (slice 1b) leave a notched iPhone\'s dialogs, list column and top bars under its status bar and sensor housing', R);
  // r4115 (the round's should: a cut at the marker is red by construction): each rule's own mutant — 17c6dd081's form put back
  const COMPACT_OLD = '  html[data-vc="compact"] #mobile-nav { padding-top: env(safe-area-inset-top, 0px); }';  // stale-pins: kept — a red control's mutant: 17c6dd081's compact form put back
  const LAPTOP_OLD = '  html[data-vc="regular"][data-fold="laptop"] #mobile-nav { padding-right: env(safe-area-inset-right, 0px); }';  // stale-pins: kept — a red control's mutant: 17c6dd081's laptop form put back
  const lineOf = (css, re) => (css.split('\n').find((l) => re.test(l)) || '');
  const compactNow = lineOf(CSS, /^  html\[data-vc="compact"\] #mobile-nav \{ height: calc\(44px/), laptopNow = lineOf(CSS, /^  html\[data-vc="regular"\]\[data-fold="laptop"\] #mobile-nav \{ padding-right:/);
  const compactOk = (css) => /html\[data-vc="compact"\] #mobile-nav \{ height: calc\(44px \+ env\(safe-area-inset-top, 0px\)\); padding-top: env\(safe-area-inset-top, 0px\); \}/.test(css);
  const mC = { compact: compactOk(CSS.replace(compactNow, COMPACT_OLD)) }, mL = edges4(CSS.replace(laptopNow, LAPTOP_OLD), CHAT);
  const HID_OLD = '  html[data-vc="regular"].vs-list-hidden #main-wrapper { margin-left: env(safe-area-inset-left, 0px) !important; }';  // stale-pins: kept — a red control's mutant: f4499e926's unscoped form put back
  const hidNow = lineOf(CSS, /^  html:not\(\[data-fold="book"\]\)\[data-vc="regular"\]\[data-standalone\]\.vs-list-hidden/);   // the book guard FIRST: test-fold-posture's census reads a [data-fold="book"] only before a data-vc
  ok(!!hidNow && /:not\(\[data-fold="book"\]\)/.test(hidNow) && /\[data-standalone\]/.test(hidNow) && !edges4(CSS.replace(hidNow, HID_OLD), CHAT).list,
    '⑤c the list-hidden margin reaches ONLY the home-screen copy (its own mark) and NEVER the book pose (主开发 r4187: unscoped, it outranked the book\'s own margin at inset 0) — RED CONTROL: f4499e926\'s unscoped rule is caught');
  ok(!!compactNow && !!laptopNow && compactOk(CSS) && !mC.compact && !mL.bars, '⑤c RED CONTROLS, one rule each: 17c6dd081\'s compact bar (the inset as padding in a 44 px box — its buttons crushed under the clock) and its laptop bar (6 px lost at inset 0) are caught by their own pins', { mC: mC.compact, mL: mL.bars });
  // EVERY CURE IS A NO-OP AT INSET ZERO (the unit's own law; r4115 MUST 3): each value with every env() at 0 equals the release's
  const atZero = (v) => { const z = v.replace(/env\(safe-area-inset-[a-z]+, 0px\)/g, '0px'); let m;
    if ((m = z.match(/^calc\((\d+)px \+ 0px\)$/))) return Number(m[1]); if ((m = z.match(/^max\((\d+)px, 0px\)$/))) return Number(m[1]); if (z === '0px') return 0; return NaN; };
  const zero = [[/html\[data-vc="compact"\] #mobile-nav \{ height: ([^;]+);/, 44, 'the compact bar\'s height (the base 44)'], [/html\[data-vc="regular"\]\[data-fold="laptop"\] #mobile-nav \{ padding-right: ([^;]+);/, 6, 'the laptop bar\'s trailing padding (the base 6)'],
    [/html\[data-vc="regular"\]:not\(\[data-sidecol\]\) #mobile-nav \{ padding-top: ([^;]+);/, 8, 'the trailing bar\'s top padding (the base 8)'], [/@media \(orientation: portrait\) \{\n  \/\*[^\n]*\*\/\n  html\[data-vc="regular"\] #mobile-nav \{ height: ([^;]+);/, 44, 'the regular portrait bar\'s height (the base 44)']]
    .map(([re, want, what]) => { const v = (CSS.match(re) || [])[1] || ''; return { what, v, got: atZero(v), want }; });
  ok(zero.every((x) => x.got === x.want), `⑤c every cure is a no-op at inset zero: ${zero.map((x) => `${x.what} ${x.got}`).join(' · ')}`, zero);
  ok(atZero('env(safe-area-inset-right, 0px)') === 0 && atZero('env(safe-area-inset-right, 0px)') !== 6, '⑤c RED CONTROL: 17c6dd081\'s laptop value at inset zero is 0, not the base\'s 6');
  const pinned = fs.existsSync(path.join(REPO, 'docs/kb-features.md')) ? read('docs/kb-features.md') : '';
  ok(/THE SYSTEM's EDGES — the four-edge audit \(B-78db slice 2\)/.test(pinned) && (pinned.match(/^\| \d+ \| (public\/)?(style|chat|viewers)\.css:/gm) || []).length === 32,
    '⑤c the audit is written down: docs/kb-features.md holds the 32 edge-pinned rules, each with its verdict (cured, or left as it is with why)');
}

console.log('⑤d the launch for every theme (B-78db line 914 cure — 主开发 r4111 / r4114)');
{
  const IDX = read('public/index.html'), CL = read('src/client.js');
  const noStyleMeta = (idx) => !/name="apple-mobile-web-app-status-bar-style"/.test(idx);  // stale-pins: kept — a deliberate absence check (the meta must stay gone)
  ok(noStyleMeta(IDX) && /<html lang="en" style="background:#0c0c18">/.test(IDX) && /id="loading-screen" style="[^"]*background:#0c0c18;/.test(IDX),
    '⑤d the release\'s DEFAULT status bar style stays (no status-bar-style meta: the column comes with cover alone; a translucent style would draw the clock white over a light theme) — and the first paint is the splash\'s own colour');
  ok(!noStyleMeta(IDX.replace('<title>', '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n  <title>')), '⑤d RED CONTROL: 17c6dd081\'s black-translucent meta is caught');  // stale-pins: kept — a red control's mutant: 17c6dd081's meta put back
  const ground = (cl) => { const a = cl.indexOf("const splash = document.getElementById('loading-screen');"), b = cl.indexOf('\n});', a); const blk = a > 0 && b > a ? cl.slice(a, b) : '';
    return /if \(splash\) \{ splash\.style\.pointerEvents = 'none'; splash\.style\.opacity = '0'; setTimeout\(\(\) => splash\.remove\(\), 300\); \}\n(  \/\/[^\n]*\n)*  document\.documentElement\.style\.removeProperty\('background'\);/.test(blk); };
  ok(ground(CL), '⑤d the inline ground is the launch\'s only: it goes where the splash goes (src/client.js, after app.ready) — the theme\'s var(--bg-root) is the ground for the session');
  ok(!ground(CL.replace("  document.documentElement.style.removeProperty('background');\n", '')), '⑤d RED CONTROL: 17c6dd081\'s client (the ground kept for the whole session — a light theme behind a dark page) is caught');
  // (g) THE LAUNCH's ORDER: the six sheets after the inline loading screen, the loading screen first in the body
  const at = (re) => { const m = IDX.match(re); return m ? m.index : -1; };
  const ls = at(/<div id="loading-screen"/), links = [...IDX.matchAll(/<link rel="stylesheet" href="\/([a-z-]+)\.css">/g)];
  ok(ls > 0 && links.length === 6 && links.every((m) => m.index > ls) && at(/<head>/) < at(/<\/head>/) && !links.some((m) => m.index < at(/<\/head>/)),
    `⑤d (g) the launch: the loading screen stands first in the body and the six sheets after it (${links.map((m) => m[1]).join(', ')})`);
  // MUST 1 (主开发 r4115): every style injected at runtime wins its ties against the sheets EXACTLY as at the release
  const { pathToFileURL } = await import('node:url');
  const SO = await import(pathToFileURL(path.join(REPO, 'src/lib/sheet-order.js')).href);
  const node = (tag, attrs = {}) => ({ tag, attrs, parent: null, kids: [], on: {}, sheet: null,
    get isConnected() { let n = this; while (n.parent) n = n.parent; return n.tag === '#doc'; },
    cloneNode() { return node(this.tag, { ...this.attrs }); }, addEventListener(ev, f) { (this.on[ev] ||= []).push(f); }, fire(ev) { for (const f of this.on[ev] || []) f(); },
    remove() { if (this.parent) { this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; } },
    appendChild(c) { c.remove(); c.parent = this; this.kids.push(c); return c; },
    insertBefore(c, ref) { c.remove(); c.parent = this; const i = ref ? this.kids.indexOf(ref) : -1; if (i < 0) this.kids.push(c); else this.kids.splice(i, 0, c); return c; },
    querySelector(q) { return this.querySelectorAll(q)[0] || null; },
    querySelectorAll(q) { const m = q.match(/^:scope > link\[rel="([^"]+)"\]$/); return m ? this.kids.filter((k) => k.tag === 'link' && k.attrs.rel === m[1]) : []; } });
  const page = () => { const doc = node('#doc'), html = doc.appendChild(node('html')), head = html.appendChild(node('head')), body = html.appendChild(node('body'));
    head.appendChild(node('title')); head.appendChild(node('link', { rel: 'vs-lazy-bundle' })); head.appendChild(node('link', { rel: 'icon' }));
    body.appendChild(node('div', { id: 'loading-screen' }));
    for (const f of ['xterm', 'style', 'viewers', 'chat', 'theme-editor', 'fonts']) body.appendChild(node('link', { rel: 'stylesheet', href: `/${f}.css` }));
    body.appendChild(node('script', { src: '/bundle.js' })); return { doc, head, body }; };
  const flat = (root) => { const out = []; const walk = (n) => { out.push(n); n.kids.forEach(walk); }; walk(root); return out; };
  const sheetsIn = (root) => flat(root).filter((n) => n.tag === 'link' && n.attrs.rel === 'stylesheet');
  const tiesWon = (P) => { const st = P.head.appendChild(node('style', { id: 'custom-theme-x' })), all = flat(P.doc), i = all.indexOf(st); return sheetsIn(P.doc).every((l) => all.indexOf(l) < i); };
  const frames = [], W = { requestAnimationFrame: (f) => frames.push(f) };
  const A = page(), n = SO.restoreSheetOrder(A, W);
  const headOrder = A.head.kids.map((k) => k.attrs.href || k.attrs.rel || k.tag).join(',');
  const before = sheetsIn(A.body).length;                                   // the twins stay until their clone's sheet is there
  for (const c of A.head.kids.filter((k) => k.attrs.rel === 'stylesheet')) c.fire('load');
  ok(n === 6 && headOrder === 'title,/xterm.css,/style.css,/viewers.css,/chat.css,/theme-editor.css,/fonts.css,vs-lazy-bundle,icon' && before === 6 && sheetsIn(A.body).length === 0 && tiesWon(A),
    `⑤d MUST 1: the six sheets back at their release place in the head (${headOrder}); the body twins kept until each clone loads (${before}), then gone — a style appended to the head afterwards (a custom theme, a plugin's own) comes after every sheet and wins its ties as at the release`);
  const B = page(); SO.restoreSheetOrder(B, W); const cl = B.head.kids.filter((k) => k.attrs.rel === 'stylesheet');
  cl[1].fire('error'); cl[0].sheet = { cssRules: [] }; for (const f of frames.splice(0)) f();
  ok(!cl[1].isConnected && sheetsIn(B.body).map((l) => l.attrs.href).includes('/style.css') && !sheetsIn(B.body).map((l) => l.attrs.href).includes('/xterm.css'),
    '⑤d a clone that fails to load is dropped and its twin KEPT (the page never loses a sheet); a clone whose sheet is seen on a later frame without a load event lets its twin go');
  ok(!tiesWon(page()), '⑤d RED CONTROL: 17c6dd081\'s order (the sheets in the body, nothing restored) — a head-injected theme rule stands BEFORE the sheets and loses every tie');
  // r4187 (a): the two ways a sheet keeps the body's order are SAID (one telemetry line); a .sheet whose rules cannot be read yet is not ready
  const said = [], frames2 = [], C = page(); SO.restoreSheetOrder(C, { requestAnimationFrame: (f) => frames2.push(f) }, { onMiss: (m) => said.push(m.why + ':' + m.href) });
  const cc = C.head.kids.filter((k) => k.attrs.rel === 'stylesheet');
  cc[0].fire('error'); cc[1].sheet = { get cssRules() { throw new Error('InvalidAccessError'); } };
  for (let k = 0; k < 400 && frames2.length; k++) for (const f of frames2.splice(0)) f();
  ok(said.includes('error:/xterm.css') && said.filter((x) => x.startsWith('frames:')).length === 5 && sheetsIn(C.body).length === 6,
    `⑤d a clone that fails, and one whose sheet never shows within its frames (a Gecko-style .sheet whose rules throw counts as not loaded), each keep their twin and are SAID: ${said.length} line(s)`, said);
  ok(/try \{ restoreSheetOrder\(document, window, \{ onMiss: \(m\) => track\('event', 'sheet-order-miss', m\) \}\); \} catch \{ \}[^\n]*\ntry \{ installSideColumn\(\); \} catch \{ \}/.test(CL) && CL.indexOf('restoreSheetOrder(') < CL.indexOf('const exitHop = continueExit();'),
    '⑤d the client restores the order FIRST, before any of the app is built (src/client.js)');
  // r4115 (c) + the reach: the probe only in an iPhone's / iPad's home-screen copy, at most once a frame
  const SC = await import(pathToFileURL(path.join(REPO, 'src/lib/side-column.js')).href);
  const heard = []; const winTab = { navigator: {}, matchMedia: () => ({ matches: true }), addEventListener: (ev) => heard.push(ev) };
  const docTab = { documentElement: { dataset: {} }, querySelector: () => ({ getAttribute: () => 'width=device-width', setAttribute() {} }) };
  const SCS = read('src/lib/side-column.js');
  ok(SC.installSideColumn(docTab, winTab) === false && heard.length === 0 && /const later = \(\) => \{ if \(queued\) return; queued = true;/.test(SCS) && /win\.addEventListener\('resize', later\)/.test(SCS),
    '⑤d no listener and no probe where no inset can exist (a tab, an Android or a desktop installed copy — display-mode standalone no longer counts); in the home-screen copy the read is once a frame at most');
}

console.log('⑤e the simulator\'s faults (主开发 r4463): the launch wears the stored theme\'s ground; the top band takes the bar\'s colour');
{
  const LG = require(path.join(REPO, 'src/launch-ground.js'));
  const IDX = read('public/index.html'), SRV = read('server.js'), TH = read('src/lib/themes.js'), CSS = read('public/style.css');
  // THE VALUE IS A COLOUR OR NOTHING (it is written into an attribute of the page every client is served)
  const good = ['#fafafa', '#FFF', '#0c0c18cc', 'rgb(250, 250, 250)', 'rgba(1,2,3,0.5)'], bad = ['white', '#ggg', 'url(x)', '#fff"><script>', '#fff;color:red', 'rgb(1,2,3);x', 'expression(1)', '', null, 'var(--bg-root)', '#'.padEnd(50, 'a'),
    '#fffff', '#fffffff', 'rgb(256,0,0)', 'rgb(1,2)', 'rgba(1,2,3,2)', '#fff\n', '#fff</style>', 'rgb(1,2,3))', 'hsl(0,0%,100%)', 'transparent', 'dark', 'light', 'custom-my-theme', '\u0023fff'.replace('#', '＃')];   // r4467: hostile values and a theme's NAME write nothing
  ok(good.every((g) => LG.cleanGround(g) === g) && bad.every((b) => LG.cleanGround(b) === null), '⑤e THE ONE STRICT PATTERN: a hex of 3/4/6/8 digits or rgb()/rgba() of 0–255 channels — a word, a theme\'s name, a url(), a quote, a semicolon, a var(), a channel of 256, a newline, a full-width «＃» are refused', { good: good.map(LG.cleanGround), bad: bad.map(LG.cleanGround) });
  ok(LG.groundOf('a=1; vs_ground=%23fafafa; b=2') === '#fafafa' && LG.groundOf('vs_ground=%23fff%22%3E%3Cscript%3E') === null && LG.groundOf('') === null && LG.groundOf('xvs_ground=%23fafafa') === null && LG.groundOf('vs_ground=%E0%A4%A') === null,
    '⑤e the cookie is read by its exact name, decoded, and refused unless it is a colour (a malformed escape is nothing)');
  // ON THE REAL PAGE: exactly the two launch grounds change — <html>'s inline style and the loading screen's
  const lit = IDX.split('#0c0c18').length - 1, out = LG.withGround(IDX, '#fafafa');
  ok(out.includes('<html lang="en" style="background:#fafafa">') && /<div id="loading-screen" style="[^"]*background:#fafafa;/.test(out) && out.split('#0c0c18').length - 1 === lit - 2 && LG.withGround(IDX, null) === IDX && LG.withGround(IDX, 'white') === IDX && LG.withGround(IDX, LG.DARK) === IDX,
    `⑤e on public/index.html the remembered ground replaces exactly its two launch grounds (of ${lit} dark literals); no cookie, a word or the dark ground leave the page as it is`);
  // THE WIRING: the index route writes it before it sends; a theme that applies remembers its ground
  const routeOk = (src) => /const ground = launchGround\.groundOf\(req\.headers\.cookie\);[^\n]*\n(?:\s*html = launchImage\.withLinks\(html, ground\);[^\n]*\n)?\s*html = launchGround\.withGround\(html, ground\);[^\n]*\n\s*res\.set\('Cache-Control', 'no-cache'\)/.test(src);
  ok(routeOk(SRV) && /app\.get\(\['\/', '\/index\.html'\], \(req, res, next\) => \{[\s\S]{0,700}const launchGround = require\('\.\/src\/launch-ground\.js'\);/.test(SRV) && /import \{ cookieFor \} from '\.\.\/launch-ground\.js';/.test(TH) && /const c = cookieFor\(getComputedStyle\(document\.documentElement\)\.getPropertyValue\('--bg-root'\)\); if \(c\) document\.cookie = c;/.test(TH),
    '⑤e the index route writes the remembered ground into the page before it sends it; ThemeManager.apply remembers the applied theme\'s ground (a custom or plugin theme\'s as the page computes it)');
  ok(!routeOk(SRV.replace(/\n\s*html = launchGround\.withGround\([^\n]*/, '')), '⑤e RED CONTROL: 26d571cdb\'s route (no rewrite) — a light theme\'s launch stays dark');
  ok(LG.cookieFor('#fafafa') === 'vs_ground=%23fafafa; path=/; max-age=31536000; SameSite=Lax' && LG.cookieFor('red') === null, '⑤e the cookie: the whole origin, a year, never sent cross-site; nothing for a value that is no colour');
  // FAULT 1: the page's chrome in ONE fixed container in the home-screen copy only
  const fixedOk = (css) => /html\[data-standalone\] #main-wrapper \{ position: fixed; top: 0; right: 0; bottom: 0; left: 0; height: auto; \}/.test(css);
  ok(fixedOk(CSS), '⑤e the home-screen copy\'s #main-wrapper is fixed at its own rectangle (主开发\'s simulator experiment: the system\'s top band then takes the bar\'s colour, the title sharp) — UNPROVEN on the device until the pictures');
  ok(!fixedOk(CSS.slice(0, CSS.indexOf('THE SYSTEM\'s TOP BAND (B-78db'))), '⑤e RED CONTROL: 26d571cdb\'s stylesheet leaves the wrapper in the flow (the blurred title)');
}

console.log('⑤f the launch image (主开发 r4481 — the owner: can the launch\'s white be removed altogether)');
{
  const zlib = require('zlib'), LI = require(path.join(REPO, 'src/launch-image.js')), LG = require(path.join(REPO, 'src/launch-ground.js'));
  // THE SUITE's OWN PNG READER (never the module's): the signature, every chunk's CRC, IHDR 8-bit RGB, the IDATs inflated, every row
  // un-filtered (0–4) → { w, h, types, off: the pixels that are not `rgb` }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); crcT.push(c >>> 0); }
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const decode = (png, rgb) => {
    if (!Buffer.isBuffer(png) || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { error: 'signature' };
    let at = 8, ihdr = null; const idat = [], types = [];
    while (at + 12 <= png.length) { const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8);
      if (crc(png.subarray(at + 4, at + 8 + len)) !== png.readUInt32BE(at + 8 + len)) return { error: 'crc ' + type };
      types.push(type); if (type === 'IHDR') ihdr = png.subarray(at + 8, at + 8 + len); if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len)); at += 12 + len; }
    if (!ihdr || ihdr[8] !== 8 || ihdr[9] !== 2 || ihdr[12] !== 0) return { error: 'not 8-bit RGB', types };
    const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), stride = 3 * w, raw = zlib.inflateSync(Buffer.concat(idat));
    if (raw.length !== (stride + 1) * h) return { error: 'length', w, h };
    let prev = Buffer.alloc(stride), off = 0;
    for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
      if (f > 4) return { error: 'filter ' + f };
      for (let i = 0; i < stride; i++) { const a = i >= 3 ? line[i - 3] : 0, b = prev[i]; let add = 0;
        if (f === 1) add = a; else if (f === 2) add = b; else if (f === 3) add = (a + b) >> 1;
        else if (f === 4) { const c = i >= 3 ? prev[i - 3] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        line[i] = (line[i] + add) & 0xff; }
      for (let i = 0; i < stride; i += 3) if (line[i] !== rgb[0] || line[i + 1] !== rgb[1] || line[i + 2] !== rgb[2]) off++;
      prev = line; }
    return { w, h, types, off };
  };
  const DUO_P = '1398x2034.png', DUO_L = '2034x1398.png';
  const light = await LI.imageFor(DUO_P, '#f0f0f5'), dark = await LI.imageFor(DUO_P), land = await LI.imageFor(DUO_L, 'rgb(30, 31, 41)');
  const dl = decode(light, [0xf0, 0xf0, 0xf5]), dd = decode(dark, [0x0c, 0x0c, 0x18]), dn = decode(land, [30, 31, 41]);
  ok(dl.w === 1398 && dl.h === 2034 && dl.off === 0 && JSON.stringify(dl.types) === '["IHDR","IDAT","IEND"]' && dd.w === 1398 && dd.off === 0 && dn.w === 2034 && dn.h === 1398 && dn.off === 0,
    `⑤f the Duo's launch images read back by the suite's own reader: every CRC, 8-bit RGB, EVERY pixel the colour — light ${dl.w}×${dl.h}, today's dark (no colour), rgb() held landscape ${dn.w}×${dn.h} (${light.length} / ${dark.length} / ${land.length} bytes)`, { dl, dd, dn });
  const bent = Buffer.from(light); bent[60] ^= 0xff;   // one byte of the IDAT turned over
  ok(decode(bent, [0xf0, 0xf0, 0xf5]).error === 'crc IDAT' && decode(light, [0x0c, 0x0c, 0x18]).off === 1398 * 2034, '⑤f RED CONTROLS: the reader refuses a bent chunk by its CRC, and counts every pixel of a colour that is not the image\'s (the colour check is not vacuous)');
  // THE SIZES: each listed screen's portrait and landscape in device pixels — nothing else answers
  const want = [...new Set(LI.SCREENS.flatMap((s) => [`${s.w * s.r}x${s.h * s.r}`, `${s.h * s.r}x${s.w * s.r}`]))];
  const offList = await Promise.all(['1399x2034.png', '1398x2034', '01398x2034.png', '../1398x2034.png', '1398x2034.png?x', '', null].map((x) => LI.imageFor(x, '#fff')));
  ok(JSON.stringify([...LI.SIZES].sort()) === JSON.stringify(want.sort()) && LI.SCREENS[0].w === 466 && LI.SCREENS[0].h === 678 && LI.SCREENS[0].r === 3 && offList.every((x) => x === null),
    `⑤f the sizes are the listed screens' own (${LI.SIZES.length}: the Duo's 466×678 at 3× first), portrait and landscape; any other size is refused (the route's 404)`, { sizes: LI.SIZES, offList });
  // A COLOUR OR TODAY's DARK — the same strict rule as the launch ground; a hostile value is the very image of no colour at all (one cache entry)
  ok(['url(x)', '#fff"><x', 'white', ['#fff', '#000'], '#'.padEnd(50, 'a'), undefined].every((g) => LI.imageFor(DUO_P, g) === LI.imageFor(DUO_P, LG.DARK)) && LI.imageFor(DUO_P, '#fff') !== LI.imageFor(DUO_P, LG.DARK),
    '⑤f a colour by launch-ground.js\'s one strict rule; a word, markup, a repeated query or an over-long value is today\'s dark (the same image)');
  // THE LINKS: ONE set, in the colour the page paints first
  const IDX = read('public/index.html'), links = LI.linksFor('#f0f0f5'), none = LI.linksFor(null), page = LI.withLinks(IDX, '#f0f0f5');
  const linkOk = (l) => { const m = /^<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (portrait|landscape)\)" href="\/launch-image\/(\d+)x(\d+)\.png\?g=([^"]+)">$/.exec(l);
    if (!m) return false; const [w, h, r, o, W, H] = m.slice(1, 7).map((x, i) => (i === 3 ? x : Number(x)));
    return W === (o === 'portrait' ? w : h) * r && H === (o === 'portrait' ? h : w) * r && LI.SIZES.includes(`${W}x${H}`); };
  ok(links.length === LI.SCREENS.length * 2 && links.every(linkOk) && links.every((l) => l.endsWith('?g=%23f0f0f5">')) && none.every((l) => l.endsWith('?g=%230c0c18">')) && LI.linksFor('url(x)').join() === none.join(),
    `⑤f the links: ${links.length} (each screen, both orientations, its media exact), ONE set in the remembered ground — none remembered (or no colour): today's dark`, links.filter((l) => !linkOk(l)));
  ok(page.split('rel="apple-touch-startup-image"').length - 1 === links.length && page.indexOf(links.at(-1)) < page.indexOf('</head>') && page.replace(`  ${links.join('\n  ')}\n`, '') === IDX && !IDX.includes('rel="apple-touch-startup-image"'),
    '⑤f the page wears the links at the end of its head and is otherwise unchanged (index.html itself holds no such link — its comment names the mechanism: the index route writes them)');
  // THE WIRING: the index route writes the links (inside the route: test-csp-report runs it from its text); the image's own route
  const SRV = read('server.js');
  const linksOk = (src) => /const launchImage = require\('\.\/src\/launch-image\.js'\);[^\n]*\n\s*const ground = launchGround\.groundOf\(req\.headers\.cookie\);[^\n]*\n\s*html = launchImage\.withLinks\(html, ground\);/.test(src);
  const routeOk = (src) => /app\.get\('\/launch-image\/:size', \(req, res\) => \{\n\s*require\('\.\/src\/launch-image\.js'\)\.imageFor\(req\.params\.size, req\.query\.g\)\.then\(\(png\) => \{\n\s*if \(!png\) return res\.status\(404\)\.end\(\);/.test(src);
  ok(linksOk(SRV) && routeOk(SRV) && SRV.indexOf("app.get('/launch-image/:size'") > SRV.indexOf("app.get(['/', '/index.html']"), '⑤f the index route writes the links in the remembered ground; /launch-image/<W>x<H>.png answers from launch-image.js, a 404 off its list (a page behind the sign-in, no door)');
  ok(!linksOk(SRV.replace(/\n\s*html = launchImage\.withLinks\([^\n]*/, '')) && !routeOk(SRV.replace("app.get('/launch-image/:size'", "app.get('/launch-image-gone/:size'")), '⑤f RED CONTROLS: effa5382a\'s route (no links) and a server without the image\'s route are caught');
}

console.log('⑤g the system\'s column on the LEFT (主开发 r4481 — the owner\'s simulator: the outer display held landscape, left 84 · right 0 · bottom 34)');
{
  const CSS = read('public/style.css'), TB = read('src/lib/trailing-bar.js'), HEAD = 'THE SYSTEM\'s COLUMN ON THE LEFT (B-78db';
  const LEFT_RULES = [
    'html[data-vc="regular"][data-sidecol="left"] #mobile-nav { left: 0; right: auto; width: max(56px, env(safe-area-inset-left, 0px)); padding-left: 6px; padding-right: 6px; padding-top: max(8px, env(safe-area-inset-top, 0px)); border-left: none; border-right: 1px solid var(--border); }',
    'html[data-vc="regular"][data-sidecol="left"] #main-wrapper { margin-right: 0 !important; margin-left: calc(max(56px, env(safe-area-inset-left, 0px)) + 321px) !important; }',
    'html:not([data-fold="book"])[data-vc="regular"][data-sidecol="left"].vs-list-hidden #main-wrapper { margin-left: max(56px, env(safe-area-inset-left, 0px)) !important; }',
    'html[data-vc="regular"][data-sidecol="left"] .sidebar { left: max(56px, env(safe-area-inset-left, 0px)); padding-left: 0; }',
    'html[data-vc="regular"][data-sidecol="left"] #list-column-toggle { left: calc(max(56px, env(safe-area-inset-left, 0px)) + 321px); }',
    'html[data-vc="regular"][data-sidecol="left"].vs-list-hidden #list-column-toggle { left: max(56px, env(safe-area-inset-left, 0px)); }',
    'html[data-vc="regular"][data-sidecol="left"] #mobile-nav :is(#mobile-nav-viewer-close, #mobile-nav-more).on { right: 0; }',
    'html[data-vc="regular"][data-sidecol="left"] #mobile-nav #mobile-nav-viewer-close.on ~ #mobile-nav-more.on { right: 44px; }',
    'html[data-vc="regular"][data-sidecol="left"] #user-todos-popup.usage-popup { left: calc(max(56px, env(safe-area-inset-left, 0px)) + 329px) !important; right: 8px !important; }',
    'html[data-vc="regular"][data-sidecol="left"].vs-list-hidden #user-todos-popup.usage-popup { left: calc(max(56px, env(safe-area-inset-left, 0px)) + 8px) !important; }'];
  const leftOk = (css) => { const i = css.indexOf(HEAD); if (i < 0) return false; const b = css.slice(i), m = b.indexOf('@media (orientation: landscape) {'), end = m < 0 ? -1 : b.indexOf('\n}\n', m);
    return m > 0 && end > m && LEFT_RULES.every((r) => b.slice(m, end).split('\n').some((l) => l.trim() === r)); };
  ok(leftOk(CSS), '⑤g the bar moves INTO a column on the left (as wide as it, its buttons from the top), the list column and the conversation start after it, ☰ / the For-you tray / the head\'s ✕ and ⋯ follow, nothing of ours on the right (one landscape block)');
  // the conversation's start when the list is hidden ties the home-screen copy's list-hidden rule in specificity (line 914's cure): the block wins by ORDER
  const tie = CSS.indexOf('html:not([data-fold="book"])[data-vc="regular"][data-standalone].vs-list-hidden #main-wrapper'), at = CSS.indexOf(HEAD);
  ok(tie > 0 && at > tie, '⑤g the block stands AFTER the home-screen copy\'s list-hidden rule it ties in specificity (it wins by order)', { tie, at });
  ok(!leftOk(CSS.slice(0, CSS.indexOf(HEAD))), '⑤g RED CONTROL: effa5382a\'s stylesheet has no column on the left (the owner\'s picture: an empty band beside our bar on the right)');
  const tipOk = (tb) => /const atLeft = vertical && r\.left \+ r\.width \/ 2 < innerWidth \/ 2;\n    tip\.style\.left = \(vertical \? \(atLeft \? r\.right \+ 8 : r\.left - tip\.offsetWidth - 8\)/.test(tb);
  ok(tipOk(TB), '⑤g a long press\'s tip stands on the conversation\'s side of a vertical bar: right of a bar in the column on the left, left of one on the right');
  const tipWas = TB.replace(/    const atLeft = [^\n]*\n    tip\.style\.left = \(vertical \? \(atLeft \? r\.right \+ 8 : r\.left - tip\.offsetWidth - 8\)/, '    tip.style.left = (vertical ? r.left - tip.offsetWidth - 8');   // stale-pins: kept — effa5382a's line, planted back by the CONTROL (anchored: the plant must change the text)
  ok(tipWas !== TB && !tipOk(tipWas) && tipWas.includes("tip.style.left = (vertical ? r.left - tip.offsetWidth - 8 : Math.max(4,"), '⑤g RED CONTROL: effa5382a\'s tip (always left of a vertical bar — off the screen beside a bar at x 0) is caught');   // stale-pins: kept — the control's own text (effa5382a's line)
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
