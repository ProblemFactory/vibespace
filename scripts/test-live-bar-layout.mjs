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
//   §4b THE WORDED-ICON-BOX CENSUS (the rebuilt switch dialog, 2026-09-27): every WORDED button that wears a ≤ 40 px
//      icon-box class (derived from the sheets) is reached by a width:auto rule of its own classes, or of a parent the
//      SAME file builds and appends it to; controls: the classifier, the three reaches, a planted site, the parent law;
//   §4c THE DEAD-TOKEN CENSUS (the naive-user verifier, 2026-09-28: the cap popover had no background — `--bg-secondary`
//      is defined by no theme): no floating surface takes its background from a dead token, the browser dialogs' own
//      surfaces use none, and the product-wide count is a ratchet; controls: the pre-fix popover rule, a planted use;
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
  const noMore = src.replace('const cost = () => sum(shown) + (folded.size ? moreCost(shown) : 0);', 'const cost = () => sum(shown);');
  const floorNoMore = src.replace('const floor = sum(fixed) + (list.length > fixed.length ? moreCost(fixed) : 0);', 'const floor = sum(fixed);');
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

// ── §4b the worded-icon-box census ──
// The rebuilt switch dialog (2026-09-27; the owner's zh screenshot: "打开集成" / "安装 CloakBrowser…" / "取消" /
// "切换" / "记住" stacked one glyph per line). §4 judges one cascade tie; this judges every WORDED button that
// wears an ICON-BOX class, wherever it is built: (1) the icon-box set = every single-class rule of the app's sheets
// (comments stripped, cascade order from index.html) setting `width: Npx`, N ≤ 40; (2) the sites = el|mk('button',
// '<cls>', …), a line-anchored `X = document.createElement('button')` + `X.className = '<cls…>'` (test-ax-paint's
// shape) and template `<button class="…">` over src/lib/*.js + index.html, whose classes hold an icon-box class;
// (3) WORDS = t( / tr( / tc( / escHtml(, a literal with two letters in a row (JS escapes decoded), or an unresolved
// variable written as TEXT; ICON = what is left after the icon refs (UI_ICONS / FILE_ICONS / *_SVG / an ALL_CAPS
// constant), tags and entities is ≤ 2 non-letter code points (test-ax-paint's rhsIconOnly rule; a variable written
// as innerHTML is markup); (4) a worded site passes only by (i) an inline `width: auto`, (ii) a rule made of its own
// classes alone setting `width: auto` that beats the icon rule (specificity above (0,1,0), or equal and later), or
// (iii) a parent-keyed rule `P > X` / `P X` whose parent the SAME file builds with class P and appends the element to
// (a template: encloses it); (5) the flagged list is EMPTY; (6) report-only: a worded site with no nowrap reaching it.
console.log('§4b the worded-icon-box census (a WORDED button on a 24 px icon class)');
const W = (() => {
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const specOf = (sel) => {
    const s2 = sel.replace(/::[a-z-]+/gi, ' ').replace(/:[a-z-]+(\([^)]*\))?/gi, ' .p');
    return [(s2.match(/#[\w-]+/g) || []).length, (s2.match(/\.[\w-]+|\[[^\]]*\]/g) || []).length, (s2.replace(/[.#][\w-]+|\[[^\]]*\]/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length];
  };
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
  const WIDTH_PX = /(?:^|[;{\s])width\s*:\s*(\d+(?:\.\d+)?)px/, WIDTH_AUTO = /(?:^|[;{\s])width\s*:\s*auto\b/, NOWRAP = /(?:^|[;{\s])white-space\s*:\s*nowrap\b/;
  const rulesOf = (sheets) => { const out = []; let i = 0; for (const { name, text } of sheets) for (const m of strip(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)) for (const sel of m[1].split(',').map((x) => x.trim()).filter(Boolean)) if (!sel.startsWith('@')) out.push({ file: name, idx: i++, sel, body: m[2], spec: specOf(sel) }); return out; };
  const iconSetOf = (rules) => { const set = new Map(); for (const r of rules) { const m = /^\.([\w-]+)$/.exec(r.sel), w = WIDTH_PX.exec(r.body); if (m && w && Number(w[1]) <= 40) set.set(m[1], r); } return set; };
  const decode = (x) => String(x || '').replace(/\\u\{([0-9a-f]+)\}/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const ICON_REF = /(?:UI_ICONS|FILE_ICONS)(?:\.\w+|\[[^\]]+\])|\b[A-Z][A-Z0-9_]+\b(?:\[[^\]]+\]|\.\w+)?|\b\w*_SVG\b/g;
  const lits = (e) => [...e.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => decode(m[1] ?? m[2] ?? m[3] ?? ''));
  const noLit = (e) => e.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
  const iconOnly = (text) => { const rest = decode(text).replace(/\$\{[^}]*\}/g, '').replace(/<[^>]+>/g, '').replace(/&#\d+;|&[a-z]+;/gi, '').replace(/\s/g, ''); return !/\p{L}{2,}/u.test(rest) && [...rest].filter((c) => !/\p{L}/u.test(c)).length <= 2; };
  /** textContent / el() content: WORDS unless it is only literals that are icon-only (an expression = unresolved = WORDS). */
  const valuePart = (e) => { const x = String(e || ''); const q = noLit(x).indexOf('?'); return q >= 0 ? x.slice(q + 1) : x; }; // a ternary's condition is not content (`m.dir === 'pull' ? MI.cross : MI.eject`)
  const textKind = (e) => {
    const x = valuePart(e).trim();
    if (!x) return 'none';
    if (/\b(?:t|tr|tc|escHtml)\(/.test(x)) return 'words';
    const ls = lits(x), other = noLit(x).replace(/''|[\s?:+()|&,;]/g, '').replace(/^(?:[\w$.!]+)$/, (m) => (ls.length ? '' : m));
    if (other && /[A-Za-z_$]/.test(other)) return 'words';
    return ls.every(iconOnly) ? 'icon' : 'words';
  };
  /** innerHTML / a template's inner: WORDS only with a translation / escHtml or a literal whose letters live outside tags. */
  const markupKind = (e) => {
    const x = valuePart(e);
    if (/\b(?:t|tr|tc|escHtml)\(/.test(x)) return 'words';
    return lits(x).every(iconOnly) ? 'icon' : 'words';
  };
  const templateInnerKind = (inner) => {
    if (/\$\{[^}]*\b(?:t|tr|tc|escHtml)\(/.test(inner)) return 'words';
    const outside = inner.replace(/\$\{[^}]*\}/g, '');
    if (!iconOnly(outside)) return 'words';
    for (const m of inner.matchAll(/\$\{([^}]*)\}/g)) {
      const branches = m[1].replace(/^[^?]*\?/, '').split(/:|\|\|/).map((b) => b.trim());
      if (!branches.every((b) => !b || /^(?:(?:UI_ICONS|FILE_ICONS)(?:\.\w+|\[[^\]]+\])|[A-Z][A-Z0-9_]+(?:\.\w+|\[[^\]]+\])?|\w*_SVG|\w*[Ii]con\w*\([^)]*\)|''|""|`[^`]*`)$/.test(b) || (/^['"`]/.test(b) && iconOnly(b.slice(1, -1))))) return 'words';
    }
    return 'icon';
  };
  const rhsAll = (src, v, prop) => { const out = []; const re = new RegExp(`(?<![\\w$.])${v.replace(/[.$]/g, '\\$&')}\\.${prop}\\s*=\\s*`, 'g'); let m; while ((m = re.exec(src))) { let i = m.index + m[0].length, d = 0, q = null; const st = i; for (; i < src.length && i - st < 1200; i++) { const c = src[i]; if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; } if (c === "'" || c === '"' || c === '`') q = c; else if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { if (!d) break; d--; } else if ((c === ';' || c === '\n') && !d) break; } out.push(src.slice(st, i)); } return out; };
  /** A helper's PARAMETER written as the button's text (`_btn(text, title) { … b.textContent = text; }`) is resolved by the
   *  helper's own call sites in the file — the argument at that position, each classified; no call found = unresolved. */
  const paramKind = (whole, at, param, kindOf) => {
    const head = whole.slice(Math.max(0, at - 400), at);
    const defs = [...head.matchAll(/(?:(?:const|let)\s+([\w$]+)\s*=\s*\(([^)]*)\)\s*=>|\b([\w$]+)\s*\(([^)]*)\)\s*\{)/g)];
    const d = defs.reverse().find((x) => (x[2] ?? x[4] ?? '').split(',').map((y) => y.trim().replace(/\s*=.*$/, '')).includes(param));
    if (!d) return 'words';
    const name = d[1] || d[3], idx = (d[2] ?? d[4]).split(',').map((y) => y.trim().replace(/\s*=.*$/, '')).indexOf(param);
    const kinds = [];
    for (const c of whole.matchAll(new RegExp(`(?<![\\w$])(?:this\\.)?${name.replace(/[$]/g, '\\$&')}\\(`, 'g'))) {
      let i = c.index + c[0].length, dpt = 0, q = null, cur = '', args = [];
      for (; i < whole.length && i - c.index < 600; i++) { const ch = whole[i]; if (q) { cur += ch; if (ch === '\\') { cur += whole[++i]; } else if (ch === q) q = null; continue; } if (ch === "'" || ch === '"' || ch === '`') { q = ch; cur += ch; continue; } if ('([{'.includes(ch)) dpt++; if (')]}'.includes(ch)) { if (!dpt) break; dpt--; } if (ch === ',' && !dpt) { args.push(cur); cur = ''; continue; } cur += ch; }
      args.push(cur);
      if (whole.slice(c.index - 12, c.index).match(/function\s*$/) || /^\s*\{/.test(whole.slice(i + 1, i + 4))) continue; // the definition itself
      if (args[idx] !== undefined) kinds.push(kindOf(args[idx]));
    }
    return !kinds.length ? 'words' : kinds.includes('words') ? 'words' : 'icon';
  };
  const varKind = (src, v, whole = src, at = 0) => {
    const kinds = [];
    for (const [prop, kindOf] of [['(?:textContent|innerText)', textKind], ['innerHTML', markupKind]]) for (const r of rhsAll(src, v, prop)) kinds.push(/^\s*[a-z_$][\w$]*\s*$/i.test(r) && !/^[A-Z][A-Z0-9_]+$/.test(r.trim()) && kindOf === textKind ? paramKind(whole, at, r.trim(), textKind) : kindOf(r));
    return !kinds.length ? 'none' : kinds.includes('words') ? 'words' : 'icon';
  };
  const inlineAuto = (src, v) => new RegExp(`(?<![\\w$.])${v.replace(/[.$]/g, '\\$&')}\\.style\\.(?:width\\s*=\\s*['"]auto['"]|cssText\\s*[+]?=\\s*['"\`][^'"\`]*width:\\s*auto)`).test(src);
  const lineOf = (src, i) => src.slice(0, i).split('\n').length;
  function sitesOf(file, src, iconSet) {
    const out = [], has = (cl) => cl.some((c) => iconSet.has(c));
    for (const m of src.matchAll(/(?:(?:const|let|var)\s+([\w$]+)\s*=\s*)?\b(?:el|mk)\(\s*'button'\s*,\s*(['"])([^'"\n]*)\2\s*(?:,\s*([^\n]*))?/g)) {
      const classes = m[3].split(/\s+/).filter(Boolean);
      if (!has(classes)) continue;
      let arg = m[4] || '';
      { let d = 0, i = 0; for (; i < arg.length; i++) { if ('([{'.includes(arg[i])) d++; else if (')]}'.includes(arg[i])) { if (!d) break; d--; } } arg = arg.slice(0, i); }
      const v = m[1] || null;
      const kind = arg.trim() ? textKind(arg) : (v ? varKind(src, v) : 'none');
      out.push({ file, line: lineOf(src, m.index), var: v, classes, kind, inlineAuto: v ? inlineAuto(src, v) : false });
    }
    for (const m of src.matchAll(/(?:(?:const|let|var)\s+)?((?:this\.)?[\w$]+)\s*=\s*document\.createElement\('button'\)/g)) {
      const v = m[1];
      const lineNo = lineOf(src, m.index);
      // THE NAME'S OWN SPAN (verifier 2026-09-28): from its birth to the next line that gives the same name another
      // element (`const|let|var v` / `v = document.createElement|el|mk(`) — a name reused later in the file is another
      // button, but a button whose words are written far below its birth (the live bar's `tabsBtn.textContent` 230 lines
      // down, `backendBtn` 500) is THIS button; the old 40-line window (test-ax-paint's) read five worded bar buttons as
      // `none` and never judged them (the negative control below strips the bar rule and names them)
      const ve = v.replace(/[.$]/g, '\\$&');
      const rest = src.slice(m.index + m[0].length);
      const reborn = rest.search(new RegExp(`\\b(?:const|let|var)\\s+${ve}\\b|(?<![\\w$.])${ve}\\s*=\\s*(?:document\\.createElement|el|mk)\\(`));
      const after = m[0] + (reborn >= 0 ? rest.slice(0, reborn) : rest);
      const cm = new RegExp(`(?<![\\w$.])${ve}\\.className\\s*=\\s*(['"\`])([^'"\`\\n]*)\\1`).exec(after.split('\n').slice(0, 40).join('\n')); // the class within 40 lines of the birth (test-ax-paint's shape)
      if (!cm) continue;
      const classes = cm[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean);
      if (!has(classes)) continue;
      out.push({ file, line: lineNo, var: v, classes, kind: varKind(after, v, src, m.index), inlineAuto: inlineAuto(after, v) });
    }
    for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const cls = /\bclass="([^"]*)"/.exec(m[1]);
      if (!cls) continue;
      const classes = cls[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean);
      if (!has(classes)) continue;
      out.push({ file, line: lineOf(src, m.index), var: null, classes, kind: templateInnerKind(m[2]), inlineAuto: /style="[^"]*width:\s*auto/.test(m[1]), template: src.slice(Math.max(0, m.index - 600), m.index) });
    }
    return out;
  }
  /** The textual proof a parent-keyed rule reaches: an append naming `v` into a variable whose NEAREST earlier class
   *  assignment (className = / classList.add / el|mk(…, '…')) names P — a name reused elsewhere is another element. */
  function parentProof(src, v, P) {
    if (!v) return false;
    const ve = v.replace(/[.$]/g, '\\$&');
    for (const a of src.matchAll(new RegExp(`((?:this\\.)?[\\w$]+)\\.(?:append|appendChild|prepend|insertBefore)\\([^;]*?(?<![\\w$.])${ve}\\b`, 'g'))) {
      const pe = a[1].replace(/[.$]/g, '\\$&');
      const before = src.slice(0, a.index);
      const assigns = [...before.matchAll(new RegExp(`(?<![\\w$.])${pe}(?:\\.className\\s*=\\s*(['"\`])([^'"\`\\n]*)\\1|\\.classList\\.add\\(([^)]*)\\)|\\s*=\\s*\\b(?:el|mk)\\(\\s*'[\\w-]+'\\s*,\\s*(['"])([^'"\\n]*)\\4|\\s*=\\s*document\\.createElement\\()`, 'g'))];
      const last = assigns.filter((m) => !/document\.createElement\($/.test(m[0])).pop();
      const cls = last ? (last[2] ?? last[3] ?? last[5] ?? '') : '';
      if (new RegExp(`(?:^|[\\s'"])${P}(?:$|[\\s'"])`).test(cls)) return true;
    }
    return false;
  }
  function reached(site, src, rules, iconSet) {
    if (site.inlineAuto) return { by: 'inline' };
    const icons = site.classes.filter((c) => iconSet.has(c)).map((c) => iconSet.get(c));
    const own = new Set(site.classes);
    for (const r of rules) {
      if (!WIDTH_AUTO.test(r.body) || /:/.test(r.sel)) continue;
      const parts = r.sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean), last = parts[parts.length - 1];
      const lastCls = (last.match(/\.[\w-]+/g) || []).map((x) => x.slice(1));
      if (!lastCls.length || last.replace(/\.[\w-]+/g, '') || !lastCls.every((c) => own.has(c))) continue;
      if (!icons.every((ic) => { const c = cmp(r.spec, ic.spec); return c > 0 || (c === 0 && r.idx > ic.idx); })) continue;
      if (parts.length === 1) return { by: 'own', rule: r };
      const parentCls = (parts[parts.length - 2].match(/\.[\w-]+/g) || []).map((x) => x.slice(1));
      if (!parentCls.length) continue;
      if (site.template ? parentCls.every((P) => new RegExp(`class="[^"]*\\b${P}\\b`).test(site.template)) : parentCls.every((P) => parentProof(src, site.var, P))) return { by: 'parent', rule: r };
    }
    return null;
  }
  function census({ sheets, srcFiles }) {
    const rules = rulesOf(sheets), iconSet = iconSetOf(rules), sites = [];
    for (const [f, src] of Object.entries(srcFiles)) sites.push(...sitesOf(f, src, iconSet));
    const worded = sites.filter((x) => x.kind === 'words'), flagged = [], noNowrap = [];
    for (const x of worded) {
      const r = reached(x, srcFiles[x.file], rules, iconSet);
      if (!r) flagged.push(`${x.file}:${x.line} ${x.var || '<template>'} [${x.classes.join(' ')}]`);
      else if (!rules.some((y) => NOWRAP.test(y.body) && (y === r.rule || ((y.sel.split(/\s*[>+~]\s*|\s+/).pop().match(/\.[\w-]+/g) || []).every((c) => x.classes.includes(c.slice(1))) && !/:/.test(y.sel))))) noNowrap.push(`${x.file}:${x.line} ${x.var || '<template>'}`);
    }
    return { iconSet, sites, worded, flagged, noNowrap };
  }
  return { census, textKind, markupKind, templateInnerKind };
})();
{
  const idxHtml = read('public/index.html');
  const order = [...idxHtml.matchAll(/<link rel="stylesheet" href="\/([\w-]+\.css)">/g)].map((m) => m[1]).filter((f) => ['style.css', 'viewers.css', 'chat.css', 'theme-editor.css'].includes(f));
  const sheets = order.map((name) => ({ name, text: read('public/' + name) }));
  const srcFiles = { ...Object.fromEntries(Object.entries(libTexts).map(([f, t]) => ['src/lib/' + f, t])), 'public/index.html': idxHtml };
  const c = W.census({ sheets, srcFiles });
  ok(same(order, ['style.css', 'viewers.css', 'chat.css', 'theme-editor.css']) && c.iconSet.has('file-tool-btn') && c.iconSet.size >= 10, `the icon-box set, in index.html's cascade order (${order.join(' → ')}), holds file-tool-btn among ${c.iconSet.size} single-class ≤ 40 px rules`);
  ok(c.worded.length >= 30, `the census scope is non-vacuous: ${c.sites.length} icon-class button sites, ${c.worded.length} of them WORDED (46 before the rebuilt dialog removed its eight — the floor sits under both)`);
  ok(c.flagged.length === 0, `every WORDED button on an icon-box class is reached by a width:auto rule of its own classes, or of a parent the same file builds and appends it to (${c.flagged.length} flagged)`, c.flagged.join('\n    '));
  console.log(`  (report only) worded icon-class sites with no white-space: nowrap in reach: ${c.noNowrap.length}${c.noNowrap.length ? ' — ' + c.noNowrap.slice(0, 8).join(', ') : ''}`);
  // CONTROLS — the classifier, the three reaches, a planted site, the parent law
  ok(W.textKind("t('Remember')") === 'words' && W.textKind("'Stop'") === 'words' && W.textKind("'\\u2715'") === 'icon' && W.textKind("'A'") === 'icon' && W.textKind('label') === 'words' && W.markupKind('UI_ICONS.more') === 'icon' && W.markupKind('svg') === 'icon' && W.markupKind("'<svg viewBox=\"0 0 1 1\"></svg>'") === 'icon' && W.markupKind('escHtml(name)') === 'words' && W.templateInnerKind('${gDef ? STAR_F : STAR_O}') === 'icon' && W.templateInnerKind("${escHtml(t('Copy'))}") === 'words' && W.templateInnerKind('Save') === 'words',
    'CONTROL: the classifier — words (t(), a literal word, an unresolved TEXT variable, escHtml) vs icons (an escaped glyph, one letter, a markup variable, an SVG literal, an ALL_CAPS constant)');
  const fx = (src, css) => W.census({ sheets: [{ name: 'style.css', text: css || '' }, { name: 'viewers.css', text: '.file-tool-btn { width: 24px; height: 24px; }' }], srcFiles: { 'fx.js': src } });
  const planted = W.census({ sheets, srcFiles: { ...srcFiles, 'src/lib/zz-planted.js': "const x = el('button', 'file-tool-btn', t('Remember'));\n" } });
  ok(planted.flagged.length === 1 && /zz-planted\.js:1/.test(planted.flagged[0]), 'NEGATIVE CONTROL: a planted `el(\'button\', \'file-tool-btn\', t(\'Remember\'))` in a patched listing is the ONE flagged site', planted.flagged);
  const inline = fx("const b = document.createElement('button');\nb.className = 'file-tool-btn';\nb.textContent = t('Save');\nb.style.width = 'auto';\n");
  const ownR = fx("const b = document.createElement('button');\nb.className = 'file-tool-btn x-save';\nb.textContent = t('Save');\n", '.file-tool-btn.x-save { width: auto; }');
  const ownTie = fx("const b = document.createElement('button');\nb.className = 'file-tool-btn x-save';\nb.textContent = t('Save');\n", '.x-save { width: auto; }');
  const par = "const row = document.createElement('div'); row.className = 'x-row';\nconst b = document.createElement('button');\nb.className = 'file-tool-btn';\nb.textContent = t('Save');\n";
  ok(inline.flagged.length === 0 && ownR.flagged.length === 0 && ownTie.flagged.length === 1 && fx(par + 'row.append(b);\n', '.x-row > .file-tool-btn { width: auto; }').flagged.length === 0 && fx(par, '.x-row > .file-tool-btn { width: auto; }').flagged.length === 1,
    'CONTROL: the reaches — inline width:auto passes; an own-class (0,2,0) rule passes; a (0,1,0) rule EARLIER in the cascade loses the tie (flagged); a parent rule passes only WITH the same-file append proof');
  const dlg = "const acts = document.createElement('div'); acts.className = 'dialog-actions';\nconst go = document.createElement('button');\ngo.className = 'file-tool-btn';\ngo.textContent = t('Switch');\nacts.append(go);\n";
  ok(fx(dlg, '.desktop-bar > .file-tool-btn { width: auto; }').flagged.length === 1, 'NEGATIVE CONTROL: a worded file-tool-btn appended into `.dialog-actions` (the old switch dialog\'s Cancel / Switch) is flagged although `.desktop-bar > .file-tool-btn` exists');
  // verifier 2026-09-28: a button's words may be written FAR below its birth — the live bar's Tabs / Console / Actions
  // (`tabsBtn.textContent = …` 230 lines down), the fit chip, the browser-name button (500 lines down). A census that read
  // only the 40 lines after `createElement` saw them as `none` and never judged them. The control: a sheet whose bar rule
  // (`.browser-live-bar > .file-tool-btn`) lost its `width: auto` must name all five — a copy of style.css, in memory.
  {
    const barRule = /\.browser-live-bar > \.file-tool-btn \{ width: auto;/;
    ok(barRule.test(sheets[0].text), 'the live bar\'s worded buttons are reached by `.browser-live-bar > .file-tool-btn { width: auto; … }` (the rule the control strips)');
    const stripped = sheets.map((sh) => (sh.name === 'style.css' ? { ...sh, text: sh.text.replace(barRule, '.browser-live-bar > .file-tool-btn { ') } : sh));
    const c2 = W.census({ sheets: stripped, srcFiles });
    const far = ['tabsBtn', 'consBtn', 'traceBtn', 'backendBtn', 'fitChip'];
    const named = far.filter((v) => c2.flagged.some((f) => f.startsWith('src/lib/browser-live-window.js:') && f.includes(' ' + v + ' ')));
    ok(named.length === far.length && c2.flagged.length > c.flagged.length, `NEGATIVE CONTROL: with the bar rule's width:auto stripped, the five bar buttons whose words are written far below their birth are flagged BY NAME (${named.join(', ')}; ${c2.flagged.length} flagged in all)`, c2.flagged.join('\n    '));
    const wl = (v) => { const src = srcFiles['src/lib/browser-live-window.js']; const birth = src.search(new RegExp(`const ${v} = document\\.createElement\\('button'\\)`)); const text = src.search(new RegExp(`(?<![\\w$.])${v}\\.textContent = `)); return src.slice(birth, text).split('\n').length; };
    ok(wl('tabsBtn') > 40 && wl('backendBtn') > 40, `…and two of them write their words more than 40 lines after the birth (tabsBtn ${wl('tabsBtn')}, backendBtn ${wl('backendBtn')}) — the span the old window never reached`);
  }
}

// ── §4c the dead-token census ──
// The naive-user verifier (2026-09-28): the live view's browser-cap popover was drawn with NO background — its rule named
// `var(--bg-secondary)`, a token no theme defines (chat.css already says so), so the popover's rows sat over the bar and
// the banner showing through. A var() with no fallback naming a token nothing defines paints NOTHING. Judged over the
// app's sheets (comments stripped): (1) a FLOATING surface (a pop / popover / menu / dropdown / tooltip rule) never takes its
// background from a dead token; (2) the browser dialogs' own surfaces (.brp / .brsw / .bwho / the cap popover / the blocked
// banner / the who cell) use no dead token at all; (3) THE RATCHET — the product-wide count of dead-token uses never grows
// (51 measured after this fix: the older live-view / panel rules, left for their own lanes, each with a named rule).
console.log('§4c the dead-token census (a var(--x) nothing defines paints nothing)');
const DEAD_TOKEN_CEILING = 51;
const deadTokens = (sheets, jsTexts) => {
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set([...sheets.map((x) => strip(x.text)).join('\n').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const src of jsTexts) for (const m of src.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(m[1]);
  const uses = [];
  for (const { name, text } of sheets) {
    for (const m of strip(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      for (const u of m[2].matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        if (u[2] || defined.has(u[1])) continue;
        const bg = new RegExp('background(-color)?\\s*:\\s*var\\(\\s*' + u[1] + '\\s*\\)').test(m[2]);
        uses.push({ file: name, sel, token: u[1], bg });
      }
    }
  }
  const floating = uses.filter((u) => u.bg && /(-pop\b|popover|menu|dropdown|tooltip)/.test(u.sel));
  const lane = uses.filter((u) => /(^|[\s,>+~])\.(brp|brsw|bwho|bprof-who|browser-live-cap-pop|browser-live-blocked)\b/.test(u.sel));
  return { defined, uses, floating, lane };
};
{
  const SHEETS = ['public/style.css', 'public/chat.css', 'public/viewers.css', 'public/theme-editor.css'].filter((f) => fs.existsSync(path.join(repo, f))).map((f) => ({ name: f, text: read(f) }));
  const walkJs = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkJs(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const JS = [...walkJs(path.join(repo, 'src')), path.join(repo, 'public/index.html')].map((f) => fs.readFileSync(f, 'utf8'));
  const d = deadTokens(SHEETS, JS);
  ok(d.defined.has('--bg-dialog') && d.defined.has('--bg-window') && !d.defined.has('--bg-secondary') && d.uses.length >= 10, `census scope is non-vacuous (${d.defined.size} tokens defined; --bg-secondary is not one of them; ${d.uses.length} dead uses product-wide)`);
  ok(d.floating.length === 0, 'no floating surface (pop / popover / menu / dropdown / tooltip) takes its background from a dead token', d.floating.map((u) => `${u.file}: ${u.sel} → ${u.token}`).join('\n    '));
  ok(d.lane.length === 0, 'the browser dialogs\' own surfaces (.brp / .brsw / .bwho / the cap popover / the blocked banner / the who cell) use no dead token', d.lane.map((u) => `${u.sel} → ${u.token}`).join('\n    '));
  ok(d.uses.length <= DEAD_TOKEN_CEILING, `THE RATCHET: ${d.uses.length} dead-token uses product-wide ≤ ${DEAD_TOKEN_CEILING} (a new one fails; fixing an old one lowers the count)`, d.uses.slice(0, 8).map((u) => `${u.file}: ${u.sel} → ${u.token}`).join('\n    '));
  // NEGATIVE CONTROLS over patched listings: the pre-fix popover rule, and a planted new dead use
  const sheetsWith = (edit) => SHEETS.map((x) => (x.name === 'public/style.css' ? { ...x, text: edit(x.text) } : x));
  const pre = deadTokens(sheetsWith((t0) => t0.replace('.browser-live-cap-pop { min-width: 240px; max-width: 360px; padding: 8px 10px; background: var(--bg-dialog);', '.browser-live-cap-pop { min-width: 240px; max-width: 360px; padding: 8px 10px; background: var(--bg-secondary);')), JS);
  ok(pre.floating.some((u) => /browser-live-cap-pop/.test(u.sel)) && pre.lane.some((u) => /browser-live-cap-pop/.test(u.sel)) && pre.uses.length === d.uses.length + 1, 'NEGATIVE CONTROL: the pre-fix cap popover (`background: var(--bg-secondary)`) is flagged as a floating surface AND as a browser-dialog surface');
  const planted = deadTokens(sheetsWith((t0) => t0 + '\n.vs-planted-card { color: var(--text-primary); }\n'), JS);
  ok(planted.uses.length === d.uses.length + 1 && (d.uses.length < DEAD_TOKEN_CEILING || planted.uses.length > DEAD_TOKEN_CEILING), 'NEGATIVE CONTROL: a planted new dead use grows the count past the ratchet');
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
  ok(/createBarFold\(bar, \{\s*more: moreBtn,/.test(lw) && /priority: key === 'kbd' && st\.claimed && \(ky\.yielded \|\| ky\.dialogHolds\) \? LIVE_BAR_PRIORITY\.badge : LIVE_BAR_PRIORITY\[key\], flexMin: key === 'url' \? URL_MIN_PX : undefined/.test(lw) && /signal: winInfo\._listenerCtl\?\.signal/.test(lw.slice(lw.indexOf('createBarFold(bar'))), 'the live view folds its bar through createBarFold (the ⋯, the priority table — the keyboard chip at the badge\'s rank while its keys are yielded to a text box the user pressed, lane takeover-keyboard, or held by a dialog he opened, lane dialog-keys — the URL minimum, the window\'s AbortSignal)');
  ok(/showContextMenu\(r\.left, r\.bottom \+ 2, rows\)/.test(lw) && /const foldedRows = \(\) =>/.test(lw) && /check\('tabs', tabsBtn\)/.test(lw), 'the ⋯ opens showContextMenu with one row per folded item, the pane rows carrying their live counts');
  ok(!/watchBtn/.test(lw) && /takeBtn\.style\.display = taken \? 'none' : ''/.test(lw) && /handBtn\.style\.display = taken \? '' : 'none'/.test(lw), 'ONE mode toggle: Take over while the agent drives, Hand back while anybody does (the Watch button — a second Hand back — is gone)');
  ok(/takeBtn\.style\.display = show && m\.mode !== 'takeover' \? '' : 'none';/.test(dw) && /handBtn\.style\.display = show && m\.mode === 'takeover' \? '' : 'none';/.test(dw) && /modeBadge\.textContent = t\(shortModeBadge\(m\)\)/.test(dw), "the desktop strip's window-live form: the same ONE toggle and the same short badge (the sentence in its tooltip)");
  ok(/openBtn\.innerHTML = UI_ICONS\.globe;/.test(lw) && !/UI_ICONS\.web\b/.test(lw), 'the web-view hand-off wears UI_ICONS.globe — never the missing UI_ICONS.web that printed "undefined"');
  ok(/bindBtn\.innerHTML = BIND_SVG;/.test(lw) && /bindBtn\.setAttribute\('aria-label', label\)/.test(lw), 'the bind button is icon-only (its label names the session — unbounded) with the label as its accessible name');
  { // THE STRIP'S CHIP CENSUS (2.369.181 — lanes D + E met lane I's fold): every control the desktop strip adds carries a
    // fold priority unless it is one of the never-fold set (the mode badge, Take over / Hand back, the ⋯ itself) — a chip
    // added without one keys as a shell item (priority 0) and could never fold, so the bar overflows at a narrow width
    const NEVER = new Set(['modeBadge', 'takeBtn', 'handBtn', 'moreBtn']);
    const census = (text) => {
      const ctl = /const controls = \[([^\]]*)\];/.exec(text), pm = /const DESK_BAR_PRIORITY = new Map\(\[(.*)\]\);/.exec(text);
      const names = ctl ? ctl[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
      const prio = new Set(pm ? [...pm[1].matchAll(/\[(\w+),\s*\d+\]/g)].map((m) => m[1]) : []);
      return { names, missing: names.filter((n) => !NEVER.has(n) && !prio.has(n)) };
    };
    const c = census(dw);
    ok(c.names.length >= 14 && c.names.includes('shareChip') && c.names.includes('scaleChip') && c.missing.length === 0, `every desktop-strip control but the never-fold set has a fold priority (${c.names.length} controls${c.missing.length ? '; missing: ' + c.missing.join(', ') : ''})`);
    const planted = census(dw.replace('const controls = [', 'const controls = [lateChip, '));
    ok(planted.missing.length === 1 && planted.missing[0] === 'lateChip', 'NEGATIVE CONTROL: a control added to the strip without a priority (planted into a copy of the text) is named missing');
  }
  ok(/barFold = createBarFold\(bar, \{\s*more: moreBtn,\s*moreAlways: \(\) => !!rec && \(rec\.stream === 'xpra' \|\| shareable\(\) \|\| !!aboutWindowText\(rec\)\),/.test(dw) && !/moreBtn\.style\.display =/.test(dw) && /DESK_BAR_PRIORITY\.get\(el\) \|\| 0/.test(dw) && /barFold\?\.dispose\(\); barFold = null;/.test(dw), 'the desktop strip folds through createBarFold (⋯ kept for xpra, — lane E — for a shareable app on every rung, and — design 009 §B2 — whenever it has the About this window line; the shell\'s own items never fold, a retarget disposes the fold)');
  ok(/import \{ barLadder \} from '\.\/live-bar-layout\.js';/.test(bf) && /new ResizeObserver\(schedule\)/.test(bf) && /requestAnimationFrame\(\(\) => \{ raf = 0; layoutNow\(\); \}\)/.test(bf) && /signal\.addEventListener\('abort', stop, \{ once: true \}\)/.test(bf) && /strip\(r\.oldValue\) === strip\(r\.target\.className\)/.test(bf), 'bar-fold.js: the PURE verdict, a ResizeObserver, ONE layout per frame, the AbortSignal lifecycle, its own fold toggles never re-trigger it');
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
