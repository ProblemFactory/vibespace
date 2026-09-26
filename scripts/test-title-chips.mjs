#!/usr/bin/env node
// THE TITLE WINS (lane G, 2026-09-25). The owner, on a tab strip whose titles read "V.." / a six-letter stub
// beside a billing chip "≋ 全部 → UCI Max" and an inbox chip "⌸ 1": "这个全部->UCI Max占据了绝大部分空间，
// 都看不到窗口标题了，你有什么好的解决方案吗？" The decision: on a TAB and on a window TITLE BAR the billing
// chip takes the widest of its three forms that leaves the title readable — full (every word), compact
// (the glyph + the member's short name), icon (the glyph) — the dropped words in its tooltip.
// Fast, no browser:
//   §1 the PURE rule (src/lib/title-chips.js): the chipMode table (full / compact / icon at their exact
//      boundaries, the owner's shapes, a short and an empty title, unmeasured input), monotonic in the
//      room, memberShortName / chipWords / titleMinText / inboxCountText;
//   §2 NEGATIVE CONTROLS on patched copies (scripts/mutant-copy.mjs): a rule that always answers 'full'
//      (the pre-fix chip) and one that keeps the full chip while ANY of the title shows both fail §1's table;
//   §3 the REAL WindowManager._fitChip over a fake box (the test-window-minsize pattern): the room is the
//      same number whatever form is showing ⇒ every starting form lands on the same answer (no oscillation),
//      an overflowing box is honest, a box not laid out keeps its form, the widths are measured once per
//      set of words — with a patched window.js that forgets the chip's own width as the failing control;
//   §4 wiring pins: every re-decision trigger (setAuthBadge, setTitle, setTitleMeta, the sibling badges,
//      ONE ResizeObserver per bar unobserved on the window's AbortController, one rAF per burst), the
//      tooltip carrying the full words, the CSS forms, the inbox chip's flex:none + 99+, the phone rule.
// Prerequisite: `npm run build`. Run: node scripts/test-title-chips.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('title-chips', repo);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

// ── the PURE table: every row a (inputs → form) with its reason ──
// The owner's shape (measured at 11 px / 9 px on the 2.369.177 strip): a 3-tab chain in a 640 px window —
// a tab's label + chip share ~95 px, the full chip "≋ 全部 → UCI Max" ~85 px, compact "≋ UCI Max" ~52 px.
const TABLE = [
  // [name, input, want]
  ['room for the whole title beside the full chip ⇒ full', { availablePx: 400, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'full'],
  ['exactly the whole title beside the full chip ⇒ full (the boundary is inclusive)', { availablePx: 190, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'full'],
  ['ONE px short of the whole title ⇒ compact (THE TITLE WINS: the chip yields before the title is cut)', { availablePx: 189, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'compact'],
  ['exactly six characters beside the compact chip ⇒ compact', { availablePx: 95, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'compact'],
  ['one px under six characters beside the compact chip ⇒ icon', { availablePx: 94, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'icon'],
  ['no room at all ⇒ icon (the floor)', { availablePx: 10, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'icon'],
  ['the owner\'s tab: 95 px shared, a long title ⇒ not full (2.369.177 drew "V..")', { availablePx: 95, titlePx: 138, chipFullPx: 85, chipCompactPx: 52, titleMinPx: 44 }, 'NOT full'],
  ['the owner\'s tab: 95 px shared ⇒ compact (43 px of title ≥ six characters at 42 px)', { availablePx: 95, titlePx: 138, chipFullPx: 85, chipCompactPx: 52, titleMinPx: 42 }, 'compact'],
  ['the owner\'s tab with an inbox chip beside it (70 px shared) ⇒ icon', { availablePx: 70, titlePx: 138, chipFullPx: 85, chipCompactPx: 52, titleMinPx: 44 }, 'icon'],
  ['a wide single window (1280 px, 900 px shared) ⇒ full', { availablePx: 900, titlePx: 138, chipFullPx: 85, chipCompactPx: 52, titleMinPx: 44 }, 'full'],
  ['a title SHORTER than six characters needs only itself: 20 px beside the compact chip ⇒ compact', { availablePx: 70, titlePx: 20, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 20 }, 'compact'],
  ['…and the whole short title beside the full chip ⇒ full', { availablePx: 110, titlePx: 20, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 20 }, 'full'],
  ['an EMPTY title never costs the chip its words when it fits', { availablePx: 90, titlePx: 0, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 0 }, 'full'],
  ['titleMinPx omitted ⇒ the whole title is the least (compact needs it all)', { availablePx: 120, titlePx: 100, chipFullPx: 90, chipCompactPx: 50 }, 'icon'],
  ['a compact form measured WIDER than the full one never makes compact harder than full', { availablePx: 140, titlePx: 100, chipFullPx: 40, chipCompactPx: 60, titleMinPx: 45 }, 'full'],
  ['unmeasured (NaN) ⇒ full (the pre-measure form; the DOM does not decide on such a pass)', { availablePx: NaN, titlePx: 100, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'full'],
  ['unmeasured (a negative width) ⇒ full', { availablePx: 100, titlePx: -1, chipFullPx: 90, chipCompactPx: 50, titleMinPx: 45 }, 'full'],
  ['unmeasured (missing chip width) ⇒ full', { availablePx: 100, titlePx: 100, chipCompactPx: 50 }, 'full'],
];
const matches = (got, want) => (want.startsWith('NOT ') ? got !== want.slice(4) : got === want);
const tableFailures = (M) => TABLE.filter(([, input, want]) => !matches(M.chipMode(input), want)).map(([name, , want]) => `${name} (want ${want}, got ${M.chipMode(TABLE.find((r) => r[0] === name)[1])})`);

const TC = await import('../src/lib/title-chips.js');

console.log('§1 the PURE rule (src/lib/title-chips.js)');
{
  for (const [name, input, want] of TABLE) { const got = TC.chipMode(input); ok(matches(got, want), `${name} → ${got}`, { input, want }); }
  ok(TC.chipMode() === 'full' && TC.chipMode({}) === 'full', 'no input at all ⇒ full (never throws)');
  // monotonic in the room: more room never yields a NARROWER form
  const rank = { icon: 0, compact: 1, full: 2 };
  let mono = true, seen = new Set(), last = -1, at = null;
  for (let a = 0; a <= 400; a++) {
    const m = TC.chipMode({ availablePx: a, titlePx: 138, chipFullPx: 85, chipCompactPx: 52, titleMinPx: 44 });
    seen.add(m);
    if (rank[m] < last) { mono = false; at = a; }
    last = rank[m];
  }
  ok(mono && seen.size === 3, `monotonic: sweeping the room 0 → 400 px the form only widens icon → compact → full (all three reached${at != null ? `; narrowed at ${at}` : ''})`, [...seen]);
  const first = (m) => { for (let a = 0; a <= 400; a++) if (TC.chipMode({ availablePx: a, titlePx: 138, chipFullPx: 85, chipCompactPx: 52, titleMinPx: 44 }) === m) return a; return null; };
  ok(first('compact') === 96 && first('full') === 223, `…switching exactly where the rule says: compact from 96 px (52 + 44), full from 223 px (85 + 138) (got ${first('compact')}, ${first('full')})`);
  ok(TC.TITLE_MIN_CHARS === 6 && TC.MEMBER_SHORT_MAX === 8 && JSON.stringify(TC.CHIP_MODES) === '["full","compact","icon"]' && Object.isFrozen(TC.CHIP_MODES), 'the constants: six title characters, eight-character member names, the three forms widest first (frozen)');
  const S = TC.memberShortName;
  ok(S('UCI Max') === 'UCI Max' && S('Personal') === 'Personal', 'memberShortName: a name of ≤ 8 characters is kept whole (UCI Max, Personal)');
  ok(S('Northwind Max') === 'Northwi…' && Array.from(S('Northwind Max')).length === 8, `memberShortName: a longer one is cut to 8 characters, the last an ellipsis (${S('Northwind Max')})`);
  ok(S('  Team   Max  ') === 'Team Max' && S('Personal  Max') === 'Persona…', 'memberShortName: whitespace collapsed first; the cut never leaves a trailing space before the ellipsis');
  ok(S('Persona Max') === 'Persona…' && S('Persona  Max 2') === 'Persona…', '…("Persona Max" → "Persona…", not "Persona …")');
  ok(S('个人订阅主账号备用') === '个人订阅主账号…' && S('🐟🐟🐟🐟🐟🐟🐟🐟🐟') === '🐟🐟🐟🐟🐟🐟🐟…', 'memberShortName: code points, never half a CJK/emoji character');
  ok(S('') === '' && S(null) === '' && S(undefined) === '', 'memberShortName: nothing ⇒ empty');
  ok(S('abcdefghij', 4) === 'abc…' && S('abcdefghij', 1) === 'a…', 'memberShortName: max is honoured (floor 2: one character + the ellipsis)');
  const W = TC.chipWords;
  ok(JSON.stringify(W({ name: '全部', target: 'UCI Max' })) === JSON.stringify({ full: '全部 → UCI Max', short: 'UCI Max' }), 'chipWords: the owner\'s pool — full "全部 → UCI Max" (the tooltip\'s head), compact "UCI Max" (the pool prefix dropped)');
  ok(JSON.stringify(W({ name: '全部', target: 'Northwind Max' })) === JSON.stringify({ full: '全部 → Northwind Max', short: 'Northwi…' }), 'chipWords: a long member name is cut in the compact form only');
  ok(JSON.stringify(W({ name: '全部' })) === JSON.stringify({ full: '全部', short: '全部' }) && JSON.stringify(W({ name: 'Team API key' })) === JSON.stringify({ full: 'Team API key', short: 'Team AP…' }), 'chipWords: no member (a pool with no target, an API key, a login) — the name itself, short in the compact form');
  ok(JSON.stringify(W({})) === JSON.stringify({ full: '', short: '' }) && JSON.stringify(W({ target: 'X' })) === JSON.stringify({ full: 'X', short: 'X' }), 'chipWords: empty parts never produce a stray arrow');
  ok(TC.titleMinText('VibeSpace billing') === 'VibeSp…' && TC.titleMinText('Alpha') === 'Alpha' && TC.titleMinText('Alpha1') === 'Alpha1' && TC.titleMinText('中文窗口标题很长') === '中文窗口标题…', 'titleMinText: six characters + the ellipsis the label draws, or the whole title when it is that short');
  const I = TC.inboxCountText;
  ok(I(0) === '0' && I(1) === '1' && I(99) === '99' && I(100) === '99+' && I(12345) === '99+' && I('x') === '0' && I(-3) === '0' && I(2.9) === '2', 'inboxCountText: the number stays, never wider than "99+"');
  ok(!/^\s*import\b/m.test(read('src/lib/title-chips.js')) && !/\b(document|window|getComputedStyle)\b/.test(read('src/lib/title-chips.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'title-chips.js is PURE: it imports nothing and touches no DOM');
}

console.log('§2 NEGATIVE CONTROLS on patched copies of the rule');
{
  const src = read('src/lib/title-chips.js');
  ok(tableFailures(TC).length === 0, 'the shipped rule passes the whole table (the controls below must not)');
  // (a) the pre-fix chip: always every word
  const a1 = "  if (a - full + EPS >= tw) return 'full';";
  ok(src.split(a1).length === 2, 'the full-form verdict is spelled once (the controls patch exactly it)');
  const alwaysFull = src.replace("export function chipMode({ availablePx, titlePx, chipFullPx, chipCompactPx, titleMinPx } = {}) {", "export function chipMode({ availablePx, titlePx, chipFullPx, chipCompactPx, titleMinPx } = {}) { return 'full'; // CONTROL: the pre-fix chip");
  ok(alwaysFull !== src, 'control (a) patched the rule\'s entry line');
  const MA = await import(MUT.write('src/lib/title-chips.js', alwaysFull, 'always-full'));
  const fa = tableFailures(MA);
  ok(fa.length >= 6 && fa.some((f) => f.startsWith('the owner\'s tab: 95 px shared ⇒ compact')), `CONTROL (a) — a chip that always shows every word (2.369.177) fails ${fa.length} rows, the owner's tab among them`, fa);
  // (b) "the chip keeps its words while ANY of the title shows" — the cut title is exactly the report
  const anyTitle = src.replace(a1, "  if (a - full + EPS >= least) return 'full'; // CONTROL: full while six characters show");
  const MB = await import(MUT.write('src/lib/title-chips.js', anyTitle, 'any-title'));
  const fb = tableFailures(MB);
  ok(fb.length >= 1 && fb.some((f) => f.startsWith('ONE px short of the whole title')), `CONTROL (b) — a chip that yields only below six characters (the title still CUT beside every word) fails ${fb.length} rows`, fb);
  // (c) no icon floor: compact whatever the room
  const noIcon = src.replace("  return 'icon';\n}", "  return 'compact'; // CONTROL: no icon form\n}");
  const MC = await import(MUT.write('src/lib/title-chips.js', noIcon, 'no-icon'));
  const fc = tableFailures(MC);
  ok(noIcon !== src && fc.some((f) => f.startsWith('one px under six characters')), `CONTROL (c) — a chip with no icon form fails ${fc.length} rows (the title under six characters)`, fc);
}

console.log('§3 the REAL WindowManager._fitChip over a fake box');
// a fake DOM just wide enough for window.js's import graph (the test-window-minsize pattern)
const TEXT_PX = 6; // the fake canvas: 6 px per character (the ellipsis too)
globalThis.document = {
  createElement: (tag) => (tag === 'canvas'
    ? { getContext: () => ({ font: '', measureText: (s) => ({ width: Array.from(String(s)).length * TEXT_PX }) }) }
    : { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, append() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {}, classList: { add() {}, remove() {}, contains: () => false } }, documentElement: { style: {}, classList: { add() {}, remove() {} } },
  addEventListener() {}, removeEventListener() {},
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ fontStyle: 'normal', fontWeight: '400', fontSize: '11px', fontFamily: 'sans-serif' });

/** A tab: `share` px for the label + the chip (what is left after the icon, the sibling badges, the ✕); the
 *  label takes whatever the chip's CURRENT form leaves (flex: 1, min-width 0) and the box clips overflow. */
const mkScene = ({ share, title, widths = { full: 85, compact: 52, icon: 20 }, laidOut = true, inTab = true }) => {
  const cls = new Set(['win-auth-badge']);
  const counts = { chipReads: 0 };
  const modeOf = () => ['full', 'compact', 'icon'].find((m) => cls.has('wab-' + m)) || 'full';
  const chip = { dataset: { words: 'pooled\n全部 → UCI Max\nUCI Max' }, classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) }, parentElement: { classList: { contains: (c) => inTab && c === 'tab-item' } } };
  Object.defineProperty(chip, 'offsetWidth', { get: () => { counts.chipReads++; return laidOut ? widths[modeOf()] : 0; } });
  const others = 60;
  const label = { textContent: title, isConnected: true };
  Object.defineProperty(label, 'offsetWidth', { get: () => (laidOut ? Math.max(0, share - widths[modeOf()]) : 0) });
  const box = { isConnected: true };
  Object.defineProperty(box, 'offsetWidth', { get: () => (laidOut ? share + others : 0) });
  Object.defineProperty(box, 'clientWidth', { get: () => (laidOut ? share + others : 0) });
  Object.defineProperty(box, 'scrollWidth', { get: () => (laidOut ? others + Math.max(share, widths[modeOf()]) : 0) });
  return { chip, label, box, counts, mode: () => chip.dataset.mode || 'full', setMode: (m) => { for (const x of ['full', 'compact', 'icon']) cls.delete('wab-' + x); cls.add('wab-' + m); chip.dataset.mode = m; } };
};
const TITLE = 'VibeSpace billing badge'; // 23 characters = 138 px; six + '…' = 42 (+2) px
const fitFrom = (WM, share, start) => {
  const wm = Object.create(WM.prototype); wm.windows = new Map();
  const sc = mkScene({ share, title: TITLE });
  const owner = {};
  sc.setMode(start);
  wm._fitChip(sc.box, sc.label, sc.chip, owner);
  const once = sc.mode();
  wm._fitChip(sc.box, sc.label, sc.chip, owner);
  return { once, twice: sc.mode(), owner: owner._chipMode };
};
const CASES = [[60, 'icon'], [95, 'icon'], [100, 'compact'], [150, 'compact'], [222, 'compact'], [223, 'full'], [400, 'full']];
const judge = (WM) => {
  const bad = [];
  for (const [share, want] of CASES) for (const start of ['full', 'compact', 'icon']) {
    const r = fitFrom(WM, share, start);
    if (r.once !== want || r.twice !== want || r.owner !== want) bad.push({ share, start, want, ...r });
  }
  return bad;
};
{
  const { WindowManager } = await import('../src/lib/window.js');
  const bad = judge(WindowManager);
  ok(bad.length === 0, `the room is the same number whatever form is showing: ${CASES.length} rooms × 3 starting forms land on the table's answer on the FIRST pass and stay there on the second (no oscillation; ${CASES.map(([s, w]) => `${s}px ${w}`).join(', ')})`, bad);
  // an overflowing box: 60 px shared, the FULL chip drawn (85) ⇒ the label is 0 and the box clips 25 — the room is 60, not 85
  const sc = mkScene({ share: 60, title: TITLE }); sc.setMode('full');
  const wm = Object.create(WindowManager.prototype); wm.windows = new Map();
  wm._fitChip(sc.box, sc.label, sc.chip, {});
  ok(sc.mode() === 'icon', `an overflowing tab (the full chip wider than the room it shares) is judged by what it can SHOW (${sc.mode()})`);
  // not laid out (the phone layout hides title bars; a minimized window): the form is kept, nothing measured into a cache
  const hid = mkScene({ share: 400, title: TITLE, laidOut: false }); hid.setMode('icon');
  const holder = {};
  wm._fitChip(hid.box, hid.label, hid.chip, holder);
  ok(hid.mode() === 'icon' && holder._chipFitW === undefined && holder._chipMode === undefined, 'a box not laid out keeps the form it has and caches no zero widths');
  // measured once per set of words: a second pass reads the chip once (the room), never the three forms again
  const m1 = mkScene({ share: 150, title: TITLE }); const o1 = {};
  wm._fitChip(m1.box, m1.label, m1.chip, o1);
  const afterFirst = m1.counts.chipReads;
  wm._fitChip(m1.box, m1.label, m1.chip, o1); wm._fitChip(m1.box, m1.label, m1.chip, o1);
  ok(afterFirst === 4 && m1.counts.chipReads === afterFirst + 2 && o1._chipFitW && o1._chipFitW.full === 85 && o1._chipFitW.compact === 52 && o1._chipFitW.icon === 20, `the chip's three widths are measured ONCE (${afterFirst} reads: three forms + the room) and kept on the window; later passes read only the room (${m1.counts.chipReads - afterFirst} reads for two passes)`, { afterFirst, total: m1.counts.chipReads, cache: o1._chipFitW });
  m1.chip.dataset.words = 'pooled\n全部 → Personal Max\nPersona…';
  wm._fitChip(m1.box, m1.label, m1.chip, o1);
  ok(m1.counts.chipReads === afterFirst + 2 + 4, 'new words (the pool moved the session to another member) ⇒ measured again');
  const tabKey = o1._chipFitW.key;
  const barScene = mkScene({ share: 150, title: TITLE, inTab: false }); barScene.chip.dataset.words = m1.chip.dataset.words;
  wm._fitChip(barScene.box, barScene.label, barScene.chip, o1);
  ok(o1._chipFitW.key !== tabKey && /\nbar$/.test(o1._chipFitW.key) && /\ntab$/.test(tabKey), 'the same words on a standalone title bar are measured apart from the tab\'s (a tab draws the chip smaller)');
  // a short title: the whole title is its own least
  const sh = mkScene({ share: 75, title: 'Alpha' }); // 30 px; compact leaves 23 < 30; icon leaves 55
  wm._fitChip(sh.box, sh.label, sh.chip, {});
  ok(sh.mode() === 'icon', `a 5-character title needs all 30 px of it: beside the compact chip only 23 px are left ⇒ icon (${sh.mode()})`);
  // CONTROL: a patched window.js that forgets the chip's own width (the room = the label alone)
  const src = read('src/lib/window.js');
  const line = '    const availablePx = label.offsetWidth + chip.offsetWidth - deficit;';
  ok(src.split(line).length === 2, 'the room is spelled once in window.js (the control patches exactly it)');
  const { WindowManager: WX } = await import(MUT.write('src/lib/window.js', src.replace(line, '    const availablePx = label.offsetWidth - deficit; // CONTROL: the chip\'s own width forgotten'), 'label-only'));
  const badX = judge(WX);
  ok(badX.length >= 6, `CONTROL — measuring the room as the label alone lands on the wrong form (or a different one per starting form) in ${badX.length} of ${CASES.length * 3} cases`, badX.slice(0, 4));
}

console.log('§4 wiring pins');
{
  const wj = read('src/lib/window.js'), tg = read('src/lib/tab-group.js'), css = read('public/style.css');
  const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j < 0 ? undefined : j); };
  ok(/import \{ chipMode, chipWords, titleMinText, CHIP_MODES \} from '\.\/title-chips\.js';/.test(wj) && /const mode = chipMode\(\{ availablePx, titlePx: tw\.full, titleMinPx: tw\.min, chipFullPx: w\.full, chipCompactPx: w\.compact \}\);/.test(wj), 'window.js decides through the PURE rule, from measured widths');
  const sab = fnBody(wj, '  setAuthBadge(id, auth) {');
  ok(/words = chipWords\(\{ name: poolName, target: auth\.poolTarget \|\| '' \}\);/.test(sab) && /<span class="wab-short">\$\{escHtml\(words\.short\)\}<\/span>/.test(sab) && /<span class="wab-name">\$\{escHtml\(poolName\)\}<\/span>/.test(sab) && /\$\{tgt \? `<span class="wab-pool-tgt"> → \$\{tgt\}<\/span>` : ''\}/.test(sab) && /const tgt = auth\.poolTarget \? escHtml\(auth\.poolTarget\) : '';/.test(sab), 'the pooled chip carries every form (pool name, → member, the SHORT member) — every string escHtml\'d');
  ok(/tip = words\.full \+ ' · ' \+ t\('Pooled account'\)/.test(sab) && /el\.dataset\.tip = tip \+ ' · ' \+ t\('Click to switch billing'\);/.test(sab) && /tip = words\.full \+ ' · ' \+ \(auth\.source === 'codex-subscription'/.test(sab), 'the tooltip LEADS with the full words ("全部 → UCI Max"; a login\'s name) — what compact / icon drop is one hover away');
  ok(/el\.onclick = \(e\) => \{ e\.stopPropagation\(\); this\.app\?\.showBillingSwitcher\?\.\(id, el\); \};/.test(sab), 'the click still opens the billing switcher (it names the pool AND its member: "全部 → UCI Max")');
  ok(/setChipMode\(el, win\._chipMode \|\| 'full'\);/.test(sab) && /this\._fitChipsSoon\(win\);\n    \};/.test(sab), 'a (re)built chip starts in the window\'s LAST form (no flash of every word on a tab-bar rebuild) and is re-decided next frame');
  ok(/win\.title = t; win\.titleSpan\.textContent = t;[\s\S]{0,420}this\._fitChipsSoon\(win\);/.test(fnBody(wj, '  setTitle(id, t) {')), 'setTitle re-decides (a new title may need the chip\'s room or give it back)');
  ok(/else this\._fitChipsSoon\(win\);/.test(fnBody(wj, '  setTitleMeta(id, meta = {}) {')), 'setTitleMeta re-decides a standalone bar (a chain re-renders, which re-applies the chips)');
  ok(/else if \(win\._ownerBadgeKey !== key\) this\._fitChipsSoon\(win\);/.test(fnBody(wj, '  setOwnerBadge(id, badge) {')) && (fnBody(wj, '  _placeInboxBadge(win) {').match(/this\._fitChipsSoon\(win\)/g) || []).length === 2, 'the sibling badges re-decide when they appear, change or go (owner dots, the mini inbox)');
  ok(/this\._fitChipsSoon\?\.\(hostWin\);/.test(fnBody(tg, '  switchTab(chain, index) {')), 'a tab switch re-decides the strip (the active label is drawn bolder)');
  const soon = fnBody(wj, '  _fitChipsSoon(win) {');
  ok(/if \(!host \|\| !host\.titleBar\?\.querySelector\('\.win-auth-badge'\)\) return;/.test(soon), 'a bar with no billing chip is never observed nor measured (file explorers, editors…)');
  ok(/if \(this\._chipFitRaf\) return;/.test(soon) && /this\._chipFitRaf = requestAnimationFrame\(/.test(soon) && /\(this\._chipFitIds \|\|= new Set\(\)\)\.add\(host\.id\);/.test(soon), 'ONE requestAnimationFrame per burst, keyed by the host bar (rAF-coalesced)');
  const obs = fnBody(wj, '  _observeChipBar(host) {');
  ok(/this\._chipRO = new ResizeObserver\(/.test(obs) && /this\._chipRO\.observe\(host\.titleBar\);/.test(obs) && /host\._listenerCtl\?\.signal\?\.addEventListener\('abort', \(\) => \{ this\._chipRO\.unobserve\(host\.titleBar\);/.test(obs) && (wj.match(/_chipRO = new ResizeObserver\(/g) || []).length === 1 && !/_chipRO = new ResizeObserver[\s\S]*_chipRO = new ResizeObserver/.test(tg), 'ONE ResizeObserver for every host title bar (the strip lives inside it), unobserved when the window\'s AbortController aborts (close)');
  ok(/if \(!box \|\| !label \|\| !chip \|\| !box\.isConnected \|\| !box\.offsetWidth\) return;/.test(fnBody(wj, '  _fitChip(box, label, chip, owner) {')), 'a bar not laid out (the ≤768 px phone layout, a minimized window) keeps its form');
  ok(/for \(const tab of host\.titleBar\.querySelectorAll\(':scope > \.tab-bar-tabs > \.tab-item'\)\)/.test(fnBody(wj, '  _fitChipsOf(win) {')), 'a chain decides EVERY tab of its strip, each against its own label');
  ok(/\.win-auth-badge\.wab-compact \.wab-name, \.win-auth-badge\.wab-compact \.wab-pool-tgt,\n\.win-auth-badge\.wab-icon \.wab-name, \.win-auth-badge\.wab-icon \.wab-pool-tgt \{ display: none; \}/.test(css) && /\.win-auth-badge\.wab-compact \.wab-short \{ display: inline; \}/.test(css) && /\.win-auth-badge \.wab-short \{ display: none;/.test(css), 'the CSS draws exactly the picked form (full: name + → member; compact: the short member; icon: the glyph)');
  ok(/\.win-auth-badge\.sub \.wab-glyph \{ display: none; \}/.test(css) && /\.win-auth-badge\.sub\.wab-icon \.wab-glyph \{ display: inline-flex; \}/.test(css), 'a subscription chip keeps its name-only face and shows its crown only as an icon');
  ok(/\.win-inbox-badge \{\n  display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; flex: none; white-space: nowrap;/.test(css) && /num\.textContent = inboxCountText\(n\);/.test(tg) && /import \{ inboxCountText \} from '\.\/title-chips\.js';/.test(tg), 'the inbox chip keeps its number and never grows past its minimal width (flex: none, 99+)');
  ok(/@media \(max-width: 768px\)[\s\S]*?\.window-titlebar \{ display: none; \}/.test(css), 'the phone rule is as it was: no title bars ≤ 768 px (the switcher rows keep their own chip)');
  ok(!/wab-(full|compact|icon)/.test(read('src/lib/session-card.js')) && !/wab-(full|compact|icon)/.test(read('src/lib/mobile-nav.js')), 'the sidebar card and the phone nav are untouched (they have room)');
}

console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 4 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
