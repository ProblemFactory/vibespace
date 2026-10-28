#!/usr/bin/env node
// THE DESKTOP TIER AT A SMALL SCREEN — the PURE rules and their wiring (lane desktop-small, 2026-10-25: the naive-user walk
// at 951×585 / 1024×600 / 1100×700 / 1280×640 — P2-1…P2-6, P3-1…P3-3 — and the owner's «userW有一大堆桌面，屏幕尺寸小了之后桌面就
// 堆积在一起了»). In-process, no browser (the chrome legs are scripts/test-desktop-small-chrome.mjs; the real WindowManager's
// release legs are scripts/test-window-drag.mjs §2 (f)).
//   §1 the release + the recovery (src/lib/drag-end.js releaseBox / reachable / insideBox / releasePoint) + the resize's
//      release (resizeRelease — acceptance r2 ③)
//   §2 the one placement of a menu (src/lib/menu-place.js menuPlace) — and of an OPEN one (`keep`: it keeps its top, capped at
//      the foot; `maxW`: never wider than the viewport — lane desktop-doors-table r4; `scrolled`: a wheeled one keeps its
//      offset, its cap lifted only as far as its rows stay — r5)
//   §3 the taskbar at a small screen (src/lib/taskbar-fit.js stripHidden / wheelScroll / switcherForm + TILE_MIN_PX = the
//      stylesheet's tile floor)
//   §4 the cascade that buries nothing (src/lib/window-min-size.js cascadeBox)
//   §5 the desktop tier's toast spot (src/lib/utils.js toastDeskSpot)
//   §6 the wiring — every door asks its rule (source pins over the comment-stripped files), acceptance r2 included: the
//      compact list's rows carry the desktop's doors and take a window's drop, the «+N» list is placed by menuPlace, the
//      resize's release, the brand observer's lifetime, the narrow-title observer's own field; acceptance r3: ONE spring
//      lifecycle for the title-bar and the tile (HTML5) roads, a stale row refused by name, a cancelled Rename… stays shut
//      (their RED controls run in the chrome suite's third bundle — DOM wiring, no PURE rule to patch)
//   §7 controls — patched copies outside the tree (scripts/mutant-copy.mjs): each rule's base form goes RED on its table
// Prerequisite: `npm run build` (src/lib/build-version.js). Run: node scripts/test-desktop-small.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
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
  ok(bad.length === 0 && same(DE.RELEASE_KEEP, { w: 80, h: 32 }), 'releaseBox: every release keeps RELEASE_KEEP (80×32) of the title bar inside — the walk\'s two buried windows come back to y 483; an inside / partly-off window is untouched', bad.map(([n, g, w]) => ({ n, g, w })));
  ok(DE.reachable({ left: 10, top: 400, width: 400, height: 300 }, WS) && !DE.reachable({ left: 64, top: 512, width: 406, height: 306 }, WS) && DE.reachable({ left: 0, top: 0, width: 1, height: 1 }, null), 'reachable: the release\'s own rule (a workspace not laid out: reachable — nothing to recover)');
  ok(same(DE.insideBox({ left: 324, top: 553, width: 406, height: 306 }, WS), { left: 324, top: 209, width: 406, height: 306, moved: true }) && same(DE.insideBox({ left: -50, top: -20, width: 900, height: 600 }, WS), { left: 0, top: 0, width: 900, height: 600, moved: true }) && DE.insideBox({ left: 1, top: 1, width: 10, height: 10 }, WS).moved === false,
    'insideBox: a named window comes back WHOLLY inside (the walk\'s {324, 553} → {324, 209}); one larger than the workspace at its top-left; never resized');
  const r = { left: 260, top: 41, width: 764, height: 515 };
  ok(same(DE.releasePoint({ x: 400, y: 570 }, r), { x: 400, y: 555, outside: true }) && same(DE.releasePoint({ x: 100, y: 300 }, { ...r, right: 1024, bottom: 556 }), { x: 261, y: 300, outside: true }) && DE.releasePoint({ x: 500, y: 300 }, r).outside === false,
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
console.log('§3 the taskbar at a small screen (taskbar-fit.js)');
{
  ok(TF.TILE_MIN_PX === 90 && /\.taskbar-item \{[^}]*min-width: 90px;/.test(read('public/style.css')), 'the tile floor is 90 px — taskbar-fit.js TILE_MIN_PX = style.css .taskbar-item min-width (P2-2: 60 px, a label of one or two characters)');
  const tiles = Array.from({ length: 8 }, (_, i) => ({ id: 'w' + i, left: i * 92 - 60, width: 90 }));
  const h = TF.stripHidden({ tiles, width: 500 });
  ok(same(h, { hidden: ['w0', 'w6', 'w7'], before: 1, after: 2 }), 'stripHidden: a tile an edge cuts is hidden (one before, two after a 500 px strip)', h);
  ok(same(TF.stripHidden({ tiles: tiles.slice(1, 5), width: 450 }).hidden, []) && same(TF.stripHidden({}).hidden, []), 'stripHidden: whole tiles (and nothing) hide nothing');
  const w = [
    TF.wheelScroll({ scrollLeft: 0, max: 416, deltaY: 120 }), TF.wheelScroll({ scrollLeft: 0, max: 416, deltaX: 120, deltaY: 0 }), TF.wheelScroll({ scrollLeft: 400, max: 416, deltaY: 120 }),
    TF.wheelScroll({ scrollLeft: 0, max: 416, deltaY: 3, deltaMode: 1 }), TF.wheelScroll({ scrollLeft: 0, max: 0, deltaY: 120 }), TF.wheelScroll({ scrollLeft: 200, max: 416, deltaY: -1, deltaMode: 2, width: 450 }),
  ];
  ok(same(w, [{ left: 120, used: true }, { left: 0, used: false }, { left: 416, used: true }, { left: 120, used: true }, { left: 0, used: false }, { left: 0, used: true }]), 'wheelScroll: deltaY scrolls sideways (P2-2: deltaY 120 ⇒ scrollLeft 0); a horizontal wheel is the browser\'s; clamped at the end; lines × 40, pages × the strip', w);
  const form = (n, bar, others = 140) => TF.switcherForm({ n, each: 54, add: 27, bar, others });
  ok(form(1, 300) === 'full' && form(3, 1008) === 'full' && form(8, 1008) === 'compact' && form(8, 679) === 'compact' && form(3, 679) === 'compact' && form(2, 679) === 'full' && form(6, 0) === 'full',
    'switcherForm: one desktop full; the walk\'s 3 at 1280 full; 8 (the owner\'s many) compact at 951 and 1280; 3 at a 951 px bar compact — the tiles keep 4 × 90 px; a bar not laid out full', [form(1, 300), form(3, 1008), form(8, 1008), form(8, 679), form(3, 679), form(2, 679), form(6, 0)]);
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
  ok(a.buried.every((x) => x <= 0.2) && b.buried.every((x) => x <= 0.2) && c.buried.every((x) => x <= 0.2), `three windows opened in a row bury no earlier title bar past 20 % — 951 (691×500: tops ${a.boxes.map((x) => x.top).join(' / ')}), 1280 (1020×555: ${b.boxes.map((x) => x.top).join(' / ')}), 1100 from the counter's 4th slot (${c.boxes.map((x) => x.top).join(' / ')})`, { a, b, c });
  ok(same(MS.cascadeBox({ left: 70, top: 70, width: 900, height: 620 }, { w: 1536, h: 686 }, []), { left: 70, top: 66, width: 900, height: 620 }), 'no title bar on show: the slid slot exactly as before (test-window-minsize\'s UI 125 % row)');
  const many = cascadeRun(MS.cascadeBox, { w: 691, h: 500 }, { w: 700, h: 500 }, 8);
  ok(many.boxes.every((x) => x.height >= 300), `a window is never opened a sliver of itself to spare a bar (≥ 60 % of the size asked: ${many.boxes.map((x) => x.height).join(' / ')}) — past the room it falls back to the slid slot`, many.boxes);
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
  ok(toastDeskSpot({ rect: toast, avoid: [menu], topY: 41, vh: 585 }) === null && same(s1, { bottom: 159 }) && same(s2, { bottom: 421 }) && s3 === null,
    'toastDeskSpot: clear ⇒ its own place; over the composer ⇒ it rises 8 px above it; over the composer then a menu ⇒ above both; no room under the toolbar ⇒ its own place', { s1, s2, s3 });
}

// ── §6 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§6 the wiring — every door asks its rule');
{
  const W = strip(read('src/lib/window.js')), TB = strip(read('src/lib/taskbar.js')), DM = strip(read('src/lib/desktop-manager.js')), U = strip(read('src/lib/utils.js')), TG = strip(read('src/lib/tab-group.js'));
  const body = (src, head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
  ok(/if \(idx < 0 && this\.grid\) \{ const p = releasePoint\(\{ x: cx, y: cy \}, this\.workspace\.getBoundingClientRect\(\)\); idx = this\._getGridCell\(p\.x, p\.y\); \}/.test(body(W, '  _snapToGrid(winId, cx, cy) {')), 'P2-1 a grid release outside every cell takes the nearest cell (_snapToGrid → releasePoint) — the title-bar drag\'s and the tear-off\'s drop both reach it');
  const endDrag = W.slice(W.indexOf('    const endDrag = (e, why = \'release\') => {'), W.indexOf('    const notePoint = (e) =>'));
  ok(/win\._isSnapped = false;\s*\}\s*this\._keepReachable\(win\);\s*this\._clearGridHighlight\(\);/.test(endDrag) && /if \(snapped\) win\._isSnapped = true;\s*this\._keepReachable\?\.\(win\);/.test(TG), 'P2-1 the title-bar drag\'s last drop branch (snap or free) and the tab tear-off\'s drop end with _keepReachable');
  ok(/this\._keepReachable\(win\);/.test(body(W, '  _reflowWindows() {')) && /const k = dir \? resizeRelease\(b, ws, dir, this\._barKeep\(win\), this\._ownMinOf\(win\)\) : releaseBox\(b, ws, this\._barKeep\(win\)\);/.test(W) && /return \{ w: RELEASE_KEEP\.w \+ 2 \* bx, h: RELEASE_KEEP\.h \+ by \};/.test(W), 'P2-1 every workspace reflow re-clamps (this client\'s fit); the keep counts the window\'s own border (80×32 of the BAR)');
  ok(/this\._bringBack\?\.\(host\);/.test(body(W, '  revealWindow(id, {')) && /const k = insideBox\(b, ws\);/.test(W) && /this\.witnessGeometry\(win\.id\);\s*win\.element\.style\.left = k\.left/.test(W), 'P2-1 THE RECOVERY: revealWindow (every door that names a window) brings an unreachable one wholly inside — witnessed as the user\'s act');
  ok(/if \(!win\.isMinimized && id === app\.wm\.activeWindowId && app\.wm\.isReachable\?\.\(id\) !== false\) \{ app\.wm\.witnessGeometry\?\.\(id\); app\.wm\.minimize\(id\); \}/.test(TB), 'P2-1 the focused window\'s tile minimizes it only while its title bar is reachable (a buried one: the click brings it back)');
  ok(/return cascadeBox\(\{ \.\.\.box, width: Math\.min\(width, ws\.w\), height: Math\.min\(height, ws\.h\) \}, ws, this\._barsOnShow\(\)\);/.test(W), 'the default placement asks cascadeBox with the title bars on show');
  ok(/const at = menuPlace\(\{ x, y, w: mr\.width, h: mr\.height, vw: window\.innerWidth, vh: window\.innerHeight, up \}\);/.test(U) && !/if \(mr\.top < 0\) pop\.style\.top = '4px';/.test(U), 'P2-3 showContextMenu places every menu through menuPlace (its own clamp lines gone)');
  ok(/return showContextMenu\(x, y, menuItems, 'taskbar-context-menu', \{ up: y > window\.innerHeight \/ 2 \}\);/.test(TB) && !/menu\.style\.bottom = \(window\.innerHeight - y \+ 4\)/.test(TB) && /showContextMenu\(e\.clientX, e\.clientY, items, 'context-menu', \{ up: e\.clientY > window\.innerHeight \/ 2 \}\);/.test(DM) && !/menu\.style\.bottom = \(window\.innerHeight - e\.clientY \+ 4\)/.test(DM),
    'P2-3 the title-bar / tile / window-list menu and the desktop preview menu ask `up` — no bottom anchor written after');
  ok(/fitTaskbarStrip\(app\);\s*\}/.test(TB) && /const \{ hidden \} = stripHidden\(\{ tiles, width: sr\.width \}\);/.test(TB) && /strip\.addEventListener\('wheel',/.test(TB) && /\{ passive: false \}/.test(TB), 'P2-2 every taskbar update fits the strip («+N» from stripHidden), the wheel scrolls it (a non-passive listener — it may take the wheel)');
  ok(/if \(form === 'compact'\) \{ this\._renderCompactSwitcher\(container\); return; \}/.test(DM) && /return switcherForm\(\{ n, each: previewW \+ 6, add: 27, bar: bar\.clientWidth, others, stripMin: STRIP_MIN_TILES \* TILE_MIN_PX \}\);/.test(DM) && /if \(digest \+ form === this\._switcherDigest\) return;/.test(DM), 'P2-2 the desktop switcher\'s form is part of its digest and PURE switcherForm decides it');
  const CS = strip(read('src/lib/chat-status-bar.js'));
  ok(/export const NARROW_BAR_PX = 480;/.test(read('src/lib/chat-status-bar.js')) && /export const SHORT_WINDOW_PX = 300;/.test(read('src/lib/chat-status-bar.js')) && /return \(w > 0 && w < NARROW_BAR_PX\) \|\| \(h > 0 && h < SHORT_WINDOW_PX\);/.test(CS) && /if \(view && view\.classList\.contains\('chat-short'\) !== short\) view\.classList\.toggle\('chat-short', short\);/.test(CS), 'P2-4 a desk window narrower than 480 px or shorter than 300 px keeps its bar ONE row; a short one marks its view chat-short');
  const CC = read('public/chat.css');
  ok(/\.chat-status-bar\.chat-status-narrow > \.chat-status-folded \{ display: none !important; \}/.test(CC) && /\.chat-view\.chat-short \.chat-input \{ min-height: 34px;/.test(CC), 'P2-4 chat.css: the narrow bar hides its folded chips; the short view\'s composer starts at one line');
  ok(/\.chat-msg:has\(> \.chat-open-editor-btn\) > :is\(\.chat-compact-msg, \.chat-bubble\) \.chat-text \{ padding-right: 28px; \}/.test(CC) && /\.chat-msg:has\(> \.chat-fork-btn\) > :is\(\.chat-compact-msg, \.chat-bubble\) \.chat-text \{ padding-right: 56px; \}/.test(CC) && /\.chat-fork-btn \{ right: 30px; \}/.test(CC) && !/chat-msg-gutter/.test(CC), 'P2-5 a message with hover buttons keeps their column free — its text\'s right padding = the buttons (28 px for one 24 px button, 56 for two 4 px apart); never a float (a float as tall as the buttons made every one-line row taller — test-ax-budget\'s band)');
  const SC = read('public/style.css');
  ok(/_observeTitleWidth\(winInfo\);/.test(W) && /const NARROW_TITLE_PX = 440;/.test(read('src/lib/window.js')) && /\.window-titlebar\.titlebar-narrow \.win-overlap-btn \{ display: none; \}/.test(SC), 'P2-6 a title bar under 440 px sets its ⧉ indicator aside (the wider buttons never take a narrow window\'s title / a split group\'s tab doors)');
  ok(/flex-shrink: 0; \}/.test(CC.slice(CC.indexOf('.chat-status-bar .chat-status-clickable {'))) && /\.dialog-close \{[^}]*min-width: 24px; min-height: 24px; margin: -2\.5px 0;/.test(SC), 'P2-6 the chips never shrink under their words (an explicit min-width replaces a flex item\'s content minimum); the dialog ✕ gives the header its line back (no dialog grows)');
  ok(/\.win-btn \{\s*width: 24px; height: 24px;/.test(SC) && /\.window-controls \{ display: flex; gap: 4px;/.test(SC) && /\.global-toast-x \{[^}]*min-width: 24px; min-height: 24px;/.test(SC) && /\.dialog-close \{[^}]*min-width: 24px; min-height: 24px;/.test(SC) && /\.chat-status-bar \.chat-status-clickable \{ display: inline-flex; align-items: center; justify-content: center; min-height: 24px; min-width: 24px;/.test(CC),
    'P2-6 the 24 px mouse target: the window buttons (4 px apart), a toast\'s ✕, a dialog\'s ✕, the status chips');
  const P = strip(read('src/lib/desktop-picker.js'));
  ok(/box\.dataset\.popover = '1';/.test(P) && /const offOutside = onOutsidePress\(box, \(\) => close\(\), \{ exclude: anchor \? \[anchor\] : \[\] \}\);/.test(P) && !/document\.addEventListener\('pointerdown'/.test(P) && /Wayland session and cannot be shown yet — click here for the virtual desktop\./.test(read('src/lib/desktop-picker.js')), 'P3-1 the Desktop popover joins the Esc protocol and the app\'s closer (a press into a frame closes it), its sentence whole');
  ok(/iframe\.contentWindow\.addEventListener\('keydown', \(e\) => \{ if \(e\.key === 'Escape' && !e\.isComposing\) document\.querySelectorAll\('\[data-popover\]'\)\.forEach\(\(p\) => p\.remove\(\)\); \}, \{ signal: winInfo\._listenerCtl\?\.signal \}\);/.test(read('src/lib/browser-window.js')), 'P3-1 a same-origin Web view page\'s Escape closes every [data-popover] float (its listener on the window\'s controller)');
  const TF2 = strip(read('src/lib/toolbar-fold.js'));
  ok(/const ro = new ResizeObserver\(judgeTitle\); ro\.observe\(title\); life\.signal\.addEventListener\('abort', \(\) => ro\.disconnect\(\), \{ once: true \}\);/.test(TF2) && /signal: life\.signal,/.test(TF2) && /fold\.dispose = \(\) => life\.abort\(\);/.test(TF2), 'P3-2 the brand re-judges its own box (whole or not drawn after any resize) — its observer joined to the fold\'s ONE lifetime (r2 ④: the fold\'s dispose disconnects it)');
  // acceptance r2
  const endResize = W.slice(W.indexOf('        const endResize = (why = \'release\') => {'), W.indexOf('          win._lastResizeEnd = why;'));
  ok(/if \(resized\) this\._keepReachable\(win, dir\);/.test(endResize), 'r2 ③ the resize\'s END door keeps the title bar too (_keepReachable with its edge — PURE resizeRelease)');
  ok(/let hoverPreview = under\?\.closest\('\.desktop-preview, \.desktop-switch-row'\);/.test(W) && /this\._app\?\.desktopManager\?\.dragHover\?\.\(under\);/.test(W) && /document\.querySelectorAll\('\.desktop-preview, \.desktop-switch-row'\)\.forEach\(p => p\.classList\.remove\('desktop-preview-drop'\)\);\s*this\._app\?\.desktopManager\?\.dragDone\?\.\(\);/.test(W),
    'r2 ① a title-bar drag hit-tests the compact list\'s rows beside the previews, springs the list open on the button, and closes it with the drag');
  ok(/if \(deskPreviewTarget && deskPreviewTarget\.classList\.contains\('desktop-switch-row'\)\) \{[\s\S]*?this\._dropOnDeskRow\(win, dragFrom, \{ id: deskId, name: deskName \}, \{ wasMax: dragFromMax, prev: dragFromPrev \}\);/.test(endDrag) && /this\._keepReachable\(win\);\s*const dm = this\._app\?\.desktopManager;\s*if \(dm && desk\.id && desk\.id !== dm\.activeDesktopId\) dm\.dropOnRow\(win\.id, desk\.id, desk\.name\);/.test(body(W, '  _dropOnDeskRow(win, from, desk, back) {')),
    'r2 ① released on a row: the window keeps its drag-start place (reachable) and moves by the row\'s door, dropOnRow (r3 ③)');
  // acceptance r3
  const tileEnds = TB.split("item.addEventListener('dragend', () => app.desktopManager?.dragDone?.());").length - 1;
  const arm = body(DM, '  _springArm() {'), hov = body(DM, '  dragHover(under) {'), done = body(DM, '  dragDone() {');
  ok(/btn\.addEventListener\('dragleave', \(\) => this\._springStop\(\)\);/.test(DM) && tileEnds === 2 && /const life = this\._springLife = new AbortController\(\), o = \{ capture: true, signal: life\.signal \};/.test(arm) && /for \(const type of \['dragenter', 'dragover'\]\) window\.addEventListener\(type, \(e\) => this\.dragHover\(e\.target\), o\);/.test(arm) && /window\.addEventListener\('drop', \(\) => setTimeout\(\(\) => this\.dragDone\(\), 0\), o\);/.test(arm) && /window\.addEventListener\('dragend', \(\) => this\.dragDone\(\), o\);/.test(arm),
    `r3 ① the HTML5 road ends the spring: the button's dragleave stops the timer, both tile builders' dragend (${tileEnds}) and the document's drop / dragend end it, its dragenter / dragover are the hit test — on ONE AbortController`);
  ok(/if \(this\._springList && !this\._springList\.isConnected\) this\._springList = null;/.test(hov) && /this\._springArm\(\);/.test(hov) && /if \(b && this\._springLife\) this\._springList = this\._openDesktopList\(b\);/.test(hov) && /this\._springStop\(\);\s*if \(this\._springList\) \{ this\._springList\.remove\(\); this\._springList = null; \}\s*if \(this\._springLife\) \{ this\._springLife\.abort\(\); this\._springLife = null; \}/.test(done) && /this\.dragDone\(\); list\?\.remove\(\);/.test(DM),
    'r3 ① ONE lifecycle for both roads: dragHover arms it (a list closed by its own door drops its ref), the timer opens a list only while armed, dragDone clears timer + list + ref + listeners, a row drop ends it');
  const dropRow = body(DM, '  dropOnRow(winId, deskId, name) {');
  ok(/if \(!this\._desktops\.some\(\(d\) => d\.id === deskId\)\) \{\s*showToast\(t\('\{why\} — the window stays where it is', \{ why: this\._doorLabel\('switch', deskId, name\) \}\), \{ type: 'warn', duration: 6000 \}\);\s*return \{ ok: false, code: 'no-desktop' \};/.test(dropRow) && /return this\.moveWindowToDesktop\(winId, deskId, \{ speak: true \}\);/.test(dropRow) && /if \(winId\) this\.dropOnRow\(winId, el\._desk\.id, el\._desk\.name\);/.test(DM),
    'r3 ③ a row drop (both roads) moves only to a desktop that IS here — a gone one refused by name, the window kept where it is');
  ok(/const done = \(p\) => Promise\.resolve\(p\)\.then\(\(r\) => \{ if \(r !== false\) after\?\.\(\); \}\);/.test(DM) && /if \(!\(name && name\.trim\(\)\)\) return false;[^\n]*\n\s*if \(this\._doorRefused\(desk, 'rename'\)\) return false;[^\n]*\n\s*const typed = name\.trim\(\), live = [^\n]*\n[\s\S]*?\n\s*this\.renameDesktop\(desk\.id, typed\);\s*return true;/.test(body(DM, '  async _startRename(desk) {')),
    'r3 ④ a cancelled Rename… (false) brings nothing back — the list stays shut (desktop-doors-table r2 ②: nor a refused one — the desktop deleted elsewhere while the dialog was open)');
  ok(/const items = this\._deskItems\(desk\);/.test(DM) && /showContextMenu\(x, y, this\._deskItems\(el\._desk, \{ order: true, after: back \}\), 'context-menu',/.test(DM) && /this\.reorderDesktop\(desk\.id, prev\.id\)/.test(DM) && /this\.reorderDesktop\(next\.id, desk\.id\)/.test(DM) && /done\(this\._startRename\(desk\)\)/.test(DM) && /done\(this\.deleteDesktop\(desk\.id\)\)/.test(DM),
    'r2 ① the preview\'s menu and a compact-list row\'s (right-click / ⋯) are ONE item set, the same handlers (Rename…, Delete, + Move up / Move down for a row)');
  ok(/const stage = this\.app\.stage, rows = this\._desktopListRows\(\);/.test(DM) && /rows\.forEach\(\(row, k\) => \{ if \(row\.kind === 'desktop' && els\[k\]\) this\._rowDoors\(els\[k\], row\.desk\); \}\);/.test(DM) && /extraClass: 'desktop-switch-menu'/.test(DM) && /if \(extraClass\) pop\.classList\.add\(/.test(U),
    'r2 ① ⑥ the list\'s rows come from ONE named source (_desktopListRows — the seam for desktopRows), each row gets its doors; the list is styled before it is measured (extraClass)');
  const listRows = body(DM, '  _desktopListRows(drawn = null) {');
  ok(/import \{ sheetRows \} from '\.\/desktop-switch-sheet\.js';/.test(DM) && /for \(const r of sheetRows\(\{ desktopManager: this, wm: this\.app\.wm \}, drawn\)\) \{/.test(listRows) && /rows\.push\(\{ kind: 'desktop', id: r\.id, desk, name: r\.name, count: r\.windows, on: !stage\?\.isActive && r\.active \}\);/.test(listRows) && !/_savedStates|wm\.windows/.test(listRows),
    'int358 seam (c): the compact list\'s desktop rows ARE the phone sheet\'s (sheetRows → PURE desktopRows) — the same names and counts on both surfaces, no second counter; the row keeps the manager\'s own desktop for its doors');
  ok(/const at = menuPlace\(\{ x: r\.right - pr\.width, y: up \? room : 0, w: pr\.width, h: pr\.height, vw: window\.innerWidth, vh: room, up \}\);/.test(TB) && /if \(at\.maxH != null\) \{ pop\.style\.maxHeight = \(at\.maxH \/ Z\) \+ 'px'; pop\.style\.overflowY = 'auto'; \}/.test(TB) && !/const above = r\.top - pr\.height - 4;/.test(TB),
    'r2 ② the «+N» list is placed by menuPlace in the room on its chip\'s side — capped and scrolling (no self-placement left)');
  ok(/this\._narrowTitleRO = new ResizeObserver/.test(W) && !/this\._titleRO\b/.test(W), 'the narrow-title observer has its own field (`_titleRO` is the tab-group mixin\'s split-tail observer — sharing it silenced the split tail: test-split-ux)');
  const SU = read('src/lib/settings-ui.js');
  ok(/dialog\.append\(header, searchWrap, body, foot\);/.test(SU) && /\.settings-foot \{/.test(SC), 'P3-3 the Settings window: its save rule at its foot (the nav is its own column already)');
  ok(/if \(shown && !_toastTier\(\) && !_openModalDialog\(\)\) \{ _placeDeskToasts\(stack\); return; \}/.test(U) && /const desk = toastDeskSpot\(\{ rect: stack\.getBoundingClientRect\(\), avoid: _toastAvoid\(\),/.test(U), 'the desktop tier\'s toast stack (anchored or centred) is placed off every open menu and composer');
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
  const tfNoCut = await patched('src/lib/taskbar-fit.js', [['    if (l >= -0.5 && r <= width + 0.5) continue;', '    if (l >= -0.5 && l <= width) continue;']], 'strip-cut-counts');
  ok(!same(tfNoCut.stripHidden({ tiles: Array.from({ length: 8 }, (_, i) => ({ id: 'w' + i, left: i * 92 - 60, width: 90 })), width: 500 }).hidden, ['w0', 'w6', 'w7']), 'CONTROL stripHidden counting a cut tile as shown: the «+N» list misses it (RED)');
  const deNoCut = await patched('src/lib/drag-end.js', [['export function resizeRelease(box, ws, dir = \'\', keep = RELEASE_KEEP, min = null) {\n', 'export function resizeRelease(box, ws, dir = \'\', keep = RELEASE_KEEP, min = null) {\n  if (box) return { ...box, moved: false };\n']], 'resize-no-release');
  ok(resizeTable(deNoCut.resizeRelease).filter(([, g, w]) => !same(g, w)).length >= 3, 'CONTROL no resize release (round 1): a north edge past the top keeps the bar out (RED)');
  const msSlid = await patched('src/lib/window-min-size.js', [['  if (covered(first) <= cover) return first;', '  return first;']], 'cascade-slid');
  const r = cascadeRun(msSlid.cascadeBox, { w: 1020, h: 555 }, { w: 700, h: 500 });
  ok(r.buried.some((x) => x > 0.2), `CONTROL cascadeBox = the slid slot (the base): an earlier title bar is buried (${r.buried.map((x) => Math.round(x * 100)).join(' / ')} %) (RED)`);
}
for (const c of copiesCensus(copies, MUT.dir, repo, { minCopies: 5, label: 'controls: ' })) ok(c.pass, c.name, c.detail);

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
