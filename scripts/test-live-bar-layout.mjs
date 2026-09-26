#!/usr/bin/env node
// THE CHROME-BAR FOLD RULE — the fast gate (lane I, 2026-09-25; the owner's zh screenshots of the agent browser's live
// view: "观看" / "接管" stacked one glyph per line over the bind button and the URL, "undefined" printed in the bar,
// "标签页 (1)" / "控制台 (0)" / "操作 (0)" squeezed to vertical stacks — "你这些UI都检查过吗？"). No browser, no DOM:
//   §1 the PURE `barLayout` (src/lib/live-bar-layout.js) over hand-computed tables: everything fits (the exact
//      boundary included) ⇒ nothing folds; one px over ⇒ the highest priority folds first, equal priorities right-to-
//      left; priority 0 never folds (never-fold items alone too wide ⇒ fits:false, every foldable folded); the ⋯
//      button's width + one gap is charged once anything folds (a fold that would fit without it folds one more);
//      an absent item (px 0) is neither shown nor folded; outputs in DOM order; the live view's REAL priority table
//      over widths measured in the audit (zh / ja at 600 / 900 / 1400); lane I verify r1: the fits:false branch
//      STATED (shown = the never-fold items, need = floor > width — a bar that narrow clips), the floor rows, and the
//      split-floor rows over the verifier's measured widths (a 134 / 209 px bound pane: [toggle][⋯] fits, the badge
//      folds LAST) beside the PRE-FIX table on the same inputs (badge never folds ⇒ fits:false — the red by arithmetic);
//   §2 properties over 3000 seeded random bars: a verdict always fits unless the never-fold items alone overflow;
//      it is MINIMAL (un-folding its last fold would not fit); widening the bar never folds more (monotone); `floor`
//      = the never-fold items + the ⋯ and a bar at least that wide always fits (lane I verify r1: the split floor);
//   §3 the short mode badge (the bar's never-fold words; the full sentence is the tooltip): three states, zh + ja;
//   §4 THE CASCADE-TIE CENSUS — the root cause: public/viewers.css's `.file-tool-btn` (a 24×24 ICON box, loaded
//      AFTER style.css) wins every (0,1,0) tie, so a text button whose own `.x { width: auto }` rule sat in style.css
//      was a 24 px box with its words stacked vertically; DERIVED over every class that co-occurs with file-tool-btn
//      in src/lib: no single-class style.css rule sets a property the icon rule sets (it would silently lose);
//   §5 wiring pins: both views fold through createBarFold with their priority tables; the URL / status minimums equal
//      their CSS min-width; the ONE mode toggle (no Watch button); the globe, never the missing `web`; the bar CSS is
//      nowrap + no-shrink at (0,2,0); the window menu's live-view row; every new t() key has zh + ja;
//   NEGATIVE CONTROLS (scripts/mutant-copy.mjs): a copy of live-bar-layout.js that folds by POSITION (right-to-left,
//      ignoring priority), one that forgets the ⋯ button's width, and one whose floor forgets the ⋯ all fail §1; the census flags a planted
//      pre-fix rule (`.browser-live-open { width: auto }`) in a patched listing.
// Run: node scripts/test-live-bar-layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('live-bar-layout', repo);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const L = await import('../src/lib/live-bar-layout.js');

// ── §1 the tables ──
console.log('§1 barLayout over hand-computed tables');
const judgeTables = (M) => {
  const bad = [];
  const T = (name, args, want) => { const v = M.barLayout(args); const got = { shown: v.shown, overflow: v.overflow, fits: v.fits }; const { need, floor, ...w } = want; if (!same(got, w) || (need !== undefined && v.need !== need) || (floor !== undefined && v.floor !== floor)) bad.push({ name, got: { ...got, need: v.need, floor: v.floor }, want }); };
  const it = (key, px, priority) => ({ key, px, priority });
  // a:50 (P0) b:40 (P2) c:40 (P1), gap 5 ⇒ total 140
  T('fits exactly at the boundary', { widthPx: 140, gapPx: 5, overflowPx: 20, items: [it('a', 50, 0), it('b', 40, 2), it('c', 40, 1)] }, { shown: ['a', 'b', 'c'], overflow: [], fits: true, need: 140 });
  T('one px over folds the HIGHEST priority first (b, P2), the ⋯ charged', { widthPx: 139, gapPx: 5, overflowPx: 20, items: [it('a', 50, 0), it('b', 40, 2), it('c', 40, 1)] }, { shown: ['a', 'c'], overflow: ['b'], fits: true, need: 120 });
  T('a fold that fits only WITHOUT the ⋯ folds one more', { widthPx: 100, gapPx: 5, overflowPx: 20, items: [it('a', 50, 0), it('b', 40, 2), it('c', 40, 1)] }, { shown: ['a'], overflow: ['b', 'c'], fits: true, need: 75 });
  T('equal priorities fold right-to-left (the far end first)', { widthPx: 130, gapPx: 0, overflowPx: 10, items: [it('p', 60, 0), it('x', 30, 3), it('y', 30, 3), it('z', 30, 3)] }, { shown: ['p', 'x', 'y'], overflow: ['z'], fits: true, need: 130 });
  T('priority 0 never folds; alone too wide ⇒ fits:false with every foldable folded (the floor = that need)', { widthPx: 80, gapPx: 4, overflowPx: 10, items: [it('m', 50, 0), it('n', 50, 0), it('o', 20, 4)] }, { shown: ['m', 'n'], overflow: ['o'], fits: false, need: 118, floor: 118 });
  // THE fits:false BRANCH, stated (lane I verify r1): what is SHOWN is the never-fold items in DOM order, every foldable
  // folded, the ⋯ charged after them — a bar that narrow CLIPS its right end (the ⋯ first), which is why a view keeps its
  // container at ≥ `floor` (the live view: WindowManager.setPaneMinWidth) instead of ever being handed such a bar
  T('fits:false: never-fold items wider than the bar ⇒ shown = exactly the never-fold items (DOM order), overflow = every foldable, need = floor > width', { widthPx: 60, gapPx: 6, overflowPx: 26, items: [it('badge', 93, 1), it('handback', 67, 0), it('bind', 26, 3), it('url', 120, 2), it('reconnect', 0, 0)] }, { shown: ['handback'], overflow: ['badge', 'bind', 'url'], fits: false, need: 99, floor: 99 });
  T('the floor is independent of the width and charges the ⋯ only when something CAN fold', { widthPx: 1000, gapPx: 6, overflowPx: 26, items: [it('a', 40, 0), it('b', 30, 0)] }, { shown: ['a', 'b'], overflow: [], fits: true, need: 76, floor: 76 });
  T('…a bar with foldables: the floor = never-fold + gap + ⋯ + gap, whatever is shown now', { widthPx: 1000, gapPx: 6, overflowPx: 26, items: [it('a', 40, 0), it('x', 300, 2), it('b', 30, 0)] }, { shown: ['a', 'x', 'b'], overflow: [], fits: true, need: 382, floor: 108 });
  T('an absent item (px 0) is neither shown nor folded', { widthPx: 100, gapPx: 0, overflowPx: 10, items: [it('a', 60, 0), it('gone', 0, 2), it('b', 30, 2)] }, { shown: ['a', 'b'], overflow: [], fits: true, need: 90 });
  T('outputs are in DOM order whatever the fold order (v folded before t)', { widthPx: 90, gapPx: 0, overflowPx: 10, items: [it('t', 30, 4), it('b', 40, 0), it('u', 30, 2), it('v', 30, 4)] }, { shown: ['b', 'u'], overflow: ['t', 'v'], fits: true, need: 80 });
  T('…and stops at the first fold that fits (t kept)', { widthPx: 120, gapPx: 0, overflowPx: 10, items: [it('t', 30, 4), it('b', 40, 0), it('u', 30, 2), it('v', 30, 4)] }, { shown: ['t', 'b', 'u'], overflow: ['v'], fits: true, need: 110 });
  T('nothing to place', { widthPx: 100, gapPx: 6, overflowPx: 20, items: [] }, { shown: [], overflow: [], fits: true, need: 0 });
  // the live view's REAL priority table over the audit's measured natural widths (zh, 11/10 px fonts; URL at its minimum)
  // (lane I verify r1: the badge folds LAST, priority 1 — it used to be a never-fold 0; see the split-floor rows below)
  const P = { take: 0, handback: 0, reconnect: 0, badge: 1, url: 2, open: 2, bind: 3, viewers: 3, rec: 3, backend: 4, tabs: 5, console: 5, trace: 5 };
  const zhWatch = [['badge', 84], ['take', 45], ['bind', 27], ['url', 120], ['open', 27], ['viewers', 62], ['rec', 40], ['tabs', 70], ['console', 76], ['trace', 62]].map(([k, px]) => it(k, px, P[k]));
  const content = (w) => w - 2 - 16; // the window border + the bar's 8 px padding each side
  T('zh Watch at 1400: everything shown', { widthPx: content(1400), gapPx: 6, overflowPx: 27, items: zhWatch }, { shown: zhWatch.map((x) => x.key), overflow: [], fits: true });
  T('zh Watch at 600: Actions then Console fold into ⋯ (P4 right-to-left); the URL keeps its 120 px', { widthPx: content(600), gapPx: 6, overflowPx: 27, items: zhWatch }, { shown: ['badge', 'take', 'bind', 'url', 'open', 'viewers', 'rec', 'tabs'], overflow: ['console', 'trace'], fits: true });
  T('zh Watch at 400: P4 goes, then P2 right-to-left (rec, viewers) until it fits — bind stays', { widthPx: content(400), gapPx: 6, overflowPx: 27, items: zhWatch }, { shown: ['badge', 'take', 'bind', 'url', 'open'], overflow: ['viewers', 'rec', 'tabs', 'console', 'trace'], fits: true, need: 360 });
  T('zh Watch at 330: bind goes, then the web-view hand-off BEFORE the URL (P1 right-to-left)', { widthPx: content(330), gapPx: 6, overflowPx: 27, items: zhWatch }, { shown: ['badge', 'take', 'url'], overflow: ['bind', 'open', 'viewers', 'rec', 'tabs', 'console', 'trace'], fits: true, need: 294 });
  // THE SPLIT FLOOR (lane I verify r1): the widths the verifier MEASURED on a bound pane dragged to the divider's clamp
  // (R6-floor-*.json: a 900 px host ⇒ a 134 px pane ⇒ 118 px of bar content; 1400 ⇒ 209 ⇒ 193), 6 px gap, 26 px ⋯
  const measured = { // [key, px] in DOM order (backend / reconnect absent: the ephemeral browser, a healthy stream)
    zhWatch: [['badge', 92], ['take', 39], ['bind', 26], ['url', 120], ['open', 26], ['viewers', 54], ['rec', 49], ['tabs', 64], ['console', 64], ['trace', 54]],
    jaWatch: [['badge', 125], ['take', 59], ['bind', 26], ['url', 120], ['open', 26], ['viewers', 65], ['rec', 59], ['tabs', 54], ['console', 84], ['trace', 54]],
    enTakeover: [['badge', 93], ['handback', 67], ['bind', 26], ['url', 120], ['open', 26], ['viewers', 56], ['rec', 77], ['tabs', 55], ['console', 71], ['trace', 67]],
  };
  const row = (m, table) => m.map(([k, px]) => it(k, px, table[k]));
  const rest = (m, keep) => m.map(([k]) => k).filter((k) => !keep.includes(k));
  T('split floor, zh Watch, 134 px pane: everything but the toggle folds — the badge LAST — [接管][⋯] fits', { widthPx: 118, gapPx: 6, overflowPx: 26, items: row(measured.zhWatch, P) }, { shown: ['take'], overflow: rest(measured.zhWatch, ['take']), fits: true, need: 71, floor: 71 });
  T('split floor, zh Watch, 209 px pane: the badge still fits beside the toggle — only it stays', { widthPx: 193, gapPx: 6, overflowPx: 26, items: row(measured.zhWatch, P) }, { shown: ['badge', 'take'], overflow: rest(measured.zhWatch, ['badge', 'take']), fits: true, need: 169, floor: 71 });
  T('split floor, ja Watch, 209 px pane (the verifier\'s red at a 1400 px host): [引き継ぐ][⋯] fits', { widthPx: 193, gapPx: 6, overflowPx: 26, items: row(measured.jaWatch, P) }, { shown: ['take'], overflow: rest(measured.jaWatch, ['take']), fits: true, need: 91, floor: 91 });
  T('split floor, en Take over, 134 px pane: [Hand back][⋯] fits', { widthPx: 118, gapPx: 6, overflowPx: 26, items: row(measured.enTakeover, P) }, { shown: ['handback'], overflow: rest(measured.enTakeover, ['handback']), fits: true, need: 99, floor: 99 });
  // …and the PRE-FIX table (the badge a never-fold 0) on the same inputs: the verifier's red, by arithmetic
  const P0 = { ...P, badge: 0 };
  T('PRE-FIX table (badge never folds), zh Watch, 134 px pane ⇒ fits:false, need 169 > 118 (the toggle cut, the ⋯ clipped out)', { widthPx: 118, gapPx: 6, overflowPx: 26, items: row(measured.zhWatch, P0) }, { shown: ['badge', 'take'], overflow: rest(measured.zhWatch, ['badge', 'take']), fits: false, need: 169, floor: 169 });
  T('PRE-FIX table, ja Watch, 209 px pane ⇒ fits:false, need 222 > 193', { widthPx: 193, gapPx: 6, overflowPx: 26, items: row(measured.jaWatch, P0) }, { shown: ['badge', 'take'], overflow: rest(measured.jaWatch, ['badge', 'take']), fits: false, need: 222, floor: 222 });
  return bad;
};
{
  const bad = judgeTables(L);
  ok(bad.length === 0, `barLayout matches every hand-computed table (${bad.length} wrong)`, bad);
}

// ── §2 properties ──
console.log('§2 properties over 3000 seeded random bars');
{
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let bad = [], nFold = 0, nOver = 0;
  for (let n = 0; n < 3000; n++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => ({ key: 'k' + i, px: rnd() < 0.1 ? 0 : Math.round(8 + rnd() * 160), priority: Math.floor(rnd() * 5) }));
    const gapPx = Math.floor(rnd() * 8), overflowPx = 16 + Math.floor(rnd() * 16), widthPx = Math.floor(rnd() * 900);
    const v = L.barLayout({ widthPx, gapPx, overflowPx, items });
    const live = items.filter((x) => x.px > 0);
    const p0 = live.filter((x) => x.priority === 0);
    const sum = (arr) => arr.reduce((s, x) => s + x.px, 0) + gapPx * Math.max(0, arr.length - 1);
    const p0Need = sum(p0) + (live.length > p0.length ? overflowPx + (p0.length ? gapPx : 0) : 0);
    if (v.overflow.length) nFold++;
    if (!v.fits) { nOver++; if (p0Need <= widthPx && sum(live) > widthPx) bad.push({ why: 'did not fit although the never-fold items do', widthPx, items, v }); }
    if (v.fits && v.need > widthPx) bad.push({ why: 'fits but need > width', v });
    // THE FLOOR (lane I verify r1): the never-fold items + the ⋯ when anything can fold — and a bar at least that wide ALWAYS fits
    if (v.floor !== p0Need) bad.push({ why: 'floor ≠ the never-fold items + the ⋯', p0Need, v });
    if (widthPx >= v.floor && !v.fits) bad.push({ why: 'a bar as wide as its floor did not fit', widthPx, v });
    if (L.barLayout({ widthPx: v.floor, gapPx, overflowPx, items }).fits !== true) bad.push({ why: 'a bar exactly at its floor did not fit', v });
    if (v.overflow.some((k) => live.find((x) => x.key === k).priority === 0)) bad.push({ why: 'a priority-0 item folded', v });
    if (v.shown.length + v.overflow.length !== live.length) bad.push({ why: 'an absent item placed / a present one lost', v });
    // MINIMAL: un-folding the item folded last (fold order: priority desc, then DOM index desc) must not fit
    if (v.overflow.length && v.fits) {
      const order = live.map((x, i) => ({ x, i })).filter((o) => o.x.priority > 0).sort((a, b) => b.x.priority - a.x.priority || b.i - a.i).map((o) => o.x.key);
      const lastFolded = order.filter((k) => v.overflow.includes(k)).pop();
      const shownBack = live.filter((x) => v.shown.includes(x.key) || x.key === lastFolded);
      const rest = v.overflow.length - 1;
      const need = sum(shownBack) + (rest ? overflowPx + gapPx : 0);
      if (need <= widthPx) bad.push({ why: 'not minimal: un-folding the last fold still fits', widthPx, items, v });
    }
    // MONOTONE: a wider bar never folds more
    const w2 = L.barLayout({ widthPx: widthPx + 1 + Math.floor(rnd() * 200), gapPx, overflowPx, items });
    if (w2.overflow.length > v.overflow.length || w2.overflow.some((k) => !v.overflow.includes(k))) bad.push({ why: 'widening folded more', v, w2 });
    if (bad.length > 3) break;
  }
  ok(bad.length === 0 && nFold > 500 && nOver > 50, `every verdict fits (unless the never-fold items alone overflow), never folds a priority-0 item, is MINIMAL and MONOTONE in the width, and a bar as wide as its FLOOR always fits (${nFold} bars folded, ${nOver} over by their never-fold items)`, bad.slice(0, 2));
}

// ── NEGATIVE CONTROLS: the tables are a judge ──
{
  const src = read('src/lib/live-bar-layout.js');
  const byPos = src.replace('.sort((a, b) => b.priority - a.priority || b.i - a.i)', '.sort((a, b) => b.i - a.i)');
  const noMore = src.replace('const cost = () => sum(shown) + (folded.size ? more + (shown.length ? gap : 0) : 0);', 'const cost = () => sum(shown);');
  const floorNoMore = src.replace('const floor = sum(fixed) + (list.length > fixed.length ? more + (fixed.length ? gap : 0) : 0);', 'const floor = sum(fixed);');
  ok(byPos !== src && noMore !== src && floorNoMore !== src, 'NEGATIVE CONTROL: the three mutations applied to the copies (the anchors exist)');
  const Mpos = await import(pathToFileURL(MUT.write('src/lib/live-bar-layout.js', byPos, 'bypos', { esm: true })).href);
  const Mmore = await import(pathToFileURL(MUT.write('src/lib/live-bar-layout.js', noMore, 'nomore', { esm: true })).href);
  const Mfloor = await import(pathToFileURL(MUT.write('src/lib/live-bar-layout.js', floorNoMore, 'floornomore', { esm: true })).href);
  const bp = judgeTables(Mpos), bm = judgeTables(Mmore), bf = judgeTables(Mfloor);
  ok(bf.length >= 4 && bf.every((b) => /floor|fits:false/.test(b.name)), `NEGATIVE CONTROL: a floor that forgets the ⋯ (the width a pane must keep to reach the folded items) fails the floor rows (${bf.length}: ${bf.map((b) => b.name).slice(0, 2).join(' / ')})`);
  ok(bp.length >= 2, `NEGATIVE CONTROL: a fold by POSITION (priority ignored) fails the tables (${bp.length}: ${bp.map((b) => b.name).slice(0, 3).join(' / ')})`);
  ok(bm.length >= 2, `NEGATIVE CONTROL: forgetting the ⋯ button's width fails the tables (${bm.length}: ${bm.map((b) => b.name).slice(0, 3).join(' / ')})`);
}

// ── §3 the short badge ──
console.log('§3 the short mode badge');
const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
{
  const w = [L.shortModeBadge({ mode: 'watch' }), L.shortModeBadge({ mode: 'takeover', mine: true }), L.shortModeBadge({ mode: 'takeover', mine: false }), L.shortModeBadge({})];
  ok(same(w, ['Agent is driving', 'You are driving', 'Another viewer is driving', 'Agent is driving']), 'three short states (watch / mine / another viewer) — the "— agent asked to pause" clause is the tooltip', w);
  ok(w.every((k) => zh[k] && ja[k]), 'each short badge has zh + ja entries', w.map((k) => `${k} → ${zh[k]} / ${ja[k]}`).join(' ; '));
}

// ── §4 the cascade-tie census ──
console.log('§4 the cascade-tie census (viewers.css `.file-tool-btn` wins every (0,1,0) tie)');
const libTexts = Object.fromEntries(fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => [f, read('src/lib/' + f)]));
const cssText = read('public/style.css');
const tieCensus = (texts, css) => {
  const co = new Map();
  for (const [f, src] of Object.entries(texts)) for (const m of src.matchAll(/['"`]([^'"`\n]*\bfile-tool-btn\b[^'"`\n]*)['"`]/g)) for (const c of m[1].split(/\s+/)) if (c && c !== 'file-tool-btn' && /^[a-z][\w-]*$/.test(c)) { if (!co.has(c)) co.set(c, new Set()); co.get(c).add(f); }
  // the properties viewers.css's `.file-tool-btn` sets — a (0,1,0) style.css rule setting one of them LOSES (viewers.css loads later)
  const icon = /\.file-tool-btn\s*\{([^}]*)\}/.exec(read('public/viewers.css'))[1];
  const props = [...icon.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  const loses = (decl) => props.some((p) => new RegExp(`(^|[;{\\s])${p}(-color)?\\s*:`).test(decl)) || /(^|[;{\s])(border-color|padding)\s*:/.test(decl) && false;
  const bad = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const sel of m[1].split(',').map((x) => x.trim())) { const mm = /^\.([\w-]+)$/.exec(sel); if (mm && co.has(mm[1]) && loses(m[2])) bad.push(`${sel} { ${m[2].trim().slice(0, 80)} } — co-occurs with file-tool-btn in ${[...co.get(mm[1])].join(', ')}`); }
  }
  return { co, props, bad };
};
{
  const c = tieCensus(libTexts, cssText);
  ok(c.co.size >= 20 && c.props.includes('width') && c.props.includes('color'), `census scope is non-vacuous (${c.co.size} classes co-occur with file-tool-btn; the icon rule sets ${c.props.join(' ')})`);
  ok(c.bad.length === 0, `no (0,1,0) style.css rule on a file-tool-btn companion class sets a property the icon rule wins (${c.bad.length})`, c.bad.join('\n    '));
  const planted = tieCensus(libTexts, cssText + '\n.browser-live-open { width: auto; padding: 0 8px; font-size: 10px; }\n');
  ok(planted.bad.length === 1 && /browser-live-open/.test(planted.bad[0]), 'NEGATIVE CONTROL: the pre-fix rule (`.browser-live-open { width: auto }`, the audit\'s D1) planted into a patched listing is caught', planted.bad);
}

// ── §5 wiring pins ──
console.log('§5 wiring pins');
{
  const lw = libTexts['browser-live-window.js'], dw = libTexts['desktop-app-window.js'], bf = libTexts['bar-fold.js'], tb = libTexts['taskbar.js'];
  const cssMin = (sel) => { const m = new RegExp(sel.replace(/[.>]/g, (x) => (x === '.' ? '\\.' : '>')) + '\\s*\\{[^}]*min-width:\\s*(\\d+)px').exec(cssText); return m ? Number(m[1]) : null; };
  const urlMin = Number(/export const URL_MIN_PX = (\d+);/.exec(lw)?.[1]);
  const stMin = Number(/export const DESK_STATUS_MIN_PX = (\d+);/.exec(dw)?.[1]);
  ok(urlMin >= 80 && urlMin === cssMin('.browser-live-bar > .browser-live-url'), `the URL's minimum is ONE number: URL_MIN_PX ${urlMin} = the CSS min-width ${cssMin('.browser-live-bar > .browser-live-url')}`);
  ok(stMin > 0 && stMin === cssMin('.desktop-bar > .desktop-status'), `the desktop status's minimum is ONE number: DESK_STATUS_MIN_PX ${stMin} = the CSS min-width ${cssMin('.desktop-bar > .desktop-status')}`);
  const P = /export const LIVE_BAR_PRIORITY = Object\.freeze\((\{[^}]*\})\)/.exec(lw);
  const pri = P ? Function(`return ${P[1]}`)() : null;
  ok(pri && pri.take === 0 && pri.handback === 0 && pri.reconnect === 0 && pri.badge > 0 && Object.entries(pri).every(([k, v]) => v === 0 || k === 'badge' || v > pri.badge) && pri.url < pri.bind && pri.bind <= pri.viewers && pri.backend > pri.viewers && pri.tabs > pri.backend && pri.tabs === pri.console && pri.console === pri.trace, 'the live view\'s priorities: the ONE toggle and Reconnect never fold; the badge folds LAST (lane I verify r1), then the URL; Tabs / Console / Actions first', pri);
  ok(/onLayout: \(v\) => \{ renderMore\(\); floorPane\(v\); \}/.test(lw) && /app\.wm\.setPaneMinWidth\?\.\(winInfo\.id, v\.floor \+ chrome\)/.test(lw) && /const chrome = Math\.max\(0, \(winInfo\.content\.offsetWidth \|\| 0\) - v\.widthPx\)/.test(lw), 'THE SPLIT FLOOR: after every fold the live view keeps its pane at ≥ its bar\'s floor + the chrome around the bar (WindowManager.setPaneMinWidth)');
  ok(/if \(key === 'badge'\) rows\.push\(\{ label: modeBadge\.title \|\| modeBadge\.textContent, title: modeBadge\.title, disabled: true \}\)/.test(lw) && /moreBtn\.dataset\.badge = want/.test(lw) && /moreBtn\.dataset\.mode = !taken \? 'watch' : st\.mine \? 'takeover' : 'other'/.test(lw) && /\.browser-live-bar > \.browser-live-more\[data-badge="folded"\]\[data-mode="takeover"\]/.test(cssText), 'a FOLDED badge rides the ⋯: its sentence is the first ⋯ row (an info row), the ⋯ wears its colour per mode (style.css) and names it in its tooltip');
  ok(/createBarFold\(bar, \{\s*more: moreBtn,/.test(lw) && /priority: LIVE_BAR_PRIORITY\[key\], flexMin: key === 'url' \? URL_MIN_PX : undefined/.test(lw) && /signal: winInfo\._listenerCtl\?\.signal/.test(lw.slice(lw.indexOf('createBarFold(bar'))), 'the live view folds its bar through createBarFold (the ⋯, the priority table, the URL minimum, the window\'s AbortSignal)');
  ok(/showContextMenu\(r\.left, r\.bottom \+ 2, rows\)/.test(lw) && /const foldedRows = \(\) =>/.test(lw) && /check\('tabs', tabsBtn\)/.test(lw), 'the ⋯ opens showContextMenu with one row per folded item, the pane rows carrying their live counts');
  ok(!/watchBtn/.test(lw) && /takeBtn\.style\.display = taken \? 'none' : ''/.test(lw) && /handBtn\.style\.display = taken \? '' : 'none'/.test(lw), 'ONE mode toggle: Take over while the agent drives, Hand back while anybody does (the Watch button — a second Hand back — is gone)');
  ok(/takeBtn\.style\.display = show && m\.mode !== 'takeover' \? '' : 'none';/.test(dw) && /handBtn\.style\.display = show && m\.mode === 'takeover' \? '' : 'none';/.test(dw) && /modeBadge\.textContent = t\(shortModeBadge\(m\)\)/.test(dw), "the desktop strip's window-live form: the same ONE toggle and the same short badge (the sentence in its tooltip)");
  ok(/openBtn\.innerHTML = UI_ICONS\.globe;/.test(lw) && !/UI_ICONS\.web\b/.test(lw), 'the web-view hand-off wears UI_ICONS.globe — never the missing UI_ICONS.web that printed "undefined"');
  ok(/bindBtn\.innerHTML = BIND_SVG;/.test(lw) && /bindBtn\.setAttribute\('aria-label', label\)/.test(lw), 'the bind button is icon-only (its label names the session — unbounded) with the label as its accessible name');
  ok(/barFold = createBarFold\(bar, \{\s*more: moreBtn,\s*moreAlways: \(\) => !!rec && rec\.stream === 'xpra',/.test(dw) && !/moreBtn\.style\.display =/.test(dw) && /DESK_BAR_PRIORITY\.get\(el\) \|\| 0/.test(dw) && /barFold\?\.dispose\(\); barFold = null;/.test(dw), 'the desktop strip folds through createBarFold (⋯ kept for xpra, the shell\'s own items never fold, a retarget disposes the fold)');
  ok(/import \{ barLayout \} from '\.\/live-bar-layout\.js';/.test(bf) && /new ResizeObserver\(schedule\)/.test(bf) && /requestAnimationFrame\(\(\) => \{ raf = 0; layoutNow\(\); \}\)/.test(bf) && /signal\.addEventListener\('abort', stop, \{ once: true \}\)/.test(bf) && /strip\(r\.oldValue\) === strip\(r\.target\.className\)/.test(bf), 'bar-fold.js: the PURE verdict, a ResizeObserver, ONE layout per frame, the AbortSignal lifecycle, its own fold toggles never re-trigger it');
  ok(!/^import /m.test(read('src/lib/live-bar-layout.js')) && !/\bdocument\b|\bwindow\./.test(read('src/lib/live-bar-layout.js').replace(/\/\/.*$/gm, '')), 'live-bar-layout.js is PURE (imports nothing, no DOM)');
  const rule = (sel) => new RegExp(sel.replace(/[.>*]/g, (x) => '\\' + x) + '\\s*\\{([^}]*)\\}').exec(cssText)?.[1] || '';
  ok(/flex: 0 0 auto; white-space: nowrap;/.test(rule('.browser-live-bar > *')) && /flex: 0 0 auto; white-space: nowrap;/.test(rule('.desktop-bar > *')), 'CSS: every child of both bars is nowrap + no-shrink');
  ok(/width: auto;/.test(rule('.browser-live-bar > .file-tool-btn')) && /width: auto;/.test(rule('.desktop-bar > .file-tool-btn')) && /display: none !important/.test(rule('.browser-live-bar > .bar-folded, .desktop-bar > .bar-folded')), 'CSS: the bars\' text buttons are width:auto at (0,2,0) (beating viewers.css\'s 24 px icon box); the fold class hides');
  ok(/overflow: hidden;/.test(rule('.browser-live-bar')) && /visibility: hidden;/.test(rule('.bar-ruler-host')), 'CSS: the live bar clips (defense in depth), the ruler is invisible');
  // the window menu (the owner looked for the live view on the chat window's own menu)
  ok(/registerCommand\(\{ id: 'window\.browserLive', title: \(\) => t\('Agent browser — live view'\), run: \(c\) => c\.app\.openBrowserLiveBeside\(c\.win, c\.s\.webuiId\) \}\)/.test(tb) && /registerMenuItem\(\{ menu: M, group: '2_session', order: 35, command: 'window\.browserLive', kind: 'browser-live', when: hasBrowser \}\)/.test(tb), "the 'window' menu (title bar / tab / taskbar / phone) offers 'Agent browser — live view', opening it BOUND beside the window");
  ok(/c\.s\.browserProfileActive != null \|\| !!c\.s\.browserInput/.test(tb), 'gated on a conversation that HAS a browser (running now, or used since its start)');
  ok(/registerMenuItem\(\{ menu: M, group: '3_admin', order: 16, command: 'session\.browserLive'/.test(libTexts['session-card.js']), 'the sidebar card keeps its own entry');
  ok(/when: \(c\) => !!\(c\.win && c\.win\.type === 'browser-live' && c\.win\._browserLive && !c\.win\._browserLive\.isBound\(\)\)/.test(lw), "a BOUND live pane's menu drops its own Unbind — the chain's Unsplit is the one word for that act (the audit's D7)");
  ok(/export function openBrowserLiveBeside\(app, hostWin, sessionId\)/.test(lw) && /intoChain: \{ hostId: host\.id, split: true, side: 'right' \}/.test(lw) && /app\.wm\.bindSplit\(host, existing, \{ side: 'right', announce: true \}\)/.test(lw), 'openBrowserLiveBeside: born in the window\'s chain as a split, or the existing view bound beside (announced) — never a second viewer');
  // i18n: every t() literal in the three touched client modules has zh + ja
  const lits = (src) => [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const missing = [...new Set([...lits(lw), ...lits(tb), ...lits(dw)])].filter((k) => !zh[k] || !ja[k]);
  ok(missing.length === 0, `every t() literal in browser-live-window.js / taskbar.js / desktop-app-window.js has zh + ja (${missing.length} missing)`, missing.join(' | '));
}

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 3 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
