#!/usr/bin/env node
// THE TOP TOOLBAR'S FOLD — the fast gate (lane toolbar-fold, 2026-09-30; the owner: "the top-right cluster of green
// buttons takes too much width on a low-resolution screen and overlaps other chrome"). Measured before the fix
// (master ab1cda46, 60 states × 2 font sets): `.toolbar-right { min-width: 160px; justify-content: flex-end }` shrank
// the zone to 160 px and its buttons overflowed LEFTWARD — over the layout presets, the title and, sidebar open,
// UNDER the sidebar; 21 of 60 states overlapped (23 under DejaVu). No browser, no DOM:
//   §1 THE ICON STEP (barLadder, src/lib/live-bar-layout.js) over hand-computed tables: nothing compact while the bar
//      fits; one px short ⇒ the highest priority gives up its words first, ties right-to-left, never-fold items last;
//      the fold only after every compactable item is compact, over the compact widths; no compactPx ⇒ exactly barLayout;
//      the floor = the all-compact floor;
//   §1b THE ZONES (barLayout `groups`): each zone its own gap, the zones separated by the bar's gap even when empty, the
//      ⋯ charged with one bar gap after the zones, an item naming no zone charged as a direct child;
//   §2 THE TOOLBAR'S REAL TABLE over the widths MEASURED in the audit (zh / ja / en / en under DejaVu Sans — the runner's
//      face) at 1024×768 / 1280×720 / 1366×768 / 1920×1080 × UI scale 1 / 1.25 × sidebar open / closed × toolbar scale
//      0.9 / 1 / 1.1 / 1.25: every state FITS (the audit's 21 overlapping states included), hand-checked rows, the
//      fold's order (words first, then Presets → Desktop → the layout presets → Apps → Web view → …);
//   §3 3000 seeded random toolbars: a verdict fits unless the never-fold items alone overflow; placed by an
//      INDEPENDENT geometry walk (zone by zone, x cursor) nothing overlaps and nothing passes the bar's end; at most ONE
//      ⋯, charged iff something folded; outputs in DOM order; compaction MINIMAL and MONOTONE; nothing folds while a
//      compactable item still shows its words; barLadder without compactPx ≡ barLayout;
//   §4 the table: every Customize element (CHROME_ELEMENTS, read from customize-mode.js) has a row; every folding row
//      names a command that is REGISTERED in src/lib (or a submenu); overflowRows keeps the bar's order; compactTitle;
//      toolbarSpec for springs / unknown ids;
//   §5 wiring pins: every toolbar button's click runs its row's command (derived from the table); the fold installed
//      after the arrangement; Customize suspends / reschedules it; toolbar-fold.js drives createBarFold (rulerIn, groups,
//      suspended); bar-fold.js carries the icon step; the CSS (no 160 px zone minimum, no-shrink children, the title the
//      flexible item, the fold's classes scoped to #toolbar, the compact form, the Customize wrap); every t() has zh + ja;
//   NEGATIVE CONTROLS (scripts/mutant-copy.mjs): a barLadder that folds WITHOUT the icon step, one that compacts by
//      POSITION, and a barLayout whose groups forget the zone gaps each fail §1/§1b/§2; the pre-fix `.toolbar-right`
//      rule planted into a patched listing fails the CSS pin.
// Run: node scripts/test-toolbar-fold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('toolbar-fold', repo);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const L = await import('../src/lib/live-bar-layout.js');
const TM = await import('../src/lib/toolbar-fold-model.js');

// ── §1 the icon step ──
console.log('§1 barLadder — the icon step before the fold');
const it = (key, px, priority, compactPx, group) => ({ key, px, priority, ...(compactPx ? { compactPx } : {}), ...(group ? { group } : {}) });
const judgeLadder = (M) => {
  const bad = [];
  const T = (name, args, want) => { const v = M.barLadder(args); const got = { shown: v.shown, overflow: v.overflow, compact: v.compact, fits: v.fits }; const { need, floor, ...w } = want; if (!same(got, w) || (need !== undefined && v.need !== need) || (floor !== undefined && v.floor !== floor)) bad.push({ name, got: { ...got, need: v.need, floor: v.floor }, want }); };
  // a:40 (P0) b:60/20 (P1) c:60/20 (P2) d:50/20 (P2), gap 4, ⋯ 20 ⇒ full 222
  const ITEMS = [it('a', 40, 0), it('b', 60, 1, 20), it('c', 60, 2, 20), it('d', 50, 2, 20)];
  T('the whole bar fits ⇒ nothing compact, nothing folded', { widthPx: 222, gapPx: 4, overflowPx: 20, items: ITEMS }, { shown: ['a', 'b', 'c', 'd'], overflow: [], compact: [], fits: true, need: 222, floor: 64 });
  T('one px short ⇒ the highest priority gives up its words first — equal priorities right-to-left (d)', { widthPx: 221, gapPx: 4, overflowPx: 20, items: ITEMS }, { shown: ['a', 'b', 'c', 'd'], overflow: [], compact: ['d'], fits: true, need: 192 });
  T('…then c, then b (the lowest priority number last)', { widthPx: 150, gapPx: 4, overflowPx: 20, items: ITEMS }, { shown: ['a', 'b', 'c', 'd'], overflow: [], compact: ['b', 'c', 'd'], fits: true, need: 112 });
  T('only when every compactable item is compact does anything FOLD — over the compact widths, by priority', { widthPx: 100, gapPx: 4, overflowPx: 20, items: ITEMS }, { shown: ['a', 'b'], overflow: ['c', 'd'], compact: ['b'], fits: true, need: 88 });
  T('a never-fold item with a compact form gives up its words LAST (after every foldable one)', { widthPx: 100, gapPx: 4, overflowPx: 20, items: [it('p', 60, 0, 20), it('q', 40, 3, 20), it('r', 40, 1, 20)] }, { shown: ['p', 'q', 'r'], overflow: [], compact: ['p', 'q', 'r'], fits: true, need: 68 });
  T('…and before that, at 110 px, the never-fold item keeps its words', { widthPx: 110, gapPx: 4, overflowPx: 20, items: [it('p', 60, 0, 20), it('q', 40, 3, 20), it('r', 40, 1, 20)] }, { shown: ['p', 'q', 'r'], overflow: [], compact: ['q', 'r'], fits: true, need: 108 });
  T('no compactPx anywhere ⇒ it IS barLayout (lane I\'s table: b folds, the ⋯ charged)', { widthPx: 139, gapPx: 5, overflowPx: 20, items: [it('a', 50, 0), it('b', 40, 2), it('c', 40, 1)] }, { shown: ['a', 'c'], overflow: ['b'], compact: [], fits: true, need: 120 });
  T('a compactPx not smaller than px is no compact form', { widthPx: 90, gapPx: 0, overflowPx: 10, items: [it('a', 50, 0), it('b', 40, 1, 40), it('c', 30, 2, 60)] }, { shown: ['a'], overflow: ['b', 'c'], compact: [], fits: true, need: 60 });
  T('the floor = the never-fold items at their COMPACT widths + the ⋯', { widthPx: 1000, gapPx: 4, overflowPx: 20, items: [it('p', 60, 0, 20), it('q', 40, 3, 20)] }, { shown: ['p', 'q'], overflow: [], compact: [], fits: true, floor: 44 });
  return bad;
};
{ const bad = judgeLadder(L); ok(bad.length === 0, `barLadder matches every hand-computed table (${bad.length} wrong)`, bad); }

// ── §1b the zones ──
console.log('§1b barLayout groups — the toolbar\'s zones');
const Z3 = [{ key: 'L', gapPx: 6 }, { key: 'C', gapPx: 6 }, { key: 'R', gapPx: 4 }];
const judgeGroups = (M) => {
  const bad = [];
  const T = (name, args, want) => { const v = M.barLayout(args); const got = { shown: v.shown, overflow: v.overflow, fits: v.fits }; const { need, floor, ...w } = want; if (!same(got, w) || (need !== undefined && v.need !== need) || (floor !== undefined && v.floor !== floor)) bad.push({ name, got: { ...got, need: v.need, floor: v.floor }, want }); };
  // L: ☰ 28 + title 1 (gap 6) = 35 · C: presets 202 · R: gear 28 + x 60 + y 60 (gap 4) = 156 · bar gaps 2 × 8 ⇒ 409
  const TB = [it('menu', 28, 0, 0, 'L'), it('title', 1, 0, 0, 'L'), it('presets', 202, 4, 0, 'C'), it('gear', 28, 0, 0, 'R'), it('x', 60, 1, 0, 'R'), it('y', 60, 2, 0, 'R')];
  T('three zones: each its own gap, the bar gap between the zones', { widthPx: 409, gapPx: 8, overflowPx: 28, groups: Z3, items: TB }, { shown: ['menu', 'title', 'presets', 'gear', 'x', 'y'], overflow: [], fits: true, need: 409 });
  T('one px short ⇒ the presets fold (P4) and the ⋯ is charged with ONE bar gap after the zones; the empty center still keeps its two bar gaps', { widthPx: 408, gapPx: 8, overflowPx: 28, groups: Z3, items: TB }, { shown: ['menu', 'title', 'gear', 'x', 'y'], overflow: ['presets'], fits: true, need: 409 - 202 + 28 + 8 });
  T('the floor: every zone\'s never-fold items + the bar gaps + the ⋯ and its gap', { widthPx: 1000, gapPx: 8, overflowPx: 28, groups: Z3, items: TB }, { shown: ['menu', 'title', 'presets', 'gear', 'x', 'y'], overflow: [], fits: true, floor: 35 + 8 + 0 + 8 + 28 + 8 + 28 });
  T('empty zones still cost their bar gaps', { widthPx: 100, gapPx: 8, overflowPx: 28, groups: Z3, items: [] }, { shown: [], overflow: [], fits: true, need: 16 });
  T('an item naming no declared zone is charged as a direct child (its px + one bar gap)', { widthPx: 1000, gapPx: 8, overflowPx: 28, groups: Z3, items: [it('menu', 28, 0, 0, 'L'), it('stray', 40, 0, 0, 'nowhere')] }, { shown: ['menu', 'stray'], overflow: [], fits: true, need: 28 + 16 + 48 });
  T('no groups ⇒ the flat arithmetic (lane I)', { widthPx: 140, gapPx: 5, overflowPx: 20, items: [it('a', 50, 0), it('b', 40, 2), it('c', 40, 1)] }, { shown: ['a', 'b', 'c'], overflow: [], fits: true, need: 140 });
  return bad;
};
{ const bad = judgeGroups(L); ok(bad.length === 0, `barLayout's zones match every hand-computed table (${bad.length} wrong)`, bad); }

// ── §2 the real table over the measured widths ──
console.log('§2 the toolbar\'s real table over the audit\'s measured widths');
// natural widths in the toolbar's local px (UI 1, toolbar scale 1; the audit's JSON, shots/before*/…-1920x1080-ui1-tb1-sbopen)
const MEASURED = {
  zh: { 'btn-presets': 61, 'btn-new-session': 83, 'btn-terminal': 61, 'btn-file-explorer': 61, 'btn-browser': 83, 'btn-desktop-apps': 61, 'btn-desktop': 61 },
  ja: { 'btn-presets': 94, 'btn-new-session': 116, 'btn-terminal': 94, 'btn-file-explorer': 83, 'btn-browser': 105, 'btn-desktop-apps': 72, 'btn-desktop': 105 },
  en: { 'btn-presets': 76.3, 'btn-new-session': 103.2, 'btn-terminal': 80.6, 'btn-file-explorer': 62.2, 'btn-browser': 86.5, 'btn-desktop-apps': 64.1, 'btn-desktop': 79.4 },
  enDejaVu: { 'btn-presets': 79, 'btn-new-session': 108.5, 'btn-terminal': 85.5, 'btn-file-explorer': 63.1, 'btn-browser': 91.8, 'btn-desktop-apps': 66.2, 'btn-desktop': 84.4 },
};
const ORDER = ['btn-presets', 'btn-new-session', 'btn-terminal', 'btn-file-explorer', 'btn-browser', 'btn-desktop-apps', 'btn-desktop']; // index.html's order in the right zone
const R1 = (w) => Math.ceil(w) + 1; // the DOM half measures offsetWidth (rounded) + 1
/** The toolbar as the page hands it to the rule (toolbar-fold.js): zones, specs from the table, the ⋯ 28 px. */
const toolbarArgs = (lang, contentW) => {
  const spec = (id) => TM.toolbarSpec(id);
  const items = [
    { key: 'sidebar-toggle', px: R1(28), priority: 0, group: 'toolbar-left' },
    { key: 'toolbar-title', px: TM.FLEX_MIN_PX, priority: 0, group: 'toolbar-left' },
    { key: 'layout-presets', px: R1(202), priority: spec('layout-presets').priority, group: 'toolbar-center' },
    { key: 'btn-global-settings', px: R1(28), priority: 0, group: 'toolbar-right' },
    ...ORDER.map((id) => ({ key: id, px: R1(MEASURED[lang][id]), compactPx: spec(id).compact ? R1(28) : 0, priority: spec(id).priority, group: 'toolbar-right' })),
  ];
  return { widthPx: contentW, gapPx: 8, overflowPx: R1(28), groups: [{ key: 'toolbar-left', gapPx: 6 }, { key: 'toolbar-center', gapPx: 6 }, { key: 'toolbar-right', gapPx: 4 }], items };
};
const localW = (W, ui, sidebarOpen, tb = 1) => (W / ui - (sidebarOpen ? 260 : 44)) / tb; // the rail is 44 px, rail + panel 260 (measured)
const judgeReal = (M) => {
  const bad = [];
  const states = [];
  for (const lang of Object.keys(MEASURED)) for (const [W] of [[1024], [1280], [1366], [1920]]) for (const ui of [1, 1.25]) for (const open of [true, false]) for (const tb of [0.9, 1, 1.1, 1.25]) {
    const v = M.barLadder(toolbarArgs(lang, localW(W, ui, open, tb) - 16));
    states.push({ lang, W, ui, open, tb, v });
    if (!v.fits) bad.push({ name: `${lang} ${W} ui${ui} ${open ? 'open' : 'closed'} tb${tb} does not fit`, v });
    const small = new Set(v.compact);
    if (v.overflow.length && ORDER.some((id) => v.shown.includes(id) && !small.has(id))) bad.push({ name: `${lang} ${W} ui${ui} tb${tb}: a button still shows its words while something folded`, v });
  }
  const at = (lang, W, ui, open, tb = 1) => states.find((s) => s.lang === lang && s.W === W && s.ui === ui && s.open === open && s.tb === tb).v;
  const T = (name, v, want) => { const got = { compact: v.compact, overflow: v.overflow }; if (!same(got, want)) bad.push({ name, got, want }); };
  // the audit's overlapping states, now: (page-verified with the probe — shots/probe-after)
  T('ja 1024×768 UI 1 sidebar open (Presets over the presets, ⚙ covered): four buttons give up their words', at('ja', 1024, 1, true), { compact: ['btn-presets', 'btn-browser', 'btn-desktop-apps', 'btn-desktop'], overflow: [] });
  T('zh 1024×768 UI 1 sidebar open: Presets + Desktop compact', at('zh', 1024, 1, true), { compact: ['btn-presets', 'btn-desktop'], overflow: [] });
  T('ja 1024×768 UI 1.25 sidebar open (⚙ / Presets / New Session UNDER the sidebar): every button a glyph, nothing folded', at('ja', 1024, 1.25, true), { compact: ORDER, overflow: [] });
  T('en 1366×768 UI 1.25 sidebar open: Presets + Desktop compact', at('en', 1366, 1.25, true), { compact: ['btn-presets', 'btn-desktop'], overflow: [] });
  T('1920×1080 UI 1 in every language: nothing compact, nothing folded', { compact: [...new Set(['zh', 'ja', 'en', 'enDejaVu'].flatMap((l) => at(l, 1920, 1, true).compact))], overflow: [...new Set(['zh', 'ja', 'en', 'enDejaVu'].flatMap((l) => at(l, 1920, 1, true).overflow))] }, { compact: [], overflow: [] });
  // the FOLD, by priority: 1024 × UI 1.25 × sidebar open × toolbar scale 1.25 ⇒ 447 local px, 431 of content: all glyphs
  // (515 needed) ⇒ Presets (P5) folds, then Desktop (P4, right of the layout presets), then the layout presets (P4)
  T('ja 1024×768 UI 1.25 sidebar open toolbar scale 1.25: every button a glyph, then Presets → Desktop → the layout presets fold', at('ja', 1024, 1.25, true, 1.25), { compact: ['btn-new-session', 'btn-terminal', 'btn-file-explorer', 'btn-browser', 'btn-desktop-apps'], overflow: ['layout-presets', 'btn-presets', 'btn-desktop'] });
  return { bad, states };
};
{
  const { bad, states } = judgeReal(L);
  const folded = states.filter((s) => s.v.overflow.length).length, compacted = states.filter((s) => s.v.compact.length).length;
  ok(bad.length === 0, `every one of ${states.length} measured states fits (${compacted} with glyphs, ${folded} with a fold) and the hand-checked rows hold (${bad.length} wrong)`, bad.slice(0, 3));
  ok(folded >= 2 && compacted >= 20 && states.some((s) => !s.v.compact.length), `the table exercises all three rungs (full ${states.filter((s) => !s.v.compact.length && !s.v.overflow.length).length} / glyphs ${compacted} / folded ${folded})`);
}

// ── §3 the seeded walk ──
console.log('§3 3000 seeded random toolbars — an independent geometry walk');
{
  let seed = 424242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const bad = [];
  let nFold = 0, nCompact = 0, nOver = 0;
  /** place a verdict zone by zone with an x cursor (the flex boxes the page draws) ⇒ the right edge + overlaps */
  const place = (args, v) => {
    const shown = new Set(v.shown), small = new Set(v.compact);
    const byKey = new Map(args.items.filter((x) => x.px > 0).map((x) => [x.key, x]));
    let x = 0; const rects = [];
    args.groups.forEach((g, gi) => {
      if (gi) x += args.gapPx;
      let first = true;
      for (const x0 of args.items) {
        if (x0.group !== g.key || !shown.has(x0.key)) continue;
        if (!first) x += g.gapPx;
        first = false;
        const w = small.has(x0.key) ? byKey.get(x0.key).compactPx : byKey.get(x0.key).px;
        rects.push({ key: x0.key, l: x, r: x + w });
        x += w;
      }
    });
    if (v.overflow.length) { x += args.gapPx; rects.push({ key: '⋯', l: x, r: x + args.overflowPx }); x += args.overflowPx; }
    let overlaps = 0; for (let i = 1; i < rects.length; i++) if (rects[i].l < rects[i - 1].r - 1e-9) overlaps++;
    return { right: x, overlaps, mores: rects.filter((r) => r.key === '⋯').length };
  };
  for (let n = 0; n < 3000; n++) {
    const ng = 1 + Math.floor(rnd() * 3);
    const groups = Array.from({ length: ng }, (_, i) => ({ key: 'g' + i, gapPx: Math.floor(rnd() * 8) }));
    const items = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => {
      const px = rnd() < 0.08 ? 0 : Math.round(8 + rnd() * 140);
      return { key: 'k' + i, px, compactPx: rnd() < 0.55 ? Math.round(6 + rnd() * Math.max(1, px - 6)) : 0, priority: Math.floor(rnd() * 6), group: 'g' + Math.floor(rnd() * ng) };
    });
    // DOM order = zone order (the page reads the zones left to right)
    items.sort((a, b) => Number(a.group.slice(1)) - Number(b.group.slice(1)));
    const args = { widthPx: Math.floor(rnd() * 800), gapPx: Math.floor(rnd() * 10), overflowPx: 16 + Math.floor(rnd() * 16), groups, items };
    const v = L.barLadder(args);
    if (v.overflow.length) nFold++;
    if (v.compact.length) nCompact++;
    const live = items.filter((x) => x.px > 0);
    const p = place(args, v);
    if (v.fits && p.right > args.widthPx + 1e-9) bad.push({ why: 'fits, but the geometry walk passes the bar\'s end', args, v, p });
    if (p.overlaps) bad.push({ why: 'overlap in the geometry walk', v, p });
    if (p.mores !== (v.overflow.length ? 1 : 0)) bad.push({ why: 'the ⋯ is not exactly one iff something folded', v });
    if (Math.abs(p.right - v.need) > 1e-6) bad.push({ why: 'need ≠ the geometry walk', need: v.need, walk: p.right });
    if (!v.fits) { nOver++; const floorArgs = { ...args, widthPx: v.floor }; if (!L.barLadder(floorArgs).fits) bad.push({ why: 'a bar as wide as its floor does not fit', v }); if (args.widthPx >= v.floor) bad.push({ why: 'did not fit although at least as wide as its floor', v }); }
    // DOM order
    const idx = (k) => live.findIndex((x) => x.key === k);
    for (const list of [v.shown, v.overflow, v.compact]) for (let i = 1; i < list.length; i++) if (idx(list[i]) < idx(list[i - 1])) bad.push({ why: 'an output out of DOM order', v });
    // nothing folds while a compactable shown item keeps its words
    const cpx = (x) => x.compactPx > 0 && x.compactPx < x.px;
    if (v.overflow.length && live.some((x) => cpx(x) && v.shown.includes(x.key) && !v.compact.includes(x.key))) bad.push({ why: 'folded while a compactable item still shows its words', v });
    // MINIMAL: the compact item made compact LAST, back at full width, would fold something (or not fit)
    if (v.compact.length && !v.overflow.length) {
      const order = live.map((x, i) => ({ x, i })).filter((o) => cpx(o.x)).sort((a, b) => b.x.priority - a.x.priority || b.i - a.i).map((o) => o.x.key);
      const lastC = order.filter((k) => v.compact.includes(k)).pop();
      const back = L.barLayout({ ...args, items: live.map((x) => ({ ...x, px: v.compact.includes(x.key) && x.key !== lastC ? x.compactPx : x.px })) });
      if (!back.overflow.length) bad.push({ why: 'not minimal: the last compaction was not needed', v, lastC });
    }
    // MONOTONE: a wider bar never compacts or folds more
    const w2 = L.barLadder({ ...args, widthPx: args.widthPx + 1 + Math.floor(rnd() * 200) });
    if (w2.overflow.some((k) => !v.overflow.includes(k)) || w2.compact.filter((k) => !w2.overflow.includes(k)).some((k) => !v.compact.includes(k) && !v.overflow.includes(k))) bad.push({ why: 'widening compacted or folded more', v, w2 });
    // without compactPx it IS barLayout
    const plain = { ...args, items: items.map(({ compactPx, ...x }) => x) };
    const a = L.barLadder(plain), b = L.barLayout(plain);
    if (!same([a.shown, a.overflow, a.need, a.fits, a.floor, a.compact], [b.shown, b.overflow, b.need, b.fits, b.floor, []])) bad.push({ why: 'barLadder without compactPx ≠ barLayout', a, b });
    if (bad.length > 3) break;
  }
  ok(bad.length === 0 && nFold > 300 && nCompact > 600 && nOver > 30, `every verdict fits unless its never-fold items alone overflow, the geometry walk places it without an overlap inside the bar, ONE ⋯ iff folded, DOM order kept, compaction minimal + monotone, nothing folds while words remain, and ≡ barLayout without compact forms (${nCompact} bars with glyphs, ${nFold} folded, ${nOver} over their floor)`, bad.slice(0, 2));
}

// ── NEGATIVE CONTROLS: the tables are a judge ──
{
  const src = read('src/lib/live-bar-layout.js');
  const noLadder = src.replace('  if (v.overflow.length) {\n    const order = base.map', '  if (false) {\n    const order = base.map');
  const byPos = src.replace('.filter((o) => o.it.cpx).sort((a, b) => b.it.priority - a.it.priority || b.i - a.i)', '.filter((o) => o.it.cpx).sort((a, b) => b.i - a.i)');
  const noZoneGap = src.replace('s += m.reduce((x, it) => x + it.px, 0) + g.gap * Math.max(0, m.length - 1);', 's += m.reduce((x, it) => x + it.px, 0) + gap * Math.max(0, m.length - 1);');
  ok(noLadder !== src && byPos !== src && noZoneGap !== src, 'NEGATIVE CONTROL: the three mutations applied to the copies (the anchors exist)');
  const Mno = await import(pathToFileURL(MUT.write('src/lib/live-bar-layout.js', noLadder, 'noladder', { esm: true })).href);
  const Mpos = await import(pathToFileURL(MUT.write('src/lib/live-bar-layout.js', byPos, 'bypos', { esm: true })).href);
  const Mgap = await import(pathToFileURL(MUT.write('src/lib/live-bar-layout.js', noZoneGap, 'nozonegap', { esm: true })).href);
  const a = judgeLadder(Mno), a2 = judgeReal(Mno).bad;
  ok(a.length >= 3 && a2.length >= 3, `NEGATIVE CONTROL: a fold WITHOUT the icon step fails the ladder tables (${a.length}) and the real table (${a2.length}: ${a2.slice(0, 2).map((b) => b.name).join(' / ')})`);
  const b = judgeLadder(Mpos), b2 = judgeReal(Mpos).bad;
  ok(b.length + b2.length >= 2, `NEGATIVE CONTROL: compaction by POSITION (priority ignored) fails the tables (${b.length} + ${b2.length}: ${[...b, ...b2].slice(0, 2).map((x) => x.name).join(' / ')})`);
  const c = judgeGroups(Mgap), c2 = judgeReal(Mgap).bad;
  ok(c.length >= 2 && c2.length >= 1, `NEGATIVE CONTROL: zones charged at the BAR's gap (their own forgotten) fail the zone tables (${c.length}) and the real table (${c2.length})`);
}

// ── §4 the table ──
console.log('§4 the table');
const libTexts = Object.fromEntries(fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => [f, read('src/lib/' + f)]));
{
  const cz = libTexts['customize-mode.js'];
  const ids = [...cz.slice(cz.indexOf('export const CHROME_ELEMENTS'), cz.indexOf('];', cz.indexOf('export const CHROME_ELEMENTS'))).matchAll(/\{ id: '([\w-]+)'/g)].map((m) => m[1]);
  const missing = ids.filter((id) => !TM.TOOLBAR_ITEMS[id]);
  ok(ids.length >= 12 && missing.length === 0, `every Customize element (${ids.length}, CHROME_ELEMENTS) has a fold row — an element with none would never fold (${missing.join(', ') || 'none missing'})`);
  const idx = read('public/index.html');
  const inBar = [...idx.slice(idx.indexOf('<header id="toolbar">'), idx.indexOf('</header>')).matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]).filter((id) => !/^(toolbar|custom-grids-container|btn-add-grid)$/.test(id));
  const unknown = inBar.filter((id) => !TM.TOOLBAR_ITEMS[id] && id !== 'layout-presets');
  ok(unknown.length === 0, `every element index.html puts in the toolbar has a row (${inBar.length} ids; ${unknown.join(', ') || 'none unknown'})`);
  const registered = new Set(Object.values(libTexts).flatMap((src) => [...src.matchAll(/registerCommand\(\{\s*id: '([\w.:-]+)'/g)].map((m) => m[1])));
  if (/export const COMMAND_ID = '([\w.]+)'/.test(libTexts['desktop-app-launcher.js'])) registered.add(/export const COMMAND_ID = '([\w.]+)'/.exec(libTexts['desktop-app-launcher.js'])[1]);
  const rows = Object.entries(TM.TOOLBAR_ITEMS).filter(([, r]) => r.priority > 0);
  const dead = rows.filter(([, r]) => !r.submenu && !(r.command && registered.has(r.command)));
  ok(rows.length >= 8 && dead.length === 0, `every row that can FOLD names a registered command (or is a submenu) — its ⋯ row runs it (${rows.length} rows; ${dead.map(([k, r]) => `${k}→${r.command}`).join(', ') || 'none dead'})`);
  ok(rows.every(([, r]) => r.submenu || (r.compact && r.label)) && Object.entries(TM.TOOLBAR_ITEMS).filter(([, r]) => r.live).every(([, r]) => r.priority === 0 && !r.compact), 'every folding button has a compact form and words; a live-measured row never folds and never compacts');
  const P = (k) => TM.TOOLBAR_ITEMS[k].priority;
  ok(P('btn-new-session') < P('btn-terminal') && P('btn-terminal') === P('btn-file-explorer') && P('btn-file-explorer') < P('btn-browser') && P('btn-browser') === P('btn-desktop-apps') && P('btn-desktop-apps') < P('btn-desktop') && P('btn-desktop') < P('btn-presets') && P('layout-presets') === P('btn-desktop'), 'the priorities: New Session folds last, then Terminal = Files, Web view = Apps, Desktop = the layout presets, Presets first');
  ok(same(TM.overflowRows(['layout-presets', 'btn-presets', 'btn-desktop', 'nope']), [{ key: 'layout-presets', submenu: 'Layout presets' }, { key: 'btn-presets', command: 'layout.savedPresets', label: 'Presets' }, { key: 'btn-desktop', command: 'desktop.open', label: 'Desktop' }]), 'overflowRows keeps the bar\'s order, a submenu head for the layout presets, an unknown key dropped');
  ok(TM.compactTitle('Presets', 'Saved presets') === 'Saved presets' && TM.compactTitle('预设', '已存预设') === '已存预设' && TM.compactTitle('Apps', 'Open a desktop application in a window') === 'Apps — Open a desktop application in a window' && TM.compactTitle('Files', '') === 'Files' && TM.compactTitle('Files', 'Files') === 'Files', 'compactTitle: the words; a longer tooltip that names them kept as is, one that does not after them');
  const sf = TM.toolbarSpec('spring-3', { spring: 'flex' }), sx = TM.toolbarSpec('spring-4', { spring: 'fixed' }), un = TM.toolbarSpec('plugin-thing');
  ok(sf.flexMin === TM.FLEX_MIN_PX && sf.priority === 0 && sx.live && sx.priority === 0 && un.live && un.priority === 0 && un.known === false && TM.FLEX_MIN_PX > 0, 'a flexible spring is a flexible item (charged 1 px, its gap paid), a fixed one rigid, an unknown element rigid and never folded');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const words = [...rows.map(([, r]) => r.label || r.submenu)];
  const tf = libTexts['toolbar-fold.js'];
  const lits = [...tf.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const miss = [...new Set([...words, ...lits])].filter((k) => !zh[k] || !ja[k]);
  ok(miss.length === 0, `every ⋯ row's words and every t() literal in toolbar-fold.js has zh + ja (${miss.join(' | ') || 'none missing'})`);
}

// ── §5 wiring pins ──
console.log('§5 wiring pins');
const cssText = read('public/style.css');
const rule = (css0, sel) => { const css = css0.replace(/\/\*[\s\S]*?\*\//g, ''); return new RegExp('(?:^|\\})\\s*' + sel.replace(/[.>*#()[\]]/g, (x) => '\\' + x) + '\\s*\\{([^}]*)\\}', 'm').exec(css)?.[1] ?? null; };
const cssPins = (css) => {
  const bad = [];
  const tr = rule(css, '.toolbar-right');
  if (!tr || /min-width:\s*160px/.test(tr) || !/flex: 0 0 auto/.test(tr)) bad.push('.toolbar-right keeps its content width (no 160 px minimum that lets it overflow leftward)');
  const tl = rule(css, '.toolbar-left');
  if (!tl || /min-width:\s*160px/.test(tl)) bad.push('.toolbar-left reserves no 160 px');
  if (!/flex-shrink: 0/.test(rule(css, '#toolbar .toolbar-left > *, #toolbar > [data-zone] > *, #toolbar > .toolbar-more') || '')) bad.push('every zone child keeps its width (flex-shrink 0)');
  const title = rule(css, '#toolbar .toolbar-left > .toolbar-title') || '';
  if (!/flex: 0 1 auto/.test(title) || !/min-width: 0/.test(title) || !/text-overflow: ellipsis/.test(title)) bad.push('the title is the flexible item (shrinks with an ellipsis)');
  if (!/display: none !important/.test(rule(css, '#toolbar .bar-folded') || '')) bad.push('the fold class hides, scoped to #toolbar');
  if (!/display: none/.test(rule(css, '#toolbar .toolbar-action.tb-compact > span') || '')) bad.push('the compact form hides the words');
  if (!/flex-wrap: wrap/.test(rule(css, 'body.customize-mode #toolbar') || '')) bad.push('Customize mode lets the bar wrap (the fold is suspended)');
  if (!/visibility: hidden/.test(rule(css, '#toolbar .toolbar-left > .toolbar-title[data-squeezed]') || '')) bad.push('a title squeezed below TITLE_MIN_PX hides (no sliver of a glyph), its box kept');
  return bad;
};
{
  const bad = cssPins(cssText);
  ok(bad.length === 0, 'CSS: no zone minimum, no-shrink children, the title flexes, the fold + compact classes scoped to #toolbar, Customize wraps', bad);
  const pre = cssText.replace('.toolbar-right { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; justify-content: flex-end; }', '.toolbar-right { display: flex; align-items: center; gap: 4px; min-width: 160px; justify-content: flex-end; }');
  const pb = cssPins(pre);
  ok(pre !== cssText && pb.length === 1 && /leftward/.test(pb[0]), 'NEGATIVE CONTROL: the pre-fix `.toolbar-right { … min-width: 160px … }` planted into a patched listing fails the pin', pb);
  const app = libTexts['app.js'];
  const btnCmd = Object.entries(TM.TOOLBAR_ITEMS).filter(([id, r]) => r.command && id.startsWith('btn-') && id !== 'btn-desktop-apps');
  const unwired = btnCmd.filter(([id, r]) => !new RegExp(`getElementById\\('${id}'\\)\\.addEventListener\\('click', \\([^)]*\\) => runCommand\\('${r.command.replace(/\./g, '\\.')}', \\{ app: this`).test(app));
  ok(btnCmd.length === 6 && unwired.length === 0, `every toolbar button's click runs its row's command — the one its ⋯ row runs (${btnCmd.length}; ${unwired.map(([id]) => id).join(', ') || 'all wired'})`);
  ok(/btn\.addEventListener\('click', \(\) => runCommand\(COMMAND_ID, \{ app \}\)\)/.test(libTexts['desktop-app-launcher.js']) && TM.TOOLBAR_ITEMS['btn-desktop-apps'].command === /export const COMMAND_ID = '([\w.]+)'/.exec(libTexts['desktop-app-launcher.js'])[1], 'Apps: the button and its row run desktop-app-launcher\'s COMMAND_ID');
  ok(!/getElementById\('btn-terminal'\)\.addEventListener\('click', async/.test(app) && /async function openTerminalFrom\(app, anchor\)/.test(libTexts['toolbar-fold.js']) && /registerCommand\(\{ id: 'toolbar\.terminal', title: 'Terminal', run: \(c\) => openTerminalFrom\(c\.app, c\.anchor\) \}\)/.test(libTexts['toolbar-fold.js']), 'Terminal\'s host picker is ONE implementation (toolbar-fold.js), anchored at whichever control was pressed');
  const setup = app.slice(app.indexOf('  _setupToolbar() {'), app.indexOf('\n  }\n', app.indexOf("this.settings.on('chrome.springs', applyArr);")));
  ok(/applyArr\(\);[\s\S]*this\._toolbarFold = installToolbarFold\(this\);/.test(setup), 'the fold is installed in _setupToolbar AFTER the arrangement is applied');
  const cz = libTexts['customize-mode.js'];
  ok((cz.match(/this\.app\._toolbarFold\?\.schedule\(\)/g) || []).length === 2, 'Customize mode reschedules the fold on enter AND on exit');
  ok(/const bottom = bar \? Math\.max\(r\.bottom, bar\.getBoundingClientRect\(\)\.bottom\) : r\.bottom;/.test(cz), 'Customize mode\'s toolbar alignment chip sits below the WHOLE (possibly wrapped) toolbar, never over a wrapped button');
  ok(/title\.clientWidth < TITLE_MIN_PX/.test(libTexts['toolbar-fold.js']) && /title\.dataset\.squeezed = '1'/.test(libTexts['toolbar-fold.js']) && TM.TITLE_MIN_PX >= 16, `the squeezed title is judged after every layout against TITLE_MIN_PX (${TM.TITLE_MIN_PX} px) by a data attribute (the fold's observer never woken by it)`);
  const tf = libTexts['toolbar-fold.js'];
  ok(/createBarFold\(bar, \{\s*more,\s*rulerIn: bar,/.test(tf) && /groups: \(\) => zones\(\)\.map\(\(z\) => \(\{ key: zoneKey\(z\), gapPx: parseFloat\(getComputedStyle\(z\)\.columnGap\) \|\| 0 \}\)\)/.test(tf) && /suspended: \(\) => !!app\._customize\?\.active/.test(tf), 'toolbar-fold.js drives createBarFold: the ruler inside #toolbar, the zones as groups with their own gaps, suspended while Customize edits');
  ok(/const key = el\.id \|\| \(el\.classList\.contains\('toolbar-title'\) \? 'toolbar-title' : `\$\{zoneKey\(z\)\}#\$\{anon\+\+\}`\);/.test(tf) && /const s = toolbarSpec\(key, \{ spring \}\);/.test(tf), 'the items are read from the zones in their ARRANGED order at every layout (an id-less element counted, never skipped)');
  ok(/bar\.appendChild\(more\);/.test(tf) && /registerMenuItem\(\{ menu: TOOLBAR_MENU, id: `\$\{TOOLBAR_MENU\}\/folded`, group: '1_folded', expand: \(c\) => foldedMenuRows\(c\) \}\)/.test(tf) && /menuItems\(TOOLBAR_MENU, \{ app, folded: fold\.folded\(\), anchor: more \}\)/.test(tf), 'the ⋯ is a direct child of #toolbar after the zones; its menu is the registry menu \'toolbar-overflow\' built from the folded keys');
  const bf = libTexts['bar-fold.js'];
  ok(/import \{ barLadder \} from '\.\/live-bar-layout\.js';/.test(bf) && /const v = barLadder\(\{ widthPx, gapPx, overflowPx, groups: zones, items: rows \}\);/.test(bf) && /if \(r\.compactClass\) setCls\(r\.el, r\.compactClass, small\.has\(r\.key\)\);/.test(bf) && /!host\.contains\(r\.target\)/.test(bf), 'bar-fold.js: barLadder (the icon step), the compact class applied, mutations inside the ruler ignored');
  ok(!/^import /m.test(read('src/lib/toolbar-fold-model.js')) && !/\bdocument\b|\bwindow\./.test(read('src/lib/toolbar-fold-model.js').replace(/\/\/.*$/gm, '')), 'toolbar-fold-model.js is PURE (imports nothing, no DOM)');
}

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 3 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
