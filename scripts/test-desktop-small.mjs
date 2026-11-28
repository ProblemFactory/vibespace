#!/usr/bin/env node
// THE DESKTOP TIER AT A SMALL SCREEN — the PURE rules and their wiring (lane desktop-small, 2026-10-25: the naive-user walk
// at 951×585 / 1024×600 / 1100×700 / 1280×640 — P2-1…P2-6, P3-1…P3-3 — and the owner's «userW有一大堆桌面，屏幕尺寸小了之后桌面就
// 堆积在一起了»). In-process, no browser (the chrome legs are scripts/test-desktop-small-chrome.mjs; the real WindowManager's
// release legs are scripts/test-window-drag.mjs §2 (f)).
//   §1 the release + the recovery (src/lib/drag-end.js releaseBox / reachable / insideBox / releasePoint) + the resize's
//      release (resizeRelease — acceptance r2 ③)
//   §2 the one placement of a menu (+ B-6944: THE MENU'S KEYS, menuKeyStep's table; §6 the keyboard wiring of showContextMenu) (src/lib/menu-place.js menuPlace) — and of an OPEN one (`keep`: it keeps its top, capped at
//      the foot; `maxW`: never wider than the viewport — lane desktop-doors-table r4; `scrolled`: a wheeled one keeps its
//      offset, its cap lifted only as far as its rows stay — r5)
//   §3 the taskbar at a small screen (src/lib/taskbar-fit.js stripHidden / wheelScroll / switcherForm + TILE_MIN_PX = the
//      stylesheet's tile floor)
//   §3b the strip's TWO names (taskbar-fit.js stripKeys — B-6cf9): a title / a star / a tab's title changes the TEXT only
//      (taskbar.js paints the tiles in place, a press across it still clicks); open / close / reorder / a tab / the active tab
//      change the STRUCTURE (the tiles rebuilt); its control in §7: the base's one key, titles in it, goes RED by name
//   §4 the cascade that buries nothing (src/lib/window-min-size.js cascadeBox)
//   §5 the desktop tier's toast spot (src/lib/utils.js toastDeskSpot) + B-7a51: the stack beside the OPEN For-you panel — its
//      left, else its right (toastBesidePanel) — else its plain toasts HELD (toastMayYield: an error, an action toast, a pinned
//      notice never yield); their time stopped while held and started whole when drawn (§6 pins; the browser leg: heavy
//      test-desktop-small-chrome ⑳ + its RED control)
//   §6 the wiring — every door asks its rule (source pins over the comment-stripped files), acceptance r2 included: the
//      compact list's rows carry the desktop's doors and take a window's drop, the «+N» list is placed by menuPlace, the
//      resize's release, the brand observer's lifetime, the narrow-title observer's own field; acceptance r3: ONE spring
//      lifecycle for the title-bar and the tile (HTML5) roads, a stale row refused by name, a cancelled Rename… stays shut
//      (their RED controls run in the chrome suite's third bundle — DOM wiring, no PURE rule to patch)
//   §7 controls — patched copies outside the tree (scripts/mutant-copy.mjs): each rule's base form goes RED on its table
//   §8 B-7a51 round 3 — THE TOAST'S STATES, DRIVEN: the REAL showToast / hold / show / placement / cap (fresh copies of utils.js)
//      over a DOM stand-in (the stack, the For-you panel, the toolbar, the anchor; a toast's box from its words, a held one drawn
//      nowhere — the stylesheet's rule) and a fake clock (every setTimeout of the module): the cap scene (four held, an error
//      born: drawn, the OLDEST held one dropped, its history line unseen) + law 2 (an error drawn, three held, a second error: a
//      plain one goes, the error stays) + a toast's whole time (drawn, held while the panel grows, drawn again: its time WHOLE) +
//      the smalls (a refusal, a timed toast born held-scene: drawn); each with its RED control (round 2's cap, the release's
//      oldest-first, a hold that keeps the timer)
// Prerequisite: `npm run build` (src/lib/build-version.js). Run: node scripts/test-desktop-small.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
// B-7a51: the stack beside the OPEN For-you panel (viewport px in; the stack's CSS right out, layout px) — [name, got, want]
const besideTable = (f) => {
  const panel = { left: 900, right: 1270, top: 80, bottom: 740 }, over = { left: 920, right: 1270, top: 600, bottom: 744, width: 350, height: 144 };
  return [
    ['a stack over the open panel stands 8 px left of it', f({ rect: over, panel, vw: 1280 }), { right: 388 }],
    ['…in layout px at a 1.25 UI scale', f({ rect: over, panel, vw: 1280, scale: 1.25 }), { right: 310.4 }],
    ['a stack clear of the panel keeps its place', f({ rect: { ...over, left: 400, right: 750 }, panel, vw: 1280 }), null],
    ['a stack below the panel keeps its place', f({ rect: { ...over, top: 745, bottom: 889 }, panel, vw: 1280 }), null],
    ['no open panel ⇒ its place', f({ rect: over, panel: null, vw: 1280 }), null],
    // its round's MUST: the For-you button moved to a LEFT bar — the panel opens at the left, the stack meets it there
    ['the panel at the left (a left bar): the stack stands 8 px RIGHT of it', f({ rect: { ...over, left: 10, right: 360 }, panel: { ...panel, left: 10, right: 380 }, vw: 1280 }), { left: 388 }],
    ['…in layout px at a 1.25 UI scale', f({ rect: { ...over, left: 10, right: 360 }, panel: { ...panel, left: 10, right: 380 }, vw: 1280, scale: 1.25 }), { left: 310.4 }],
    ['room on both sides ⇒ the left first (where it stood)', f({ rect: { ...over, left: 450, right: 800 }, panel: { ...panel, left: 400, right: 800 }, vw: 1280 }), { right: 888 }],
    ['no room on either side ⇒ null (the caller holds its plain toasts — never off screen)', f({ rect: over, panel: { ...panel, left: 300 }, vw: 1280 }), null],
    ['a long toast in a window under 1000 px (its round\'s scene) ⇒ null', f({ rect: { left: 380, right: 940, top: 500, bottom: 540, width: 560, height: 40 }, panel: { left: 545, right: 945, top: 61, bottom: 541 }, vw: 951 }), null],
  ];
};
// B-7a51 (its round's MUST): which toast may be HELD while the stack has no room clear of the open panel — [name, got, want]
// B-7a51 round 3 (THE CAP DROPPED THE NEWBORN): which of the stack's OTHER toasts goes when a fifth arrives — [name, got, want]
// (the caller never offers the toast being born nor a pinned notice: §6 pins it, §8 drives it)
const capTable = (f) => {
  const P = { yields: true, drawn: false }, PD = { yields: true, drawn: true }, E = { yields: false, drawn: true }, EH = { yields: false, drawn: false };
  return [
    ['four plain toasts held (the panel open, no room): the OLDEST goes', f([P, P, P, P]), 0],
    ['a plain toast the person has seen (drawn) goes before a held one', f([P, PD, P]), 1],
    ['a toast that may yield goes before one that may not — the older error stays', f([E, P, P]), 1],
    ['…an Undo or an error never while a plain one stands, wherever it sits', f([E, EH, PD]), 2],
    ['only toasts that may not yield: the drawn one first, the oldest', f([EH, E, E]), 1],
    ['only never-drawn ones that may not yield: the oldest', f([EH, EH]), 0],
    ['nothing offered ⇒ none (the stack keeps them all)', f([]), -1],
  ];
};
const yieldTable = (f) => [
  ['a plain notice yields (held: its time stopped, drawn again whole)', f({ type: 'info', action: false, pinned: false }), true],
  ['a success yields', f({ type: 'success' }), true],
  ['the person\'s failed act (an error) never yields', f({ type: 'error', action: false, pinned: false }), false],
  ['a refusal of the person\'s press (warn: «… moved under the pointer just now — press it again») never yields', f({ type: 'warn' }), false],
  ['a door («Marked done · Undo», a setting link, the For-you tap) never yields', f({ type: 'info', action: true, pinned: false }), false],
  ['an error with an action never yields', f({ type: 'error', action: true }), false],
  ['a pinned notice (no time at all) never yields', f({ type: 'info', pinned: true }), false],
  ['a toast that names a time («press ✕ again within n s») never yields — held, its words would turn false', f({ type: 'info', timed: true }), false],
  ['nothing said ⇒ a plain toast', f({}), true],
];
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }
const MUT = mutantCopies('desksmall', repo);
const copies = [];
const patched = async (rel, pairs, tag) => {
  let text = read(rel);
  for (const [from, to] of pairs) { if (text.split(from).length !== 2) throw new Error(`control anchor ${rel}: ${from.slice(0, 60)}`); text = text.replace(from, to); }
  const p = MUT.write(rel, text, tag, { esm: true }); copies.push(p);
  return import(pathToFileURL(p).href);
};

const DE = await import('../src/lib/drag-end.js');
const MP = await import('../src/lib/menu-place.js');
const TF = await import('../src/lib/taskbar-fit.js');
const MS = await import('../src/lib/window-min-size.js');

/** the table every copy of resizeRelease is judged on (r2 ③: the window's floor 320×180) */
const resizeTable = (rr) => [
  ['north past the top by 60: top 0, the bottom kept (height 360 → 300)', rr({ left: 100, top: -60, width: 400, height: 360 }, WS, 'n', undefined, { w: 320, h: 180 }), { left: 100, top: 0, width: 400, height: 300, moved: true }],
  ['north-west past the top: the same cut', rr({ left: 100, top: -60, width: 400, height: 360 }, WS, 'nw', undefined, { w: 320, h: 180 }), { left: 100, top: 0, width: 400, height: 300, moved: true }],
  ['north past the top beyond the floor: cut to the floor, then moved down (bar kept)', rr({ left: 100, top: -60, width: 400, height: 200 }, WS, 'n', undefined, { w: 320, h: 180 }), { left: 100, top: 0, width: 400, height: 180, moved: true }],
  ['north inside: untouched', rr({ left: 100, top: 12, width: 400, height: 300 }, WS, 'n', undefined, { w: 320, h: 180 }), { left: 100, top: 12, width: 400, height: 300, moved: false }],
  ['south past the bottom (the bar in): untouched', rr({ left: 100, top: 300, width: 400, height: 400 }, WS, 's', undefined, { w: 320, h: 180 }), { left: 100, top: 300, width: 400, height: 400, moved: false }],
  ['east: untouched', rr({ left: 100, top: 20, width: 900, height: 300 }, WS, 'e', undefined, { w: 320, h: 180 }), { left: 100, top: 20, width: 900, height: 300, moved: false }],
  ['the workspace not laid out: as is', rr({ left: 100, top: -60, width: 400, height: 360 }, null, 'n'), { left: 100, top: -60, width: 400, height: 360, moved: false }],
];

// ── §1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§1 the release + the recovery (drag-end.js)');
const WS = { w: 764, h: 515 }; // 1024×600 with the sidebar open — the walk's workspace
/** the table every copy of releaseBox is judged on — the walk's two buried releases first */
const releaseTable = (rb) => [
  ['P2-1 #1: Quad, released over the taskbar (y 553 of 515 + the toolbar\'s 41 — workspace y 512)', rb({ left: 64, top: 512, width: 406, height: 306 }, WS), { left: 64, top: 483, width: 406, height: 306, moved: true }],
  ['P2-1 #2: 0 px of the bar left (y 514)', rb({ left: 162, top: 514, width: 406, height: 306 }, WS), { left: 162, top: 483, width: 406, height: 306, moved: true }],
  ['inside: untouched', rb({ left: 10, top: 10, width: 400, height: 300 }, WS), { left: 10, top: 10, width: 400, height: 300, moved: false }],
  ['the body hanging past the bottom with the whole bar in: untouched (the person may leave it partly off)', rb({ left: 10, top: 400, width: 400, height: 300 }, WS), { left: 10, top: 400, width: 400, height: 300, moved: false }],
  ['above the workspace (under the toolbar): top 0', rb({ left: 10, top: -40, width: 400, height: 300 }, WS), { left: 10, top: 0, width: 400, height: 300, moved: true }],
  ['past the left edge: 80 px of the bar kept', rb({ left: -390, top: 50, width: 400, height: 300 }, WS), { left: -320, top: 50, width: 400, height: 300, moved: true }],
  ['past the right edge: 80 px of the bar kept', rb({ left: 760, top: 50, width: 400, height: 300 }, WS), { left: 684, top: 50, width: 400, height: 300, moved: true }],
  ['a keep with the window border (82×33)', rb({ left: 10, top: 600, width: 400, height: 300 }, WS, { w: 82, h: 33 }), { left: 10, top: 482, width: 400, height: 300, moved: true }],
  ['the workspace not laid out: as is', rb({ left: 10, top: 9999, width: 400, height: 300 }, null), { left: 10, top: 9999, width: 400, height: 300, moved: false }],
];
{
  const bad = releaseTable(DE.releaseBox).filter(([, got, want]) => !same(got, want));
  ok(bad.length === 0 && verdictOf(same(DE.RELEASE_KEEP, { w: 80, h: 32 })), 'releaseBox: every release keeps RELEASE_KEEP (80×32) of the title bar inside — the walk\'s two buried windows come back to y 483; an inside / partly-off window is untouched', bad.map(([n, g, w]) => ({ n, g, w })));
  ok(gateOf(DE.reachable({ left: 10, top: 400, width: 400, height: 300 }, WS)) && !DE.reachable({ left: 64, top: 512, width: 406, height: 306 }, WS) && verdictOf(DE.reachable({ left: 0, top: 0, width: 1, height: 1 }, null)), 'reachable: the release\'s own rule (a workspace not laid out: reachable — nothing to recover)');
  ok(gateOf(same(DE.insideBox({ left: 324, top: 553, width: 406, height: 306 }, WS), { left: 324, top: 209, width: 406, height: 306, moved: true })) && gateOf(same(DE.insideBox({ left: -50, top: -20, width: 900, height: 600 }, WS), { left: 0, top: 0, width: 900, height: 600, moved: true })) && DE.insideBox({ left: 1, top: 1, width: 10, height: 10 }, WS).moved === false,
    'insideBox: a named window comes back WHOLLY inside (the walk\'s {324, 553} → {324, 209}); one larger than the workspace at its top-left; never resized');
  const r = { left: 260, top: 41, width: 764, height: 515 };
  ok(gateOf(same(DE.releasePoint({ x: 400, y: 570 }, r), { x: 400, y: 555, outside: true })) && gateOf(same(DE.releasePoint({ x: 100, y: 300 }, { ...r, right: 1024, bottom: 556 }), { x: 261, y: 300, outside: true })) && DE.releasePoint({ x: 500, y: 300 }, r).outside === false,
    'releasePoint: a grid release over the taskbar (y 570) is judged just inside the workspace (y 555) — the nearest bottom cell; a rect without right / bottom (a fake DOM) works too');
  const badR = resizeTable(DE.resizeRelease).filter(([, got, want]) => !same(got, want));
  ok(badR.length === 0, 'resizeRelease (r2 ③): a north edge dragged past the top stops there — the bottom edge stays, the height shrinks by the overshoot (never under the floor, then the move keeps the bar); every other edge is releaseBox\'s keep', badR.map(([n, g, w]) => ({ n, g, w })));
}

// ── §2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§2 the one placement of a menu (menu-place.js)');
const menuTable = (mp) => [
  ['P2-3 951×585: a 430 px title menu opened upward from y 294 — no room above, none below: clamped inside', mp({ x: 345, y: 294, w: 243, h: 430, vw: 951, vh: 585, up: true }), { left: 345, top: 151, maxH: null, maxW: null, scroll: null, side: 'clamped' }],
  ['P2-3 1024×600: 414 px from y 318 upward', mp({ x: 365, y: 318, w: 247, h: 414, vw: 1024, vh: 600, up: true }), { left: 365, top: 182, maxH: null, maxW: null, scroll: null, side: 'clamped' }],
  ['upward with room above: its bottom on the point', mp({ x: 100, y: 500, w: 200, h: 214, vw: 1024, vh: 600, up: true }), { left: 100, top: 286, maxH: null, maxW: null, scroll: null, side: 'above' }],
  ['upward without room above, room below: below (the flip)', mp({ x: 100, y: 60, w: 200, h: 214, vw: 1024, vh: 600, up: true }), { left: 100, top: 60, maxH: null, maxW: null, scroll: null, side: 'below' }],
  ['downward with room: below the point', mp({ x: 100, y: 60, w: 200, h: 214, vw: 1024, vh: 600 }), { left: 100, top: 60, maxH: null, maxW: null, scroll: null, side: 'below' }],
  ['downward without room below: clamped to the bottom edge (as before)', mp({ x: 100, y: 500, w: 200, h: 214, vw: 1024, vh: 600 }), { left: 100, top: 382, maxH: null, maxW: null, scroll: null, side: 'clamped' }],
  ['taller than the viewport: capped, scrolls, at the top pad', mp({ x: 100, y: 300, w: 200, h: 900, vw: 1024, vh: 600, up: true }), { left: 100, top: 4, maxH: 592, maxW: null, scroll: null, side: 'clamped' }],
  ['past the right edge: slid left', mp({ x: 950, y: 60, w: 200, h: 100, vw: 1024, vh: 600 }), { left: 820, top: 60, maxH: null, maxW: null, scroll: null, side: 'below' }],
  ['a menu wider than the viewport: capped across, at the left pad', mp({ x: 300, y: 60, w: 1200, h: 100, vw: 1024, vh: 600 }), { left: 4, top: 60, maxH: null, maxW: 1016, scroll: null, side: 'below' }],
  ['doors-table r4: an OPEN list (17 desktops at 951×585, 552 px from y 29) and three rows added there — it KEEPS its top, capped at the foot, scrolling (the hand correction lifted it to y −61)', mp({ x: 738, y: 29, w: 160, h: 642, vw: 951, vh: 585, keep: 552 }), { left: 738, top: 29, maxH: 552, maxW: null, scroll: 0, side: 'kept' }],
  ['doors-table r4: …then a name wider than the viewport — capped across at the left pad, its top kept', mp({ x: 738, y: 29, w: 2570, h: 642, vw: 951, vh: 585, keep: 552 }), { left: 4, top: 29, maxH: 552, maxW: 943, scroll: 0, side: 'kept' }],
  ['doors-table r4: an open list that still fits below its top — grows downward, no cap', mp({ x: 100, y: 200, w: 180, h: 300, vw: 951, vh: 585, keep: 270 }), { left: 100, top: 200, maxH: null, maxW: null, scroll: 0, side: 'kept' }],
  ['doors-table r4: an open box no longer inside (the viewport shrank under it) — placed afresh, downward', mp({ x: 100, y: 400, w: 180, h: 300, vw: 951, vh: 585, keep: 300 }), { left: 100, top: 281, maxH: null, maxW: null, scroll: null, side: 'clamped' }],
  ['doors-table r5: a list wheeled 100 px, the room grown till its content fits (25 desktops, 951×900) — it KEEPS ITS OFFSET: its cap lifts only as far as what it shows past it (5a98bf0f: lifted whole — the offset 0, every row 100 px down)', mp({ x: 738, y: 4, w: 160, h: 792, vw: 951, vh: 900, keep: 577, scrolled: 100 }), { left: 738, top: 4, maxH: 692, maxW: null, scroll: 100, side: 'kept' }],
  ['doors-table r5: a list wheeled 100 px whose content shrank under its cap — the offset kept, the box shorter at its foot', mp({ x: 100, y: 29, w: 180, h: 500, vw: 951, vh: 585, keep: 552, scrolled: 100 }), { left: 100, top: 29, maxH: 400, maxW: null, scroll: 100, side: 'kept' }],
  ['doors-table r5: …wheeled back to the top — the cap lifts whole (no dead scroll room)', mp({ x: 738, y: 4, w: 160, h: 792, vw: 951, vh: 900, keep: 692, scrolled: 0 }), { left: 738, top: 4, maxH: null, maxW: null, scroll: 0, side: 'kept' }],
  ['doors-table r5: a wheeled list still taller than the room — capped at the foot, the offset carried', mp({ x: 738, y: 4, w: 160, h: 792, vw: 951, vh: 585, keep: 577, scrolled: 100 }), { left: 738, top: 4, maxH: 577, maxW: null, scroll: 100, side: 'kept' }],
  ['doors-table r5: a wheeled box no longer inside — placed afresh, its offset left to the browser', mp({ x: 100, y: 400, w: 180, h: 300, vw: 951, vh: 585, keep: 300, scrolled: 50 }), { left: 100, top: 281, maxH: null, maxW: null, scroll: null, side: 'clamped' }],
];
{
  const rows = menuTable(MP.menuPlace);
  const bad = rows.filter(([, got, want]) => !same(got, want));
  ok(bad.length === 0, `menuPlace: ${rows.length} placements — inside the viewport every time (the walk's two lower-row title menus clamped inside, Move reachable), up flips, a tall one scrolls`, bad.map(([n, g, w]) => ({ n, g, w })));
  const inside = (p, h, vh) => p.top >= 0 && p.top + (p.maxH ?? h) <= vh;
  let n = 0, out = [];
  for (let vh = 300; vh <= 900; vh += 37) for (let h = 20; h <= 1000; h += 53) for (let y = 0; y <= vh; y += 29) for (const up of [false, true]) { n++; const p = MP.menuPlace({ x: 10, y, w: 100, h, vw: 800, vh, up }); if (!inside(p, h, vh)) out.push({ vh, h, y, up, p }); }
  ok(out.length === 0, `menuPlace: a sweep of ${n} (viewport height × menu height × point × direction) — every menu inside the viewport`, out.slice(0, 3));
  // doors-table r4: an OPEN box (`keep` = its height as it stands) — standing inside, it keeps its top whatever it gained
  // (capped exactly when it no longer fits below it); no longer inside, it is placed afresh — inside either way
  const pad = MP.MENU_PAD, within = (p, h, vh) => p.top >= pad && p.top + (p.maxH ?? h) <= vh - pad;
  let nk = 0, nf = 0; const outK = [];
  for (let vh = 300; vh <= 900; vh += 37) for (let y = pad; y <= vh - pad - 20; y += 23) for (let k = 20; k <= 900; k += 41) for (let h = k; h <= k + 600; h += 47) {
    const p = MP.menuPlace({ x: 10, y, w: 100, h, vw: 800, vh, keep: k });
    if (y + k <= vh - pad) { nk++; if (p.side !== 'kept' || p.top !== y || !within(p, h, vh) || (p.maxH == null) !== (y + h <= vh - pad)) outK.push({ vh, y, k, h, p }); }
    else if (y + k > vh - pad + 1) { nf++; if (p.side === 'kept' || !within(p, h, vh)) outK.push({ vh, y, k, h, p }); }
  }
  ok(outK.length === 0 && nk > 1000 && nf > 1000, `menuPlace keep (r4): a sweep of ${nk} open boxes standing inside — the top KEPT, capped exactly when it no longer fits below, inside — and ${nf} a shrunk viewport left outside, placed afresh inside`, outK.slice(0, 3));
  // doors-table r5: a SCROLLED open box (`scrolled` = its offset, 0 … h − k) keeps it — its rows stay where they stood: the
  // offset still reachable, the box as tall as the room and that offset allow (never shorter than it stood), inside; at 0
  // it is r4's box; a box placed afresh leaves the offset to the browser
  let ns = 0, na = 0; const outS = [];
  for (let vh = 300; vh <= 900; vh += 37) for (let y = pad; y <= vh - pad - 20; y += 29) for (let k = 20; k <= 900; k += 47) for (let h = k; h <= k + 600; h += 53) for (const sc of new Set([0, 1, Math.floor((h - k) / 2), h - k].filter((v) => v <= h - k))) {
    const p = MP.menuPlace({ x: 10, y, w: 100, h, vw: 800, vh, keep: k, scrolled: sc }), tall = p.maxH ?? h, below = vh - pad - y;
    if (y + k <= vh - pad) { ns++; if (p.side !== 'kept' || p.top !== y || p.scroll !== sc || h - tall < sc || tall !== Math.min(below, h - sc) || tall < k || !within(p, h, vh) || (sc === 0 && p.maxH !== (h > below ? below : null))) outS.push({ vh, y, k, h, sc, p }); }
    else if (y + k > vh - pad + 1) { na++; if (p.side === 'kept' || p.scroll !== null || !within(p, h, vh)) outS.push({ vh, y, k, h, sc, p }); }
  }
  ok(outS.length === 0 && ns > 10000 && na > 1000, `menuPlace scrolled (r5): a sweep of ${ns} wheeled open boxes standing inside — the offset KEPT and reachable, as tall as the room and the offset allow (never shorter than it stood), at 0 the r4 box — and ${na} placed afresh (the offset left to the browser)`, outS.slice(0, 3));
  let nw = 0; const outW = [];
  for (let vw = 300; vw <= 1400; vw += 61) for (let x = 0; x <= vw; x += 37) for (let w = 50; w <= 2000; w += 89) { nw++; const p = MP.menuPlace({ x, y: 10, w, h: 50, vw, vh: 600 }); if (p.left < pad || p.left + (p.maxW ?? w) > vw - pad || (p.maxW == null) !== (w <= vw - 2 * pad)) outW.push({ vw, x, w, p }); }
  ok(outW.length === 0, `menuPlace maxW (r4): a sweep of ${nw} (viewport width × point × menu width) — never past an edge, capped exactly when wider than the viewport`, outW.slice(0, 3));
}

// ── §3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// B-6944 (the readers of B-db5d: a plugin's Update… / Uninstall… moved from native buttons into a «⋯» menu whose rows a keyboard
// could not reach — every showContextMenu menu was so): THE MENU'S KEYS, PURE menu-place.js menuKeyStep — [name, got, want]
const keyTable = (step) => {
  const v = (o) => ({ focus: null, press: false, open: false, leave: false, close: false, back: false, ...o });
  return [
    ['ArrowDown from none ⇒ the first row', step({ key: 'ArrowDown', at: -1, count: 3 }), v({ focus: 0 })],
    ['ArrowDown moves on', step({ key: 'ArrowDown', at: 0, count: 3 }), v({ focus: 1 })],
    ['ArrowDown from the last wraps to the first', step({ key: 'ArrowDown', at: 2, count: 3 }), v({ focus: 0 })],
    ['ArrowUp from none ⇒ the last row', step({ key: 'ArrowUp', at: -1, count: 3 }), v({ focus: 2 })],
    ['ArrowUp from the first wraps to the last', step({ key: 'ArrowUp', at: 0, count: 3 }), v({ focus: 2 })],
    ['Home ⇒ the first, End ⇒ the last', [step({ key: 'Home', at: 2, count: 3 }), step({ key: 'End', at: 0, count: 3 })], [v({ focus: 0 }), v({ focus: 2 })]],
    ['Enter and Space press the focused row', [step({ key: 'Enter', at: 1, count: 3 }), step({ key: ' ', at: 1, count: 3 })], [v({ focus: 1, press: true }), v({ focus: 1, press: true })]],
    ['Enter with no row focused presses nothing', step({ key: 'Enter', at: -1, count: 3 }), null],
    ['Enter / Space on an OFF row press nothing (it is reached and read, never pressed)', [step({ key: 'Enter', at: 1, count: 3, off: true }), step({ key: ' ', at: 1, count: 3, off: true })], [v({ focus: 1 }), v({ focus: 1 })]],
    ['Enter / ArrowRight on a row with a submenu OPEN it', [step({ key: 'Enter', at: 0, count: 2, parent: true }), step({ key: 'ArrowRight', at: 0, count: 2, parent: true })], [v({ focus: 0, open: true }), v({ focus: 0, open: true })]],
    ['ArrowRight on a plain row is no key of the menu', step({ key: 'ArrowRight', at: 0, count: 2 }), null],
    ['ArrowLeft in a submenu leaves it; at the top level it is nothing', [step({ key: 'ArrowLeft', at: 0, count: 2, inSub: true }), step({ key: 'ArrowLeft', at: 0, count: 2 })], [v({ leave: true }), null]],
    ['Escape closes and gives the focus back; Tab too (and moves on)', [step({ key: 'Escape', at: 1, count: 3 }), step({ key: 'Tab', at: 1, count: 3 })], [v({ close: true, back: true }), v({ close: true, back: true })]],
    ['a menu with no stop: the arrows do nothing, Escape still closes', [step({ key: 'ArrowDown', at: -1, count: 0 }), step({ key: 'Escape', at: -1, count: 0 })], [null, v({ close: true, back: true })]],
    ['a key that is not the menu\'s passes', step({ key: 'a', at: 0, count: 3 }), null],
    // its round: the ONE-ROW menu (every move stays on it, Enter presses it) and the ALL-OFF menu (every row reached, none pressed)
    ['one row: Down / Up / Home / End stay on it', [step({ key: 'ArrowDown', at: 0, count: 1 }), step({ key: 'ArrowUp', at: 0, count: 1 }), step({ key: 'Home', at: 0, count: 1 }), step({ key: 'End', at: 0, count: 1 })], [v({ focus: 0 }), v({ focus: 0 }), v({ focus: 0 }), v({ focus: 0 })]],
    ['one row: Enter presses it, ArrowDown from none reaches it', [step({ key: 'Enter', at: 0, count: 1 }), step({ key: 'ArrowDown', at: -1, count: 1 })], [v({ focus: 0, press: true }), v({ focus: 0 })]],
    ['all rows off: the arrows reach each (wrapping), Enter / Space press none', [step({ key: 'ArrowDown', at: 2, count: 3, off: true }), step({ key: 'ArrowUp', at: 0, count: 3, off: true }), step({ key: 'Enter', at: 1, count: 3, off: true }), step({ key: ' ', at: 2, count: 3, off: true })], [v({ focus: 0 }), v({ focus: 2 }), v({ focus: 1 }), v({ focus: 2 })]],
  ];
};
// B-6944 ② (its round — THE TYPING GUARD counted fields only): where do a person's KEYS go — the element holding the focus when a
// menu opens (utils.js menuOpenerTyping) — [name, got, want]
// B-6944 owed (主开发 09:53Z — THE TYPING GUARD IS FOR A MENU OPENED BY CODE): does a menu opening now take the focus — the
// person's own MENU key (the context-menu key, Shift+F10) vs any other key a moment ago, from where the focus was (utils.js
// menuTakesFocus, isMenuKey) — [name, got, want]
const takesTable = (f, k) => {
  const el = (tagName, o = {}) => ({ tagName, isContentEditable: false, classList: { contains: (c) => (o.cls || []).includes(c) }, ...o });
  const field = el('INPUT'), canvas = el('CANVAS'), live = el('DIV', { cls: ['browser-live'] }), button = el('BUTTON');
  const xpraSink = el('TEXTAREA', { cls: ['xpra-ime'] }), liveSink = el('TEXTAREA', { cls: ['browser-live-kbd'] });
  return [
    ['the person\'s MENU key in a text field: the menu takes the focus (a keyboard-only person walks it)', f({ menuKey: true, fromKey: false, opener: field }), true],
    ['…the menu key on a button: takes it', f({ menuKey: true, opener: button }), true],
    ['…the menu key with nothing focused: takes it', f({ menuKey: true, opener: null }), true],
    ['…the menu key on a remote desktop\'s canvas: NO — the key is the remote machine\'s', f({ menuKey: true, fromKey: true, opener: canvas }), false],
    ['…the menu key in the live browser view: NO — the page\'s', f({ menuKey: true, opener: live }), false],
    ['…the menu key while DRIVING an xpra desktop (its key sink holds the focus): NO — the remote machine\'s', f({ menuKey: true, opener: xpraSink }), false],
    ['…the menu key while driving the live browser (its key sink): NO — the page\'s', f({ menuKey: true, opener: liveSink }), false],
    ['a menu REDRAWING itself while the focus is in it keeps it — opened by the menu key from a field a moment before', f({ kept: true, opener: field }), true],
    ['a menu CODE opened a moment after a key in a field: no focus (no character lost)', f({ fromKey: true, opener: field }), false],
    ['…after a key on a canvas: no focus', f({ fromKey: true, opener: canvas }), false],
    ['…after a key on a button: takes it', f({ fromKey: true, opener: button }), true],
    ['no key (a pointer\'s menu, a timer\'s): no focus', f({ opener: button }), false],
    ['isMenuKey: the context-menu key, Shift+F10 — yes; F10, a modifier with either (no menu raised), Enter — no', [k({ key: 'ContextMenu' }), k({ key: 'F10', shiftKey: true }), k({ key: 'F10' }), k({ key: 'F10', shiftKey: true, ctrlKey: true }), k({ key: 'F10', shiftKey: true, altKey: true }), k({ key: 'ContextMenu', metaKey: true }), k({ key: 'Enter' }), k(null)], [true, true, false, false, false, false, false, false]],
  ];
};
const typingTable = (f) => {
  const el = (tagName, o = {}) => ({ tagName, isContentEditable: false, classList: { contains: (c) => (o.cls || []).includes(c) }, ...o });
  return [
    ['a text field (the caret)', f(el('INPUT')), true],
    ['a textarea (a composer, an IME sink)', f(el('TEXTAREA')), true],
    ['an editable block', f(el('DIV', { isContentEditable: true })), true],
    ['a frame (an app\'s picture, a Web view)', f(el('IFRAME')), true],
    ['a desktop\'s picture: noVNC\'s canvas', f(el('CANVAS')), true],
    ['a stream\'s picture: its video', f(el('VIDEO')), true],
    ['the live browser view\'s own root', f(el('DIV', { cls: ['browser-live'] })), true],
    ['a button (the «⋯», a toolbar door)', f(el('BUTTON')), false],
    ['a toolbar button (the live browser view\'s own: not its root)', f(el('BUTTON', { cls: ['file-tool-btn'] })), false],
    ['a taskbar tile', f(el('DIV', { cls: ['taskbar-item'] })), false],
    ['nothing focused', f(null), false],
  ];
};
{ const { menuTakesFocus, isMenuKey } = await import('../src/lib/utils.js'); const bad = takesTable(menuTakesFocus, isMenuKey).filter(([, g, w]) => JSON.stringify(g) !== JSON.stringify(w)); ok(bad.length === 0, 'B-6944 owed (09:53Z): a menu the person\'s own MENU key opened takes the focus wherever it was — a field too — but on a view the key is the shown machine\'s; a menu CODE opened takes it only from where no keys go; isMenuKey = the context-menu key and Shift+F10 alone', bad); }
{ const { menuOpenerTyping } = await import('../src/lib/utils.js'); const bad = typingTable(menuOpenerTyping).filter(([, g, w]) => g !== w); ok(bad.length === 0, 'B-6944 ② menuOpenerTyping (its round): a menu opened while a person\'s keys go to a field, a frame, a desktop\'s canvas, a stream\'s video or the live browser view takes no focus; from a button, a tile or nothing it may', bad); }
{ const bad = keyTable(MP.menuKeyStep).filter(([, g, w]) => !same(g, w)); ok(typeof MP.menuKeyStep === 'function' && bad.length === 0, 'B-6944 menuKeyStep: Up / Down wrap, Home / End, Enter / Space press, Enter / ArrowRight open a submenu and ArrowLeft leaves it, Escape and Tab close with the focus back; nothing else is the menu\'s', bad.map(([n]) => n)); }

console.log('§3 the taskbar at a small screen (taskbar-fit.js)');
{
  ok(TF.TILE_MIN_PX === 90 && verdictOf(/\.taskbar-item \{[^}]*min-width: 90px;/.test(read('public/style.css'))), 'the tile floor is 90 px — taskbar-fit.js TILE_MIN_PX = style.css .taskbar-item min-width (P2-2: 60 px, a label of one or two characters)');
  const tiles = Array.from({ length: 8 }, (_, i) => ({ id: 'w' + i, left: i * 92 - 60, width: 90 }));
  const h = TF.stripHidden({ tiles, width: 500 });
  ok(verdictOf(same(h, { hidden: ['w0', 'w6', 'w7'], before: 1, after: 2 })), 'stripHidden: a tile an edge cuts is hidden (one before, two after a 500 px strip)', h);
  ok(gateOf(same(TF.stripHidden({ tiles: tiles.slice(1, 5), width: 450 }).hidden, [])) && verdictOf(same(TF.stripHidden({}).hidden, [])), 'stripHidden: whole tiles (and nothing) hide nothing');
  const w = [
    TF.wheelScroll({ scrollLeft: 0, max: 416, deltaY: 120 }), TF.wheelScroll({ scrollLeft: 0, max: 416, deltaX: 120, deltaY: 0 }), TF.wheelScroll({ scrollLeft: 400, max: 416, deltaY: 120 }),
    TF.wheelScroll({ scrollLeft: 0, max: 416, deltaY: 3, deltaMode: 1 }), TF.wheelScroll({ scrollLeft: 0, max: 0, deltaY: 120 }), TF.wheelScroll({ scrollLeft: 200, max: 416, deltaY: -1, deltaMode: 2, width: 450 }),
  ];
  ok(verdictOf(same(w, [{ left: 120, used: true }, { left: 0, used: false }, { left: 416, used: true }, { left: 120, used: true }, { left: 0, used: false }, { left: 0, used: true }])), 'wheelScroll: deltaY scrolls sideways (P2-2: deltaY 120 ⇒ scrollLeft 0); a horizontal wheel is the browser\'s; clamped at the end; lines × 40, pages × the strip', w);
  const form = (n, bar, others = 140) => TF.switcherForm({ n, each: 54, add: 27, bar, others });
  ok(form(1, 300) === 'full' && form(3, 1008) === 'full' && form(8, 1008) === 'compact' && form(8, 679) === 'compact' && form(3, 679) === 'compact' && form(2, 679) === 'full' && form(6, 0) === 'full',
    'switcherForm: one desktop full; the walk\'s 3 at 1280 full; 8 (the owner\'s many) compact at 951 and 1280; 3 at a 951 px bar compact — the tiles keep 4 × 90 px; a bar not laid out full', [form(1, 300), form(3, 1008), form(8, 1008), form(8, 679), form(3, 679), form(2, 679), form(6, 0)]);
}

// ── §3b ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// B-6cf9 (the coordinator's r1479): THE STRIP'S TWO NAMES — a row: [name, before, after, wanted change: 'text' | 'structure' | 'none']
const stripRows = () => {
  const one = (id, title, star = '') => ({ id, title, star, group: null });
  const grp = (id, tabs, active, star = '') => ({ id, title: tabs[active][1], star, group: { tabs: tabs.map(([tid, title]) => ({ id: tid, title })), active } });
  const base = [one('w1', 'Lane A — ~/work'), one('w2', 'Terminal'), grp('w3', [['w3', 'Docs'], ['w4', 'Notes']], 0)];
  const edit = (f) => { const c = JSON.parse(JSON.stringify(base)); f(c); return c; };
  return [
    ['a title changes (an agent\'s status in it)', base, edit((c) => { c[0].title = 'Lane A · working — ~/work'; }), 'text'],
    ['a star is given', base, edit((c) => { c[1].star = '\u2605 '; }), 'text'],
    ['a grouped tab\'s title changes (not the active one)', base, edit((c) => { c[2].group.tabs[1].title = 'Notes · 2'; }), 'text'],
    ['a title holding a tab and a newline reads apart from its neighbour', [one('w1', 'a\tb'), one('w2', 'c')], [one('w1', 'a'), one('w2', 'b\tc')], 'text'],
    ['a window opens', base, edit((c) => { c.push(one('w9', 'New')); }), 'structure'],
    ['a window closes', base, edit((c) => { c.splice(1, 1); }), 'structure'],
    ['the tiles reorder', base, edit((c) => { c.reverse(); }), 'structure'],
    ['a tab joins a group', base, edit((c) => { c[2].group.tabs.push({ id: 'w5', title: 'More' }); }), 'structure'],
    ['a group\'s active tab changes', base, edit((c) => { c[2].group.active = 1; c[2].title = 'Notes'; }), 'structure'],
    ['nothing changes', base, edit(() => {}), 'none'],
  ];
};
const stripTable = (keysOf) => stripRows().map(([name, a, b, want]) => {
  const x = keysOf(a), y = keysOf(b);
  const got = x.structure !== y.structure ? 'structure' : x.text !== y.text ? 'text' : 'none';
  return [name, got, want];
});
console.log('§3b the strip\'s two names (taskbar-fit.js stripKeys — B-6cf9)');
{
  const rows = stripTable(TF.stripKeys);
  const bad = rows.filter(([, got, want]) => got !== want);
  ok(rows.length === 10 && bad.length === 0, `stripKeys: a title, a star or a grouped tab's title changes the TEXT only (painted in place — a press across it keeps its element); a window opened, closed or moved, a tab joining, the active tab change the STRUCTURE (the tiles rebuilt); nothing changed, nothing — ${rows.map(([n, g]) => `${n}: ${g}`).join(' · ')}`, bad);
  ok(gateOf(same(TF.stripKeys([]), { structure: '[]', text: '[]' })) && verdictOf(same(TF.stripKeys(null), { structure: '[]', text: '[]' })), 'stripKeys: an empty strip has two empty names (and a non-list reads as none)');
}

// ── §4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§4 the cascade that buries nothing (window-min-size.js cascadeBox)');
const cascadeRun = (cb, ws, size, n = 3, start = 0) => {
  const bars = [], boxes = [];
  for (let k = 0; k < n; k++) { const o = ((start + k) % 8) * 30; const b = cb({ left: 40 + o, top: 40 + o, width: Math.min(size.w, ws.w), height: Math.min(size.h, ws.h) }, ws, bars); boxes.push(b); bars.push({ left: b.left, top: b.top, width: b.width, height: 32 }); }
  const buried = boxes.map((b, i) => { const r = bars[i]; let worst = 0; for (const c of boxes.slice(i + 1)) { const ix = Math.max(0, Math.min(c.left + c.width, r.left + r.width) - Math.max(c.left, r.left)), iy = Math.max(0, Math.min(c.top + c.height, r.top + r.height) - Math.max(c.top, r.top)); worst = Math.max(worst, ix * iy / (r.width * r.height)); } return worst; });
  return { boxes, buried };
};
{
  const a = cascadeRun(MS.cascadeBox, { w: 691, h: 500 }, { w: 700, h: 500 });
  const b = cascadeRun(MS.cascadeBox, { w: 1020, h: 555 }, { w: 700, h: 500 });
  const c = cascadeRun(MS.cascadeBox, { w: 1100, h: 615 }, { w: 700, h: 500 }, 3, 3);
  ok(gateOf(a.buried.every((x) => x <= 0.2)) && gateOf(b.buried.every((x) => x <= 0.2)) && verdictOf(c.buried.every((x) => x <= 0.2)), `three windows opened in a row bury no earlier title bar past 20 % — 951 (691×500: tops ${a.boxes.map((x) => x.top).join(' / ')}), 1280 (1020×555: ${b.boxes.map((x) => x.top).join(' / ')}), 1100 from the counter's 4th slot (${c.boxes.map((x) => x.top).join(' / ')})`, { a, b, c });
  ok(verdictOf(same(MS.cascadeBox({ left: 70, top: 70, width: 900, height: 620 }, { w: 1536, h: 686 }, []), { left: 70, top: 66, width: 900, height: 620 })), 'no title bar on show: the slid slot exactly as before (test-window-minsize\'s UI 125 % row)');
  const many = cascadeRun(MS.cascadeBox, { w: 691, h: 500 }, { w: 700, h: 500 }, 8);
  ok(verdictOf(many.boxes.every((x) => x.height >= 300)), `a window is never opened a sliver of itself to spare a bar (≥ 60 % of the size asked: ${many.boxes.map((x) => x.height).join(' / ')}) — past the room it falls back to the slid slot`, many.boxes);
}

// ── §5 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§5 the desktop tier\'s toast spot (utils.js toastDeskSpot)');
{
  const { toastDeskSpot } = await import('../src/lib/utils.js');
  const toast = { left: 519, right: 880, top: 503, bottom: 547, height: 44 };
  const composer = { left: 261, right: 950, top: 434, bottom: 513 };
  const menu = { left: 749, right: 909, top: 172, bottom: 414 };
  const s1 = toastDeskSpot({ rect: toast, avoid: [composer], topY: 41, vh: 585 });
  const s2 = toastDeskSpot({ rect: toast, avoid: [composer, menu], topY: 41, vh: 585 });
  const s3 = toastDeskSpot({ rect: toast, avoid: [{ left: 0, right: 951, top: 60, bottom: 545 }], topY: 41, vh: 585 });
  ok(toastDeskSpot({ rect: toast, avoid: [menu], topY: 41, vh: 585 }) === null && gateOf(same(s1, { bottom: 159 })) && gateOf(same(s2, { bottom: 421 })) && s3 === null,
    'toastDeskSpot: clear ⇒ its own place; over the composer ⇒ it rises 8 px above it; over the composer then a menu ⇒ above both; no room under the toolbar ⇒ its own place', { s1, s2, s3 });
  // B-7a51 (the 2.369.410 train's K41: three «Marked done · Undo» toasts across the open For-you panel's band bar — a press for
  // «26 more — expand» landed on a toast's Undo, outside the panel, and the panel closed): the OPEN panel is in the avoid list,
  // and a stack that still meets it (no room above it) stands BESIDE it, on its left — toastBesidePanel's table
  const { toastBesidePanel, toastMayYield, toastCapPick } = await import('../src/lib/utils.js');
  ok(verdictOf(capTable(toastCapPick).every(([, g, w]) => g === w)), 'toastCapPick (round 3): a toast that may yield goes before one that may not, a seen one before one never drawn, the oldest first; nothing offered ⇒ none', capTable(toastCapPick).filter(([, g, w]) => g !== w));
  ok(verdictOf(besideTable(toastBesidePanel).every(([, g, w]) => same(g, w))), 'toastBesidePanel: a stack over the open panel stands 8 px left of it, else 8 px right of it (a left bar — its round\'s MUST) (÷ the UI scale); clear of it, below it, no panel ⇒ its place; no room on either side ⇒ null', besideTable(toastBesidePanel).filter(([, g, w]) => !same(g, w)));
  ok(verdictOf(yieldTable(toastMayYield).every(([, g, w]) => g === w)), 'toastMayYield (its round\'s MUST): a plain toast may be held while the stack has no room; an error, an action toast and a pinned notice never', yieldTable(toastMayYield).filter(([, g, w]) => g !== w));
}

// ── §6 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§6 the wiring — every door asks its rule');
{
  const W = strip(read('src/lib/window.js')), TB = strip(read('src/lib/taskbar.js')), DM = strip(read('src/lib/desktop-manager.js')), U = strip(read('src/lib/utils.js')), TG = strip(read('src/lib/tab-group.js'));
  const body = (src, head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
  ok(verdictOf(/if \(idx < 0 && this\.grid\) \{ const p = releasePoint\(\{ x: cx, y: cy \}, this\.workspace\.getBoundingClientRect\(\)\); idx = this\._getGridCell\(p\.x, p\.y\); \}/.test(body(W, '  _snapToGrid(winId, cx, cy) {'))), 'P2-1 a grid release outside every cell takes the nearest cell (_snapToGrid → releasePoint) — the title-bar drag\'s and the tear-off\'s drop both reach it');
  const endDrag = W.slice(W.indexOf('    const endDrag = (e, why = \'release\') => {'), W.indexOf('    const notePoint = (e) =>'));
  ok(gateOf(/win\._isSnapped = false;\s*\}\s*this\._keepReachable\(win\);\s*this\._clearGridHighlight\(\);/.test(endDrag)) && verdictOf(/if \(snapped\) win\._isSnapped = true;\s*this\._keepReachable\?\.\(win\);/.test(TG)), 'P2-1 the title-bar drag\'s last drop branch (snap or free) and the tab tear-off\'s drop end with _keepReachable');
  ok(gateOf(/this\._keepReachable\(win\);/.test(body(W, '  _reflowWindows() {'))) && gateOf(/const k = dir \? resizeRelease\(b, ws, dir, this\._barKeep\(win\), this\._ownMinOf\(win\)\) : releaseBox\(b, ws, this\._barKeep\(win\)\);/.test(W)) && verdictOf(/return \{ w: RELEASE_KEEP\.w \+ 2 \* bx, h: RELEASE_KEEP\.h \+ by \};/.test(W)), 'P2-1 every workspace reflow re-clamps (this client\'s fit); the keep counts the window\'s own border (80×32 of the BAR)');
  ok(gateOf(/this\._bringBack\?\.\(host\);/.test(body(W, '  revealWindow(id, {'))) && gateOf(/const k = insideBox\(b, ws\);/.test(W)) && verdictOf(/this\.witnessGeometry\(win\.id\);\s*win\.element\.style\.left = k\.left/.test(W)), 'P2-1 THE RECOVERY: revealWindow (every door that names a window) brings an unreachable one wholly inside — witnessed as the user\'s act');
  ok(verdictOf(/const w = app\.wm\.windows\.get\(id\);\s*if \(!w\) return;\s*if \(!w\.isMinimized && id === app\.wm\.activeWindowId && app\.wm\.isReachable\?\.\(id\) !== false\) \{ app\.wm\.witnessGeometry\?\.\(id\); app\.wm\.minimize\(id\); \}/.test(TB)), 'P2-1 the focused window\'s tile minimizes it only while its title bar is reachable (a buried one: the click brings it back) — the window read BY ITS ID at the click (B-6cf9 follow: a tile outlives a title change)');
  ok(verdictOf(/return cascadeBox\(\{ \.\.\.box, width: Math\.min\(width, ws\.w\), height: Math\.min\(height, ws\.h\) \}, ws, this\._barsOnShow\(\)\);/.test(W)), 'the default placement asks cascadeBox with the title bars on show');
  ok(gateOf(/const at = menuPlace\(\{ x, y, w: mr\.width, h: mr\.height, vw: window\.innerWidth, vh: window\.innerHeight, up \}\);/.test(U)) && !/if \(mr\.top < 0\) pop\.style\.top = '4px';/.test(U), 'P2-3 showContextMenu places every menu through menuPlace (its own clamp lines gone)');
  ok(gateOf(/pop\.style\.left = \(MENU_PAD \/ Z\) \+ 'px';\n    const mr = pop\.getBoundingClientRect\(\);/.test(U)) && gateOf(/if \(at\.maxW != null\) pop\.style\.maxWidth = \(at\.maxW \/ Z\) \+ 'px';/.test(U)) && verdictOf(/import \{ menuPlace, menuKeyStep, MENU_PAD \} from '\.\/menu-place\.js';/.test(read('src/lib/utils.js'))),
    'B-16ab ③ showContextMenu MEASURES a menu where it has the screen\'s width (at the left pad — at its point a fixed box is squeezed by the edge, slid by that width and grown back flush: the Agents dialog\'s «+ 添加账号…» at 390, 201 + 189 = 390) and applies menuPlace\'s maxW (the drawn proof: test-fit-390-chrome ③)');
  ok(gateOf(/return showContextMenu\(x, y, menuItems, 'taskbar-context-menu', \{ up: y > window\.innerHeight \/ 2 \}\);/.test(TB)) && !/menu\.style\.bottom = \(window\.innerHeight - y \+ 4\)/.test(TB) && gateOf(/showContextMenu\(e\.clientX, e\.clientY, items, 'context-menu', \{ up: e\.clientY > window\.innerHeight \/ 2 \}\);/.test(DM)) && !/menu\.style\.bottom = \(window\.innerHeight - e\.clientY \+ 4\)/.test(DM),
    'P2-3 the title-bar / tile / window-list menu and the desktop preview menu ask `up` — no bottom anchor written after');
  ok(gateOf(/fitTaskbarStrip\(app\);\s*\}/.test(TB)) && gateOf(/const \{ hidden \} = stripHidden\(\{ tiles, width: sr\.width \}\);/.test(TB)) && gateOf(/strip\.addEventListener\('wheel',/.test(TB)) && verdictOf(/\{ passive: false \}/.test(TB)), 'P2-2 every taskbar update fits the strip («+N» from stripHidden), the wheel scrolls it (a non-passive listener — it may take the wheel)');
  { const BI = body(TB, 'function bringTileIn(strip) {');
    ok(gateOf(/strip\.scrollLeft -= Math\.ceil\(sr\.left - r\.left\) \+ 4;/.test(BI)) && gateOf(/strip\.scrollLeft \+= Math\.ceil\(r\.right - sr\.right\) \+ 4;/.test(BI)) && gateOf(/if \(r\.left >= sr\.left - 0\.5 && r\.right <= sr\.right \+ 0\.5\) return;/.test(BI))
      && gateOf(/requestAnimationFrame\(\(\) => \{ strip\._bringIn = \{ id: win\.id, until: performance\.now\(\) \+ BRING_IN_MS, tries: 3 \}; bringTileIn\(strip\); \}\);/.test(TB))
      && gateOf(/chip\.setAttribute\('aria-label', chip\.title\);\s*bringTileIn\(strip\);\s*\}/.test(TB)) && gateOf(/strip\.addEventListener\('wheel', \(e\) => \{\s*strip\._bringIn = null;/.test(TB)) && verdictOf(/strip\.addEventListener\('pointerdown', \(\) => \{ strip\._bringIn = null; \}, \{ passive: true \}\);/.test(TB)),
      'B-b13c a «+N» row brings its tile into the strip WHOLE across a FRACTIONAL strip edge: whole pixels rounded outward, again at the refit its own scroll starts (the chip\'s new count moves the edge after the scroll — 1024×600: tile right 761 vs strip right 760.17), «whole» = stripHidden\'s ±0.5 px; the person\'s own wheel or press ends it (never pulls the strip back)'); }
  { // B-b13c, the BEHAVIOUR (the reading of 2026-11-18): taskbar.js's own bringTileIn source, run over a fake strip and a fake clock
    const RAW = read('src/lib/taskbar.js'), a = RAW.indexOf('const BRING_IN_MS = '), b = RAW.indexOf('\n}\n', RAW.indexOf('function bringTileIn(strip) {'));
    const SRC = a >= 0 && b > a ? RAW.slice(a, b + 2) : '';
    const mk = (src) => new Function('performance', `${src}\nreturn bringTileIn;`);
    const rig = (src, { left0, width = 90, sl = 0, max = 10000, now = 0 } = {}) => {
      const clock = { t: now }, fn = mk(src)({ now: () => clock.t });
      const strip = { _bringIn: { id: 'w', until: 600, tries: 3 }, _sl: sl, get scrollLeft() { return this._sl; }, set scrollLeft(v) { this._sl = Math.max(0, Math.min(max, Math.round(v))); },
        getBoundingClientRect: () => ({ left: 266, right: 760.17 }) };
      const el = { dataset: { winId: 'w' }, getBoundingClientRect: () => ({ left: left0 - strip._sl, right: left0 - strip._sl + width }) };
      strip.children = [el];
      return { fn, strip, clock, go: () => { fn(strip); return { sl: strip._sl, left: strip._bringIn && strip._bringIn.tries }; } };
    };
    const legs = (src) => { const bad = []; try {
      { const R = rig(src, { left0: 671 + 883, sl: 883 }); const s1 = R.go(); if (!(s1.sl === 883 + 1 + 4 && s1.left === 2)) bad.push('a tile 0.83 px past the right edge scrolls ceil(0.83) + 4 = 5 px, one try spent ' + JSON.stringify(s1));
        const s2 = R.go(); if (!(s2.sl === s1.sl && R.strip._bringIn)) bad.push('then whole: no scroll, the bring-in kept for the refit ' + JSON.stringify(s2)); }
      { const R = rig(src, { left0: 671 + 883 - 0.4, sl: 883 }); const s = R.go(); if (s.sl !== 883) bad.push('0.4 px past = whole by stripHidden\'s ±0.5: no scroll ' + JSON.stringify(s)); }
      { const R = rig(src, { left0: 264 + 10, sl: 10 }); const s = R.go(); if (s.sl !== 10 - (2 + 4)) bad.push('the left edge: 2 px past scrolls back ceil(2) + 4 ' + JSON.stringify(s)); }
      { const R = rig(src, { left0: 671 + 883, sl: 883 }); R.clock.t = 601; const s = R.go(); if (!(s.sl === 883 && R.strip._bringIn === null)) bad.push('past BRING_IN_MS: no scroll, the bring-in ends ' + JSON.stringify(s)); }
      { const R = rig(src, { left0: 671 + 883 + 200, sl: 883, max: 883 }); const seen = []; for (let i = 0; i < 5; i++) seen.push(R.go()); if (!(R.strip._bringIn === null && seen[2].left === 0 && seen[3].left === null)) bad.push('a tile the range cannot reach: three tries, then it ends (never a loop) ' + JSON.stringify(seen)); }
    } catch (e) { bad.push('threw: ' + String(e && e.message)); } return bad; };
    const got = SRC ? legs(SRC) : ['bringTileIn not found in taskbar.js'];
    ok(got.length === 0, 'B-b13c bringTileIn over a fake strip and clock: whole pixels rounded outward, ±0.5 px is whole, both edges, it ends at BRING_IN_MS and after three tries', got);
    const mut = SRC ? legs(SRC.replace('  want.tries--;\n', '\n')) : [];
    ok(verdictOf(mut.some((w) => /three tries/.test(w))), 'MUTANT (tries never counted down): the unreachable tile is scrolled at every refit — RED', mut);
  }
  ok(gateOf(/if \(form === 'compact'\) \{ this\._renderCompactSwitcher\(container\); return; \}/.test(DM)) && gateOf(/return switcherForm\(\{ n, each: previewW \+ 6, add: 27, bar: bar\.clientWidth, others, stripMin: STRIP_MIN_TILES \* TILE_MIN_PX \}\);/.test(DM)) && verdictOf(/if \(digest \+ form === this\._switcherDigest\) return;/.test(DM)), 'P2-2 the desktop switcher\'s form is part of its digest and PURE switcherForm decides it');
  const CS = strip(read('src/lib/chat-status-bar.js'));
  // lane mask-value-shape (the strip's step two — the owner's arrangement of 2026-11-14): a narrow window's bar is the strip's
  // SAME two rows (a row break below ONE_ROW_PX, strip-table.js) — it was ONE row with ⋯ under 480 px
  ok(!/NARROW_BAR_PX/.test(read('src/lib/chat-status-bar.js')) && gateOf(/export const SHORT_WINDOW_PX = 300;/.test(read('src/lib/chat-status-bar.js'))) && gateOf(/if \(!one && firstRow2 > 0\) ordered\.splice\(firstRow2, 0, mark\('row-break', 'chat-status-rowbreak'\)\);/.test(CS)) && verdictOf(/if \(view && view\.classList\.contains\('chat-short'\) !== short\) view\.classList\.toggle\('chat-short', short\);/.test(CS)), 'P2-4 a narrow desk window\'s bar is the strip\'s two rows (the row break below ONE_ROW_PX — no one-row fold); a window shorter than 300 px marks its view chat-short');
  const CC = read('public/chat.css');
  ok(gateOf(/\.chat-status-bar > \.chat-status-rowbreak \{ flex-basis: 100%;/.test(CC)) && !/chat-status-narrow|chat-status-folded/.test(CC) && verdictOf(/\.chat-view\.chat-short \.chat-input \{ min-height: 34px;/.test(CC)), 'P2-4 chat.css: the row break takes a whole line (nothing folds — no narrow / folded rules left); the short view\'s composer starts at one line');   // stale-pins: kept — a «gone» check: no narrow / folded rule left
  ok(gateOf(/\.chat-msg:has\(> \.chat-open-editor-btn\) > :is\(\.chat-compact-msg, \.chat-bubble\) \.chat-text \{ padding-right: 28px; \}/.test(CC)) && gateOf(/\.chat-msg:has\(> \.chat-fork-btn\) > :is\(\.chat-compact-msg, \.chat-bubble\) \.chat-text \{ padding-right: 56px; \}/.test(CC)) && gateOf(/\.chat-fork-btn \{ right: 30px; \}/.test(CC)) && !/chat-msg-gutter/.test(CC), 'P2-5 a message with hover buttons keeps their column free — its text\'s right padding = the buttons (28 px for one 24 px button, 56 for two 4 px apart); never a float (a float as tall as the buttons made every one-line row taller — test-ax-budget\'s band)');
  const SC = read('public/style.css');
  ok(gateOf(/_observeTitleWidth\(winInfo\);/.test(W)) && gateOf(/const NARROW_TITLE_PX = 440;/.test(read('src/lib/window.js'))) && verdictOf(/\.window-titlebar\.titlebar-narrow \.win-overlap-btn \{ display: none; \}/.test(SC)), 'P2-6 a title bar under 440 px sets its ⧉ indicator aside (the wider buttons never take a narrow window\'s title / a split group\'s tab doors)');
  ok(gateOf(/flex-shrink: 0; \}/.test(CC.slice(CC.indexOf('.chat-status-bar .chat-status-clickable {')))) && verdictOf(/\.dialog-close \{[^}]*min-width: 24px; min-height: 24px; margin: -2\.5px 0;/.test(SC)), 'P2-6 the chips never shrink under their words (an explicit min-width replaces a flex item\'s content minimum); the dialog ✕ gives the header its line back (no dialog grows)');
  ok(gateOf(/\.win-btn \{\s*width: 24px; height: 24px;/.test(SC)) && gateOf(/\.window-controls \{ display: flex; gap: 4px;/.test(SC)) && gateOf(/\.global-toast-x \{[^}]*min-width: 24px; min-height: 24px;/.test(SC)) && gateOf(/\.dialog-close \{[^}]*min-width: 24px; min-height: 24px;/.test(SC)) && verdictOf(/\.chat-status-bar \.chat-status-clickable \{ display: inline-flex; align-items: center; justify-content: center; min-height: 24px; min-width: 24px;/.test(CC)),
    'P2-6 the 24 px mouse target: the window buttons (4 px apart), a toast\'s ✕, a dialog\'s ✕, the status chips');
  const P = strip(read('src/lib/desktop-picker.js'));
  ok(gateOf(/box\.dataset\.popover = '1';/.test(P)) && gateOf(/const offOutside = onOutsidePress\(box, \(\) => close\(\), \{ exclude: anchor \? \[anchor\] : \[\] \}\);/.test(P)) && !/document\.addEventListener\('pointerdown'/.test(P) && verdictOf(/Wayland session and cannot be shown yet — click here for the virtual desktop\./.test(read('src/lib/desktop-picker.js'))), 'P3-1 the Desktop popover joins the Esc protocol and the app\'s closer (a press into a frame closes it), its sentence whole');
  ok(verdictOf(/iframe\.contentWindow\.addEventListener\('keydown', \(e\) => \{ if \(e\.key === 'Escape' && !e\.isComposing\) document\.querySelectorAll\('\[data-popover\]'\)\.forEach\(\(p\) => p\.remove\(\)\); \}, \{ signal: winInfo\._listenerCtl\?\.signal \}\);/.test(read('src/lib/browser-window.js'))), 'P3-1 a same-origin Web view page\'s Escape closes every [data-popover] float (its listener on the window\'s controller)');
  const TF2 = strip(read('src/lib/toolbar-fold.js'));
  ok(gateOf(/const ro = new ResizeObserver\(judgeTitle\); ro\.observe\(title\); life\.signal\.addEventListener\('abort', \(\) => ro\.disconnect\(\), \{ once: true \}\);/.test(TF2)) && gateOf(/signal: life\.signal,/.test(TF2)) && verdictOf(/fold\.dispose = \(\) => life\.abort\(\);/.test(TF2)), 'P3-2 the brand re-judges its own box (whole or not drawn after any resize) — its observer joined to the fold\'s ONE lifetime (r2 ④: the fold\'s dispose disconnects it)');
  // acceptance r2
  const endResize = W.slice(W.indexOf('        const endResize = (why = \'release\') => {'), W.indexOf('          win._lastResizeEnd = why;'));
  ok(verdictOf(/if \(resized\) this\._keepReachable\(win, dir\);/.test(endResize)), 'r2 ③ the resize\'s END door keeps the title bar too (_keepReachable with its edge — PURE resizeRelease)');
  ok(gateOf(/let hoverPreview = under\?\.closest\('\.desktop-preview, \.desktop-switch-row'\);/.test(W)) && gateOf(/this\._app\?\.desktopManager\?\.dragHover\?\.\(under\);/.test(W)) && verdictOf(/document\.querySelectorAll\('\.desktop-preview, \.desktop-switch-row'\)\.forEach\(p => p\.classList\.remove\('desktop-preview-drop'\)\);\s*this\._app\?\.desktopManager\?\.dragDone\?\.\(\);/.test(W)),
    'r2 ① a title-bar drag hit-tests the compact list\'s rows beside the previews, springs the list open on the button, and closes it with the drag');
  ok(gateOf(/if \(deskPreviewTarget && deskPreviewTarget\.classList\.contains\('desktop-switch-row'\)\) \{[\s\S]*?this\._dropOnDeskRow\(win, dragFrom, \{ id: deskId, name: deskName \}, \{ wasMax: dragFromMax, prev: dragFromPrev \}\);/.test(endDrag)) && verdictOf(/this\._keepReachable\(win\);\s*const dm = this\._app\?\.desktopManager;\s*if \(dm && desk\.id && desk\.id !== dm\.activeDesktopId\) dm\.dropOnRow\(win\.id, desk\.id, desk\.name\);/.test(body(W, '  _dropOnDeskRow(win, from, desk, back) {'))),
    'r2 ① released on a row: the window keeps its drag-start place (reachable) and moves by the row\'s door, dropOnRow (r3 ③)');
  // acceptance r3
  const tileEnds = TB.split("item.addEventListener('dragend', () => app.desktopManager?.dragDone?.());").length - 1;
  const arm = body(DM, '  _springArm() {'), hov = body(DM, '  dragHover(under) {'), done = body(DM, '  dragDone() {');
  ok(gateOf(/btn\.addEventListener\('dragleave', \(\) => this\._springStop\(\)\);/.test(DM)) && tileEnds === 2 && gateOf(/const life = this\._springLife = new AbortController\(\), o = \{ capture: true, signal: life\.signal \};/.test(arm)) && gateOf(/for \(const type of \['dragenter', 'dragover'\]\) window\.addEventListener\(type, \(e\) => this\.dragHover\(e\.target\), o\);/.test(arm)) && gateOf(/window\.addEventListener\('drop', \(\) => setTimeout\(\(\) => this\.dragDone\(\), 0\), o\);/.test(arm)) && verdictOf(/window\.addEventListener\('dragend', \(\) => this\.dragDone\(\), o\);/.test(arm)),
    `r3 ① the HTML5 road ends the spring: the button's dragleave stops the timer, both tile builders' dragend (${tileEnds}) and the document's drop / dragend end it, its dragenter / dragover are the hit test — on ONE AbortController`);
  ok(gateOf(/if \(this\._springList && !this\._springList\.isConnected\) this\._springList = null;/.test(hov)) && gateOf(/this\._springArm\(\);/.test(hov)) && gateOf(/if \(b && this\._springLife\) this\._springList = this\._openDesktopList\(b\);/.test(hov)) && gateOf(/this\._springStop\(\);\s*if \(this\._springList\) \{ this\._springList\.remove\(\); this\._springList = null; \}\s*if \(this\._springLife\) \{ this\._springLife\.abort\(\); this\._springLife = null; \}/.test(done)) && verdictOf(/this\.dragDone\(\); list\?\.remove\(\);/.test(DM)),
    'r3 ① ONE lifecycle for both roads: dragHover arms it (a list closed by its own door drops its ref), the timer opens a list only while armed, dragDone clears timer + list + ref + listeners, a row drop ends it');
  const dropRow = body(DM, '  dropOnRow(winId, deskId, name) {');
  ok(gateOf(/if \(!this\._desktops\.some\(\(d\) => d\.id === deskId\)\) \{\s*showToast\(t\('\{why\} — the window stays where it is', \{ why: this\._doorLabel\('switch', deskId, name\) \}\), \{ type: 'warn', duration: 6000 \}\);\s*return \{ ok: false, code: 'no-desktop' \};/.test(dropRow)) && gateOf(/return this\.moveWindowToDesktop\(winId, deskId, \{ speak: true \}\);/.test(dropRow)) && verdictOf(/if \(winId\) this\.dropOnRow\(winId, el\._desk\.id, el\._desk\.name\);/.test(DM)),
    'r3 ③ a row drop (both roads) moves only to a desktop that IS here — a gone one refused by name, the window kept where it is');
  ok(gateOf(/const done = \(p\) => Promise\.resolve\(p\)\.then\(\(r\) => \{ if \(r !== false\) after\?\.\(\); \}\);/.test(DM)) && verdictOf(/if \(!\(name && name\.trim\(\)\)\) return false;[^\n]*\n\s*if \(this\._doorRefused\(desk, 'rename'\)\) return false;[^\n]*\n\s*const typed = name\.trim\(\), live = [^\n]*\n[\s\S]*?\n\s*this\.renameDesktop\(desk\.id, typed\);\s*return true;/.test(body(DM, '  async _startRename(desk) {'))),
    'r3 ④ a cancelled Rename… (false) brings nothing back — the list stays shut (desktop-doors-table r2 ②: nor a refused one — the desktop deleted elsewhere while the dialog was open)');
  ok(gateOf(/const items = this\._deskItems\(desk\);/.test(DM)) && gateOf(/showContextMenu\(x, y, this\._deskItems\(el\._desk, \{ order: true, after: back \}\), 'context-menu',/.test(DM)) && gateOf(/this\.reorderDesktop\(desk\.id, prev\.id\)/.test(DM)) && gateOf(/this\.reorderDesktop\(next\.id, desk\.id\)/.test(DM)) && gateOf(/done\(this\._startRename\(desk\)\)/.test(DM)) && verdictOf(/done\(this\.deleteDesktop\(desk\.id\)\)/.test(DM)),
    'r2 ① the preview\'s menu and a compact-list row\'s (right-click / ⋯) are ONE item set, the same handlers (Rename…, Delete, + Move up / Move down for a row)');
  ok(gateOf(/const stage = this\.app\.stage, rows = this\._desktopListRows\(\);/.test(DM)) && gateOf(/rows\.forEach\(\(row, k\) => \{ if \(row\.kind === 'desktop' && els\[k\]\) this\._rowDoors\(els\[k\], row\.desk\); \}\);/.test(DM)) && gateOf(/extraClass: 'desktop-switch-menu'/.test(DM)) && verdictOf(/if \(extraClass\) pop\.classList\.add\(/.test(U)),
    'r2 ① ⑥ the list\'s rows come from ONE named source (_desktopListRows — the seam for desktopRows), each row gets its doors; the list is styled before it is measured (extraClass)');
  const listRows = body(DM, '  _desktopListRows(drawn = null) {');
  ok(gateOf(/import \{ sheetRows \} from '\.\/desktop-switch-sheet\.js';/.test(DM)) && gateOf(/for \(const r of sheetRows\(\{ desktopManager: this, wm: this\.app\.wm \}, drawn\)\) \{/.test(listRows)) && gateOf(/rows\.push\(\{ kind: 'desktop', id: r\.id, desk, name: r\.name, count: r\.windows, on: !stage\?\.isActive && r\.active \}\);/.test(listRows)) && !/_savedStates|wm\.windows/.test(listRows),
    'int358 seam (c): the compact list\'s desktop rows ARE the phone sheet\'s (sheetRows → PURE desktopRows) — the same names and counts on both surfaces, no second counter; the row keeps the manager\'s own desktop for its doors');
  ok(gateOf(/const at = menuPlace\(\{ x: r\.right - pr\.width, y: up \? room : 0, w: pr\.width, h: pr\.height, vw: window\.innerWidth, vh: room, up \}\);/.test(TB)) && gateOf(/if \(at\.maxH != null\) \{ pop\.style\.maxHeight = \(at\.maxH \/ Z\) \+ 'px'; pop\.style\.overflowY = 'auto'; \}/.test(TB)) && !/const above = r\.top - pr\.height - 4;/.test(TB),
    'r2 ② the «+N» list is placed by menuPlace in the room on its chip\'s side — capped and scrolling (no self-placement left)');
  ok(gateOf(/this\._narrowTitleRO = new ResizeObserver/.test(W)) && !/this\._titleRO\b/.test(W), 'the narrow-title observer has its own field (`_titleRO` is the tab-group mixin\'s split-tail observer — sharing it silenced the split tail: test-split-ux)');
  const SU = read('src/lib/settings-ui.js');
  ok(gateOf(/dialog\.append\(header, searchWrap, body, foot\);/.test(SU)) && verdictOf(/\.settings-foot \{/.test(SC)), 'P3-3 the Settings window: its save rule at its foot (the nav is its own column already)');
  // B-6944: every showContextMenu menu is a keyboard's — ARIA roles, every row a stop (an OFF row too: reached, read, never pressed;
  // a caption no stop), the keys through menuKeyStep, the focus taken at the first STOP only when a KEY opened it from where no
  // person's keys go (menuOpenerTyping: a field, a frame, a desktop's or a live browser's view), and given back on close
  const VCSS = read('public/viewers.css');
  const keyed = (u, css) => /pop\.setAttribute\('role', 'menu'\);\n\s+pop\._menuOpener = opener;/.test(u)
    && /function menuStop\(el, live\) \{ el\.setAttribute\('role', 'menuitem'\); el\.tabIndex = -1; el\.dataset\.menuStop = '1'; if \(!live\) el\.setAttribute\('aria-disabled', 'true'\); \}/.test(u)
    && /row\.setAttribute\('role', 'menuitem'\); row\.setAttribute\('aria-disabled', 'true'\); row\.tabIndex = -1; row\.dataset\.menuStop = '1';/.test(u) && /row\.setAttribute\('aria-describedby', why\.id\);/.test(u)
    && /menuStop\(el, !item\.disabled\);/.test(u) && /menuStop\(ce, !child\.disabled\);/.test(u)
    && /const st = menuKeyStep\(\{ key: e\.key, at, count: stops\.length, parent: [^\n]*inSub: level !== pop, off: [^\n]*\}\);/.test(u)
    && /armMenuKeys\(pop, \{ opener, fromKey, keep, menuKey, kept: !!held \}\);\s*\n\s*placeMenu\(pop, x, y, \{ up, placesItself \}\);/.test(u) && /const menuKey = Date\.now\(\) - _menuOwnKeyAt < MENU_KEY_MS;/.test(u)
    && /const held = \[\.\.\.document\.querySelectorAll\('\.' \+ className\.split\(' '\)\[0\]\)\]\.find\(\(p\) => p\.contains\(document\.activeElement\)\);/.test(u) && /const opener = held \? \(held\._menuOpener \|\| null\) : document\.activeElement;/.test(u)
    && /const takes = menuTakesFocus\(\{ fromKey, menuKey, opener, kept \}\);/.test(u) && /if \(takes\) queueMicrotask\(/.test(u) && /if \(menuKey\) _menuOwnKeyAt = 0;/.test(u)
    && /const at = \(keep && all\.find\(\(r\) => \(r\.textContent \|\| ''\)\.trim\(\) === keep\)\) \|\| all\[0\]; if \(at\) at\.focus\(\{ preventScroll: true \}\);/.test(u) && !/\|\| live\[0\] \|\| all\[0\]/.test(u)   // stale-pins: kept (an absence check: the first focus never skips an off row for a live one — its round ①)
    && /if \(st\.close\) \{ pop\.remove\(\); if \(st\.back\) giveBack\(\); return; \}/.test(u)
    && /window\.addEventListener\('pointerdown', \(e\) => \{ _gestureAt = Date\.now\(\); _menuKeyAt = _menuOwnKeyAt = 0; if \(e\.isTrusted !== false\) _personAct = \{ at: _actAt\(e\), ref: _actRef\(e\.target\) \}; \}, true\);/.test(u) && /window\.addEventListener\('keydown', \(e\) => \{ if \(isGestureKey\(e, _editable\(e\.target\)\)\) _gestureAt = _menuKeyAt = Date\.now\(\); if \(isMenuKey\(e\)\) _menuOwnKeyAt = Date\.now\(\); if \(keyIsAct\(e\)\) _personAct = \{ at: _actAt\(e\), ref: _actRef\(e\.target\) \}; \}, true\);/.test(u)   // B-c87d: the same two listeners also stamp the person's last act
    && !/document\.addEventListener\('keydown', \(e\) => \{ if \(isGestureKey/.test(u) && !/document\.addEventListener\('pointerdown', \(\) => \{ _menuKeyAt = 0; \}/.test(u)   // stale-pins: kept (an absence check: no page-long document listener of the menu's own — the block checkpoint's red, test-needs-doors)
    && /\.context-menu-item:focus-visible, \.taskbar-context-menu-item:focus-visible \{ background: var\(--bg-hover\);/.test(css) && /\.context-menu-item:focus, \.taskbar-context-menu-item:focus \{ outline: none; \}/.test(css);
  ok(verdictOf(keyed(U, VCSS)), 'B-6944: showContextMenu is a keyboard\'s menu — role menu / menuitem, every row a stop (an off row aria-disabled with its why described: read, never pressed), the keys through menuKeyStep, the focus taken only when a gesture key led to it a moment ago (never from a field being typed in or a frame), given back on Escape / Tab, kept on its row when the menu redraws itself; only the KEYS\' row is drawn (a pointer\'s look unchanged)');
  ok(!keyed(U.replace('if (takes) queueMicrotask(', 'if (false) queueMicrotask('), VCSS) && !keyed(U.replace("if (st.close) { pop.remove(); if (st.back) giveBack(); return; }", 'if (st.close) { pop.remove(); return; }'), VCSS)
    && !keyed(U.replace("const opener = held ? (held._menuOpener || null) : document.activeElement;", 'const opener = document.activeElement;'), VCSS)
    && !keyed(U, VCSS.replace('.context-menu-item:focus-visible, .taskbar-context-menu-item:focus-visible { background: var(--bg-hover);', '.context-menu-item:focus { background: var(--bg-hover);'))
    && !keyed(U + "\ndocument.addEventListener('keydown', (e) => { if (isGestureKey(e, _editable(e.target))) _menuKeyAt = Date.now(); }, true);\n", VCSS)   // stale-pins: kept (103af4972's listener, planted)
    && !keyed(U.replace("|| all[0]; if (at) at.focus({ preventScroll: true });", "|| live[0] || all[0]; if (at) at.focus({ preventScroll: true });"), VCSS)   // stale-pins: kept (the base's first live row, planted)
    && !keyed(U.replace('const takes = menuTakesFocus({ fromKey, menuKey, opener, kept });', "const typing = _editable(opener) || (!!opener && opener.tagName === 'IFRAME'); const takes = fromKey && !typing;"), VCSS)   // stale-pins: kept (the base's guard, planted)
    && !keyed(U.replace('const takes = menuTakesFocus({ fromKey, menuKey, opener, kept });', 'const takes = fromKey && !menuOpenerTyping(opener);'), VCSS)   // stale-pins: kept (the smalls' guard: no menu key, no redraw kept, planted)
    && !keyed(U.replace('  if (menuKey) _menuOwnKeyAt = 0;', ''), VCSS)
    && !keyed(U.replace(' if (isMenuKey(e)) _menuOwnKeyAt = Date.now();', ''), VCSS),
    'CONTROL: the checkpoint\'s shapes and the reader\'s finds — a key-opened menu that takes no focus, a close that leaves the focus nowhere, a redrawn menu that forgets its opener, a pointer press painting a row, a page-long document listener of the menu\'s own (103af4972: the block checkpoint\'s red), the first focus skipping an off row for a live one, the guard counting fields only (its round ① ②), the guard judging the opener alone (the person\'s menu key in a field took no focus — 09:53Z), the menu key never stamped, its stamp never consumed — are each refused');
  ok(gateOf(/if \(shown && !_toastTier\(\) && !_openModalDialog\(\)\) \{ _placeDeskToasts\(stack\); return; \}/.test(U)) && verdictOf(/const rect = stack\.getBoundingClientRect\(\);\n  const desk = toastDeskSpot\(\{ rect, avoid: _toastAvoid\(rect\),/.test(U)), 'the desktop tier\'s toast stack (anchored or centred) is placed off every open menu and composer');
  const PANEL = strip(read('src/lib/user-todos-panel.js')), CSS = read('public/style.css');
  // B-7a51 + its round's MUST (A TOAST THAT YIELDS IS NEVER LOST): above the open panel → beside it (left, else right) → its PLAIN
  // toasts held (their time stopped), what stays placed clear when it now fits; every placement measures the whole stack and
  // draws again (time WHOLE) what it no longer holds; the panel's open / close / GROWTH re-place it; a toast press is no outside press
  const yields = (u, panelSrc, css) => /const up = toastDeskSpot\(\{ rect: r2, avoid: \[\.\.\._toastAvoid\(r2\), fr\], topY, vh: window\.innerHeight, scale: uiScale\(\) \}\);/.test(u)
    && /if \(up\) \{ stack\.style\.top = 'auto'; stack\.style\.bottom = up\.bottom \+ 'px'; return true; \}\s*const beside = toastBesidePanel\(\{ rect: r2, panel: fr, vw: window\.innerWidth, scale: uiScale\(\) \}\);\s*if \(!beside\) return false;/.test(u)
    && /if \(beside\.right != null\) \{ stack\.style\.left = 'auto'; stack\.style\.right = beside\.right \+ 'px'; \} else \{ stack\.style\.right = 'auto'; stack\.style\.left = beside\.left \+ 'px'; \}/.test(u)
    && /const r3 = stack\.getBoundingClientRect\(\), there = toastDeskSpot\(\{ rect: r3, avoid: \[\.\.\._toastAvoid\(r3\), fr\],[^\n]*\n\s+if \(there\) \{ stack\.style\.top = 'auto'; stack\.style\.bottom = there\.bottom \+ 'px'; \}/.test(u)
    && /if \(!clear\(\)\) \{\s*for \(const t of stack\.children\) if \(_toastYields\(t\)\) _toastHold\(t\);\s*if \(\[\.\.\.stack\.children\]\.some\(\(t\) => !t\.classList\.contains\('global-toast-held'\)\) && onPanel\(stack\.getBoundingClientRect\(\)\) && !clear\(\)\) \{\s*stack\.style\.transform = 'none';\s*if \(fr\.left \+ fr\.right > window\.innerWidth\) \{ stack\.style\.right = 'auto'; stack\.style\.left = \(8 \/ uiScale\(\)\) \+ 'px'; \}\s*else \{ stack\.style\.left = 'auto'; stack\.style\.right = \(8 \/ uiScale\(\)\) \+ 'px'; \}/.test(u)
    && /const _toastYields = \(t\) => toastMayYield\(\{ \.\.\.\(t\._toastKind \|\| \{\}\), action: !!\(t\._toastKind && t\._toastKind\.action\) \|\| !!t\.querySelector\('\.global-toast-setting, \.global-toast-tap'\) \}\);/.test(u)
    && /const others = \[\.\.\.stack\.children\]\.filter\(\(c\) => c !== el && !c\.classList\.contains\('global-toast-pinned'\)\);\s*const at = toastCapPick\(others\.map\(\(c\) => \(\{ yields: _toastYields\(c\), drawn: !!c\._toastDrawn \}\)\)\);\s*if \(at < 0\) break;\s*const drop = others\[at\];\s*if \(!drop\._toastDrawn && drop\._toastKey\) _markToastSeen\(drop\._toastKey, false\);\s*drop\.remove\(\);/.test(u)
    && (panelSrc.match(/press it again'\), \{ type: 'warn' \}\); return; \}/g) || []).length === 6
    && !/stack\.style\.visibility = 'hidden'/.test(u)   // stale-pins: kept (an absence check: the base's whole-stack yield is gone)
    && /const held = stack \? \[\.\.\.stack\.children\]\.filter\(\(t\) => t\.classList\.contains\('global-toast-held'\)\) : \[\];\s*for \(const t of held\) t\.classList\.remove\('global-toast-held'\);\s*try \{ _placeToastStackNow\(\); \} catch \{\s*\}\s*for \(const t of held\) if \(t\.isConnected && !t\.classList\.contains\('global-toast-held'\)\) _toastShow\(t\);/.test(u)
    && /function _toastHold\(el\) \{\s*clearTimeout\(el\._toastTimer\); el\._toastTimer = null;\s*el\.classList\.add\('global-toast-held'\);\s*if \(!el\._toastBorn && el\._toastKey\) \{ el\._toastJudge = true; _markToastSeen\(el\._toastKey, false\); \}/.test(u)
    && /function _toastShow\(el\) \{\s*el\.classList\.remove\('global-toast-held'\);\s*_toastRun\(el\);\s*_markDrawn\(el\);\s*if \(el\._toastJudge\) \{ el\._toastJudge = false; if \(_seenAtShow\(el\._toastRef\)\) _markToastSeen\(el\._toastKey, true\); \}/.test(u)
    && /el\._toastKind = \{ type, action: acts\.length > 0, pinned, timed: !!timed \};/.test(u)
    && /el\._toastTtl = pinned \? 0 : ttl;\s*_placeToastStack\(\); _queueToastPlace\(\);\s*if \(!el\.classList\.contains\('global-toast-held'\)\) \{ _toastRun\(el\); _markDrawn\(el\); \}\s*el\._toastBorn = true;/.test(u)
    && /const detach = el\.remove\.bind\(el\);\s*el\.remove = \(\) => \{ clearTimeout\(el\._toastTimer\); el\._toastTimer = null; detach\(\); \};/.test(u)
    && /frame\(\(\) => \{ if \(el\.isConnected && !el\.classList\.contains\('global-toast-held'\)\) el\._toastDrawn = true; \}\);/.test(u)
    && /el\._toastTimer = setTimeout\(\(\) => \{ el\._toastTimer = null; const st = el\.parentNode; el\.remove\(\);/.test(u)
    && (u.match(/el\.classList\.add\('global-toast-out'\)/g) || []).length === 1
    && /if \(fy\) _toastWatch\.observe\(fy, \{ attributes: true, attributeFilter: \['class', 'style'\] \}\);/.test(u)
    && /if \(fy && !_toastPanelSize && typeof ResizeObserver === 'function'\) \{ _toastPanelSize = new ResizeObserver\(_queueToastPlace\); _toastPanelSize\.observe\(fy\); \}/.test(u)
    && /document\.querySelectorAll\('\.context-menu, \.taskbar-context-menu, \[data-popover\], \.ut-announce'\)/.test(u)
    && /ignore: \(t\) => !!t\?\.closest\?\.\('[^']*#global-toasts[^']*'\)/.test(panelSrc)
    && /\n#global-toasts > \.global-toast\.global-toast-held \{ display: none; \}/.test(css);
  ok(verdictOf(yields(U, PANEL, CSS)), 'B-7a51 + its round\'s MUST: a stack still meeting the OPEN For-you panel rises above it when there is room, else stands beside it (left, else right) and off what stands there, else its PLAIN toasts are HELD (not drawn, their time stopped) while an error / an action toast / a pinned notice stays (placed clear when the smaller stack fits); every placement measures the whole stack and draws again — time WHOLE — what it no longer holds; a toast held at its birth loses `seen` and is judged when first drawn; the panel\'s open / close / growth re-place it; the panel is no obstacle in the general list; a toast press is no press outside the panel');
  const sub = (src, from, to) => { if (src.split(from).length !== 2) throw new Error('§6 control anchor: ' + from.slice(0, 70)); return src.replace(from, to); };
  // round 3's smalls: every refusal of a press in the panel is warn (the setting card's seventh too), the toast that names a time says so
  const UA = strip(read('src/lib/user-todos-actions.js')), DA = strip(read('src/lib/desktop-app-window.js'));
  const typed = (ua, da) => /showToast\(t\('It changed meanwhile — look again'\), \{ type: 'warn', duration: 9000 \}\); return false; \}/.test(ua)
    && /n: Math\.round\(OUTER_CLOSE_AGAIN_MS \/ 1000\) \}\), \{ duration: OUTER_CLOSE_AGAIN_MS, timed: true \}\);/.test(da);
  ok(verdictOf(typed(UA, DA)), 'B-7a51 round 3: the setting card\'s «It changed meanwhile» is warn like the six; the app window\'s «press ✕ again within n s» is timed — neither yields');
  ok(!typed(UA.replace("{ type: 'warn', duration: 9000 }", '{ duration: 9000 }'), DA) && !typed(UA, DA.replace(', timed: true });', ' });')),   // stale-pins: kept (the base's text, planted)
    'CONTROL: the seventh refusal untyped, the timed toast unmarked — each is refused');
  // THE TOAST CENSUS (2.369.413 checkpoint 2, the coordinator's law): round 3 counted ONE spelling of the jobs panel's failed acts in ONE
  // file; piece 7 then wrote two more failed-act toasts with the flag `error: true` that showToast never reads — one in that file, one in
  // src/lib/wake-grant-rows.js, which the leg never read — both drawn as plain toasts that yield to the open For-you panel. Now EVERY
  // call in the page's code (each .js under src/) of showToast — or of a name a file binds to it (`toast: showToast`) — is read whole:
  //  LAW 1: every option a call writes is one showToast READS (the reads taken from showToast's own signature in src/lib/utils.js):
  //         the flag nothing reads appears nowhere, whatever its file;
  //  LAW 2: a failed act's toast is typed error: every toast whose words are an answer's error (`….error`) gives its type — 'error',
  //         or a type computed from the answer that is 'error' on the failure — found by what it says, never counted; a WARN only where
  //         it is one on purpose, each NAMED below with its why (so the next reader does not cure it); a name no call carries is red.
  const WARN_ON_PURPOSE = [
    ['src/lib/browser-live-window.js', "String(m.error || m.code || 'refused')", 'the live view\'s REFUSAL codes (its `refused` answer): a refusal of a press is warn, like every other refusal there (B-7a51 round 3)'],
    ['src/lib/chat-renderers.js', "t('Could not search for {name}: {why}'", 'the chat\'s «search by name» for a file link: ONE toast says the search\'s outcome — «No file named …» (a finding, no failure) or, rarely, «Could not search» — a hint beside the chat, warn on purpose'],
  ];
  const PAGE = new Map((function walk(d) { const out = []; for (const e of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) out.push(...walk(r)); else if (e.name.endsWith('.js') && !/^i18n-/.test(e.name)) out.push(r); } return out; })('src').map((f) => [f, read(f)]));
  const READS = (() => { const m = /export function showToast\(message, \{([^}]*)\} = \{\}\)/.exec(PAGE.get('src/lib/utils.js') || ''); return m ? new Set(m[1].split(',').map((x) => x.trim().split(/\s*=/)[0]).filter(Boolean)) : null; })();
  ok(!!READS && gateOf(READS.has('type')) && !READS.has('error'), `the toast census takes what showToast reads from its own signature: ${READS ? [...READS].join(', ') : 'NOT FOUND'}`);
  const toastCensus = (files, warns = WARN_ON_PURPOSE) => {
    // THE READER (the coordinator's small, 03:01Z — bl-machines-a met it): ONE scan of a file marks each character as code, a comment,
    // a string / a template's text, or a REGEX LITERAL (a slash where an expression can start opens one, skipped to its close: classes
    // and escapes honoured, its flags after it); a template's ${…} is code again. The call finder, the argument split and the key split
    // all read that mask — so a call is read WHOLE whatever a person may lawfully write in its arguments (two slashes or a quote in a
    // regex were a line comment or a string to the reader before)
    const KW_BEFORE_REGEX = /(?:^|[^\w$])(?:return|typeof|case|in|of|void|delete|new|throw|instanceof|else|do|await|yield)$/;
    const maskOf = (s) => {
      const m = new Uint8Array(s.length), tpl = []; let prev = '', depth = 0;   // 0 code · 1 comment · 2 string / template text · 3 regex
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i), end = e < 0 ? s.length : e; m.fill(1, i, end); i = end - 1; continue; }
        if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2), end = e < 0 ? s.length : e + 2; m.fill(1, i, end); i = end - 1; continue; }
        if (c === '"' || c === "'") { let j = i + 1; for (; j < s.length && s[j] !== c && s[j] !== '\n'; j++) if (s[j] === '\\') j++; m.fill(2, i, j + 1); i = j; prev = c; continue; }
        if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === depth)) {
          if (c === '}') tpl.pop();
          let j = i + 1; for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '`' || (s[j] === '$' && s[j + 1] === '{')) break; }
          if (s[j] === '$') { m.fill(2, i, j + 2); tpl.push(depth); i = j + 1; prev = '{'; continue; }
          m.fill(2, i, j + 1); i = j; prev = '`'; continue;
        }
        if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || KW_BEFORE_REGEX.test(s.slice(Math.max(0, i - 12), i).trimEnd()))) {
          let j = i + 1, cls = false; for (; j < s.length && s[j] !== '\n'; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; else if (s[j] === '/' && !cls) break; }
          j++; while (j < s.length && /[a-z]/.test(s[j])) j++;
          m.fill(3, i, j); i = j - 1; prev = 'a'; continue;
        }
        if (c === '{') depth++; else if (c === '}') depth--;
        if (!/\s/.test(c)) prev = c;
      }
      return m;
    };
    // a call's arguments, balanced over () [] {} in CODE only → [{ text, from, to }]
    const argsOf = (s, m, open) => { const out = []; let d = 0, start = open + 1; for (let i = open; i < s.length; i++) { if (m[i]) continue; const c = s[i];
      if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { d--; if (d === 0) { out.push({ text: s.slice(start, i), from: start, to: i }); return out; } } else if (c === ',' && d === 1) { out.push({ text: s.slice(start, i), from: start, to: i }); start = i + 1; } }
      return out; };
    // an object literal's own keys (a spread is said as «...»); null = the options are not written at the call (a name, a call)
    const keysOf = (s, m, arg) => { if (!arg) return []; let a = arg.from, b = arg.to; while (a < b && /\s/.test(s[a])) a++; while (b > a && /\s/.test(s[b - 1])) b--;
      if (s[a] !== '{' || s[b - 1] !== '}' || m[a] || m[b - 1]) return null; const parts = []; let d = 0, start = a + 1;
      for (let i = a + 1; i < b - 1; i++) { if (m[i]) continue; const c = s[i]; if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === ',' && !d) { parts.push(s.slice(start, i)); start = i + 1; } }
      parts.push(s.slice(start, b - 1));
      return parts.map((p) => p.trim()).filter(Boolean).map((p) => (p.startsWith('...') ? '...' : (/^([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*(?::|$|\()/.exec(p) || [null, '?' + p.slice(0, 16)])[1].replace(/['"]/g, ''))); };
    const r = { calls: 0, opaque: 0, regex: 0, unread: [], answers: 0, plain: [] }, namedSeen = new Set();
    for (const [f, s] of files) {
      const mask = maskOf(s);
      const alias = [...new Set([...s.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*showToast\b/g)].filter((m) => !mask[m.index]).map((m) => m[1]))].filter((n) => n !== 'showToast');
      const re = new RegExp(`(?<![\\w$.])showToast\\s*\\(${alias.length ? `|(?<![\\w$])(?:[A-Za-z_$][\\w$]*\\.)?(?:${alias.join('|')})\\s*\\(` : ''}`, 'g');
      for (let m; (m = re.exec(s));) {
        if (mask[m.index] || /function\s+$/.test(s.slice(Math.max(0, m.index - 12), m.index))) continue;   // in a comment, a string or a regex; its definition
        const args = argsOf(s, mask, m.index + m[0].length - 1), a = args.map((x) => x.text), line = s.slice(0, m.index).split('\n').length; r.calls++;
        if (args.length && mask.subarray(args[0].from, args[args.length - 1].to).includes(3)) r.regex++;
        const ks = args.length > 1 ? keysOf(s, mask, args[1]) : [];
        if (ks === null) r.opaque++;
        for (const k of ks || []) if (k !== '...' && !READS.has(k)) r.unread.push(`${f}:${line} «${k}»`);
        if (/[\w$\])]\??\.error\b/.test(a[0] || '')) {
          r.answers++;
          const tv = ((/\btype\s*:\s*([^,}]+)/.exec(a[1] || '') || [])[1] || '').trim(), named = warns.find((w) => w[0] === f && (a[0] || '').includes(w[1]));
          if (named) { namedSeen.add(named[1]); if (tv !== "'warn'") r.plain.push(`${f}:${line} (named warn, typed ${tv || 'nothing'})`); }
          else if (!(tv === "'error'" || (/'error'/.test(tv) && /\?/.test(tv)))) r.plain.push(`${f}:${line} ${tv ? `typed ${tv}` : 'untyped'}`);
        }
      }
    }
    for (const w of warns) if (!namedSeen.has(w[1])) r.plain.push(`a named warn no call carries: ${w[0]} «${w[1]}»`);
    return r;
  };
  const tc = toastCensus(PAGE);
  ok(tc.calls > 1000 && tc.unread.length === 0, `LAW 1 — the toast census: ${tc.calls} toast calls in the page's code (${tc.opaque} pass their options by a name, not written at the call; ${tc.regex} carry a regex literal in their arguments); every option written is one showToast reads${tc.unread.length ? ` — NOT READ: ${tc.unread.join(' · ')}` : ''}`, tc.unread);
  ok(tc.answers > 10 && tc.plain.length === 0, `LAW 2 — a failed act's toast is typed error: the page's ${tc.answers} toasts whose words are an answer's error all give their type — error, or computed from the answer — but the ${WARN_ON_PURPOSE.length} warns named on purpose (${WARN_ON_PURPOSE.map((w) => w[0].split('/').pop()).join(', ')})${tc.plain.length ? ` — NOT: ${tc.plain.join(' · ')}` : ''}`, tc.plain);
  // CONTROLS: the flag planted back where piece 7 wrote it (the wake grants' save) — both laws red BY FILE AND LINE; an unread option in a
  // file the leg never names (the tab group's toast) and in a call through a bound name (the link door's io.toast) — LAW 1 red there
  // (a plant whose anchor is gone is a named red of the control, never a throw that stops the suite)
  // EACH CONTROL JUDGES ITS PLANTED FILE ALONE (B-7e49, 主开发 r2466: the five walks of the whole page again were ~7 s of the suite):
  // the census reads a file by itself — its aliases are the file's own, READS is showToast's signature, a named warn counts where
  // its file is judged — so the rest of the page, held to LAW 1 and LAW 2 by the two checks above, adds nothing to a control's answer
  const plant = (f, from, to) => { const s = PAGE.get(f); if (!s || s.split(from).length !== 2) return { gone: `${f}: «${from.slice(0, 50)}»` }; return { m: new Map([[f, s.replace(from, to)]]), line: s.slice(0, s.indexOf(from)).split('\n').length }; };
  const alone = (m, warns = WARN_ON_PURPOSE) => toastCensus(m, warns.filter((w) => m.has(w[0])));
  const p1 = plant('src/lib/wake-grant-rows.js', "showToast((r && r.error) || t('Save failed'), { type: 'error' });", "showToast((r && r.error) || t('Save failed'), { error: true });");   // stale-pins: kept (piece 7's text, planted)
  const p2 = plant('src/lib/tab-group.js', "showToast(t('Grouped as tabs'), { action:", "showToast(t('Grouped as tabs'), { sticky: true, action:");
  const p3 = plant('src/lib/internal-link-ui.js', "io.toast(t('This session is running outside VibeSpace'), { type: 'error' });", "io.toast(t('This session is running outside VibeSpace'), { error: true });");
  const none = { unread: [], plain: [] }, gone = [p1, p2, p3].filter((p) => p.gone).map((p) => p.gone);
  const c1 = p1.m ? alone(p1.m) : none, c2 = p2.m ? alone(p2.m) : none, c3 = p3.m ? alone(p3.m) : none;
  ok(!gone.length && c1.unread.join() === `src/lib/wake-grant-rows.js:${p1.line} «error»` && c1.plain.join() === `src/lib/wake-grant-rows.js:${p1.line} untyped`
    && c2.unread.join() === `src/lib/tab-group.js:${p2.line} «sticky»` && c3.unread.join() === `src/lib/internal-link-ui.js:${p3.line} «error»`,
    `CONTROL: the flag planted back in the wake grants' save — LAW 1 and LAW 2 red at ${c1.unread.join(' · ')}; an unread option planted in the tab group's toast (${c2.unread.join(' · ')}) and in the link door's io.toast (${c3.unread.join(' · ')}) — each red by file and line${gone.length ? ` — A PLANT'S ANCHOR IS GONE: ${gone.join(' · ')}` : ''}`, { gone, c1: [c1.unread, c1.plain], c2: c2.unread, c3: c3.unread });
  // CONTROLS of LAW 2 over the whole page: chat-view's sub-agent list toast back to plain (the third site, untyped before this cure) —
  // red at its file and line; a named warn struck from the list — red at its own call (the list is what keeps it, not the leg's blindness)
  const p4 = plant('src/lib/chat-view.js', "showToast(r.error, { type: 'error' }); return; }", "showToast(r.error); return; }");   // stale-pins: kept (the base's text, planted)
  const c4 = p4.m ? alone(p4.m) : none;
  const LIVE = 'src/lib/browser-live-window.js';
  const c5 = PAGE.has(LIVE) ? alone(new Map([[LIVE, PAGE.get(LIVE)]]), WARN_ON_PURPOSE.filter((w) => w[0] !== LIVE)) : none;
  const liveAt = (() => { const s = PAGE.get('src/lib/browser-live-window.js') || '', i = s.indexOf(WARN_ON_PURPOSE[0][1]); return i < 0 ? 0 : s.slice(0, s.lastIndexOf('showToast(', i)).split('\n').length; })();
  ok(!p4.gone && c4.plain.join() === `src/lib/chat-view.js:${p4.line} untyped` && c5.plain.join() === `src/lib/browser-live-window.js:${liveAt} typed 'warn'`,
    `CONTROL: chat-view's failed sub-agent fetch back to a plain toast — LAW 2 red at ${c4.plain.join(' · ') || p4.gone}; the live view's refusal struck from the named warns — red at ${c5.plain.join(' · ')}`, { c4: c4.plain, c5: c5.plain, liveAt });
  // CONTROL of THE READER (the coordinator's small, 03:01Z): calls whose arguments hold a regex literal with two slashes side by side
  // and a quote in a class — typed, untyped, and with an option written AFTER the regex — and a division that is no regex: each read
  // right (the reader before this took the slashes for a line comment and the quote for a string)
  const RX = [
    String.raw`showToast(r.error.replace(/["']\/\//g, ''), { type: 'error' });`,
    String.raw`showToast(r.error.replace(/["']\/\//g, ''));`,
    String.raw`showToast(t('x'), { icon: /["']\/\//.source, sticky: true });`,
    String.raw`showToast(r.error + String(n / 2 / 3), { type: 'error' });`,
  ].join('\n');
  const rx = toastCensus(new Map([['src/lib/zz-rx.js', RX]]), []);
  ok(rx.calls === 4 && rx.regex === 3 && rx.plain.join() === 'src/lib/zz-rx.js:2 untyped' && rx.unread.join() === 'src/lib/zz-rx.js:3 «sticky»',
    `CONTROL: the reader reads a regex literal in a call's arguments right — four calls (${rx.calls}), three with a regex (${rx.regex}): the typed one passes, the untyped one is red (${rx.plain.join(' · ')}), an option written after the regex is read (${rx.unread.join(' · ')}), a division is no regex`, rx);
  const C6 = [
    ['the base\'s yield (the whole stack hidden, every toast\'s time running)', sub(U, "      for (const t of stack.children) if (_toastYields(t)) _toastHold(t);", "      stack.style.visibility = 'hidden';")],
    ['every toast yields (an error, an Undo held too)', sub(U, "if (_toastYields(t)) _toastHold(t);", '_toastHold(t);')],
    ['a door drawn in the words (a setting link, the For-you tap) not counted', sub(U, " || !!t.querySelector('.global-toast-setting, .global-toast-tap')", '')],
    ['what stays left on the panel when nothing fits (its anchored place: the lowest rows)', sub(U, "        if (fr.left + fr.right > window.innerWidth) { stack.style.right = 'auto'; stack.style.left = (8 / uiScale()) + 'px'; }\n", '')],
    ['the newborn offered to the cap (round 2: it went at its birth)', sub(U, ".filter((c) => c !== el && !c.classList", ".filter((c) => !c.classList")],
    ['a toast dropped never drawn left «seen» in the history', sub(U, "    if (!drop._toastDrawn && drop._toastKey) _markToastSeen(drop._toastKey, false);\n", '')],
    ['a drawn toast never remembered as seen by the cap', sub(U, " { _toastRun(el); _markDrawn(el); }", ' _toastRun(el);')],
    ['a removal that leaves the toast\'s time running (its timer fired on a detached toast)', sub(U, "  el.remove = () => { clearTimeout(el._toastTimer); el._toastTimer = null; detach(); };\n", '')],
    ['a toast DRAWN the moment it is born (round 3: the fifth of a burst dropped the first as «seen»)', sub(U, "frame(() => { if (el.isConnected && !el.classList.contains('global-toast-held')) el._toastDrawn = true; });", 'el._toastDrawn = true;')],
    ['the fade\'s timer untracked (a removal in the fade leaves it running)', sub(U, "    el._toastTimer = setTimeout(() => { el._toastTimer = null; const st = el.parentNode;", "    setTimeout(() => { const st = el.parentNode;")],   // stale-pins: kept (the base's text, planted)
    ['a held toast never drawn again', sub(U, "  for (const t of held) if (t.isConnected && !t.classList.contains('global-toast-held')) _toastShow(t);", '')],
    ['a held toast drawn again without its time (it never expires)', sub(U, '  el.classList.remove(\'global-toast-held\');\n  _toastRun(el);', "  el.classList.remove('global-toast-held');")],
    ['a held toast\'s time still running', sub(U, '  clearTimeout(el._toastTimer); el._toastTimer = null;\n  el.classList.add', '  el.classList.add')],
    ['a toast held at its birth still called seen', sub(U, '  if (!el._toastBorn && el._toastKey) { el._toastJudge = true; _markToastSeen(el._toastKey, false); }\n', '')],
    ['the time started at birth whatever the placement', sub(U, "  if (!el.classList.contains('global-toast-held')) { _toastRun(el); _markDrawn(el); }", '  { _toastRun(el); _markDrawn(el); }')],
    ['the panel\'s growth never re-placing the stack', sub(U, "if (fy && !_toastPanelSize && typeof ResizeObserver === 'function')", 'if (false)')],
    ['the panel\'s open never re-placing the stack', sub(U, 'if (fy) _toastWatch.observe(fy,', 'if (false) _toastWatch.observe(fy,')],
    ['the beside place never checked against the chrome there', sub(U, "      if (there) { stack.style.top = 'auto'; stack.style.bottom = there.bottom + 'px'; }\n", '')],
    ['the right side never tried', sub(U, " else { stack.style.right = 'auto'; stack.style.left = beside.left + 'px'; }", '')],
  ];
  const c6 = C6.filter(([, u]) => yields(u, PANEL, CSS)).map(([n]) => n);
  ok(c6.length === 0 && !yields(U, PANEL.replace('.context-menu, #global-toasts, #record-clear-dialog', '.context-menu, #record-clear-dialog'), CSS) && !yields(U, PANEL, CSS.replace('#global-toasts > .global-toast.global-toast-held { display: none; }', '')) && !yields(U, PANEL.replace("press it again'), { type: 'warn' }); return; }", "press it again')); return; }"), CSS),   // stale-pins: kept (the base's text, planted)   // stale-pins: kept (the base's text, planted)
    `CONTROL: ${C6.length} planted shapes of the wiring (the base's whole-stack yield among them), a toast press closing the panel, a held toast still drawn — each is refused`, c6);
}

// ── §7 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§7 controls — each rule\'s base form, on its own table');
{
  const deNoTop = await patched('src/lib/drag-end.js', [['  const top = Math.min(Math.max(box.top, 0), ws.h - kh);', '  const top = Math.max(box.top, 0);']], 'release-no-floor');
  ok(releaseTable(deNoTop.releaseBox).filter(([, g, w]) => !same(g, w)).length >= 3, 'CONTROL releaseBox without the floor clamp: the walk\'s buried releases stay buried (RED)');
  const mpNoFlip = await patched('src/lib/menu-place.js', [["const side = up && fitsAbove ? 'above' : fitsBelow ? 'below' : 'clamped';", "const side = up ? 'above' : fitsBelow ? 'below' : 'clamped';"]], 'menu-up-always');
  ok(menuTable(mpNoFlip.menuPlace).filter(([, g, w]) => !same(g, w)).length >= 3, 'CONTROL menuPlace opening upward unconditionally (the base\'s bottom anchor): the lower-row title menus run off the top (RED)');
  const mpNoKeep = await patched('src/lib/menu-place.js', [['  if (keep > 0 && y >= pad - 1 && y + keep <= vh - pad + 1) {', '  if (false) {']], 'menu-no-keep');
  ok(menuTable(mpNoKeep.menuPlace).filter(([n, g, w]) => /^doors-table r4: (an OPEN|…then|an open list that)/.test(n) && !same(g, w)).length === 3, 'CONTROL menuPlace without `keep` (doors-table r4): an open list that gained rows is placed afresh — lifted, its rows slide under the pointer (RED)');
  const mpNoCap = await patched('src/lib/menu-place.js', [['  const maxW = w > across ? across : null, ww = maxW == null ? w : across;', '  const maxW = null, ww = w;']], 'menu-no-maxw');
  ok(menuTable(mpNoCap.menuPlace).filter(([n, g, w]) => /wider than the viewport/.test(n) && !same(g, w)).length === 2, 'CONTROL menuPlace without `maxW` (doors-table r4): a menu wider than the viewport runs past its right edge (RED)');
  const mpNoOffset = await patched('src/lib/menu-place.js', [['    const tall = Math.min(below, h - scroll);', '    const tall = Math.min(below, h);']], 'menu-no-offset');
  ok(menuTable(mpNoOffset.menuPlace).filter(([n, g, w]) => /^doors-table r5: a list wheeled 100 px(, the room grown| whose content shrank)/.test(n) && !same(g, w)).length === 2, 'CONTROL menuPlace lifting a wheeled box\'s cap whole (5a98bf0f): the offset dropped — every row comes down by it (RED)');
  // B-6cf9: the base's ONE key — a title in the structure ⇒ every title change rebuilds the strip (the press across it lost)
  const tfOneKey = await patched('src/lib/taskbar-fit.js', [['  const structure = list.map((e) => (e.group ? [e.id, e.group.tabs.map((x) => x.id), e.group.active] : [e.id]));', '  const structure = list.map((e) => [e.id, String(e.title ?? \'\'), String(e.star ?? \'\'), ...(e.group ? [e.group.tabs.map((x) => [x.id, x.title]), e.group.active] : [])]);']], 'strip-one-key');
  { const red = stripTable(tfOneKey.stripKeys).filter(([, got, want]) => got !== want).map(([n]) => n);
    ok(red.length === 4 && red[0] === 'a title changes (an agent\'s status in it)', `CONTROL the base's one key (titles and stars in the strip's structure): a title change rebuilds every tile — RED by name: «${red.join(' · ')}»`, red); }
  const tfNoCut = await patched('src/lib/taskbar-fit.js', [['    if (l >= -0.5 && r <= width + 0.5) continue;', '    if (l >= -0.5 && l <= width) continue;']], 'strip-cut-counts');
  ok(!same(tfNoCut.stripHidden({ tiles: Array.from({ length: 8 }, (_, i) => ({ id: 'w' + i, left: i * 92 - 60, width: 90 })), width: 500 }).hidden, ['w0', 'w6', 'w7']), 'CONTROL stripHidden counting a cut tile as shown: the «+N» list misses it (RED)');
  const deNoCut = await patched('src/lib/drag-end.js', [['export function resizeRelease(box, ws, dir = \'\', keep = RELEASE_KEEP, min = null) {\n', 'export function resizeRelease(box, ws, dir = \'\', keep = RELEASE_KEEP, min = null) {\n  if (box) return { ...box, moved: false };\n']], 'resize-no-release');
  ok(resizeTable(deNoCut.resizeRelease).filter(([, g, w]) => !same(g, w)).length >= 3, 'CONTROL no resize release (round 1): a north edge past the top keeps the bar out (RED)');
  const mkNoWrap = await patched('src/lib/menu-place.js', [["  if (key === 'ArrowDown') return v({ focus: i < 0 ? 0 : (i + 1) % count });", "  if (key === 'ArrowDown') return v({ focus: i < 0 ? 0 : Math.min(i + 1, count - 1) });"]], 'keys-no-wrap');
  ok(keyTable(mkNoWrap.menuKeyStep).filter(([, g, w]) => !same(g, w)).length >= 1, 'CONTROL menuKeyStep that stops at the last row: ArrowDown never wraps (RED)');
  const mkPressOff = await patched('src/lib/menu-place.js', [["return off ? v({ focus: i }) : parent ?", "return parent ?"]], 'keys-press-off');
  ok(keyTable(mkPressOff.menuKeyStep).filter(([, g, w]) => !same(g, w)).length >= 1, 'CONTROL menuKeyStep that presses an off row (RED)');
  const mtNoKey = await patched('src/lib/utils.js', [['  if (menuKey) return !menuOpenerView(opener);\n', '']], 'takes-no-menu-key');
  const mtNoSink = await patched('src/lib/utils.js', [[" || cls('xpra-ime') || cls('browser-live-kbd');", ';']], 'view-no-sinks');
  ok(takesTable(mtNoSink.menuTakesFocus, mtNoSink.isMenuKey).filter(([n, g, w]) => /DRIVING|driving the live/.test(n) && JSON.stringify(g) !== JSON.stringify(w)).length === 2, 'CONTROL menuOpenerView without the driven views\' key sinks (the reader\'s find): Shift+F10 while driving an xpra desktop or the live browser takes the focus from the remote machine (RED)');
  ok(takesTable(mtNoKey.menuTakesFocus, mtNoKey.isMenuKey).filter(([, g, w]) => JSON.stringify(g) !== JSON.stringify(w)).length >= 2, 'CONTROL menuTakesFocus judging the opener alone (the smalls\' guard): the person\'s menu key in a field takes no focus, with nothing focused no focus (RED)');
  const mtFields = await patched('src/lib/utils.js', [["  return tag === 'IFRAME' || tag === 'CANVAS' || tag === 'VIDEO' || cls('browser-live') || cls('xpra-ime') || cls('browser-live-kbd');", "  return tag === 'IFRAME';"]], 'typing-fields-only');
  ok(typingTable(mtFields.menuOpenerTyping).filter(([, g, w]) => g !== w).length === 3, 'CONTROL menuOpenerTyping counting fields and frames only (the base\'s guard — its round ②): a desktop\'s canvas, a stream\'s video, the live browser view lose their keys to the menu (RED)');
  const mkNoBack = await patched('src/lib/menu-place.js', [["  if (key === 'Escape') return v({ close: true, back: true });", "  if (key === 'Escape') return v({ close: true });"]], 'keys-no-back');
  ok(keyTable(mkNoBack.menuKeyStep).filter(([, g, w]) => !same(g, w)).length >= 2, 'CONTROL menuKeyStep whose Escape leaves the focus nowhere (RED)');
  const tbNoMeet = await patched('src/lib/utils.js', [['  if (!meets) return null;\n', '']], 'beside-any');
  ok(besideTable(tbNoMeet.toastBesidePanel).filter(([, g, w]) => !same(g, w)).length >= 2, 'CONTROL toastBesidePanel moving a stack that meets no panel: a stack clear of the panel, or below it, is pushed aside (RED)');
  const tbLeftOnly = await patched('src/lib/utils.js', [['  if (panel.right + gap + rect.width <= vw) return { left: (panel.right + gap) / (scale || 1) };\n', '']], 'beside-left-only');
  ok(besideTable(tbLeftOnly.toastBesidePanel).filter(([n, g, w]) => /at the left \(a left bar\)|^…in layout px at a 1\.25 UI scale$/.test(n) && !same(g, w)).length >= 2, 'CONTROL toastBesidePanel trying the left alone (672158c6c — its round\'s MUST): a stack meeting a panel on a left bar finds no place (RED)');
  const tyAll = await patched('src/lib/utils.js', [["export function toastMayYield({ type = 'info', action = false, pinned = false, timed = false } = {}) { return type !== 'error' && type !== 'warn' && !action && !pinned && !timed; }", "export function toastMayYield({ type = 'info', action = false, pinned = false, timed = false } = {}) { return true; }"]], 'yield-all');
  const capOld = await patched('src/lib/utils.js', [['  facts.forEach((f, i) => { const rank = (f && f.yields ? 0 : 2) + (f && f.drawn ? 0 : 1); if (rank < best) { best = rank; at = i; } });', '  facts.forEach((f, i) => { const rank = 0; if (rank < best) { best = rank; at = i; } });']], 'cap-oldest');
  ok(capTable(capOld.toastCapPick).filter(([, g, w]) => g !== w).length >= 3, 'CONTROL toastCapPick = the release\'s oldest-first: the older error goes while plain toasts stand, a held toast before a seen one (RED)');
  const capDrawn = await patched('src/lib/utils.js', [['  facts.forEach((f, i) => { const rank = (f && f.yields ? 0 : 2) + (f && f.drawn ? 0 : 1); if (rank < best) { best = rank; at = i; } });', '  facts.forEach((f, i) => { const rank = (f && f.drawn ? 0 : 1); if (rank < best) { best = rank; at = i; } });']], 'cap-drawn-first');
  ok(capTable(capDrawn.toastCapPick).filter(([, g, w]) => g !== w).length >= 2, 'CONTROL toastCapPick = round 2\'s «a drawn toast before a held one» alone: a drawn error goes while held plain toasts stand (RED)');
  ok(yieldTable(tyAll.toastMayYield).filter(([, g, w]) => g !== w).length === 6, 'CONTROL toastMayYield holding every toast (the base: the whole stack went): the error, the action door, the pinned notice are held (RED)');
  const msSlid = await patched('src/lib/window-min-size.js', [['  if (covered(first) <= cover) return first;', '  return first;']], 'cascade-slid');
  const r = cascadeRun(msSlid.cascadeBox, { w: 1020, h: 555 }, { w: 700, h: 500 });
  ok(verdictOf(r.buried.some((x) => x > 0.2)), `CONTROL cascadeBox = the slid slot (the base): an earlier title bar is buried (${r.buried.map((x) => Math.round(x * 100)).join(' / ')} %) (RED)`);
}

// ── §8 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§8 THE TOAST\'S STATES, DRIVEN — the real showToast / hold / show / place / cap over a DOM stand-in and a fake clock (B-7a51 round 3)');
{
  // THE CLOCK: every setTimeout the module asks for (a toast's time, its fade, the placement's frame) is ours, run by advance()
  const REAL = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let now = 0, seq = 0, queue = [];
  const clock = {
    install() { now = 0; queue = []; globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; queue.push({ id, at: now + (Number(ms) || 0), fn }); return id; }; globalThis.clearTimeout = (id) => { queue = queue.filter((q) => q.id !== id); }; },
    advance(ms) { const end = now + ms; for (;;) { queue.sort((a, b) => a.at - b.at || a.id - b.id); const q = queue[0]; if (!q || q.at > end) break; queue.shift(); now = q.at; q.fn(); } now = end; },
    restore() { globalThis.setTimeout = REAL.setTimeout; globalThis.clearTimeout = REAL.clearTimeout; },
    pending() { return queue.length; },
  };
  // THE DOM STAND-IN: what the toast stack's code touches. A toast is TH px high and as wide as its words (≤ 560 — the stylesheet's
  // cap); the stack stacks its DRAWN toasts (a held one is `display: none` — the rule §6 pins) from its own place (right / bottom
  // / left / top in px, else the stylesheet's centred strip); the panel, the toolbar and the For-you button are boxes of their own
  const VW = 951, VH = 585, TH = 40, GAP = 6;
  const R = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t });
  const px = (v) => (typeof v === 'string' && /^-?[\d.]+px$/.test(v) ? parseFloat(v) : null);
  const GROWN = R(545, 16, 400, 527), SHORT = R(545, 380, 400, 163);   // the panel grown from its content / with little in it
  let DOC = null;
  const drawnOf = (st) => st.children.filter((c) => !c._cls.has('global-toast-held'));
  const wOf = (t) => Math.min(560, 60 + 7 * t.textContent.length);
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this._cls = new Set(); this.style = {}; this.dataset = {}; this.attrs = new Map(); this.id = ''; this._text = ''; this._box = null; }
    get className() { return [...this._cls].join(' '); }
    set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get classList() { const c = this._cls; return { add: (...xs) => xs.forEach((x) => c.add(x)), remove: (...xs) => xs.forEach((x) => c.delete(x)), contains: (x) => c.has(x), toggle: (x, f) => { const on = f === undefined ? !c.has(x) : !!f; if (on) c.add(x); else c.delete(x); return on; } }; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    removeAttribute(k) { this.attrs.delete(k); }
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
    append(...xs) { for (const x of xs) { if (typeof x === 'string') this._text += x; else this.appendChild(x); } }
    prepend(x) { if (x.parentNode) x.remove(); x.parentNode = this; this.children.unshift(x); }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return !!DOC && n === DOC.body; }
    get parentElement() { return this.parentNode; }
    contains(t) { for (let n = t; n; n = n.parentNode) if (n === this) return true; return false; }
    matches(sel) { return String(sel).split(',').map((x) => x.trim()).some((x) => (/^\.[\w-]+(\.[\w-]+)*$/.test(x) ? x.slice(1).split('.').every((c) => this._cls.has(c)) : /^#[\w-]+$/.test(x) ? this.id === x.slice(1) : false)); }
    closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches(sel)) return n; return null; }
    querySelectorAll(sel) { const scope = /^\s*:scope > /.test(sel), q = String(sel).replace(/:scope > /g, ''), out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(q)) out.push(c); if (!scope) walk(c); } }; walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    addEventListener() {}
    removeEventListener() {}
    get offsetParent() { return this.isConnected ? DOC.body : null; }
    get offsetHeight() { return this.getBoundingClientRect().height; }
    getClientRects() { const r = this.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? [r] : []; }
    getBoundingClientRect() {
      if (this._box) return this._box();
      if (!this.isConnected) return R(0, 0, 0, 0);
      if (this.id === 'global-toasts') {
        const d = drawnOf(this), w = d.length ? Math.max(...d.map(wOf)) : 0, h = d.length ? d.length * TH + (d.length - 1) * GAP : 0;
        const l = px(this.style.left) ?? (px(this.style.right) != null ? VW - px(this.style.right) - w : VW / 2 - w / 2);
        const tp = px(this.style.top) ?? (px(this.style.bottom) != null ? VH - px(this.style.bottom) - h : VH - 50 - h);
        return R(l, tp, w, h);
      }
      if (this._cls.has('global-toast') && this.parentNode) {
        const st = this.parentNode, i = drawnOf(st).indexOf(this);
        if (i < 0) return R(0, 0, 0, 0);
        const sr = st.getBoundingClientRect(), w = wOf(this);
        return R(sr.right - w, sr.top + i * (TH + GAP), w, TH);
      }
      return R(0, 0, 0, 0);
    }
  }
  let OBS = [];
  const page = ({ panelOpen = false, box = GROWN } = {}) => {
    const body = new El('body');
    DOC = { body, documentElement: new El('html'), visibilityState: 'visible', hasFocus: () => true, activeElement: null,
      createElement: (tg) => new El(tg),
      getElementById: (id) => { const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const f = walk(c); if (f) return f; } return null; }; return walk(body); },
      querySelectorAll: (q) => body.querySelectorAll(q), querySelector: (q) => body.querySelector(q), addEventListener() {}, removeEventListener() {} };
    globalThis.document = DOC;
    const tb = new El('div'); tb.id = 'toolbar'; tb._box = () => R(0, 0, VW, 41); body.appendChild(tb);
    const panel = new El('div'); panel.id = 'user-todos-popup'; panel.className = 'usage-popup ut-popup' + (panelOpen ? '' : ' hidden'); panel.at = box;
    panel._box = () => (panel._cls.has('hidden') ? R(0, 0, 0, 0) : panel.at); body.appendChild(panel);
    const btn = new El('div'); btn.id = 'taskbar-user-todos'; btn._box = () => R(900, 549, 40, 32); body.appendChild(btn);
    OBS = [];
    return { panel, btn };
  };
  const fire = () => { for (const o of [...OBS]) o.cb([]); };   // the panel's class / size changed: what the page's observers report
  const store = new Map();
  const G = {
    window: globalThis, innerWidth: VW, innerHeight: VH, devicePixelRatio: 1,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); }, clear: () => store.clear() },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    MutationObserver: class { constructor(cb) { this.cb = cb; OBS.push(this); } observe() {} disconnect() {} },
    ResizeObserver: class { constructor(cb) { this.cb = cb; OBS.push(this); } observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => globalThis.setTimeout(fn, 16),
    dispatchEvent: () => true,
  };
  const SAVED = Object.fromEntries(Object.keys(G).concat(['document']).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(G)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const LONG = 'is a stand-in notice long enough to fill the widest toast a window this narrow allows, so that no side of the open panel has room';
  const history = () => { try { return JSON.parse(store.get('vibespace.toastHistory') || '[]'); } catch { return []; } };
  const lineOf = (k) => history().find((h) => String(h.m).startsWith(k + ' '));
  const kids = () => { const st = DOC.getElementById('global-toasts'); return st ? [...st.children] : []; };
  const tag = (t) => (t ? t.textContent.slice(0, 2) : null);
  const drawn = (t) => kids().includes(t) && !t.classList.contains('global-toast-held') && t.getBoundingClientRect().width > 0;
  const held = (t) => kids().includes(t) && t.classList.contains('global-toast-held');
  const TTL = 3000;
  const arm = (M) => { M.configureToasts({ getAnchor: () => DOC.getElementById('taskbar-user-todos'), getSeconds: () => TTL / 1000 }); };
  /** the CAP scene: the panel open and grown (no room above it nor beside it), a person's press, four plain toasts born — held;
   *  then the person's failed act (an error) born */
  const capScene = (M) => {
    clock.install(); store.clear(); page({ panelOpen: true }); arm(M);
    try {
      M.noteOwnGesture();   // every birth below judged «seen» by the verdict (a press a moment ago) — held at birth un-sees it
      const P = ['p1', 'p2', 'p3', 'p4'].map((k) => M.showToast(`${k} ${LONG}`));
      clock.advance(20);
      const heldAll = P.every(held);
      const E = M.showToast(`e1 ${LONG}`, { type: 'error' });
      clock.advance(20);
      return { heldAll, eDrawn: drawn(E), eThere: kids().includes(E), dropped: P.filter((t) => !kids().includes(t)).map(tag), n: kids().length, p1Line: lineOf('p1') ? !!lineOf('p1').seen : 'none', e1Line: lineOf('e1') ? !!lineOf('e1').seen : 'none' };
    } finally { clock.restore(); }
  };
  /** law 2: an error drawn (over the panel's edge), three plain toasts held, a second error born */
  const law2Scene = (M) => {
    clock.install(); store.clear(); page({ panelOpen: true }); arm(M);
    try {
      const E1 = M.showToast(`e1 ${LONG}`, { type: 'error' });
      const P = ['p1', 'p2', 'p3'].map((k) => M.showToast(`${k} ${LONG}`));
      clock.advance(20);
      const before = { e1Drawn: drawn(E1), pHeld: P.every(held) };
      const E2 = M.showToast(`e2 ${LONG}`, { type: 'error' });
      clock.advance(20);
      return { ...before, e1There: kids().includes(E1), e2Drawn: drawn(E2), dropped: [E1, ...P].filter((t) => !kids().includes(t)).map(tag) };
    } finally { clock.restore(); }
  };
  /** a toast's WHOLE time: born drawn (the panel short: room above it), half its time gone, the panel GROWS (no room) — held through
   *  ten seconds; the panel closes — drawn again, still there just before its whole time, gone after it */
  const timeScene = (M) => {
    clock.install(); store.clear(); const { panel } = page({ panelOpen: true, box: SHORT }); arm(M);
    try {
      const T = M.showToast(`t1 ${LONG}`);
      clock.advance(20);
      const born = drawn(T);
      clock.advance(TTL / 2);
      panel.at = GROWN; fire(); clock.advance(20);
      const heldNow = held(T);
      clock.advance(10000);
      const afterHold = kids().includes(T) && held(T);
      panel.classList.add('hidden'); fire(); clock.advance(20);
      const back = drawn(T);
      clock.advance(TTL - 120);
      const stillWhole = drawn(T);
      clock.advance(400);
      return { born, heldNow, afterHold, back, stillWhole, gone: !kids().includes(T) };
    } finally { clock.restore(); }
  };
  /** the smalls: in the no-room scene a refusal (warn) and a toast that names a time are drawn at once; a plain one is held */
  const smallsScene = (M) => {
    clock.install(); store.clear(); page({ panelOpen: true }); arm(M);
    try {
      const W = M.showToast(`w1 ${LONG}`, { type: 'warn' }), T = M.showToast(`t1 ${LONG}`, { timed: true, duration: 4000 }), P = M.showToast(`p1 ${LONG}`);
      clock.advance(20);
      return { warnDrawn: drawn(W), timedDrawn: drawn(T), plainHeld: held(P) };
    } finally { clock.restore(); }
  };
  /** FIVE ERRORS AT ONCE (round 4): a person's press, five errors born in one turn (no panel) — the fifth drops the OLDEST, which
   *  never reached a frame: its history line UNSEEN; then four errors, a frame, a fifth — the oldest WAS on screen: its line keeps
   *  the verdict (seen: the press a moment before) */
  const burstScene = (M) => {
    clock.install(); store.clear(); page({ panelOpen: false }); arm(M);
    try {
      M.noteOwnGesture();
      const A = [1, 2, 3, 4, 5].map((k) => M.showToast(`a${k} ${LONG}`, { type: 'error' }));
      clock.advance(20);
      const once = { dropped: A.filter((t) => !kids().includes(t)).map(tag), a1Line: lineOf('a1') ? !!lineOf('a1').seen : 'none', a5Drawn: drawn(A[4]) };
      for (const t of kids()) t.remove();
      store.clear(); M.noteOwnGesture();
      const B = [1, 2, 3, 4].map((k) => M.showToast(`b${k} ${LONG}`, { type: 'error' }));
      clock.advance(20);
      B.push(M.showToast(`b5 ${LONG}`, { type: 'error' }));
      clock.advance(20);
      return { once, later: { dropped: B.filter((t) => !kids().includes(t)).map(tag), b1Line: lineOf('b1') ? !!lineOf('b1').seen : 'none' } };
    } finally { clock.restore(); }
  };
  /** EVERY REMOVAL CLEARS ITS TIME (round 4): a toast drawn, its OWNER withdraws it (`.remove()` on what showToast returned) — one
   *  timer fewer waits; another closed by its ✕ — the same; past their time nothing touches them */
  const removeScene = (M) => {
    clock.install(); store.clear(); page({ panelOpen: false }); arm(M);
    try {
      const T = M.showToast(`t1 ${LONG}`), X = M.showToast(`x1 ${LONG}`);
      clock.advance(20);
      const w0 = clock.pending(); T.remove(); const w1 = clock.pending();
      X.querySelector('.global-toast-x').onclick({ stopPropagation() {} }); const w2 = clock.pending();
      let threw = null; try { clock.advance(TTL + 600); } catch (e) { threw = String(e && e.message || e); }
      return { owner: w0 - w1, close: w1 - w2, gone: !kids().includes(T) && !kids().includes(X), threw };
    } finally { clock.restore(); }
  };
  const fresh = (name) => { const f = MUT.write('src/lib/utils.js', read('src/lib/utils.js'), name, { esm: true, same: true }); copies.push(f); return import(pathToFileURL(f).href); };   // a fresh, deliberately UNPATCHED copy of this tree's utils.js: its own stack state
  // every copy is IMPORTED before a scene builds its page: at import a module with a `document` arms its page-long chrome
  // (the instant tooltip's listeners) — the copies load as on a page that has none yet, the scenes' DOM comes after
  const MODS = { cap: await fresh('s8-cap'), capRed: await patched('src/lib/utils.js', [[`  for (let k = stack.children.length; k > 4; k--) {
    const others = [...stack.children].filter((c) => c !== el && !c.classList.contains('global-toast-pinned'));
    const at = toastCapPick(others.map((c) => ({ yields: _toastYields(c), drawn: !!c._toastDrawn })));
    if (at < 0) break;
    const drop = others[at];
    if (!drop._toastDrawn && drop._toastKey) _markToastSeen(drop._toastKey, false);
    drop.remove();
  }`, "  for (let k = stack.children.length; k > 4; k--) { const drop = [...stack.children].find((c) => !c.classList.contains('global-toast-pinned') && !c.classList.contains('global-toast-held')) || [...stack.children].find((c) => !c.classList.contains('global-toast-pinned')); if (!drop) break; drop.remove(); }"]], 's8-cap-round2'), law2: await fresh('s8-law2'), law2Red: await patched('src/lib/utils.js', [['  facts.forEach((f, i) => { const rank = (f && f.yields ? 0 : 2) + (f && f.drawn ? 0 : 1); if (rank < best) { best = rank; at = i; } });', '  facts.forEach((f, i) => { const rank = 0; if (rank < best) { best = rank; at = i; } });']], 's8-law2-oldest'), time: await fresh('s8-time'), timeRed: await patched('src/lib/utils.js', [["  clearTimeout(el._toastTimer); el._toastTimer = null;\n  el.classList.add('global-toast-held');", "  el.classList.add('global-toast-held');"]], 's8-time-hold-runs'), smalls: await fresh('s8-smalls'), burst: await fresh('s8-burst'), burstRed: await patched('src/lib/utils.js', [["frame(() => { if (el.isConnected && !el.classList.contains('global-toast-held')) el._toastDrawn = true; });", 'el._toastDrawn = true;']], 's8-burst-drawn-at-birth'), remove: await fresh('s8-remove'), removeRed: await patched('src/lib/utils.js', [['  el.remove = () => { clearTimeout(el._toastTimer); el._toastTimer = null; detach(); };\n', '']], 's8-remove-time-runs') };
  try {
    const c = capScene(MODS.cap);
    ok(gateOf(c.heldAll) && gateOf(c.eThere) && gateOf(c.eDrawn) && JSON.stringify(c.dropped) === '["p1"]' && c.n === 4 && c.p1Line === false && c.e1Line === true,
      'THE CAP (round 3\'s MUST): four plain toasts HELD (the panel open, no room), the person\'s failed act born — it is DRAWN, the OLDEST held one goes, its history line UNSEEN (it was never drawn); the error\'s line seen (drawn a moment after the press)', c);
    const cRed = capScene(MODS.capRed);
    ok(gateOf(cRed.heldAll) && !cRed.eThere && cRed.e1Line === true, 'CONTROL the cap of round 2 («a drawn toast before a held one» — the newborn counted as drawn): the error goes at its BIRTH, never drawn, its history line «seen» (RED)', cRed);
    const l = law2Scene(MODS.law2);
    ok(gateOf(l.e1Drawn) && gateOf(l.pHeld) && gateOf(l.e1There) && gateOf(l.e2Drawn) && JSON.stringify(l.dropped) === '["p1"]', 'LAW 2: an error drawn over the panel\'s edge, three plain toasts held, a second error born — a PLAIN one goes (the oldest), the error stays, the new one is drawn', l);
    const lRed = law2Scene(MODS.law2Red);
    ok(gateOf(lRed.e1Drawn) && !lRed.e1There && JSON.stringify(lRed.dropped) === '["e1"]', 'CONTROL the release\'s oldest-first cap: the person\'s first error goes while plain toasts stand (RED)', lRed);
    const tm = timeScene(MODS.time);
    ok(gateOf(tm.born) && gateOf(tm.heldNow) && gateOf(tm.afterHold) && gateOf(tm.back) && gateOf(tm.stillWhole) && verdictOf(tm.gone), 'A TOAST\'S WHOLE TIME: drawn, half its time gone, the panel GROWS — held (ten seconds pass: still there), the panel closes — drawn again and still there just before its WHOLE time, gone after it', tm);
    const tmRed = timeScene(MODS.timeRed);
    ok(gateOf(tmRed.born) && gateOf(tmRed.heldNow) && !tmRed.afterHold, 'CONTROL a hold that keeps the timer: the toast expires while it cannot be seen (RED)', tmRed);
    const sm = smallsScene(MODS.smalls);
    ok(gateOf(sm.warnDrawn) && gateOf(sm.timedDrawn) && verdictOf(sm.plainHeld), 'the smalls in the no-room scene: a refusal (warn) and a toast that names a time are DRAWN at once; a plain one is held', sm);
    const bu = burstScene(MODS.burst);
    ok(JSON.stringify(bu.once.dropped) === '["a1"]' && bu.once.a1Line === false && gateOf(bu.once.a5Drawn) && JSON.stringify(bu.later.dropped) === '["b1"]' && bu.later.b1Line === true,
      'FIVE ERRORS AT ONCE (round 4): the fifth drops the OLDEST — never on screen (no frame painted it), its history line UNSEEN; four, a frame, a fifth — the oldest WAS on screen, its line keeps the verdict (seen)', bu);
    const buRed = burstScene(MODS.burstRed);
    ok(JSON.stringify(buRed.once.dropped) === '["a1"]' && buRed.once.a1Line === true, 'CONTROL a toast drawn the moment it is born (round 3\'s mark): the burst\'s oldest — never on screen — stays «seen» (RED)', buRed);
    const rm = removeScene(MODS.remove);
    ok(rm.owner === 1 && rm.close === 1 && gateOf(rm.gone) && rm.threw === null, 'EVERY REMOVAL CLEARS ITS TIME (round 4): an owner\'s withdrawal and a ✕ each take the toast\'s timer with it; past their time nothing fires on them', rm);
    const rmRed = removeScene(MODS.removeRed);
    ok(rmRed.owner === 0 && rmRed.close === 0, 'CONTROL a removal that leaves the time running: the timers of the withdrawn and the closed toast still wait (RED)', rmRed);
  } finally {
    clock.restore();
    for (const [k, d] of Object.entries(SAVED)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
}

for (const c of copiesCensus(copies, MUT.dir, repo, { minCopies: 5, label: 'controls: ' })) ok(verdictOf(c.pass), c.name, c.detail);

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
