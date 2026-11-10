#!/usr/bin/env node
// THE TITLE OWNS THE PHONE'S BAR — the fast gate (lane phone-titlebar-title). The owner 2026-11-06, a phone at ~360 CSS px (zh):
// 「手机端的标题栏被挤压得根本看不到聊天标题了」 — ☰ · 📁 · desktops «2» · the ring «37» · the For-you chip's FIVE badges · ⚙ · ✕ · + left
// the title «游…»; then: 「最左边那个文件浏览器的图标也很容易误认为是当前窗口的图标…应该放进 + 菜单里」.
//   §1 PURE src/lib/title-chips.js navTitleMinText — the readable minimum: the first 6 CJK / 12 Latin characters + «…»
//   §2 navBarFold — the table over the widths the chrome gate measured (every control a 44 px target, the For-you chip 130.4 px with
//      five badges / 44 px with one), the r1 acceptance's measured bar (the For-you chip 120 / 47.016 px: «NotesDtekEH» 93.297 px and
//      «NotescvHJ.vu» 93.031 px against a 92.984 px room — Chrome cut both while ⚙ stood), the count's give-back (a ⋯ never holds ONE
//      chip no wider than itself, whatever folded it); then a SWEEP of 13 bars × every room 160…768 px (4 px steps, each fold
//      boundary found by bisection and stepped through in 0.01 px steps ±0.5 px — the band a slack would hide in), judged by the
//      GEOMETRY (the room the title is left, computed here from the verdict's folds — never the verdict's own `fits`): the folds a
//      STACK in the fixed order (the give-back the one exception), never deeper on a wider bar, the doors never folded, the title
//      WHOLE whenever a chip still has a smaller form, `fits` / `readable` never claimed for a title wider than its room
//   §3 navMoreRows — every folded chip is a ⋯ row, in the bar's order, with its live value in the chip's OWN words (r3: the desktops
//      row «2/3 · 工作» — the PLACE of the total and the name, never r2's bare «2» that read as «two desktops»; the ring «52 %»; the
//      lock's and ⚙'s words their labels); navMoreLoud (r3) — the ⋯ wears ⚙'s lock while the vault is locked AND ⚙ is folded, over
//      every bar of the sweep (some door always says the lock); navOneBadge — the five's ONE
//   §4 NEGATIVE CONTROLS on patched copies outside the tree: the base's fixed layout, a chip folding out of order, a folded chip
//      missing from the ⋯, the For-you chip folding away, the badge lost; the r1 acceptance's behaviour mutants M1–M8 (no give-back,
//      the count off by one, no one-badge step, the give-back for a width fold only (= r1), fold only until the minimum reads, one
//      fold too many, a free ⋯, an 8-unit minimum); the r1 half-pixel slack in the title's favour; r3: a quiet ⋯ on a locked vault
//      (= r2), a loud ⋯ while ⚙ stands, a plain ⚙ row, r2's bare desktops badge — each RED by name
//   §5 the wiring: the bar's watchers on the controller it owns, the compact class only, the ⋯ its menu's anchor (exempt from the
//      menu's closer), a row's door anchored at its own chip, a row's glyph AND value repainted from the chip, the «+» sheet's 文件 =
//      the nav door's press, the one badge never a .ut-count and in theme colours, no later rule re-showing the compact bar's folder
//      icon; the count 3 as a literal AND = row-fold-model.js's ROW_INLINE_MAX when that file rides; r3: ⚙'s row the WHOLE chip (its
//      lock mark), the ⋯'s mark from navMoreLoud, the desktops row's words from the chip's own state, the menu PATCHED by key (never
//      re-opened by the fit) and held still under a press, the «+» 文件 row's hint naming the explorer it brings back — each pin a
//      predicate judged on the tree AND on the tree with r2's line put back (its CONTROL, RED)
// Every check is RED BY NAME on an older tree (the base, r1, r2): a missing export is a named failure, never a crash.
// The chrome half: scripts/test-phone-titlebar-ui.mjs (heavy). Run: node scripts/test-phone-titlebar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('phone-titlebar', repo);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : ''}`); } return !!c; };
const J = JSON.stringify;
const TC = await import('../src/lib/title-chips.js');
// an older tree (the base, r1, r2) lacks exports this suite judges: a call that throws is a NAMED failure, never a crash
const tryv = (f) => { try { return f(); } catch (e) { return `threw — ${e.message}`; } };
const safe = (f) => (...a) => { try { return f(...a); } catch (e) { return [`threw — ${e.message}`]; } };

console.log('§1 the readable minimum (navTitleMinText)');
const MINS = [['游戏关卡与数值平衡讨论稿', '游戏关卡与数…'], ['Quarterly planning notes for the fleet ops', 'Quarterly pl…'], ['游戏', '游戏'], ['Notes', 'Notes'],
  ['Twelve chars', 'Twelve chars'], ['Mixed 中文 title here', 'Mixed 中文 t…'], ['  spaced   out  ', 'spaced out'], ['', ''], ['日本語のタイトルです', '日本語のタイ…'], ['한국어 제목입니다', '한국어 제목…']];
const minFailures = safe((M) => MINS.filter(([title, want]) => M.navTitleMinText(title) !== want).map(([title, want]) => `«${title}» → want «${want}», got «${M.navTitleMinText(title)}»`));
for (const [title, want] of MINS) { const got = tryv(() => TC.navTitleMinText(title)); ok(got === want, `«${title}» → «${want}» (got «${got}»)`); }

// THE MEASURED BAR (the chrome gate's numbers on this lane, zh, Noto): every control 44 px, the For-you chip 130.4 px with the owner's
// five badges / 44 px with one, the ⋯ 44 px, no gap, no padding. MEASURED = the r1 acceptance's fixture (the For-you chip 120 / 47.016)
const MORE_W = 44;
const bar = ({ desk = 44, usage = 44, badges = 130.4, one = 44, vault = 0, gear = 44, close = 44 } = {}) => [
  { key: 'menu', forms: [44] }, { key: 'desktops', forms: [desk] }, { key: 'usage', forms: [usage] }, { key: 'vault', forms: [vault] },
  { key: 'todos', forms: badges > one ? [badges, one] : [badges] }, { key: 'gear', forms: [gear] }, { key: 'close', forms: [close] }, { key: 'new', forms: [44] }];
const fold = (roomPx, titlePx, titleMinPx, o = {}, M = TC) => M.navBarFold({ roomPx, gapPx: o.gap || 0, moreW: MORE_W, titlePx, titleMinPx, items: bar(o) });
const OWNER = [168, 96], TWO = [28, 28], LATIN = [292.2, 96.8], WORD = [41.4, 41.4], MEASURED = { badges: 120, one: 47.016 };

console.log('§2 the fold (navBarFold)');
const TABLE = [
  ['the owner\'s 12-character zh title, five badges, 360 px ⇒ the badges ONE, desktops · ring · ⚙ in ⋯, the title readable', [360, ...OWNER], {}, { folded: 'desktops,usage,gear', todos: 1, readable: true, fits: false, titleRoom: 140 }],
  ['…at 320 px ⇒ the same folds, 100 px ≥ its 96 px minimum', [320, ...OWNER], {}, { folded: 'desktops,usage,gear', todos: 1, readable: true, titleRoom: 100 }],
  ['a 2-character title, five badges, 430 px ⇒ everything fits, NOTHING folds', [430, ...TWO], {}, { folded: '', todos: 0, fits: true }],
  ['…at 360 px ⇒ desktops + ring fold, the badges ONE, ⚙ stands, the whole title', [360, ...TWO], {}, { folded: 'desktops,usage', todos: 1, fits: true }],
  ['a 42-character Latin title, 360 px ⇒ every chip folds, ≥ 12 characters read', [360, ...LATIN], {}, { folded: 'desktops,usage,gear', todos: 1, readable: true, fits: false }],
  ['one word, 360 px ⇒ the whole word', [360, ...WORD], {}, { folded: 'desktops,usage', todos: 1, fits: true }],
  ['no badges (the For-you chip one form), the owner\'s title, 360 px ⇒ desktops · ring · ⚙ in ⋯', [360, ...OWNER], { badges: 44 }, { folded: 'desktops,usage,gear', todos: 0, readable: true }],
  ['the ring hidden: ONE ⋯ for ONE chip gains nothing — desktops stands, the badges ONE suffice (365 px)', [365, 100, 96], { usage: 0 }, { folded: '', todos: 1, fits: true }],
  ['…a px less (363 px) ⇒ ⚙ folds too: two chips in the ⋯', [363, 100, 96], { usage: 0 }, { folded: 'desktops,gear', todos: 1, fits: true }],
  // THE COUNT'S GIVE-BACK (r2): at most 3 foldable chips inline — or 4 when the 4th alone would fill the ⋯ (a 44 px ⋯ for a 44 px chip)
  ['the vault-lock chip makes FOUR foldable chips: the count would put the desktops door ALONE in a ⋯ — the title gains nothing, it stands (900 px)', [900, ...TWO], { vault: 44 }, { folded: '', todos: 0, fits: true }],
  ['…the same at 600 px (the r1 acceptance\'s fixture c6): four chips inline, no ⋯', [600, ...TWO], { vault: 44 }, { folded: '', todos: 0, fits: true }],
  ['…the owner\'s title at 600 px ⇒ the count folds the desktops door, the width the ring: TWO chips in the ⋯', [600, ...OWNER], { vault: 44 }, { folded: 'desktops,usage', todos: 0, fits: true }],
  ['the vault-lock chip folds after the badges, before ⚙ (the owner\'s title, 450 px)', [450, ...OWNER], { vault: 44 }, { folded: 'desktops,usage,vault', todos: 1, fits: true }],
  ['a 200 px bar ⇒ the doors stand (☰ · For you at its floor · ✕ · +), every chip folded, the title cut', [200, ...OWNER], {}, { folded: 'desktops,usage,gear', todos: 1, readable: false, fits: false }],
  // THE SLACK IS THE TITLE'S (r2): the r1 acceptance's measured bar — ⚙ left the title 92.984 px; Chrome cut a title 0.05 px wider
  ['«NotesDtekEH» (93.297 px, 0.31 px over the room ⚙ leaves it) ⇒ ⚙ folds, the title WHOLE (136.984 px)', [360, 93.297, 93.297], MEASURED, { folded: 'desktops,usage,gear', todos: 1, fits: true, titleRoom: 136.984 }],
  ['«NotescvHJ.vu» (93.031 px, 0.05 px over) ⇒ ⚙ folds, the title WHOLE', [360, 93.031, 93.031], MEASURED, { folded: 'desktops,usage,gear', todos: 1, fits: true, titleRoom: 136.984 }],
  ['a title 0.034 px UNDER that room (92.95 px) ⇒ ⚙ stands, the title whole', [360, 92.95, 92.95], MEASURED, { folded: 'desktops,usage', todos: 1, fits: true, titleRoom: 92.984 }],
  ['a title within one layout unit of it (92.975 px) ⇒ ⚙ folds: the unit is charged to the chips, never the title', [360, 92.975, 92.975], MEASURED, { folded: 'desktops,usage,gear', todos: 1, fits: true }],
  ['the minimum 0.3 px wider than the last room (315.7 px, every chip folded) ⇒ NOT readable', [315.7, ...OWNER], {}, { folded: 'desktops,usage,gear', todos: 1, readable: false, fits: false, titleRoom: 95.7 }],
  ['…0.2 px narrower (316.2 px) ⇒ readable', [316.2, ...OWNER], {}, { folded: 'desktops,usage,gear', todos: 1, readable: true, fits: false, titleRoom: 96.2 }],
  ['unmeasured (no room) ⇒ nothing changes', [0, ...OWNER], {}, { folded: '', todos: 0 }],
  ['unmeasured (NaN) ⇒ nothing changes', [NaN, ...OWNER], {}, { folded: '', todos: 0 }],
];
const tableFailures = (M) => TABLE.filter(([, [r, tw, tm], o, want]) => {
  const v = tryv(() => fold(r, tw, tm, o, M));
  if (typeof v === 'string') return true;
  return v.folded.join() !== want.folded || (v.forms.todos || 0) !== want.todos || ('readable' in want && v.readable !== want.readable) || ('fits' in want && v.fits !== want.fits) || ('titleRoom' in want && Math.abs(v.titleRoom - want.titleRoom) > 0.001);
}).map(([name, [r, tw, tm], o]) => `${name} → ${J(tryv(() => fold(r, tw, tm, o, M)))}`);
{ const f = tableFailures(TC); for (const [name, [r, tw, tm], o] of TABLE) ok(!f.some((x) => x.startsWith(name)), name, tryv(() => fold(r, tw, tm, o))); }

// THE SWEEP: 13 bars × every room 160…768 px, each fold boundary stepped through at 0.01 px — judged by the geometry
const SHAPES = [['the owner', OWNER, {}], ['2 characters', TWO, {}], ['Latin 42', LATIN, {}], ['one word', WORD, {}], ['no badges', OWNER, { badges: 44 }],
  ['the vault locked', OWNER, { vault: 44 }], ['the vault locked, 2 characters', TWO, { vault: 44 }], ['the vault locked, no badges, Latin', LATIN, { vault: 44, badges: 44 }],
  ['the ring hidden', [100, 96], { usage: 0 }], ['the measured bar, «NotesDtekEH»', [93.297, 93.297], MEASURED], ['the measured bar, «NotescvHJ.vu»', [93.031, 93.031], MEASURED],
  ['a 2 px gap', OWNER, { gap: 2 }], ['odd widths', [150.37, 96.4], { desk: 44.5, usage: 47.3, vault: 44.9, gear: 44.2, badges: 101.7, one: 45.1 }]];
const DOORS = ['menu', 'todos', 'close', 'new'], SLACK = 1 / 64;
const shapeOf = ([name, [tw, tm], o], M) => {
  const items = bar(o).filter((it) => it.forms[0] > 0), g = o.gap || 0;
  // THE STACK: the fold order's steps as they are taken — a chip folds, the For-you chip takes its one-badge form
  const steps = M.NAV_FOLD_ORDER.flatMap((k) => { const it = items.find((x) => x.key === k); return !it ? [] : k === 'todos' ? (it.forms.length > 1 ? [{ k, form: 1 }] : []) : [{ k }]; });
  return { name, tw, tm, g, items, steps };
};
const judge = (S, r, v) => {
  const bad = [], at = (it) => it.forms[v.forms[it.key] || 0];
  if (DOORS.some((k) => v.folded.includes(k))) bad.push(`a door folded (${v.folded})`);
  const standing = S.items.filter((it) => !v.folded.includes(it.key));
  const boxes = 1 + standing.length + (v.folded.length ? 1 : 0);
  const room = r - standing.reduce((s, it) => s + at(it), 0) - (v.folded.length ? MORE_W : 0) - S.g * (boxes - 1); // what the title is left
  if (Math.abs(Math.max(0, room) - v.titleRoom) > 1e-6) bad.push(`the verdict's titleRoom ${v.titleRoom} is not the bar's ${room}`);
  const taken = S.steps.map((s) => (s.form ? (v.forms[s.k] || 0) === s.form : v.folded.includes(s.k)));
  const depth = taken.lastIndexOf(true) + 1;
  const holes = taken.slice(0, depth).map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
  // the one exception to the stack: a chip given back (ONE fold step in the prefix, the chip no wider than the ⋯)
  const prefixFolds = S.steps.slice(0, depth).filter((s) => !s.form);
  // (a chip given back stands: legal when it is no wider than the ⋯, or the whole title fits beside it)
  const gaveBack = holes.length === 1 && !S.steps[holes[0]].form && prefixFolds.length === 1 && (at(S.items.find((it) => it.key === S.steps[holes[0]].k)) <= MORE_W || room - SLACK >= S.tw);
  if (holes.length && !gaveBack) bad.push(`not a stack in the fixed order: ${S.steps.map((s, i) => (taken[i] ? '●' : '○') + s.k).join(' ')}`);
  if (v.folded.length === 1) {
    const w = at(S.items.find((it) => it.key === v.folded[0]));
    if (w <= MORE_W || room - (w - MORE_W) - SLACK >= S.tw) bad.push(`ONE chip (${v.folded[0]}, ${w} px) alone in a ⋯ the title does not need`);
  }
  const allTaken = taken.every(Boolean);
  if (!allTaken && room < S.tw) bad.push(`the title CUT (${S.tw} px in ${room.toFixed(4)} px) while a chip still has a smaller form (${v.folded})`);
  if (v.fits && room < S.tw) bad.push(`fits claimed for a title ${(S.tw - room).toFixed(4)} px wider than its room`);
  if (v.readable && room < S.tm) bad.push(`readable claimed for a minimum ${(S.tm - room).toFixed(4)} px wider than its room`);
  return { bad, depth };
};
const sig = (v) => v.folded.join() + '|' + (v.forms.todos || 0);
const sweepFailures = safe((M, only = null) => {
  const bad = [];
  for (const shape of SHAPES) {
    if (only && !only.includes(shape[0])) continue;
    const S = shapeOf(shape, M);
    const call = (r) => M.navBarFold({ roomPx: r, gapPx: S.g, moreW: MORE_W, titlePx: S.tw, titleMinPx: S.tm, items: S.items });
    const look = (r, v = call(r)) => { const j = judge(S, r, v); for (const b of j.bad) bad.push(`${S.name} @${+r.toFixed(4)}: ${b}`); return j.depth; };
    let prev = null, prevDepth = Infinity;
    for (let r = 160; r <= 768; r += 4) {
      const v = call(r), d = look(r, v);
      if (d > prevDepth) bad.push(`${S.name} @${r}: a wider bar folds DEEPER (${prevDepth} → ${d})`);
      if (prev && sig(prev) !== sig(v)) {
        // every boundary in (r − 4, r]: found by bisection, then stepped through at 0.01 px, ±0.5 px
        let lo = r - 4;
        while (lo < r) {
          const s0 = sig(call(lo));
          let a = lo, b = r;
          if (sig(call(b)) === s0) break;
          while (b - a > 1e-6) { const m = (a + b) / 2; if (sig(call(m)) === s0) a = m; else b = m; }
          let dPrev = Infinity;
          for (let i = -50; i <= 50; i++) {
            const x = b + i * 0.01, d2 = look(x);
            if (d2 > dPrev) bad.push(`${S.name} @${+x.toFixed(4)}: 0.01 px wider folds DEEPER (${dPrev} → ${d2})`);
            dPrev = d2;
          }
          lo = b + 1e-6;
        }
      }
      prev = v; prevDepth = d;
    }
  }
  return bad;
});
{ const f = sweepFailures(TC); ok(f.length === 0, `the sweep (13 bars × rooms 160…768 px, every fold boundary at 0.01 px ±0.5 px), judged by the geometry: a stack in the fixed order, never deeper on a wider bar, the doors never folded, never one chip alone in a ⋯ no narrower than itself, the title WHOLE while a chip still has a smaller form, fits / readable never claimed past the room (${f.length} breaks)`, f.slice(0, 4)); }
ok(J(TC.NAV_FOLD_ORDER) === J(['desktops', 'usage', 'todos', 'vault', 'gear']) && J(TC.NAV_NEVER_FOLD) === J(['menu', 'todos', 'close', 'new']) && TC.NAV_SLACK_PX === 1 / 64,
  'the fixed order (desktops → ring → badges → vault-lock → ⚙), the doors (☰ · For you · ✕ · +), the slack one layout unit (1/64 px) on the title\'s side', { order: TC.NAV_FOLD_ORDER, doors: TC.NAV_NEVER_FOLD, slack: TC.NAV_SLACK_PX });
ok(TC.NAV_INLINE_MAX === 3, `the count: NAV_INLINE_MAX = 3, the owner's phone-row rule as a literal (${TC.NAV_INLINE_MAX})`);

console.log('§3 the ⋯ rows (navMoreRows), the lock on a folded bar (navMoreLoud) and the ONE badge (navOneBadge)');
// over the sweep's bars at 16 px steps: every folded chip a row (in the bar's order) and, the vault locked, the ⋯ wearing the lock
// exactly when ⚙ is folded — never when open (one pass per module, shared by both judges)
const DESK = { k: 2, n: 3, name: '工作' };
const barSweep = (M) => {
  if (barSweep.c.has(M)) return barSweep.c.get(M);
  const res = tryv(() => {
    const rows = [], loud = [], judgeLoud = typeof M.navMoreLoud === 'function';
    if (!judgeLoud) loud.push('threw — navMoreLoud is not a function');
    for (const [name, [tw, tm], o] of SHAPES) for (let r = 160; r <= 768; r += 16) {
      const v = fold(r, tw, tm, o, M), keys = M.navMoreRows(v.folded, { desktops: DESK, usage: '37' }).map((x) => x.key);
      if (keys.join() !== v.folded.join()) rows.push(`${name} @${r}: folded ${v.folded} but the ⋯ lists ${keys}`);
      if (!judgeLoud) continue;
      const lk = M.navMoreLoud(v.folded, { vaultLocked: true }), op = M.navMoreLoud(v.folded, { vaultLocked: false });
      if (lk !== v.folded.includes('gear') || op) loud.push(`${name} @${r}: folded ${v.folded || '—'}, the vault ${op ? 'open' : 'locked'} — the ⋯ ${lk ? 'wears' : 'does not wear'} the lock`);
    }
    return { rows, loud };
  });
  const out = typeof res === 'string' ? { rows: [res], loud: [res] } : res;
  barSweep.c.set(M, out);
  return out;
};
barSweep.c = new Map();
const moreFailures = (M) => {
  const bad = [...barSweep(M).rows];
  const keys = tryv(() => M.navMoreRows(['gear', 'desktops'], {}).map((x) => x.key).join());
  if (keys !== 'desktops,gear') bad.push('the bar\'s order: ' + keys);
  return bad;
};
{ const f = moreFailures(TC); ok(f.length === 0, 'every folded chip is a ⋯ row, in the bar\'s order (the sweep\'s bars at 16 px steps)', f.slice(0, 3)); }
// THE ROWS' WORDS (r3 F3 — decided per row by what the chip tells a person): the desktops chip's badge is the active desktop's PLACE
// and its name says «Desktops — 工作 (2/3)» — its row says the place OF THE TOTAL and the name, never a bare number (r2's «Desktops 1»
// on a page with two read as ONE desktop); the ring's arc is a percent; the lock's words and ⚙'s are their labels (no value)
const WORDS = [
  ['three desktops, the second active ⇒ «2/3 · 工作»', [['desktops'], { desktops: { k: 2, n: 3, name: '工作' } }], [{ key: 'desktops', value: '2/3 · 工作' }]],
  ['three desktops, the first active ⇒ «1/3 · Desk 1» (r2 said «1»)', [['desktops'], { desktops: { k: 1, n: 3, name: 'Desk 1' } }], [{ key: 'desktops', value: '1/3 · Desk 1' }]],
  ['one desktop ⇒ «1/1 · Main» (the place of the total, said)', [['desktops'], { desktops: { k: 1, n: 1, name: 'Main' } }], [{ key: 'desktops', value: '1/1 · Main' }]],
  ['a name over two lines ⇒ one line', [['desktops'], { desktops: { k: 2, n: 2, name: ' Q3\n decks ' } }], [{ key: 'desktops', value: '2/2 · Q3 decks' }]],
  ['a nameless desktop ⇒ the place of the total alone', [['desktops'], { desktops: { k: 2, n: 4, name: '' } }], [{ key: 'desktops', value: '2/4' }]],
  ['the chip\'s bare badge text (r2\'s fact) ⇒ nothing said — never a bare number', [['desktops'], { desktops: '2' }], [{ key: 'desktops', value: '' }]],
  ['no desktops known ⇒ nothing', [['desktops'], {}], [{ key: 'desktops', value: '' }]],
  ['the ring ⇒ its percent «52 %»', [['usage'], { usage: '52' }], [{ key: 'usage', value: '52 %' }]],
  ['the four rows, the vault LOCKED: the place of the total, the percent, the lock\'s words alone, ⚙ wearing the lock', [['desktops', 'usage', 'vault', 'gear'], { desktops: DESK, usage: '37', vaultLocked: true }],
    [{ key: 'desktops', value: '2/3 · 工作', loud: false }, { key: 'usage', value: '37 %', loud: false }, { key: 'vault', value: '', loud: false }, { key: 'gear', value: '', loud: true }]],
  ['…the vault open: ⚙ plain', [['usage', 'gear'], { usage: '37' }], [{ key: 'usage', value: '37 %', loud: false }, { key: 'gear', value: '', loud: false }]],
];
// a row is judged on the fields its want names (`loud` as a yes / no — a tree without it says no)
const same = (got, want) => Array.isArray(got) && got.length === want.length && want.every((w, i) => Object.keys(w).every((k) => (k === 'loud' ? !!got[i][k] === w[k] : got[i][k] === w[k])));
const wordFailures = (M) => WORDS.filter(([, [f, facts], want]) => !same(tryv(() => M.navMoreRows(f, facts)), want)).map(([name, [f, facts]]) => `${name} → ${J(tryv(() => M.navMoreRows(f, facts)))}`);
{ const w = wordFailures(TC); for (const [name] of WORDS) ok(!w.some((x) => x.startsWith(name)), `the ⋯ row's words: ${name}`, w.filter((x) => x.startsWith(name))); }
// THE LOCK STAYS LOUD (r3 F1 — vault-locked-loud: «the vault is locked» is said wherever Settings is reached from): the lock chip folds
// before ⚙, so once ⚙ folds the ⋯ that stands in for it wears ⚙'s lock — never while ⚙ stands (it says it itself)
const LOUD = [
  ['⚙ folded, the vault locked ⇒ the ⋯ wears the lock', [['desktops', 'usage', 'vault', 'gear'], true], true],
  ['⚙ folded, the vault open ⇒ a plain ⋯', [['desktops', 'usage', 'gear'], false], false],
  ['the lock chip folded, ⚙ standing ⇒ a plain ⋯ (⚙ wears the lock itself)', [['desktops', 'usage', 'vault'], true], false],
  ['nothing folded, the vault locked ⇒ nothing to mark', [[], true], false],
];
const loudFailures = (M, sweep = true) => LOUD.filter(([, [f, locked], want]) => tryv(() => M.navMoreLoud(f, { vaultLocked: locked })) !== want).map(([name]) => name).concat(sweep ? barSweep(M).loud : []);
{
  const l = loudFailures(TC);
  for (const [name] of LOUD) ok(!l.includes(name), `the ⋯ and the lock: ${name}`);
  ok(!l.some((x) => / @\d+: |^threw/.test(x)), 'over every bar of the sweep (16 px steps), the vault locked: the ⋯ wears the lock exactly when ⚙ is folded — some door on the bar always says it; open: never', l.slice(0, 3));
}
const ONE = [[{ urgent: 1, high: 2, loud: 11, total: 31, notices: 37 }, { seg: 'urgent', count: 31 }], [{ high: 2, loud: 10, total: 30, notices: 37 }, { seg: 'high', count: 30 }],
  [{ loud: 8, total: 28 }, { seg: 'norm', count: 28 }], [{ total: 20, notices: 37 }, { seg: 'quiet', count: 20 }], [{ notices: 37 }, { seg: 'notice', count: 37 }], [{}, null]];
const oneFailures = safe((M) => ONE.filter(([i, want]) => J(M.navOneBadge(i)) !== J(want)).map(([i, want]) => `${J(i)} → want ${J(want)}, got ${J(M.navOneBadge(i))}`));
ok(oneFailures(TC).length === 0, 'the ONE badge: the honest count in the worst urgency\'s colour (31 urgent · 30 high · 28 · 20 quiet), the notices\' grey count alone, nothing when nothing', oneFailures(TC));

console.log('§4 NEGATIVE CONTROLS on patched copies (outside the tree)');
{
  const src = read('src/lib/title-chips.js');
  const mutant = async (tag, edits) => {
    let s = src;
    for (const [from, to] of edits) { if (s.split(from).length !== 2) { ok(false, `control «${tag}» patches one spelled line`, from); return null; } s = s.replace(from, to); }
    return import(MUT.write('src/lib/title-chips.js', s, tag));
  };
  const named = (fails, ...names) => names.filter((n) => fails.some((f) => f.startsWith(n)));
  const at = (frag) => TABLE.find((t) => t[0].includes(frag))[0]; // a table row by a fragment of its name
  const cases = [
    // the r1 lane's five
    ['fixed-bar', 'the base\'s fixed layout (nothing yields)', [['  if (!room) return verdict();\n', '  return verdict(); // CONTROL: the base\'s fixed bar — nothing yields\n']], (M) => {
      const t = tableFailures(M), s = sweepFailures(M, ['the owner']);
      return { red: named(t, at('12-character zh title')).length > 0 && s.some((f) => /the title CUT .* while a chip still has a smaller form/.test(f)), say: `the owner's row RED, the title cut with chips standing (${t.length} rows, ${s.length} sweep breaks)`, ex: t.slice(0, 2) };
    }],
    ['out-of-order', 'a chip folding out of order (⚙ before the desktops door)', [["export const NAV_FOLD_ORDER = Object.freeze(['desktops', 'usage', 'todos', 'vault', 'gear']);", "export const NAV_FOLD_ORDER = Object.freeze(['gear', 'usage', 'todos', 'vault', 'desktops']); // CONTROL: ⚙ first"]], (M) => {
      const t = tableFailures(M); return { red: named(t, at('…at 360 px ⇒ desktops + ring fold')).length > 0, say: `RED by name (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['more-missing', 'a folded chip missing from the ⋯', [["  return NAV_FOLD_ORDER.filter((key) => f.has(key) && key !== 'todos')", "  return NAV_FOLD_ORDER.filter((key) => f.has(key) && key !== 'todos' && key !== 'gear') // CONTROL: ⚙ never listed\n"]], (M) => {
      const m = moreFailures(M); return { red: m.some((f) => /but the ⋯ lists/.test(f)), say: `RED (${m.length} bars)`, ex: m.slice(0, 2) };
    }],
    ['tray-folds', 'the For-you chip folding away (its badge with it)', [["export const NAV_NEVER_FOLD = Object.freeze(['menu', 'todos', 'close', 'new']);", "export const NAV_NEVER_FOLD = Object.freeze(['menu', 'close', 'new']); // CONTROL: the For-you chip may fold"]], (M) => {
      const d = TABLE.map(([name, [r, tw, tm], o]) => [name, fold(r, tw, tm, o, M).folded]).filter(([, f]) => DOORS.some((k) => f.includes(k)));
      return { red: d.length > 0 && named(tableFailures(M), at('a 200 px bar')).length > 0, say: `a door folded in ${d.length} table rows, the 200 px row RED`, ex: d.slice(0, 2) };
    }],
    ['badge-lost', 'the one-badge form losing its number', [['  if (n(total)) return { seg:', '  if (n(total)) return null; // CONTROL: the one badge lost\n  if (n(total)) return { seg:']], (M) => {
      const o = oneFailures(M); return { red: o.length >= 4, say: `RED (${o.length} rows)`, ex: o };
    }],
    // the r1 acceptance's behaviour mutants (accept-r1-verdict.json claims[0], M1–M8)
    ['M1-no-give-back', 'M1 — no give-back (a ⋯ may hold ONE chip no wider than itself)', [['  if (folded.size === 1) {\n', '  if (false) { // CONTROL M1: no give-back\n']], (M) => {
      const t = tableFailures(M); return { red: named(t, at('the ring hidden: ONE ⋯'), at('FOUR foldable chips')).length === 2, say: `the ring-hidden and the count rows RED (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M2-count-off-by-one', 'M2 — the count off by one (two foldable chips inline)', [['    if (list.filter((it) => foldable(it.key) && !folded.has(it.key)).length <= cap) break;', '    if (list.filter((it) => foldable(it.key) && !folded.has(it.key)).length < cap) break; // CONTROL M2']], (M) => {
      const t = tableFailures(M); return { red: named(t, at('FOUR foldable chips'), at('fixture c6')).length === 2, say: `the count rows RED (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M3-no-one-badge', 'M3 — no one-badge step (the five badges never collapse)', [['      if (i < it.forms.length) { if (it.forms[i] < it.forms[at.get(k)]) at.set(k, i); }', '      if (i < it.forms.length) { /* CONTROL M3: no smaller form */ }']], (M) => {
      const t = tableFailures(M); return { red: named(t, at('12-character zh title'), at('…at 360 px ⇒ desktops + ring fold')).length === 2, say: `the owner's and the 2-character rows RED (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M4-r1-count-keeps-one', 'M4 — the give-back for a width fold only (r1: a COUNT fold kept ONE chip in the ⋯)', [['  if (folded.size === 1) {\n', '  if (folded.size === 1 && list.filter((it) => foldable(it.key)).length <= cap) { // CONTROL M4 (= r1)\n']], (M) => {
      const t = tableFailures(M); return { red: named(t, at('FOUR foldable chips'), at('fixture c6')).length === 2 && !named(t, at('the ring hidden: ONE ⋯')).length, say: `the count rows RED, the width give-back still green (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M5-until-minimum', 'M5 — fold only until the MINIMUM reads (not the whole title)', [['  const fits = () => room - used() - NAV_SLACK_PX >= tw;', '  const fits = () => room - used() - NAV_SLACK_PX >= least; // CONTROL M5']], (M) => {
      const t = tableFailures(M); return { red: named(t, at('folds after the badges, before ⚙')).length > 0, say: `RED by name (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M6-one-fold-too-many', 'M6 — one fold too many (the next chip in the order folds past the fit)', [['  // ONE ⋯ for ONE chip, whatever folded it', "  { const nx = NAV_FOLD_ORDER.find((k) => foldable(k) && at.has(k) && !folded.has(k)); if (nx && folded.size) folded.add(nx); } // CONTROL M6\n  // ONE ⋯ for ONE chip, whatever folded it"]], (M) => {
      const t = tableFailures(M); return { red: named(t, at('…at 360 px ⇒ desktops + ring fold'), at('one word')).length === 2, say: `the 2-character and one-word rows RED (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M7-free-more', 'M7 — the ⋯ costs nothing', [['    if (folded.size) { s += more; n++; }', '    if (folded.size) { n++; } // CONTROL M7']], (M) => {
      const t = tableFailures(M); return { red: named(t, at('12-character zh title')).length > 0, say: `the owner's 140 px row RED (${t.length} rows)`, ex: t.slice(0, 2) };
    }],
    ['M8-eight-units', 'M8 — a minimum of 8 units (4 CJK / 8 Latin)', [['export const NAV_TITLE_MIN_UNITS = 12;', 'export const NAV_TITLE_MIN_UNITS = 8; // CONTROL M8']], (M) => {
      const m = minFailures(M); return { red: m.some((f) => f.startsWith('«游戏关卡与数值平衡讨论稿»')) && m.some((f) => f.startsWith('«Quarterly planning')), say: `the owner's and the Latin minimum RED (${m.length} rows)`, ex: m.slice(0, 2) };
    }],
    // r2's major: the r1 half-pixel slack in the title's favour
    ['r1-slack', 'the r1 slack (a title up to 0.5 px WIDER than its room counted as fitting, a minimum 0.5 px short as readable)', [
      ['fits: titleRoom - NAV_SLACK_PX >= tw, readable: titleRoom - NAV_SLACK_PX >= least };', 'fits: titleRoom + 0.5 >= tw, readable: titleRoom + 0.5 >= least }; // CONTROL: the r1 slack'],
      ['  const fits = () => room - used() - NAV_SLACK_PX >= tw;', '  const fits = () => room - used() + 0.5 >= tw; // CONTROL: the r1 slack']], (M) => {
      const t = tableFailures(M), s = sweepFailures(M, ['the measured bar, «NotesDtekEH»']);
      const want = [at('«NotesDtekEH»'), at('«NotescvHJ.vu»'), at('the minimum 0.3 px wider')];
      return { red: named(t, ...want).length === 3 && s.some((f) => /the title CUT/.test(f)) && s.some((f) => /fits claimed for a title/.test(f)), say: `the two acceptance titles + the readable band RED by name, the 0.01 px sweep sees the cut (${t.length} rows, ${s.length} sweep breaks)`, ex: t.slice(0, 3).concat(s.slice(0, 2)) };
    }],
    // r3 — the r2 acceptance's confirmed minors, each a copy carrying r2's behaviour
    ['F1-quiet-more', 'F1 — a quiet ⋯ on a locked vault (= r2: once ⚙ folded nothing on the bar said the lock)', [["  return !!vaultLocked && Array.isArray(folded) && folded.includes('gear');", "  return false; // CONTROL F1: the ⋯ never wears the lock"]], (M) => {
      const l = loudFailures(M, false); return { red: l.includes(LOUD[0][0]) && !l.includes(LOUD[1][0]), say: `the locked row RED by name, the open one green (${l.length})`, ex: l.slice(0, 2) };
    }],
    ['F1-loud-while-gear-stands', 'F1 — the ⋯ wearing the lock while ⚙ stands (it holds no ⚙; ⚙ says it)', [["  return !!vaultLocked && Array.isArray(folded) && folded.includes('gear');", "  return !!vaultLocked && Array.isArray(folded) && folded.includes('vault'); // CONTROL"]], (M) => {
      const l = loudFailures(M, false); return { red: l.includes(LOUD[2][0]) && !l.includes(LOUD[0][0]), say: `the ⚙-standing row RED by name, the folded-⚙ row green (${l.length})`, ex: l.slice(0, 2) };
    }],
    ['F1-plain-gear-row', 'F1 — ⚙\'s ⋯ row plain on a locked vault (= r2: the cog without its lock)', [["loud: key === 'gear' && !!vaultLocked }));", "loud: false })); // CONTROL F1"]], (M) => {
      const w = wordFailures(M); return { red: w.some((f) => f.startsWith(WORDS[8][0])) && !w.some((f) => f.startsWith(WORDS[0][0])), say: `the locked four-row row RED by name, the words still green (${w.length})`, ex: w.slice(0, 2) };
    }],
    ['F3-r2-bare-badge', 'F3 — r2\'s desktops row: the chip\'s bare badge (the PLACE, read as a count)', [["  const place = k >= 1 && n >= k ? `${k}/${n}${name ? ` · ${name}` : ''}` : '';", "  const place = typeof desktops === 'string' ? oneLine(desktops) : k >= 1 ? String(k) : ''; // CONTROL F3: r2's bare badge"]], (M) => {
      const w = wordFailures(M); return { red: [0, 1, 2, 5].every((i) => w.some((f) => f.startsWith(WORDS[i][0]))), say: `the three-desktop, one-desktop and bare-badge rows RED by name (${w.length})`, ex: w.slice(0, 2) };
    }],
  ];
  for (const [tag, what, edits, judgeIt] of cases) {
    const M = await mutant(tag, edits);
    if (!M) continue;
    const j = judgeIt(M);
    ok(j.red, `CONTROL — ${what}: ${j.say}`, j.ex);
  }
}

console.log('§5 the wiring');
{
  const tc = read('src/lib/title-chips.js');
  ok(!/^\s*import\b/m.test(tc), 'title-chips.js still imports nothing (test-title-chips pins it): the count is spelled here');
  const rf = path.join(repo, 'src/lib/row-fold-model.js');
  if (fs.existsSync(rf)) { const m = /export const ROW_INLINE_MAX = (\d+);/.exec(fs.readFileSync(rf, 'utf8')); ok(m && Number(m[1]) === TC.NAV_INLINE_MAX, `the bar's count IS the phone row's: NAV_INLINE_MAX ${TC.NAV_INLINE_MAX} = row-fold-model.js ROW_INLINE_MAX ${m && m[1]} (one rule for phone rows)`); }
  else console.log('    (src/lib/row-fold-model.js is not on this tree — lane phone-roster-fold\'s twin: the literal 3 above holds the rule; the train runs this suite on the merged tree, where ROW_INLINE_MAX is pinned equal)');
  const mn = read('src/lib/mobile-nav.js');
  ok(/import \{ navBarFold, navTitleMinText, navMoreRows, navMoreLoud \} from '\.\/title-chips\.js';/.test(mn) && /import \{ FOLDED \} from '\.\/bar-fold\.js';/.test(mn), 'mobile-nav.js reads the PURE fold + the shared FOLDED class');
  ok(/const ctl = this\._barCtl = new AbortController\(\);/.test(mn) && /window\.addEventListener\('vs-viewport-class', fit, \{ signal: ctl\.signal \}\);/.test(mn) && /ctl\.signal\.addEventListener\('abort', \(\) => \{ this\._barMo\.disconnect\(\); wrapMo\.disconnect\(\); ro\?\.disconnect\(\);/.test(mn)
    && /more\.addEventListener\('click', [^\n]*\{ signal: ctl\.signal \}\);/.test(mn), 'the bar\'s watchers (the tier signal, the ⋯\'s press, the subtree + width observers, r4: what stands above it) live on the controller the bar owns');
  ok(/this\._barMo\.observe\(nav, \{ subtree: true, childList: true, characterData: true \}\);/.test(mn) && /this\._barMo\?\.takeRecords\(\); \/\/ the pass's own writes/.test(mn) && /\n    this\._scheduleFit\?\.\(\);\n  \}\n/.test(mn),
    're-decided on a chip\'s change (the subtree — never the pass\'s own writes) and on the title\'s (updateTitle)');
  ok(/if \(this\.app\.isMobile && this\.app\.viewportClass\?\.\(\) === 'compact' && nav\.getClientRects\(\)\.length\) \{/.test(mn) && /for \(const el of kids\) el\.classList\.remove\(FOLDED\);\n    if \(todos\?\.dataset\.badges\) delete todos\.dataset\.badges;\n    more\.classList\.remove\('on'\);/.test(mn),
    'the fold is the compact class\'s alone: every pass starts unfolded — the regular class and the desktop keep the base\'s bar');
  ok(/more\.addEventListener\('click', \(e\) => \{ e\.stopPropagation\(\); if \(this\._moreMenu\?\.isConnected\) \{ this\._moreMenu\.remove\(\); return; \} this\._openMore\(\); \}/.test(mn) && /menu\._closeExclude\?\.push\(this\.moreBtn\);/.test(mn) && !/more\.addEventListener\('pointerdown'/.test(mn),
    'the ⋯ is its menu\'s anchor: exempt from the menu\'s outside-press closer, so its second press — a finger\'s or a mouse\'s — closes the menu (r2)');
  ok(/run: \(\) => app\._pressGlobalSettings\(el\) \}/.test(mn) && /run: \(\) => openDesktopSheet\(app, el, \{/.test(mn) && !/_pressGlobalSettings\(more\)|openDesktopSheet\(app, more,/.test(mn),
    'a ⋯ row\'s door is anchored at its OWN chip — Settings keyed to ⚙, never to the ⋯ (a later ⋯ press closes it; 设置 again opens it) (r2)');
  ok(/const icon = row\?\.querySelector\('\.mnav-more-icon'\), label = row\?\.querySelector\('\.mnav-more-label'\), val = row\?\.querySelector\('\.mnav-more-value'\), g = r\.glyph\(\);\n      if \(!icon \|\| !label \|\| !val\) continue;\n      if \(icon\._glyph !== g\) \{ icon\.innerHTML = g; icon\._glyph = g; \}/.test(mn) && /if \(val\.textContent !== r\.value\) val\.textContent = r\.value;/.test(mn)
    && /menu\._paintMo = new MutationObserver\(\(\) => this\._paintMore\(\)\);/.test(mn) && /for \(const r of rows\) menu\._paintMo\.observe\(r\.el, \{ subtree: true, childList: true, characterData: true, attributes: true \}\);/.test(mn)
    && /if \(key === 'usage'\) return \{ el, glyph: \(\) => el\.innerHTML,/.test(mn), 'a ⋯ row repaints its glyph AND its value from the chip at every change (the ring\'s arc with its %) (r2)');
  ok(/row\(FILE_ICONS\.folder, t\('Files'\), \(\) => this\._pressFiles\(\)/.test(mn) && /this\._pressFiles = installNavFilesDoor\(app\);/.test(mn) && !/app\.openFileExplorer\(\)\),/.test(mn), 'LAW 3: the «+» sheet\'s 文件 row is the nav door\'s press (moved, not copied — the explorer this phone showed last)');
  const pf = read('src/lib/phone-files.js');
  ok(/const press = \(\) => \{ dayOneUsed\(DOOR\); paint\(\); return openFilesDoor\(app\); \};\n  if \(btn\) btn\.onclick = press;\n  paint\(\);\n  return press;/.test(pf), 'phone-files.js: ONE press — the regular bar\'s button and the «+» row run it');
  const ut = read('src/lib/user-todos-panel.js');
  ok(/const one = navOneBadge\(\{ urgent: cu, high: ch, loud: n, total, notices \}\);\n      mBtn\.innerHTML = UI_ICONS\.inbox \+ segs \+ \(one \? `<span class="mnav-one" data-seg="\$\{one\.seg\}">\$\{one\.count\}<\/span>` : ''\);/.test(ut),
    'the For-you chip carries its ONE-badge form beside the five — a .mnav-one, never a .ut-count (the badge\'s readers count those)');
  const css = read('public/style.css');
  ok(css.includes('html[data-vc="compact"] #mobile-nav-files { display: none; }') && css.includes('html[data-vc="compact"] #mobile-nav > .bar-folded { display: none !important; }')
    && /html\[data-vc="compact"\] #mobile-nav > :is\(#mobile-nav-menu, [^)]*#mobile-nav-overflow\) \{ min-width: 44px; min-height: 44px; \}/.test(css) && css.includes('html[data-vc="compact"] #mobile-nav-todos[data-badges="one"] .ut-count { display: none; }')
    && css.includes('.mobile-sheet.mnav-more-menu .context-menu-item { min-height: 44px; font-size: 16px;'), 'style.css: the compact bar — no folder icon, 44 px targets, a folded chip leaves the row, the one-badge form, the ⋯ rows 44 px / 16 px');
  // NO RULE RE-SHOWS THE COMPACT BAR'S FOLDER ICON (the r1 acceptance's gap M6b): a rule that names #mobile-nav-files itself and sets a
  // display other than none is the regular class's, or plain (lower than the compact rule), never !important
  const CHUNKS = css.split('}'); // ONE split of the 850 KB sheet (each costs ~2 ms): the rules below read its chunks
  const reshows = (sheet) => (sheet === css ? CHUNKS : sheet.split('}')).filter((c) => c.includes('#mobile-nav-files')).flatMap((c) => {
    const parts = c.split('{'), body = parts.pop() || '', sel = parts.pop() || ''; // a rule's selector and body (a @media head before them)
    const m = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body);
    if (!m || /^none\b/.test(m[1].trim())) return [];
    return sel.split(',').map((x) => x.trim()).filter((x) => /#mobile-nav-files$/.test(x) && (/!important/.test(m[1]) || (/\[data-vc|#mobile-nav\b[^-]|html|body/.test(x) && !/\[data-vc="regular"\]/.test(x))));
  });
  ok(reshows(css).length === 0 && reshows('\nhtml body #mobile-nav-files { display: inline-flex; }\n').length === 1 && reshows('@media (max-width: 768px) {\n  #mobile-nav-files { display: flex !important; }\n}').length === 1,
    `style.css: no rule re-shows the compact bar's folder icon (only the regular class's or a plain lower rule) — CONTROL: a later «html body #mobile-nav-files» / an !important one is caught (${reshows(css).join(', ') || 'none'})`);
  const cssLines = css.split('\n');
  const laneLines = cssLines.filter((l) => /mnav-|vault-gear-mark|#mobile-nav-overflow|phone-sheet-top/.test(l)); // ONE pass over the sheet's lines
  const lane = laneLines.filter((l) => /mnav-one|mnav-more|mnav-sheet|#mobile-nav-overflow/.test(l));
  const laneCss = laneLines.join('\n'); // the r4 CSS pins judge these lines
  ok(/--red-fg: #ffffff; --yellow-fg: #000000;/.test(css) && css.includes('.mnav-one[data-seg="urgent"] { background: var(--red); color: var(--red-fg); }') && css.includes('.mnav-one[data-seg="high"] { background: var(--yellow); color: var(--yellow-fg); }')
    && lane.every((l) => !/:\s*#[0-9a-fA-F]{3,8}\b|,\s*#[0-9a-fA-F]{3,8}\s*\)/.test(l)), `the one badge and the ⋯ in THEME colours only — words on --red / --yellow are --red-fg / --yellow-fg (defined with the palette); no colour literal in the bar's rules (${lane.length} lines) (r2)`);
  // r3 — each pin a predicate over the source, judged on the tree AND on the tree with r2's line put back (its CONTROL, RED)
  const put = (src, from, to) => { const i = src.indexOf(from); return i < 0 || src.indexOf(from, i + 1) >= 0 ? null : src.slice(0, i) + to + src.slice(i + from.length); };
  const pinOn = (subject, name, holds, back, who) => ok(holds(subject) && back !== null && !holds(back), `${name} — CONTROL: ${who}'s line put back is RED${back === null ? ` (the CONTROL could not put ${who}'s line back)` : ''}`);
  const pin = (name, holds, r2) => pinOn(mn, name, holds, r2, 'r2');
  const fitOf = (src) => { const a = src.indexOf('  _fitBar() {'); return a < 0 ? '' : src.slice(a, src.indexOf('\n  }\n', a)); };
  const gearWhole = (src) => /if \(key === 'gear'\) return \{ el, glyph: \(\) => el\.innerHTML, label: t\('Settings'\), run: \(\) => app\._pressGlobalSettings\(el\) \};/.test(src)
    && /row\.classList\.toggle\('vault-locked', r\.loud\);/.test(src) && /vaultLocked: !!document\.getElementById\('mobile-nav-gear'\)\?\.classList\.contains\('vault-locked'\) \};\n    return navMoreRows\(this\._folded, facts\)/.test(src);
  pin('F1: ⚙\'s ⋯ row draws the WHOLE chip — the cog and, while the vault is locked, its lock mark — and wears its colour (navMoreRows `loud`)', gearWhole,
    put(mn, "if (key === 'gear') return { el, glyph: () => el.innerHTML,", "if (key === 'gear') return { el, glyph: svg,"));
  const moreMark = (src) => { const f = fitOf(src), a = f.indexOf('const loud = navMoreLoud(folded, { vaultLocked: !!document.getElementById(\'mobile-nav-gear\')?.classList.contains(\'vault-locked\') });'), b = f.indexOf('this._barMo?.takeRecords();');
    return a > 0 && b > a && /more\.classList\.toggle\('vault-locked', loud\);/.test(f) && /m\.className = 'vault-gear-mark'; m\.setAttribute\('aria-hidden', 'true'\); m\.innerHTML = UI_ICONS\.lock \|\| '';/.test(f) && /more\.title = loud \? t\('More — Vault locked'\) : t\('More'\);/.test(f); };
  { const f = fitOf(mn), a = f.indexOf('    const loud = navMoreLoud('), b = f.indexOf('    this._barMo?.takeRecords();');
    pin('F1: the fit puts ⚙\'s lock on the ⋯ (PURE navMoreLoud over the fold and ⚙\'s own lock class: drawGearMark\'s mark, the red, «More — Vault locked») before it drops its own records — an unlock\'s broadcast takes it off', moreMark, a > 0 && b > a ? mn.replace(f, f.slice(0, a) + f.slice(b)) : null); }
  const deskWords = (src) => /b\._door = \{ k: s\.k, n: s\.n, name: s\.name, waiting, waitingWords: waiting \? t\('\{n\} waiting for input', \{ n: waiting \}\) : '' \};/.test(src) && /const facts = \{ desktops: this\.desktopsBtn\?\._door \|\| null,/.test(src);
  pin('F3: the desktops row\'s words come from the chip\'s own state (updateDesktopsDoor: the place, the total, the name — what its label says)', deskWords,
    put(mn, 'const facts = { desktops: this.desktopsBtn?._door || null,', "const facts = { desktops: document.querySelector('#mobile-nav-desktops .mnav-badge:not(.hidden)')?.textContent || '',"));
  const patched = (src) => { const f = fitOf(src); return f.includes('if (this._moreMenu?.isConnected) this._syncMore();') && !/this\._openMore\(\)/.test(f)
    && /for \(const el of menu\.querySelectorAll\(':scope > \.context-menu-item'\)\) if \(!keys\.has\(el\.dataset\.key\)\) el\.remove\(\);/.test(src) && /let el = menu\.querySelector\(`:scope > \.context-menu-item\[data-key="\$\{r\.key\}"\]`\);/.test(src)
    && /if \(menu\.children\[i\] !== el\) menu\.insertBefore\(el, menu\.children\[i\] \|\| null\);/.test(src) && /const menu = this\._sheet\(\[\]\);/.test(src); };
  pin('F2: an open ⋯ is PATCHED by key on a fold change (a row that stays keeps its element and listener; gone rows leave first, new ones go in place) — never re-opened by the fit', patched,
    put(mn, 'if (this._moreMenu?.isConnected) this._syncMore();', 'if (this._moreMenu?.isConnected && folded.join() !== was) { if (folded.length) this._openMore(); else this._moreMenu.remove(); }'));
  // r4 — the r3 acceptance's G1–G4: each pin judged on the tree AND with r3's line put back (its CONTROL, RED)
  const pin3 = (name, holds, r3) => pinOn(mn, name, holds, r3, 'r3');
  // G1 — the hint NAMES the folder (PURE files-door.js doorName: the explorer's last breadcrumb, «host: » before it when remote) —
  // never r3's window title (a path front-cut to 40 whose END the line then cut: «Back to …e/userW/workspace/AIWorkspace/vib…»)
  const FD = tryv(() => createRequire(import.meta.url)(path.join(repo, 'src/files-door.js')));
  const NAMES = [['/home/userW/workspace/AIWorkspace/vibespace', { home: '/home/userW' }, 'vibespace'], ['/home/userW', { home: '/home/userW' }, '~'], ['/home/userW/', { home: '/home/userW' }, '~'],
    ['/', {}, '/'], ['/srv/data/reports', { host: 'devbox' }, 'devbox: reports'], ['/home/userW/文档/项目资料/二〇二五年度总结', { home: '/home/userW' }, '二〇二五年度总结'], ['', {}, ''],
    ['/tmp/scratch/a-folder-whose-name-alone-is-longer-than-any-phone-line-can-hold', {}, 'a-folder-whose-name-alone-is-longer-than-any-phone-line-can-hold']];
  const nameFailures = (rule) => NAMES.filter(([d, o, want]) => tryv(() => rule(d, o)) !== want).map(([d, o, want]) => `${d || '«»'} → want «${want}», got «${tryv(() => rule(d, o))}»`);
  ok(typeof FD?.doorName === 'function' && nameFailures(FD.doorName).length === 0, `G1: the 文件 row names the FOLDER (files-door.js doorName — the last breadcrumb: the 43-character path's «vibespace», «~» the home, «/» the root, «devbox: reports» on another machine), never a path (${NAMES.length} rows)`, typeof FD?.doorName === 'function' ? nameFailures(FD.doorName) : 'files-door.js exports no doorName');
  const r3Title = (d, { host = '' } = {}) => (host ? host + ': ' : '') + (d.length > 40 ? '…' + d.slice(-39) : d); // r3's hint = the window's title (file-explorer.js navigate + utils.js frontTruncate)
  ok(nameFailures(r3Title).length >= 5, `G1 CONTROL — r3's hint (the explorer's window title, a front-cut path) names no folder: RED on ${nameFailures(r3Title).length} of ${NAMES.length} rows`, nameFailures(r3Title).slice(0, 2));
  const hintNamed = (src) => /const named = \(\{ name, dir \}\) => \{\n      const \[pre, post = ''\] = t\('Back to \{name\}'\)\.split\('\{name\}'\);\n      const d = name && dir === 'rtl' \? 'rtl' : 'ltr';/.test(src)
    && /<span class="mnav-sheet-name" data-dir="\$\{d\}"><bdi dir="\$\{d\}">\$\{escHtml\(name \|\| t\('Files'\)\)\}<\/bdi><\/span>/.test(src) && /row\(FILE_ICONS\.folder, t\('Files'\), \(\) => this\._pressFiles\(\), back \? named\(filesDoorName\(app, back\)\) : ''\),/.test(src);
  pin3('G1: the «+» sheet\'s 文件 row says «Back to <the folder>» — the sentence\'s own words in their spans (never cut: ja keeps «に戻る»), the name in its own span (cut at its START by style.css)', hintNamed,
    put(mn, "row(FILE_ICONS.folder, t('Files'), () => this._pressFiles(), back ? named(filesDoorName(app, back)) : ''),", "row(FILE_ICONS.folder, t('Files'), () => this._pressFiles(), back ? t('Back to {name}', { name: back.title || t('Files') }) : ''),"));
  // r5 K3 — the START in READING order, whichever way the name runs (the r4 acceptance: a 63-character Arabic name at 320 ja lost
  // its END — r4's rtl box cut an LTR name's start only): PURE doorNameDir — the FOLDER's first strong letter, as <bdi> resolves a
  // name (digits and marks weak), never the «host: »'s — on the <bdi>, the box the other way; the part read LAST stays, as the
  // explorer's own title keeps a path's end (frontTruncate)
  const DIRS = [['/home/userW/workspace/AIWorkspace/vibespace', { home: '/home/userW' }, 'ltr'], ['/home/userW/文档/项目', { home: '/home/userW' }, 'ltr'],
    ['/srv/\u05EA\u05D9\u05E7\u05D9\u05D9\u05D4', {}, 'rtl'], ['/srv/\u0645\u062C\u0644\u062F', {}, 'rtl'], ['/srv/\u0662\u0660\u0662\u0665 notes', {}, 'ltr'], ['/srv/2025 \u05D3\u05D5\u05D7', {}, 'rtl'],
    ['/srv/\u05B4\u05D3\u05D5\u05D7', {}, 'rtl'], ['/srv/\u05D3\u05D5\u05D7', { host: 'devbox' }, 'rtl'], ['/srv/reports', { host: '\u05E9\u05E8\u05EA' }, 'ltr'], ['/home/userW', { home: '/home/userW' }, 'ltr'], ['/', {}, 'ltr'], ['', {}, 'ltr']];
  const dirFailures = (rule) => DIRS.filter(([d, o, want]) => tryv(() => rule(d, o)) !== want).map(([d, o, want]) => `${d || '«»'}${o.host ? ` on ${o.host}` : ''} → want ${want}, got ${tryv(() => rule(d, o))}`);
  ok(typeof FD?.doorNameDir === 'function' && dirFailures(FD.doorNameDir).length === 0, `K3: the direction the FOLDER's name is read in (files-door.js doorNameDir — its first strong letter: Hebrew / Arabic rtl, Latin / CJK ltr, digits and points skipped, a remote folder by its OWN letters, never the host's) (${DIRS.length} rows) — CONTROL: r4's one rtl box for every name (every name «ltr») RED on ${dirFailures(() => 'ltr').length}`,
    typeof FD?.doorNameDir === 'function' ? dirFailures(FD.doorNameDir) : 'files-door.js exports no doorNameDir');
  ok(dirFailures(() => 'ltr').length >= 4, `K3 CONTROL — r4's box (an rtl box over EVERY name: a Hebrew / Arabic one cut at its END) is RED by name: ${dirFailures(() => 'ltr').slice(0, 2).join(' · ')}`);
  pinOn(mn, 'K3: the hint\'s name carries its direction — data-dir on its box, dir on its <bdi> (filesDoorName → doorNameDir) — so style.css runs the box AGAINST it', (src) => /<span class="mnav-sheet-name" data-dir="\$\{d\}"><bdi dir="\$\{d\}">/.test(src),
    put(mn, '<span class="mnav-sheet-name" data-dir="${d}"><bdi dir="${d}">${escHtml(name || t(\'Files\'))}</bdi></span>', '<span class="mnav-sheet-name"><bdi>${escHtml(name || t(\'Files\'))}</bdi></span>'), 'r4');
  pinOn(laneCss, 'K3: style.css — a Hebrew / Arabic name\'s box runs ltr (its overflow, and «…», where the name BEGINS: the part read last stays)', (c) => c.includes('.mobile-sheet .mnav-sheet-name[data-dir="rtl"] { direction: ltr; }'),
    put(laneCss, '.mobile-sheet .mnav-sheet-name[data-dir="rtl"] { direction: ltr; }', ''), 'r4');
  pinOn(laneCss, 'G1: style.css cuts a name too long for the line at its START («…» — its end, the part a person knows, stays: an rtl box over the isolated name); the sentence\'s words never shrink',
    (c) => c.includes('.mobile-sheet .mnav-sheet-said { flex: none; white-space: pre; }') && c.includes('.mobile-sheet .mnav-sheet-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }'),
    put(laneCss, '.mobile-sheet .mnav-sheet-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }', '.mobile-sheet .mnav-sheet-name { overflow: hidden; text-overflow: ellipsis; }'), 'r3');
  // WHICH explorer: the one shown LAST (the highest z — a show raises it), this desktop's before another's; on another desktop, minimized,
  // a tab group's guest, another machine's — still named (the press reveals it); none ⇒ null. Judged by RUNNING phone-files.js's own text
  const runFdw = (src) => tryv(() => {
    const a = src.indexOf('export function filesDoorWindow(app) {'); if (a < 0) return null;
    let d = 0, i = src.indexOf('{', a); const b0 = i; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
    const helpers = [/const explorersHere = [^\n]+;/, /const z = [^\n]+;/].map((re) => (re.exec(src) || [''])[0]).join('\n');
    return new Function('app', `${helpers}\n${src.slice(b0 + 1, i)}`);
  });
  const xw = (id, z, o = {}) => [id, { id, type: 'files', _explorer: { currentPath: '/p/' + id, _host: o.host || '' }, _hiddenByDesktop: !!o.away, isMinimized: !!o.min, element: { style: { zIndex: String(z) } } }];
  const appOf = (...ws) => ({ wm: { windows: new Map([...ws, ['t1', { id: 't1', type: 'terminal', element: { style: { zIndex: '99' } } }]]) } });
  const WHICH = [['two explorers here ⇒ the LAST shown (the higher z)', appOf(xw('A', 10), xw('B', 12)), 'B'], ['the only explorer on ANOTHER desktop ⇒ still it', appOf(xw('A', 30, { away: true })), 'A'],
    ['one here + one on another desktop (higher z) ⇒ this desktop\'s', appOf(xw('A', 5), xw('B', 20, { away: true })), 'A'], ['minimized ⇒ still it', appOf(xw('A', 7, { min: true })), 'A'],
    ['another machine\'s ⇒ still it («host: » named)', appOf(xw('A', 7, { host: 'devbox' })), 'A'], ['none ⇒ null (the press opens one at home)', appOf(), null]];
  const whichFailures = (src) => { const f = runFdw(src); return typeof f !== 'function' ? [`no runnable filesDoorWindow (${f})`] : WHICH.filter(([, app, want]) => (tryv(() => f(app))?.id ?? null) !== want).map(([what, app, want]) => `${what}: want ${want}, got ${tryv(() => f(app))?.id ?? null}`); };
  const pf3 = put(pf, pf.slice(pf.indexOf('export function filesDoorWindow(app) {'), pf.indexOf('\n}\n', pf.indexOf('export function filesDoorWindow(app) {')) + 2), 'export function filesDoorWindow(app) { return explorersHere(app).sort((a, b) => z(b) - z(a))[0] || null; }');
  ok(whichFailures(pf).length === 0 && pf3 !== null && whichFailures(pf3).length >= 2, `G1: WHICH explorer the row names and the press brings — phone-files.js filesDoorWindow RUN over ${WHICH.length} rooms (the last shown; this desktop's first; another desktop / minimized / another machine still named) — CONTROL: r3's (this desktop's local explorers only) RED on ${pf3 === null ? '?' : whichFailures(pf3).length}`, [...whichFailures(pf), ...(pf3 ? whichFailures(pf3) : [])].slice(0, 4));
  ok(/export function filesDoorName\(app, win\) \{/.test(pf) && /const path = ex\.currentPath \|\| win\._explorerPath \|\| '', at = \{ home: app\._localHome \|\| '', host \};\n  return \{ name: doorName\(path, at\), dir: doorNameDir\(path, at\) \};/.test(pf) && /const host = ex\._host \? \(ex\._hostSelect\?\.selectedOptions\?\.\[0\]\?\.textContent \|\| ex\._host\) : '';/.test(pf)
    && /const there = path \? explorersHere\(app\)\.find\(\(w\) => w\._explorer\.currentPath === path\) : filesDoorWindow\(app\);/.test(pf), 'G1: phone-files.js — the door and the row ask ONE function which explorer comes back, and ONE what it is called (the explorer\'s host words, as its title says them) and (r5) which way its folder\'s name reads');
  // G2 — ⚙'s lock mark drawn ONE way: its svg in the mark's OWN em (never the row's 16 px), on its glyph's corner (never a 44 px box's)
  pinOn(laneCss, 'G2: the lock mark\'s svg is sized in the mark\'s OWN em (13.333 px — the bar\'s 11 × 13.3 in the ⋯ menu\'s 16 px row too) and keeps the mark\'s shrink there', (c) => c.includes('.vault-gear-mark { font-size: 13.3333px; }') && c.includes('.mobile-sheet .context-menu-item .vault-gear-mark svg { flex-shrink: 1; }'),
    put(laneCss, '.vault-gear-mark { font-size: 13.3333px; }', ''), 'r3');
  pinOn(laneCss, 'G2: the mark sits on its GLYPH\'s corner (50% − 18 px from the chip\'s middle: where the base\'s 36 px ⚙ wore it) — on ⚙, on the ⋯, on the 设置 row alike', (c) => c.includes('html[data-vc="compact"] #mobile-nav > :is(#mobile-nav-gear, #mobile-nav-overflow).vault-locked > .vault-gear-mark,\n.mnav-more-menu .context-menu-item.vault-locked .mnav-more-icon > .vault-gear-mark { top: calc(50% - 18px); right: calc(50% - 18px); }'),
    put(laneCss, 'html[data-vc="compact"] #mobile-nav > :is(#mobile-nav-gear, #mobile-nav-overflow).vault-locked > .vault-gear-mark,\n.mnav-more-menu .context-menu-item.vault-locked .mnav-more-icon > .vault-gear-mark { top: calc(50% - 18px); right: calc(50% - 18px); }', ''), 'r3');
  pinOn(laneCss, 'G2: the ⋯ rows\' glyphs stand in ONE column (20 px — the widest glyph\'s, the ring and the cog; centred) — every label starts at one x', (c) => c.includes('.mnav-more-menu .mnav-more-icon { display: inline-flex; flex-shrink: 0; width: 20px; justify-content: center; }'),
    put(laneCss, '.mnav-more-menu .mnav-more-icon { display: inline-flex; flex-shrink: 0; width: 20px; justify-content: center; }', '.mnav-more-menu .mnav-more-icon { display: inline-flex; flex-shrink: 0; }'), 'r3');
  // G3 — a press holds the bar and what hangs under it until it ENDS, wherever it is lifted
  const hold = (src) => /\n    this\._installPressHold\(ctl\);\n/.test(src) && /document\.addEventListener\('pointerdown', \(e\) => \{\n      const r = e\.target\?\.closest\?\.\(`#mobile-nav, \$\{PHONE_SURFACES\}`\);/.test(src)
    && /document\.addEventListener\('pointerup', \(e\) => \{\n      if \(!this\._held\) return;\n      clearTimeout\(this\._heldT\);\n      if \(root\?\.isConnected && root\.contains\(e\.target\)\) this\._heldT = setTimeout\(end, 600\); else end\(\);/.test(src)
    && /r\.addEventListener\('click', \(\) => \{ clearTimeout\(this\._heldT\); this\._heldT = setTimeout\(end, 0\); \}, \{ capture: true, signal: press\.signal \}\);/.test(src)
    && /document\.addEventListener\('pointercancel', end, \{ capture: true, signal: ctl\.signal \}\);\n    window\.addEventListener\('blur', end, o\);\n    document\.addEventListener\('visibilitychange', end, o\);/.test(src)
    && /if \(this\._held && menu\.children\.length\) \{ this\._heldMissed = true; this\._paintMore\(\); return; \}/.test(src);
  pin3('G3: a press on the bar or a phone surface holds the folds, the ⋯\'s rows and every surface\'s place until it ENDS — its click, its lift anywhere (off the menu: at once), a cancel, the page\'s blur or hiding', hold,
    put(mn, "    document.addEventListener('pointerup', (e) => {\n      if (!this._held) return;", "    root?.addEventListener('pointerup', (e) => {\n      if (!this._held) return;"));
  pin3('G3: …and the ⋯ ITSELF is held — the fit waits for the press\'s end and runs ONCE then if anything changed meanwhile (another client\'s rename never slides ⚙ under a finger on ⋯)', (src) => /\n    if \(this\._held\) \{ this\._heldMissed = true; return; \} \/\/ a press is on the bar or under it/.test(fitOf(src)) && /if \(this\._heldMissed\) \{ this\._heldMissed = false; this\._fitBar\(\); \}/.test(src),
    put(mn, '\n    if (this._held) { this._heldMissed = true; return; } // a press is on the bar or under it', '\n    // a press is on the bar or under it'));
  // G4 — ONE place for every phone surface (r4), and r5 ONE ROOM (the r4 acceptance's K1: the tops followed the variable, the
  // max-heights still assumed 48 — under the lock strip a tall sheet ran ~102 px past the screen, its tail unreachable) and the bar's
  // own title switcher a surface too (K2: it placed itself once). THE CSS CENSUS IS DERIVED (r5 — r4's took the chunks carrying «left:
  // 8px !important; right: 8px !important;»: 5 of the acceptance's 8 planted mutants stayed green): EVERY rule whose SUBJECT (the
  // selector's last compound) names a phone surface and sets its top or max-height !important — what beats an opener's inline place
  // — takes BOTH from the variable: top var(--phone-sheet-top) (the switcher 4 px less: flush under the bar) and max-height the ROOM
  // (or min(…, the room)); the regular class's own rules ([data-vc="regular"]: its column) aside; every surface has such a rule
  const surfaceList = (src) => ((/const PHONE_SURFACES = '([^']+)';/.exec(src) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const surfaces = surfaceList(mn);
  // the bar's FLOATING elements (r5 K2): whatever mobile-nav.js builds position:fixed is a phone surface — named in PHONE_SURFACES
  const FLOATS = new Map(), floats = (src) => { if (!FLOATS.has(src)) FLOATS.set(src, [...src.matchAll(/\.className = '([\w-]+)';\n\s*\w+\.style\.cssText = 'position:fixed;/g)].map((m) => '.' + m[1])); return FLOATS.get(src); };
  const strays = (src) => floats(src).filter((c) => !surfaceList(src).includes(c));
  const ROOM = 'calc(calc(100dvh / var(--ui-scale, 1)) - var(--phone-sheet-top) - 12px)', R4_ROOM = 'calc(calc(100dvh / var(--ui-scale, 1)) - 60px)';
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const TOP_OK = /^(?:var\(--phone-sheet-top\)|calc\(var\(--phone-sheet-top\) - 4px\)) !important$/, ROOM_OK = new RegExp(`^(?:${esc(ROOM)}|min\\([^,()]+, ${esc(ROOM)}\\)) !important$`);
  const splitTop = (x, re) => { const out = []; let d = 0, a = 0; for (let i = 0; i < x.length; i++) { const c = x[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (!d && re.test(c)) { out.push(x.slice(a, i)); a = i + 1; } } out.push(x.slice(a)); return out.map((y) => y.trim()).filter(Boolean); };
  const subjectOf = (sel) => splitTop(sel, /[\s>+~]/).pop() || '';
  const decl = (body, prop) => { const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body); return m ? m[1].trim().replace(/\s+/g, ' ') : null; };
  const imp = (v) => !!v && /!\s*important$/.test(v);
  const placeRules = (sheet, names) => { // the rules whose selector names a surface class (comments stripped) — found by indexOf (a regex pass over the 850 KB sheet costs ~2 ms)
    const out = [], seen = new Set(), cls = new RegExp(`\\.(?:${names.map((c) => esc(c.slice(1))).join('|')})(?![-\\w])`);
    for (const c of names) for (let at = sheet.indexOf(c); at >= 0; at = sheet.indexOf(c, at + 1)) {
      const ob = sheet.indexOf('{', at), cb = sheet.indexOf('}', at);
      if (ob < 0 || (cb >= 0 && cb < ob) || seen.has(ob)) continue; // in a body, not a selector
      seen.add(ob);
      const sel = sheet.slice(Math.max(sheet.lastIndexOf('}', at), sheet.lastIndexOf('{', at)) + 1, ob).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[\s\S]*\*\//, ' ');
      const body = sheet.slice(ob + 1, sheet.indexOf('}', ob));
      for (const one of splitTop(sel, /,/)) if (cls.test(subjectOf(one))) out.push({ sel: one.replace(/\s+/g, ' '), body });
    }
    return out;
  };
  const placedBy = (rules, c) => rules.some(({ sel, body }) => !/\[data-vc="regular"\]/.test(sel) && new RegExp(`${esc(c)}(?![-\\w])`).test(subjectOf(sel)) && TOP_OK.test(decl(body, 'top') || '') && ROOM_OK.test(decl(body, 'max-height') || ''));
  const placeFailures = (rules, names) => {
    const out = [];
    for (const { sel, body } of rules) {
      if (/\[data-vc="regular"\]/.test(sel)) continue; // the regular class's column: its own rules
      const top = decl(body, 'top'), room = decl(body, 'max-height');
      if (imp(top) && !TOP_OK.test(top)) out.push(`${sel}: top «${top}» — not the variable`);
      if (imp(top) && !ROOM_OK.test(room || '')) out.push(`${sel}: a top without the room (max-height «${room || 'none'}»)`);
      if (!imp(top) && imp(room) && !ROOM_OK.test(room)) out.push(`${sel}: max-height «${room}» — not the room`);
    }
    for (const c of names) if (!placedBy(rules, c)) out.push(`${c}: no rule places it (top + room from the variable)`);
    return out;
  };
  const NAMES5 = [...new Set([...surfaces, ...floats(mn)])];
  const RULES = placeRules(css, NAMES5), mini = RULES.map((r) => `${r.sel} {${r.body}}`).join('\n'); // the controls re-judge THESE rules' text
  const judge = (sheet, names = NAMES5) => placeFailures(sheet === mini ? RULES : placeRules(sheet, names), names);
  ok(RULES.length >= 5 && judge(mini).length === 0 && surfaces.length >= 5 && strays(mn).length === 0 && /(^|\n):root \{ --phone-sheet-top: 48px; \}(\n|$)/.test(laneCss),
    `G4 + K1/K2: EVERY phone surface is placed AND given its room by ONE variable — the ${RULES.length} rules naming one as their subject (${RULES.filter((r) => imp(decl(r.body, 'top'))).map((r) => r.sel).join(' · ')}): top var(--phone-sheet-top), max-height the screen − it − 12 px, !important over any inline value; the bar's floating elements are all named (${floats(mn).join(' ') || 'none'}); the bar's press hold covers exactly these (${surfaces.join(' ')})`, { fails: judge(mini), strays: strays(mn) });
  const r4Css = mini.split(`max-height: ${ROOM} !important;`).join(`max-height: ${R4_ROOM};`).split(`max-height: min(420px, ${ROOM}) !important;`).join(`max-height: ${R4_ROOM};`);
  const k1 = judge(r4Css);
  ok(['.usage-popup', '.global-settings-popover', '.ut-mini-popover', '.context-menu.mobile-sheet'].every((x) => k1.some((f) => f.startsWith(`${x}: a top without the room`))), `K1 CONTROL — r4's max-heights (the screen − 60 px: a 48 px top's room) put back are RED by name: ${k1.map((f) => f.split(':')[0]).join(' · ')}`, k1);
  const r3Css = mini.split('top: var(--phone-sheet-top) !important;').join('top: 48px !important;');
  ok(['.context-menu.mobile-sheet', '.usage-popup'].every((x) => judge(r3Css).some((f) => f.startsWith(`${x}: top «48px !important»`))), `G4 CONTROL — r3's rules (the Desktops sheet's .mobile-sheet and the Usage popup at 48 !important) are RED by name: ${[...new Set(judge(r3Css).map((f) => f.split(':')[0]))].join(' · ')}`);
  const mn4 = put(mn, ", .ut-mini-popover, .mobile-win-switcher';", ", .ut-mini-popover';");
  const k2 = mn4 === null ? ['?'] : [...strays(mn4), ...judge(mini.replace(/html\[data-vc="compact"\] \.mobile-win-switcher \{[^}]*\}/, ''), [...new Set([...surfaceList(mn4), ...floats(mn4)])])];
  ok(k2.includes('.mobile-win-switcher') && k2.includes('.mobile-win-switcher: no rule places it (top + room from the variable)'), `K2 CONTROL — r4's bar (the title switcher outside PHONE_SURFACES, no rule of its own: placed once, at open) is RED by name: ${k2.join(' · ')}`);
  // the acceptance's planted CSS mutants (M5–M7: a literal top on a sheet by another selector shape) — RED by name now
  const MUTS = [['M5 a new rule with the sheets\' left/right at a literal top', '.foo-sheet.mobile-sheet { left: 8px !important; right: 8px !important; top: 48px !important; }'],
    ['M6 the same with right before left', '.context-menu.mobile-sheet { right: 8px !important; left: 8px !important; top: 48px !important; }'], ['M7 the Desktops sheet by its own class', '.mdesk-menu.mobile-sheet { top: 48px !important }'],
    ['a room of its own (a top from the variable, the old 60 px room)', '.mdesk-menu.mobile-sheet { top: var(--phone-sheet-top) !important; max-height: calc(100dvh - 60px) !important; }']];
  const mutReds = MUTS.filter(([, rule]) => judge(`${mini}\n${rule}`).length > 0).map(([w]) => w);
  ok(mutReds.length === MUTS.length, `K1 CONTROL — the acceptance's planted rules RED by name (${mutReds.length}/${MUTS.length}: ${MUTS.map(([w]) => w.split(' ')[0]).join(', ')})`, MUTS.filter(([w]) => !mutReds.includes(w)).map(([w]) => w));
  const writers = ['src/lib/mobile-nav.js', 'src/lib/desktop-switch-sheet.js', 'src/lib/phone-files.js', 'src/lib/app.js', 'src/lib/user-todos-panel.js', 'src/lib/usage-meter.js'].map((f) => [f, f === 'src/lib/mobile-nav.js' ? mn : f === 'src/lib/phone-files.js' ? pf : f === 'src/lib/user-todos-panel.js' ? ut : read(f)]);
  const OPENERS = [['src/lib/mobile-nav.js', /menu\.classList\.add\('mobile-sheet'\);/, '.mobile-sheet'], ['src/lib/desktop-switch-sheet.js', /if \(!regular\) menu\.classList\.add\('mobile-sheet'\);/, '.mobile-sheet'],
    ['src/lib/app.js', /createPopover\(anchor, 'global-settings-popover'\)/, '.global-settings-popover'], ['src/lib/user-todos-panel.js', /createPopover\(anchor, 'ut-mini-popover'\)/, '.ut-mini-popover'], ['src/lib/usage-meter.js', /document\.getElementById\('usage-popup'\)/, '.usage-popup'],
    ['src/lib/user-todos-panel.js', /document\.getElementById\('user-todos-popup'\)/, '.usage-popup'], ['src/lib/mobile-nav.js', /pop\.className = 'mobile-win-switcher';/, '.mobile-win-switcher']];
  // an opener's INLINE place: no !important top / max-height (it would beat the variable's rule — r3's sheetUnderNav, the planted M1 / M3)
  const INLINE_IMP = /setProperty\(\s*['"](?:top|max-height)['"][^\n]*?['"]important['"]\s*\)|(?<![-\w])(?:top|max-height)\s*:[^;'"`\n{}]*!\s*important/;
  const OPENED = new Map(); // a verdict per (opener row, file text): a control re-judges the one file it changed
  const openerFailures = (files) => OPENERS.filter((row) => { const [f, re, cls] = row, t = files.find(([g]) => g === f)?.[1] || '', sl = surfaceList(files.find(([g]) => g === 'src/lib/mobile-nav.js')?.[1] || '');
    const k = OPENED.get(row) || OPENED.set(row, new Map()).get(row); if (!k.has(t)) k.set(t, !re.test(t) || (t.includes('important') && INLINE_IMP.test(t)));
    return k.get(t) || !sl.includes(cls) || !placedBy(RULES, cls); }).map(([f, , cls]) => `${f} (${cls})`);
  const roads = (files) => files.filter(([, t]) => /setProperty\('--phone-sheet-top'/.test(t)).map(([f]) => f);
  const underOf = (src) => { const a = src.indexOf('  _publishUnder() {'); return a < 0 ? '' : src.slice(a, src.indexOf('\n  }\n', a)); };
  const pub = underOf(mn);
  ok(openerFailures(writers).length === 0 && roads(writers).join() === 'src/lib/mobile-nav.js' && /if \(this\._held\) \{ this\._heldMissed = true; return; \}/.test(pub) && /const v = nb > 0 \? `\$\{Math\.round\(nb \/ \(uiScale\(\) \|\| 1\)\) \+ 4\}px` : '';/.test(pub) && /if \(v\) root\.style\.setProperty\('--phone-sheet-top', v\); else root\.style\.removeProperty\('--phone-sheet-top'\);/.test(pub)
    && /this\._publishUnder\(\); \/\/ r4: every phone surface under the bar as it stands now/.test(fitOf(mn)),
    `G4: every OPENER of a phone surface (${OPENERS.map(([f, , c]) => `${f.replace('src/lib/', '')} ${c}`).join(' · ')}) opens a surface whose rule takes its top AND its room from the variable, and writes no inline !important top / max-height; ONE function writes it (mobile-nav.js _publishUnder, each fit pass — the bar's measured bottom + 4, never under a held press)`, { openers: openerFailures(writers), roads: roads(writers) });
  const r3Under = put(mn, "    menu.classList.add('mobile-sheet'); // under the bar as it stands: style.css --phone-sheet-top (_publishUnder, r4)\n", "    menu.classList.add('mobile-sheet');\n    menu.style.setProperty('top', `${Math.round(nb / (uiScale() || 1)) + 4}px`, 'important');\n");
  ok(r3Under !== null && openerFailures(writers.map(([f, t]) => [f, f === 'src/lib/mobile-nav.js' ? r3Under : t])).includes('src/lib/mobile-nav.js (.mobile-sheet)'), 'G4 CONTROL — r3\'s road of its own in _sheet (sheetUnderNav\'s inline !important top) is RED by name');
  const m3 = put(ut, "createPopover(anchor, 'ut-mini-popover')", "createPopover(anchor, 'ut-mini-popover'); pop.style.cssText += 'max-height:718px !important'; (0)");
  ok(m3 !== null && openerFailures(writers.map(([f, t]) => [f, f === 'src/lib/user-todos-panel.js' ? m3 : t])).includes('src/lib/user-todos-panel.js (.ut-mini-popover)'), 'K1 CONTROL — an opener\'s inline !important room of its own (the planted M3 shape: cssText «max-height:…!important») is RED by name');
  // K1 — a popup's INLINE room is computed from what is DRAWN (r5: the Usage popup through the ⋯ row hung from its folded chip, a zero
  // rect — inline max-height = the whole screen − 22): utils.js anchorFixedPopup RUN from its text over a folded chip in a bar at 114–158
  const fnOf = (src, head) => { const a = src.indexOf(head); if (a < 0) return ''; let d = 0, i = a + head.length - 1; const b0 = i; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(a, i + 1).replace(/^export /, ''); };
  const uts = read('src/lib/utils.js');
  const runAfp = (src) => tryv(() => {
    const f = new Function('window', 'uiScale', `${fnOf(src, 'export function drawnAnchorRect(anchor) {')}\n${fnOf(src, 'export function anchorFixedPopup(popup, anchor, { gap = 6 } = {}) {')}\nreturn anchorFixedPopup;`)({ innerWidth: 360, innerHeight: 740 }, () => 1);
    const rect = (top, h, w = 44) => ({ top, bottom: top + h, left: 272, right: 272 + w, width: w, height: h });
    const bar = { parentElement: null, getClientRects: () => [1], getBoundingClientRect: () => ({ ...rect(114, 44, 360), left: 0, right: 360 }) };
    const folded = { parentElement: bar, getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }) };
    const shown = { parentElement: bar, getClientRects: () => [1], getBoundingClientRect: () => rect(114, 44) };
    const pop = () => ({ style: {}, getBoundingClientRect: () => ({ left: 8, right: 352, width: 344 }) }), a = pop(), b = pop(); f(a, folded); f(b, shown);
    return { folded: a.style.maxHeight, shown: b.style.maxHeight, foldedTop: a.style.top };
  });
  const afp = runAfp(uts), afp4 = runAfp(put(uts, '  const r = drawnAnchorRect(anchor); // a folded chip\'s popup: from the bar that holds it, never a zero rect (r5)', '  const r = anchor.getBoundingClientRect();') || '');
  ok(afp?.folded === '560px' && afp.shown === '560px' && afp.foldedTop === '164px' && afp4?.folded === '718px', `K1: a popup's inline room is computed from what is DRAWN — utils.js anchorFixedPopup RUN over a folded chip in a bar at 114–158 (740 px screen): max-height ${afp?.folded} from the bar, as from a shown chip (${afp?.shown}) — CONTROL: r4's zero rect ${afp4?.folded} (RED)`, { afp, afp4 });
  ok(/const rect = drawnAnchorRect\(anchor\); \/\/ ⚙ folded into the phone's ⋯/.test(writers.find(([f]) => f === 'src/lib/app.js')[1]) && /while \(el\?\.parentElement && !el\.getClientRects\(\)\.length\) el = el\.parentElement;/.test(uts), 'K1: the Settings popover takes its place from what is drawn too (app.js _showGlobalSettings → drawnAnchorRect — the bar when ⚙ is folded)');
  ok(css.includes('html[data-vc="compact"] #mobile-nav-overflow.vault-locked { position: relative; color: var(--red); }') && css.includes('.mnav-more-menu .context-menu-item.vault-locked .mnav-more-icon { position: relative; color: var(--red); }')
    && css.includes('.mnav-more-menu .mnav-more-value { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;') && css.includes('.mobile-sheet .mnav-sheet-hint {'),
    'style.css (r3): the ⋯ and ⚙\'s row in the lock\'s red, a long desktop name ellipsized in its value (the label never cut), the 文件 row\'s hint line');
  // r6 L1 — «+» IS THE CREATE MENU (the r5 acceptance: the owner put Files INTO «+», but its sheet opened only on a 500 ms press and
  // the tap opened New Session; with nothing waiting no For-you page, so no 文件 card — NO door on the screen said Files): a TAP opens
  // the sheet (a second tap closes it: «+» is exempt from the sheet's outside-press closer), a long press the same sheet; its rows —
  // New session FIRST and accented (the tap's old act, one row in), Files always among them (never gated). CONTROL: r5's road put back
  // (the tap = the dialog, the sheet on contextmenu only) RED
  const createOf = (src) => { const a = src.indexOf('  _showCreateSheet() {'); return a < 0 ? '' : src.slice(a, src.indexOf('\n  }\n', a)); };
  const R6_TAP = "    newBtn.onclick = (e) => { e.stopPropagation(); if (this._createMenu?.isConnected) { this._createMenu.remove(); return; } this._showCreateSheet(); };\n";
  const R6_PRESS = "    newBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (!this._createMenu?.isConnected) this._showCreateSheet(); });\n";
  const tapMenu = (src) => src.includes(R6_TAP) && src.includes(R6_PRESS) && src.includes("    newBtn.setAttribute('aria-haspopup', 'menu');\n")
    && /\n    const menu = this\._sheet\(items\);\n    menu\.querySelector\(':scope > \.context-menu-item'\)\?\.classList\.add\('mnav-sheet-lead'\);[^\n]*\n    menu\._closeExclude\?\.push\(document\.getElementById\('mobile-nav-new'\)\);[^\n]*\n    this\._createMenu = menu;\n    return menu;$/.test(createOf(src))
    && /const items = \[\n      row\(UI_ICONS\.robot, t\('Agent session'\), \(\) => app\.showNewSessionDialog\(\)\),\n(?:      row\([^\n]*\n)*?      row\(FILE_ICONS\.folder, t\('Files'\), \(\) => this\._pressFiles\(\)[^\n]*\n(?:      row\([^\n]*\n)*    \];/.test(createOf(src));
  const r5Road = put(put(mn, R6_TAP, '    newBtn.onclick = () => app.showNewSessionDialog();\n') || '', R6_PRESS, "    newBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._showCreateSheet(); });\n");
  pinOn(mn, 'L1: a TAP on «+» opens the «+» sheet (a second tap closes it; a long press, the same sheet) — New session its FIRST row, accented; Files always in it: two taps from any screen, nothing waiting or not', tapMenu, r5Road, 'r5');
  pinOn(laneCss, 'L1: style.css — the sheet\'s lead row (New session) in the accent, bolder', (c) => c.includes('.mobile-sheet .context-menu-item.mnav-sheet-lead { color: var(--accent); font-weight: 600; }'),
    put(laneCss, '.mobile-sheet .context-menu-item.mnav-sheet-lead { color: var(--accent); font-weight: 600; }', ''), 'r5');
  // r7 W1 — «+» NAMES ITS MENU (the r6 acceptance: a tap opens the create menu, but the button was still titled «New session» — a
  // mouse's tooltip and a screen reader named the one act a tap no longer does, and told a person looking for Files that it only
  // makes sessions): its title AND aria-label are ONE key naming the menu, never a row's words, translated by data-i18n-attr (the
  // key's zh / ja entries: i18n-check counts them; test-phone-titlebar-ui ⑪ reads the drawn title in en / zh / ja — the 3 MB
  // dictionaries cost this suite ~5 ms, more than the cap's room). CONTROL: 187ca86cf's line put back RED
  const html = read('public/index.html');
  const MENU_ROWS = ['New session', 'Agent session', 'Terminal', 'Files', 'Web view', 'Desktop', 'Apps…', 'Agent browser'];
  const plusNames = (h) => { const b = (/<button id="mobile-nav-new"[^>]*>/.exec(h) || [''])[0], ti = (/ title="([^"]*)"/.exec(b) || [])[1] || '', al = (/ aria-label="([^"]*)"/.exec(b) || [])[1] || '';
    return !!ti && ti === al && !MENU_ROWS.includes(ti) && / data-i18n-attr="title,aria-label"/.test(b); };
  pinOn(html, `W1: «+» names its MENU — its title and aria-label ONE key («${(/<button id="mobile-nav-new" title="([^"]*)"/.exec(html) || [])[1]}»), translated, never a row's words (r6's «New session» named the one act a tap no longer does)`, plusNames,
    put(html, '<button id="mobile-nav-new" title="Create or open…" aria-label="Create or open…" data-i18n-attr="title,aria-label">+</button>', '<button id="mobile-nav-new" title="New session" data-i18n-attr="title">+</button>'), 'r6');
  // r6 L2 — THE REGULAR CLASS PINNED (the r5 acceptance: only the `viewportClass() === 'compact'` term kept the regular class's trailing
  // bar — a column, its bottom the screen's — from writing the variable as the screen + 4: the Usage popup, the Settings popover, the
  // mini inbox off the bottom of a Duo in landscape, every gate green): mobile-nav.js _publishUnder RUN from its own text over the
  // compact bar (at the top; under the lock strip) and the regular class's bar (the Duo's landscape column; its portrait row; a stale
  // value a rotation left) — the regular class and the desktop write NOTHING. CONTROL: the term dropped ⇒ the column's 589px, RED by name
  const runPub = (src) => tryv(() => {
    const body = underOf(src); if (!body) return null;
    const f = new Function('document', 'uiScale', body.slice(body.indexOf('{') + 1));
    return ({ vc, bottom, was = '' }) => {
      const props = new Map(was ? [['--phone-sheet-top', was]] : []);
      const style = { getPropertyValue: (k) => props.get(k) || '', setProperty: (k, v) => { props.set(k, v); }, removeProperty: (k) => { props.delete(k); } };
      const nav = { getClientRects: () => (bottom ? [1] : []), getBoundingClientRect: () => ({ bottom }) };
      f.call({ _held: false, app: { viewportClass: () => vc } }, { getElementById: (id) => (id === 'mobile-nav' ? nav : null), documentElement: { style } }, () => 1);
      return props.get('--phone-sheet-top') || '';
    };
  });
  const PUB = [['the compact bar at the page\'s top', { vc: 'compact', bottom: 44 }, '48px'], ['the compact bar under the lock strip', { vc: 'compact', bottom: 158 }, '162px'],
    ['the regular class: a Duo\'s landscape, the bar a column to the screen\'s bottom', { vc: 'regular', bottom: 585 }, ''], ['the regular class: a Duo\'s portrait, the bar a row', { vc: 'regular', bottom: 44 }, ''],
    ['the regular class after a rotation (a stale 162px on <html>)', { vc: 'regular', bottom: 585, was: '162px' }, ''], ['the desktop (no bar drawn)', { vc: 'desktop', bottom: 0, was: '48px' }, '']];
  const pubFailures = (src) => { const f = runPub(src); return typeof f !== 'function' ? [`no runnable _publishUnder (${f})`] : PUB.filter(([, c, want]) => tryv(() => f(c)) !== want).map(([what, c, want]) => `${what}: want «${want}», got «${tryv(() => f(c))}»`); };
  const noTerm = put(mn, "const nb = nav && this.app.viewportClass?.() === 'compact' && nav.getClientRects().length ? ", 'const nb = nav && nav.getClientRects().length ? ');
  const l2 = noTerm === null ? ['(the term not found)'] : pubFailures(noTerm);
  ok(pubFailures(mn).length === 0 && l2.filter((x) => x.startsWith('the regular class')).length === 3,
    `L2: the regular class writes no variable — mobile-nav.js _publishUnder RUN from its text over ${PUB.length} bars (the compact one at the top 48px, under the strip 162px; the regular class's column, its row, a rotation's stale value, the desktop: none) — CONTROL: the compact term dropped is RED by name: ${l2.map((x) => x.replace(/, the bar[^:]*/, '').replace(/: want «[^»]*», got /, ' → ')).join(' · ')}`,
    { now: pubFailures(mn), control: l2 });
  const pd = read('src/phone-doors.js');
  ok(pd.includes(`T('the «+» sheet «Files» (the nav door\\'s press; r6: a tap on «+», then the row)', 'src/lib/mobile-nav.js', "t('Files'), () => this._pressFiles")`) && pd.includes(`T('the nav «+» (a tap opens its sheet — r6)', 'src/lib/mobile-nav.js', "newBtn.onclick = (e) => { e.stopPropagation(); if (this._createMenu?.isConnected)")`),
    'phone-doors.js: the Files twin is the «+» row\'s press, a tap on «+» away; New session\'s, «+»\'s tap and the sheet\'s first row (test-phone-doors censuses them)');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
