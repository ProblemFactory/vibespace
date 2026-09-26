#!/usr/bin/env node
// THE PER-APP DEFAULT SCALE + THE CLICKABLE SCALE CHIP (lane D (b), 2026-09-25; docs/design-desktop-apps-seamless.zh.md
// §3.4 note). The owner: "可以改成那个1.5x 已选的提示直接可以点快速切换" + "最好加入可以在app启动前那个app选择界面调整每个app默认
// dpi的能力". Fast, no browser, no display:
//   §1 the widened EXPLICIT set: every value a person picks (1 / 1.5 / 2 / 2.5 / 3) is spelled EXACTLY by scaleKnobs
//      under BOTH rules — lane D (a)'s default ceil rule (GDK_SCALE = ⌈s⌉ at 96 dpi, the picture shown at s ÷ ⌈s⌉: a
//      fraction is a real scale of widgets and text) and the dpi rule of a browser row (GDK_SCALE = ⌊s⌋, the rest in the
//      font dpi, an integer) — 2.5× and 3× are offered because they are; the Settings enum (APP_SCALES) stays
//      1 / 1.5 / 2; parseScaleChoice's table;
//   §2 the launch request's `scaleChoice` (both shapes): carried as a number, 'auto' = none, anything else REFUSED by
//      name (bad-request) — scaleChoiceVerdict is the one check;
//   §3 THE PRECEDENCE (PURE scalePick): a window's Scale ▸ choice > the app's default (origin 'app') > an explicit
//      Settings value > auto, over the full table; the record keeps origin 'app'; the Scale ▸ model marks the app's
//      default row and offers 2.5× / 3×;
//   §4 the client's PURE model (src/lib/desktop-app-scale.js): ONE key per app (= the frame key: a record, a catalog row
//      and a typed command of the same program agree), the map (auto REMOVES, junk removes, the input never mutated),
//      the launch field, the card's menu, the window's "Make n× the default" model;
//   §5 the words: the chip "1.5× · App default" + its title sentence; the chip is a CONTROL exactly when the window can
//      relaunch (else plain, the reason in its tooltip); the rows (plain numbers since the lane-D merge — no GTK caveat,
//      a fraction is a real scale; the "App default" marker, Make / Forget); the card control's words; zh + ja for every
//      new key, the retired caveats gone;
//   §6 THE ROUTE (a real express app, a stub keeper): a bad `scaleChoice` is refused 400 BEFORE any machine is asked
//      (an older paired agent would drop the field silently); a good one rides the body to the keeper unchanged, `host`
//      apart; the hub keeper hands it to a paired machine INSIDE the op's `body` — the op's shape otherwise unchanged;
//   §7 wiring pins: the machine's pick line, the launcher's POST, the card control a SIBLING button that never
//      launches, the chip's role / keyboard / menu, ONE user-state loader for both per-app maps;
//   §8 THE LOADER OVER A FAKE SOCKET (lane D verify, the minor: B dropped its socket, A stored xterm 2×, B stored the
//      calculator 1.5× from its stale copy ⇒ A's xterm gone, no word): two pages on one fake server that merges a PATCH
//      top-level exactly as src/routes/persistence.js does and broadcasts only to connected sockets — after a close/reopen
//      the page's map IS the server's; a save made after it keeps the other page's key; a save made from a copy that
//      MISSED a broadcast still keeps it (the edit is applied to the server's map read NOW, never the whole local map);
//      a refused save rolls the view back (notified twice, one toast naming the reason); two quick saves from one page
//      both land; a save that lands as shown notifies once; a whole map (not an edit) is refused — for BOTH per-app maps;
//   NEGATIVE CONTROLS (scripts/mutant-copy.mjs): a scalePick that forgets the app default fails §3's table; a route
//      without the check lets a bad value through to a paired machine; a setScaleChoice that stores 'auto' grows the map;
//      §8: a loader without the reconnect re-read keeps the stale map; one that PATCHes its local map loses the other
//      page's key; one that keeps a refused edit shows an unsaved choice.
// Run: node scripts/test-desktop-app-scale.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const MUT = mutantCopies('dapp-scale', repo);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

const M = require('../src/desktop-apps.js');
const S = await import('../src/lib/desktop-app-scale.js');
const SEAM = await import('../src/lib/desktop-seamless.js');

console.log('§1 the explicit scales a person picks — each one spelled exactly by the ceil rule (lane D (a)) and by a browser row\'s dpi rule');
{
  ok(same(M.EXPLICIT_SCALES, [1, 1.5, 2, 2.5, 3]) && Object.isFrozen(M.EXPLICIT_SCALES), 'EXPLICIT_SCALES = 1, 1.5, 2, 2.5, 3');
  // the ceil rule written out HERE (lane D (a), the default): GDK_SCALE = ceil(s) at 96 dpi, the picture shown at s ÷ GDK_SCALE
  // — widgets AND text at s; an integer stays 1:1
  const rows = M.EXPLICIT_SCALES.map((s) => { const k = M.scaleKnobs(s); const g = Math.ceil(s); return { s, gdk: k.gdkScale, dpi: k.dpi, pic: k.pictureScale, rule: k.rule, want: [g, 96, Math.round(s / g * 10000) / 10000] }; });
  ok(rows.every((r) => r.rule === 'ceil' && r.gdk === r.want[0] && r.dpi === r.want[1] && r.pic === r.want[2] && Math.abs(r.gdk * r.pic - r.s) < 1e-3 && M.scaleKnobs(r.s).scale === r.s), `scaleKnobs spells each by the ceil rule (${rows.map((r) => `${r.s} ⇒ GDK_SCALE ${r.gdk} shown at ${r.pic}`).join(', ')})`, rows);
  // …and a browser row's dpi rule: GDK_SCALE = floor(s), the font dpi = 96 × s / GDK_SCALE — an INTEGER for every row
  const drows = M.EXPLICIT_SCALES.map((s) => { const k = M.scaleKnobs(s, { rule: 'dpi' }); const g = Math.floor(s); return { s, gdk: k.gdkScale, dpi: k.dpi, pic: k.pictureScale, want: [g, 96 * s / g], exact: Number.isInteger(96 * s / g) }; });
  ok(drows.every((r) => r.gdk === r.want[0] && r.dpi === r.want[1] && r.exact && r.pic === 1), `…and by the dpi rule of a browser row, no rounding needed (${drows.map((r) => `${r.s} ⇒ GDK_SCALE ${r.gdk} + ${r.dpi} dpi`).join(', ')})`, drows);
  ok(M.scaleKnobs(2.5).env.GDK_SCALE === '3' && M.scaleKnobs(2.5).dpi === 96 && M.scaleKnobs(2.5).pictureScale === 0.8333 && M.scaleKnobs(2.5, { rule: 'dpi' }).env.GDK_SCALE === '2' && M.scaleKnobs(2.5, { rule: 'dpi' }).dpi === 120 && M.scaleKnobs(3).env.GDK_SCALE === '3' && M.scaleKnobs(3).dpi === 96 && M.scaleKnobs(3).pictureScale === 1, '2.5× = drawn at GDK_SCALE 3, shown at 0.8333 (a browser: GDK_SCALE 2 + 120 dpi); 3× = GDK_SCALE 3 at 96 dpi, 1:1');
  ok(same(M.APP_SCALES, [1, 1.5, 2]) && same(M.SCALE_CHOICES, ['auto', 1, 1.5, 2, 2.5, 3]) && Object.isFrozen(M.SCALE_CHOICES), 'the Settings enum stays 1 / 1.5 / 2 (an instance default); the Scale ▸ rows are auto + the explicit set');
  const P = [['auto', 'auto'], [1, 1], ['1', 1], [1.5, 1.5], ['1.5', 1.5], [2.5, 2.5], ['3', 3], [3, 3], [1.25, null], [4, null], [0, null], ['', null], [null, null], [undefined, null], [true, null], ['x', null], [{}, null], [[2], null], ['Auto', null]];
  const got = P.map(([v]) => M.parseScaleChoice(v));
  ok(P.every(([, w], i) => got[i] === w), `parseScaleChoice: ${P.map(([v], i) => `${JSON.stringify(v)} ⇒ ${JSON.stringify(got[i])}`).join(', ')}`);
  ok(M.appScaleFor('2.5', 1) === 2.5 && M.appScaleFor('3', 1) === 3 && M.appScaleFor('1.25', 2) === 1 && M.appScaleFor('4', 1) === 1, 'appScaleFor honours every explicit scale (2.5, 3); anything else explicit ⇒ 1');
  const rv = [[{ scale: 2.5 }, 2.5], [{ scale: '3' }, 3], [{ scale: 1.25 }, null], [{ scale: 4 }, null]].map(([b, w]) => [w, M.validateRelaunchRequest(b)]);
  ok(rv.every(([w, v]) => (w === null ? !v.ok && v.code === 'bad-request' && /2\.5, 3/.test(v.error) : v.ok && v.choice === w)), 'a relaunch accepts 2.5× and 3×, and refuses 1.25 / 4 naming the whole set', rv);
}

console.log('§2 the launch request carries the app\'s default scale — or refuses it by name');
{
  const reg = M.DEFAULT_REGISTRY;
  const a = M.validateLaunchRequest({ appId: 'xterm', scaleChoice: 1.5 }, reg), b = M.validateLaunchRequest({ exec: 'xterm', args: [], scaleChoice: '2.5' }, reg);
  ok(a.ok && a.launch.scaleChoice === 1.5 && b.ok && b.launch.scaleChoice === 2.5, 'both request shapes carry it (a catalog row by id: 1.5; a typed command: "2.5" read as 2.5)', { a: a.launch && a.launch.scaleChoice, b: b.launch && b.launch.scaleChoice });
  const none = [{ appId: 'xterm' }, { appId: 'xterm', scaleChoice: 'auto' }, { appId: 'xterm', scaleChoice: null }].map((x) => M.validateLaunchRequest(x, reg));
  ok(none.every((v) => v.ok && v.launch.scaleChoice === null), 'absent / "auto" / null ⇒ null (no app default: the instance default decides)');
  const badV = [1.25, 4, 'x', true, {}, [1.5], ''].map((c) => [c, M.validateLaunchRequest({ appId: 'xterm', scaleChoice: c }, reg)]);
  ok(badV.every(([, v]) => !v.ok && v.code === 'bad-request' && /^scaleChoice must be one of auto, 1, 1\.5, 2, 2\.5, 3$/.test(v.error)), `every other value is REFUSED by name, never silently dropped (${badV.map(([c]) => JSON.stringify(c)).join(' ')})`, badV.map(([c, v]) => [c, v.error]));
  ok(same(M.scaleChoiceVerdict({}), { ok: true, scaleChoice: null }) && same(M.scaleChoiceVerdict(null), { ok: true, scaleChoice: null }) && same(M.scaleChoiceVerdict({ scaleChoice: 3 }), { ok: true, scaleChoice: 3 }) && M.scaleChoiceVerdict({ scaleChoice: 9 }).code === 'bad-request', 'scaleChoiceVerdict: the one check (the machine\'s validateLaunchRequest and the hub\'s route both call it)');
}

console.log('§3 the precedence — a window\'s choice > the app\'s default > an explicit Settings value > auto');
const precedenceTable = (mod) => {
  // [choice, appDefault, setting, dpr, uiScale] → [scale, origin]
  const T = [
    [undefined, undefined, 'auto', 2, 1.25, 2.5, 'auto'],
    [undefined, undefined, '1.5', 2, 1, 1.5, 'setting'],
    [undefined, 1.5, 'auto', 2, 1.25, 1.5, 'app'],
    [undefined, 1.5, '2', 1, 1, 1.5, 'app'],
    [undefined, 3, undefined, 1, 1, 3, 'app'],
    [undefined, 'auto', '2', 1, 1, 2, 'setting'],
    [undefined, null, 'auto', 1, 1, 1, 'auto'],
    [undefined, 7, '2', 1, 1, 2, 'setting'],
    [1, 2.5, '2', 2, 1, 1, 'chosen'],
    ['auto', 2.5, '2', 1, 1.25, 1.25, 'auto'],
    [2.5, null, 'auto', 1, 1, 2.5, 'chosen'],
  ];
  return T.map(([choice, appDefault, setting, dpr, uiScale, ws, wo]) => { const p = mod.scalePick({ choice, appDefault, setting, dpr, uiScale }); return { choice, appDefault, setting, got: [p.scale, p.origin], want: [ws, wo], from: p.from }; });
};
{
  const rows = precedenceTable(M);
  ok(rows.every((r) => same(r.got, r.want)), `scalePick over the whole table (${rows.length} rows): ${rows.map((r) => `c=${JSON.stringify(r.choice)} app=${JSON.stringify(r.appDefault)} set=${JSON.stringify(r.setting)} ⇒ ${r.got.join(' ')}`).join('; ')}`, rows.filter((r) => !same(r.got, r.want)));
  ok(rows.filter((r) => r.got[1] === 'app').every((r) => r.from === null), 'an app default carries no `from` (it was not derived from a screen)');
  const rec = M.newRecord({ id: 'da-1', label: 'Calc', exec: '/usr/bin/gnome-calculator', source: 'registry', backend: 'xpra', now: 1, scale: 1.5, dpi: 144, scaleOrigin: 'app' });
  const junk = M.newRecord({ id: 'da-2', label: 'x', exec: '/x', source: 'adhoc', backend: 'xpra', now: 1, scaleOrigin: 'mine' });
  ok(rec.scaleOrigin === 'app' && rec.scale === 1.5 && junk.scaleOrigin === null && same(M.SCALE_ORIGINS, ['auto', 'setting', 'chosen', 'app']), 'the record keeps origin "app"; an origin outside the closed set is dropped');
  // CONTROL — a scalePick that never reads the app default (the pre-lane-D pick): the table is a judge, not an echo
  const src = read('src/desktop-apps.js');
  const line = "  if (typeof app === 'number') return { scale: app, origin: 'app', from: null };\n";
  ok(src.split(line).length === 2, 'CONTROL: the app-default line is spelled exactly once (the copy removes exactly it)');
  const Mc = MUT.load('src/desktop-apps.js', src.replace(line, ''), 'no-app-default');
  const bad = precedenceTable(Mc).filter((r) => !same(r.got, r.want));
  ok(bad.length === 3 && bad.every((r) => r.want[1] === 'app'), `CONTROL: without it the table fails on exactly the ${bad.length} app-default rows (they fall to Settings / auto)`, bad.map((r) => [r.appDefault, r.got]));
  // the window's Scale ▸ model: 2.5× and 3× rows, the app default marked (never current by itself)
  const live = { id: 'da-9', state: 'ready', backend: 'xpra', exec: '/usr/bin/gnome-calculator', args: [], label: 'Calc', source: 'registry', appId: 'gnome-calculator', scale: 1.5, scaleOrigin: 'app' };
  const mm = M.scaleMenuModel(live, { dpr: 1, uiScale: 1, appDefault: 1.5 });
  ok(same(mm.rows.map((r) => [r.choice, r.current, r.appDefault, r.disabled]), [['auto', false, false, false], [1, false, false, false], [1.5, true, true, true], [2, false, false, false], [2.5, false, false, false], [3, false, false, false]]), 'a window launched AT its app default: that row is current (not offered again) and marked as the default; 2.5× and 3× are rows', mm.rows);
  const mm2 = M.scaleMenuModel({ ...live, scale: 2, scaleOrigin: 'chosen' }, { appDefault: 1.5 });
  ok(mm2.rows.find((r) => r.choice === 2).current && mm2.rows.find((r) => r.choice === 1.5).appDefault && !mm2.rows.find((r) => r.choice === 1.5).current && M.scaleMenuModel(live, {}).rows.every((r) => !r.appDefault), 'running at another scale: the default row stays marked, the current one is what runs; no default ⇒ nothing marked');
}

console.log('§4 the client\'s PURE model — one key per app, the map, the launch field, the card\'s menu, "Make n× the default"');
{
  const K = [[{ appId: 'gnome-calculator' }, 'gnome-calculator'], [{ appId: 'chromium', exec: '/usr/bin/google-chrome' }, 'chromium'], [{ exec: 'xterm' }, 'exec:xterm'], [{ exec: '/usr/bin/xterm' }, 'exec:xterm'], [{}, null], [null, null]];
  ok(K.every(([x, w]) => S.scaleKeyOf(x) === w && SEAM.frameKeyOf(x) === w), `scaleKeyOf == frameKeyOf (ONE key per app for both per-app choices): ${K.map(([x, w]) => `${JSON.stringify(x)} ⇒ ${w}`).join(', ')}`);
  ok(S.scaleKeyOf({ exec: 'xterm' }) === S.scaleKeyOf({ exec: '/usr/bin/xterm', appId: undefined, source: 'adhoc' }), 'a typed command ("xterm") and the record it becomes (exec resolved to /usr/bin/xterm) share the key — a window\'s "Make default" reaches the next typed launch');
  const m0 = { 'exec:xterm': 2 };
  const m1 = S.setScaleChoice(m0, 'gnome-calculator', 1.5), m2 = S.setScaleChoice(m1, 'exec:xterm', 'auto'), m3 = S.setScaleChoice(m1, 'gnome-calculator', 9), m4 = S.setScaleChoice(m1, null, 2);
  ok(same(m0, { 'exec:xterm': 2 }) && same(m1, { 'exec:xterm': 2, 'gnome-calculator': 1.5 }) && same(m2, { 'gnome-calculator': 1.5 }) && same(m3, { 'exec:xterm': 2 }) && same(m4, m1), 'setScaleChoice: stores a number; "auto" and junk REMOVE the key (the map never grows by choices that change nothing); no key ⇒ unchanged; the input never mutated');
  ok(S.scaleChoiceOf(m1, 'gnome-calculator') === 1.5 && S.scaleChoiceOf(m1, 'nope') === 'auto' && S.scaleChoiceOf({ x: 'weird' }, 'x') === 'auto' && S.scaleChoiceOf(null, 'x') === 'auto' && S.scaleChoiceOf({ x: '2.5' }, 'x') === 2.5, 'scaleChoiceOf: the stored number, else auto (unknown key, junk, no map)');
  ok(S.launchScaleChoice(m1, { appId: 'gnome-calculator' }) === 1.5 && S.launchScaleChoice(m1, { exec: '/usr/bin/xterm', args: ['-T', 'x'] }) === 2 && S.launchScaleChoice(m1, { appId: 'xterm' }) === null && S.launchScaleChoice({}, { appId: 'gnome-calculator' }) === null, 'launchScaleChoice: a card by its id, a typed / recent command by its program; nothing stored ⇒ null (nothing sent)');
  ok(same(S.scaleDefaultMenuModel(m1, 'gnome-calculator').map((r) => [r.choice, r.current, r.disabled]), [['auto', false, false], [1, false, false], [1.5, true, true], [2, false, false], [2.5, false, false], [3, false, false]]) && S.scaleDefaultMenuModel({}, 'x')[0].current, 'the card\'s menu: auto + every explicit scale, the stored one checked and not offered again (auto when none)');
  const rec = (o) => ({ appId: 'gnome-calculator', exec: '/usr/bin/gnome-calculator', scale: 1.5, scaleOrigin: 'chosen', ...o });
  const D = [
    [rec({}), {}, { def: 'auto', running: 1.5, make: 1.5, isDefault: false, clear: false }],
    [rec({ scaleOrigin: 'app' }), { 'gnome-calculator': 1.5 }, { def: 1.5, running: 1.5, make: null, isDefault: true, clear: true }],
    [rec({ scale: 2 }), { 'gnome-calculator': 1.5 }, { def: 1.5, running: 2, make: 2, isDefault: false, clear: true }],
    [rec({ scale: 2.5, scaleOrigin: 'auto' }), {}, { def: 'auto', running: 'auto', make: null, isDefault: false, clear: false }],
    [rec({ scale: 1.25, scaleOrigin: 'auto' }), { 'gnome-calculator': 3 }, { def: 3, running: 'auto', make: null, isDefault: false, clear: true }],
    [rec({ scale: 1.25, scaleOrigin: 'setting' }), {}, { def: 'auto', running: null, make: null, isDefault: false, clear: false }],
  ];
  ok(D.every(([r, m, w]) => { const g = S.appDefaultModel(r, m); return g && g.key === 'gnome-calculator' && Object.entries(w).every(([k, v]) => g[k] === v); }), `appDefaultModel over ${D.length} rows (chosen 1.5 ⇒ make 1.5; at its default ⇒ isDefault + clear; derived (auto) ⇒ nothing to make — the app default is an explicit scale; a value outside the explicit set ⇒ nothing)`, D.map(([r, m]) => S.appDefaultModel(r, m)));
  ok(S.appDefaultModel({ scale: 2 }, {}) === null && S.appDefaultModel(null, {}) === null, 'a record nothing names (no app id, no exec) ⇒ no rows');
  // CONTROL — a setScaleChoice that STORES 'auto' (the map grows by choices that change nothing)
  const src = read('src/lib/desktop-app-scale.js');
  const line = "  if (typeof c === 'number') next[key] = c; else delete next[key];\n";
  ok(src.split(line).length === 2, 'CONTROL: the remove line is spelled exactly once');
  const Sc = await import(pathToFileURL(MUT.write('src/lib/desktop-app-scale.js', src.replace(line, "  next[key] = c === null ? 'auto' : c;\n"), 'stores-auto')).href);
  const grown = Sc.setScaleChoice({ a: 2 }, 'a', 'auto');
  ok(!same(grown, {}) && grown.a === 'auto', 'CONTROL: the patched copy keeps the key with "auto" — the map test above is a judge', grown);
}

console.log('§5 the words — the chip, its tooltip, the rows, the card control; zh + ja');
{
  const W = await import('../src/lib/desktop-app-window.js');
  const L = await import('../src/lib/desktop-app-launcher.js');
  const X = { stream: 'xpra', state: 'ready', backend: 'xpra', dpi: 144, scale: 1.5 };
  ok(W.scaleChipText({ ...X, scaleOrigin: 'app' }) === '1.5× · App default' && W.scaleChipText({ ...X, scaleOrigin: 'chosen' }) === '1.5× · chosen' && W.scaleChipText({ ...X, scale: 2, scaleOrigin: 'setting' }) === '2× · Settings' && W.scaleChipText({ ...X, scale: 2.5, scaleOrigin: 'auto' }) === '2.5× · auto', 'the chip names the value AND its origin: "1.5× · App default" / "· chosen" / "· Settings" / "· auto"');
  const tA = W.scaleChipTitle({ ...X, dpi: 96, gdkScale: 2, pictureScale: 0.75, scaleOrigin: 'app' }); // the record a launch writes since the lane-D merge
  ok(/^Scale 1\.5× — the default you chose for this app — widgets 1\.5×, text at 96 dpi\. Drawn at 2× and shown at 75% — a fractional scale is resampled\. Click to change the scale$/.test(tA), `the app-default tooltip names where it came from, the numbers (lane D (a): widgets 1.5×, drawn at 2× shown at 75%), and that a click changes it: "${tA}"`);
  const tL = W.scaleChipTitle({ ...X, scaleOrigin: 'app' }); // a record from before lane D (no gdkScale): the floor rule, shown 1:1
  ok(/^Scale 1\.5× — the default you chose for this app — widgets 1×, text at 144 dpi\. Click to change the scale$/.test(tL), `a record from before lane D keeps its own numbers (widgets 1×, 144 dpi, nothing resampled): "${tL}"`);
  ok(W.scaleChipWhy({ ...X }) === null && W.scaleChipWhy({ ...X, state: 'launching' }) === 'not-ready' && W.scaleChipWhy({ ...X, backend: 'vnc-display' }) === 'not-xpra' && W.scaleChipWhy(null) === 'not-found', 'the chip is a CONTROL exactly when the window can relaunch (a running xpra app); launching / a whole-display rung ⇒ plain');
  const tP = W.scaleChipTitle({ ...X, state: 'launching', scaleOrigin: 'chosen' }, 'not-ready');
  ok(/Only a running app can be relaunched at another scale$/.test(tP) && !/Click to change/.test(tP), `a plain chip says WHY in its tooltip instead ("…${tP.slice(-60)}")`);
  ok(W.scaleRowLabel({ choice: 2.5, current: false }) === ' 2.5×' && W.scaleRowLabel({ choice: 1.5, current: true, appDefault: true }) === '✓ 1.5× · App default' && W.scaleRowLabel({ choice: 3 }) === ' 3×' && W.scaleRowLabel({ choice: 'auto', scale: 2, appDefault: false }) === ' Auto (2×)', 'the Scale ▸ rows: plain numbers (a fraction is a real scale since lane D (a) — no GTK caveat), the app\'s default row is marked');
  const saved = [];
  const items = W.appDefaultItems({ key: 'k', def: 1.5, running: 2, make: 2, isDefault: false, clear: true }, (c) => saved.push(c));
  items.forEach((it) => it.action && it.action());
  ok(items.length === 2 && items[0].label === 'Make 2× the default for this app' && /border-top/.test(items[0].style || '') && items[1].label === 'Forget this app’s default (1.5×)' && same(saved, [2, 'auto']), '"Make 2× the default for this app" stores 2, "Forget this app\'s default (1.5×)" stores auto (removes); the first row opens the group with a rule', items);
  const at = W.appDefaultItems({ key: 'k', def: 1.5, running: 1.5, make: null, isDefault: true, clear: true }, () => {});
  ok(at.length === 2 && at[0].disabled && at[0].label === '1.5× is this app’s default' && W.appDefaultItems(null, () => {}).length === 0 && W.appDefaultItems({ make: null, isDefault: false, clear: false }, () => {}).length === 0, 'at its default: one status line + Forget; nothing to say ⇒ no rows');
  ok(L.cardScaleText('auto') === 'Auto' && L.cardScaleText(2.5) === '2.5×' && /^Default scale for Calc: Auto \(Settings → Desktop app scale\)\. Click to choose the scale it starts at\.$/.test(L.cardScaleTitle('Calc', 'auto')) && /^Default scale for Calc: 1\.5× — it starts at this scale\. Click to change\.$/.test(L.cardScaleTitle('Calc', 1.5)) && L.cardScaleRowLabel({ choice: 'auto', current: true }) === '✓ Auto (Settings → Desktop app scale)' && L.cardScaleRowLabel({ choice: 2.5 }) === ' 2.5×' && L.cardScaleRowLabel({ choice: 1.5 }) === ' 1.5×', 'the card control: "Auto" / "2.5×", a tooltip naming the app and what happens, the rows\' words (plain numbers)');
  // every new t() key has zh AND ja (the build's i18n-check warns on parity only — this is the hard pin)
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const KEYS = ['App default', 'Click to change the scale', 'Scale {scale}× — the default you chose for this app — widgets {gdk}×, text at {dpi} dpi.', 'Drawn at {gdk}× and shown at {pct}% — a fractional scale is resampled.', '{scale}× is this app’s default', 'Make {scale}× the default for this app', 'Forget this app’s default ({scale}×)', 'Could not save the app’s default scale', 'Could not save the choice', 'Default scale for {app}', 'Default scale for {app}: Auto (Settings → Desktop app scale). Click to choose the scale it starts at.', 'Default scale for {app}: {scale}× — it starts at this scale. Click to change.', 'Auto (Settings → Desktop app scale)', 'Auto'];
  const miss = KEYS.filter((k) => !zh[k] || !ja[k]);
  ok(miss.length === 0, `zh + ja for every new key (${KEYS.length})`, miss);
  const code = ['src/lib/desktop-app-window.js', 'src/lib/desktop-app-launcher.js', 'src/lib/desktop-app-prefs.js'].map(read).join('\n');
  ok(KEYS.every((k) => code.includes(`t('${k}'`)), 'each key is a t() literal in the code that says it (extractable)', KEYS.filter((k) => !code.includes(`t('${k}'`)));
  ok(!('⋯ → Scale relaunches the app at another scale.' in zh) && !code.includes('⋯ → Scale relaunches'), 'the retired tooltip tail is gone from the code and the dictionaries (the chip itself is the way now)');
  const RETIRED = ['1.5× (text only in GTK apps)', '2.5× (GTK apps: widgets 2×, text 2.5×)']; // the floor rule's caveats — a fraction is a real scale since lane D (a)
  const all = code + read('src/lib/settings-schema.js');
  ok(RETIRED.every((k) => !(k in zh) && !(k in ja) && !all.includes(k)), 'the floor rule\'s row caveats are gone from the code, Settings and both dictionaries (lane D (a))', RETIRED.filter((k) => k in zh || k in ja || all.includes(k)));
}

console.log('§6 the route refuses a bad default before any machine is asked; the hub hands a good one over inside the op body');
{
  const express = require('express');
  const drive = async (R) => {
    const seen = [];
    const kStub = { list: async () => ({ apps: [] }), launch: async (b, o) => { seen.push([b, o]); return { id: 'da-x' }; }, facts: () => Promise.resolve() };
    R.setup({ keeper: kStub, access: null, vnc: {} });
    const appx = express(); appx.use(express.json()); appx.use(R.router);
    const srv = await new Promise((r) => { const s = appx.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${srv.address().port}`;
    const post = async (b) => { const r = await fetch(base + '/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
    const out = { bad: await post({ appId: 'gnome-calculator', scaleChoice: 7, host: 'dev-a' }), badLocal: await post({ appId: 'gnome-calculator', scaleChoice: 'huge' }), good: await post({ appId: 'gnome-calculator', scaleChoice: 1.5, host: 'dev-a' }), seen };
    srv.close();
    return out;
  };
  const r = await drive(require('../src/routes/desktop-apps.js'));
  ok(r.bad.status === 400 && r.bad.body.code === 'bad-request' && /scaleChoice must be one of/.test(r.bad.body.error) && r.badLocal.status === 400 && !r.seen.some(([b]) => b.scaleChoice === 7 || b.scaleChoice === 'huge'), 'a bad scaleChoice ⇒ 400 bad-request by name, for this machine AND a paired one — the keeper (and so the device) never asked', { bad: r.bad, badLocal: r.badLocal });
  const g = r.seen.find(([b]) => b.scaleChoice === 1.5);
  ok(r.good.status === 200 && !!g && same(g[0], { appId: 'gnome-calculator', scaleChoice: 1.5 }) && g[1] && g[1].host === 'dev-a', 'a good one rides the body unchanged to keeper.launch (host apart, as ever)', g);
  // CONTROL — the route without its check: a paired machine whose agent predates the field would silently drop the value
  const rsrc = read('src/routes/desktop-apps.js');
  const lines = "  const sv = scaleChoiceVerdict(req.body);\n  if (!sv.ok) return fail(res, { code: sv.code, message: sv.error });\n";
  ok(rsrc.split(lines).length === 2, 'CONTROL: the route\'s check is spelled exactly once');
  const rc = await drive(MUT.load('src/routes/desktop-apps.js', rsrc.replace(lines, ''), 'no-check'));
  ok(rc.bad.status === 200 && rc.seen.some(([b, o]) => b.scaleChoice === 7 && o && o.host === 'dev-a'), 'CONTROL: without it the bad value reaches keeper.launch for dev-a (a device\'s own check is the only one left — an old one has none)', rc.bad);
  // the hub keeper hands the body to a paired machine INSIDE the op's `body` — the op's shape is unchanged apart from it
  const Kp = require('../src/server/desktop-app-keeper.js');
  const Dd = require('../src/desktop-display.js');
  const root = scratch('dapp-scale-k'); fs.mkdirSync(root, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { } });
  const calls = [];
  const fakeDisplay = { ...Dd, hostFacts: async () => ({ hostId: 'local', bins: {}, xpra: null }), binOnPath: () => null };
  const quiet = { log() { }, warn() { }, error() { } };
  const k = Kp.create({ dataDir: root, env: () => ({ PATH: '/usr/bin:/bin', HOME: root }), broadcast: () => { }, serverSetting: () => undefined, display: fakeDisplay, log: quiet, serverNotice: () => 1,
    access: () => ({ call: async (hostId, op, p) => { calls.push({ hostId, op, p }); if (op === 'launch') return { ok: true, app: { id: 'da-dev1', label: 'Calc', state: 'launching', startedAt: 1, backend: 'xpra', stream: 'xpra', scale: 1.5, scaleOrigin: 'app', pids: {}, starts: {}, hostId: 'local' } }; return { ok: true, apps: [] }; } }), hostLabel: (h) => h, remoteHosts: () => ['dev-a'] });
  try {
    const rec = await k.launch({ appId: 'gnome-calculator', scaleChoice: 1.5 }, { host: 'dev-a' });
    const lc = calls.find((c) => c.op === 'launch');
    ok(!!lc && lc.hostId === 'dev-a' && same(Object.keys(lc.p).sort(), ['body', 'settings']) && same(lc.p.body, { appId: 'gnome-calculator', scaleChoice: 1.5 }), 'the `launch` op to a paired machine = {body, settings} as before — `scaleChoice` rides INSIDE body, never as the op\'s own scaleChoice (that one is a relaunch\'s pick, origin chosen)', lc && lc.p);
    ok(rec && rec.hostId === 'dev-a' && rec.scaleOrigin === 'app', 'the device\'s answer (origin app) comes back as the hub\'s record', rec);
  } finally { k.shutdown(); }
}

console.log('§7 wiring pins');
{
  const serve = read('src/desktop-serve.js'), launcher = read('src/lib/desktop-app-launcher.js'), win = read('src/lib/desktop-app-window.js'), prefs = read('src/lib/desktop-app-prefs.js'), css = read('public/style.css');
  ok(/const pick = M\.scalePick\(\{ choice: opts\.scaleChoice, appDefault: v\.launch\.scaleChoice, setting: serverSetting\('desktop\.appScale'\), dpr: v\.launch\.dpr, uiScale: v\.launch\.uiScale \}\);/.test(serve), 'WIRING PIN: the machine picks the scale ONCE — a relaunch\'s choice, the body\'s app default, the setting, the launching client\'s dpr × uiScale');
  ok(/const scaleChoice = launchScaleChoice\(appPrefs\(SCALE_PREF_KEY\), payload\);/.test(launcher) && /\.\.\.\(scaleChoice != null \? \{ scaleChoice \} : \{\}\)/.test(launcher), 'WIRING PIN: every launch POST (a card, a Recent row, a typed command) carries its app\'s stored default as scaleChoice — nothing when none');
  const ctl = launcher.slice(launcher.indexOf('const cardScaleControl = (row) => {'), launcher.indexOf('return c;\n  };', launcher.indexOf('const cardScaleControl = (row) => {')));
  ok(ctl.length > 200 && /c\.type = 'button'/.test(ctl) && /saveAppPrefs\(SCALE_PREF_KEY, \(map\) => setScaleChoice\(map, key, m\.choice\)/.test(ctl) && !/launch\(/.test(ctl) && /e\.stopPropagation\(\)/.test(ctl) && /document\.addEventListener\('keydown', onEsc, true\)/.test(ctl) && /ev\.stopPropagation\(\); ev\.preventDefault\(\); pop\.remove\(\);/.test(ctl), 'WIRING PIN: the card control is its own BUTTON whose menu stores the choice through the shared loader and never launches; Esc (a capture listener) closes the menu, never the dialog');
  ok(/wrap\.className = 'desktop-launch-card-wrap';\s*wrap\.appendChild\(b\);\s*if \(scales\) wrap\.appendChild\(cardScaleControl\(row\)\);/.test(launcher) && /const scales = !dead && data\?\.availability\?\.stream === 'xpra';/.test(launcher), 'WIRING PIN: the control is a SIBLING of the card button (never nested in it), on a rung that scales apps only');
  ok(/scaleChip\.setAttribute\('role', 'button'\); scaleChip\.tabIndex = 0;/.test(win) && /e\.key === 'Enter' \|\| e\.key === ' '/.test(win) && /showContextMenu\(r\.left, r\.bottom \+ 2, scaleItems\(\)\)/.test(win) && /scaleChip\.removeAttribute\('role'\)/.test(win), 'WIRING PIN: the chip is role=button + tabindex + Enter / Space while the window can relaunch, and opens the SAME scaleItems() the ⋯ and the window menu show; plain otherwise');
  ok(/const tail = appDefaultItems\(appDefaultModel\(rec, appPrefs\(SCALE_PREF_KEY\)\)/.test(win) && /appDefault: scaleChoiceOf\(appPrefs\(SCALE_PREF_KEY\), frameKey\(\)\)/.test(win), 'WIRING PIN: Scale ▸ (chip, ⋯, window menu — one function) ends with the app-default rows and marks the default row');
  const lib = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js'));
  const codeOf = (f) => read(`src/lib/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // comments out (a comment naming the key is not a writer)
  // a payload naming either map outside the loader would be a second writer (a second cache that drifts)
  const payloads = lib.filter((f) => /\{\s*(?:desktopAppFrame|desktopAppScale|\[SCALE_PREF_KEY\])\s*:/.test(codeOf(f)));
  const savers = lib.filter((f) => /saveAppPrefs\(/.test(codeOf(f)) && f !== 'desktop-app-prefs.js');
  ok(payloads.length === 0 && /method: 'PATCH', headers: \{ 'Content-Type': 'application\/json' \}, body: JSON\.stringify\(\{ \[key\]: next \}\)/.test(prefs) && /APP_PREF_KEYS = Object\.freeze\(\['desktopAppFrame', 'desktopAppScale'\]\)/.test(prefs) && same(savers.sort(), ['desktop-app-launcher.js', 'desktop-app-window.js']), `ONE loader writes both per-app maps (desktop-app-prefs.js, merge-only PATCH of its one key) — the window and the dialog save through it (${savers.join(', ')}); no other file builds a payload for either map`, { payloads, savers });
  // lane D verify: every save is an EDIT of one app's entry (the loader applies it to the server's current map) — a caller
  // that hands the loader a whole map built from its own copy is the stale-map clobber again
  const calls = savers.flatMap((f) => (codeOf(f).match(/saveAppPrefs\([^\n]*/g) || []).map((c) => [f, c]));
  const bad = calls.filter(([, c]) => !/^saveAppPrefs\((?:SCALE_PREF_KEY|'desktopAppFrame'), \(map\) => set(?:Scale|Frame)Choice\(map, /.test(c));
  ok(calls.length === 3 && bad.length === 0, `every saveAppPrefs call (${calls.length}) passes an EDIT \`(map) => setXChoice(map, key, …)\`, never a whole map`, bad);
  ok(/\.desktop-app-chip-scale\.is-control \{ cursor: pointer; \}/.test(css) && /\.desktop-launch-card-wrap \{ display: flex; min-width: 0; \}/.test(css) && !/#[0-9a-f]{3,6}\b/i.test(css.slice(css.indexOf('.desktop-launch-card-wrap'), css.indexOf('.desktop-launch-card-scale:focus-visible'))), 'CSS: the control chip has a pointer, the card + its control are one split button, theme vars only');
}

console.log('§8 the per-app loader over a fake socket — a reconnect re-reads, a save edits ONE entry of the server\'s map, a refusal rolls back');
{
  const PREFS = 'src/lib/desktop-app-prefs.js';
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };
  // ONE fake server: GET = the whole user state; PATCH = the top-level merge src/routes/persistence.js does ({...cur,
  // ...data}) + the full-state broadcast to every CONNECTED socket (a socket that is down never hears it)
  const world = () => {
    let state = { stateVersion: 2, starredSessions: [] };
    const socks = [];
    const bcast = () => { for (const c of socks) { if (!c.up) continue; if (c.dropNext) { c.dropNext = false; continue; } for (const h of [...c.globals]) h({ type: 'user-state-updated', state: clone(state) }); } };
    const page = (mod) => {
      const c = { up: true, dropNext: false, refuse: null, globals: [], states: [], toasts: [], patches: 0 };
      socks.push(c);
      c.ws = { onGlobal: (h) => { c.globals.push(h); return () => { }; }, onStateChange: (h) => { c.states.push(h); } };
      c.down = () => { c.up = false; for (const h of c.states) h(false); };
      c.reopen = () => { c.up = true; for (const h of c.states) h(true); };
      const fetchJson = async (url, opts) => {
        await settle(1);
        if (url !== '/api/user-state') return null;
        if (!opts || !opts.method) return clone(state);
        if (opts.method !== 'PATCH') return { error: 'unexpected ' + opts.method };
        c.patches++;
        if (c.refuse) return { error: c.refuse };
        state = { ...state, ...JSON.parse(opts.body) };
        bcast();
        return { success: true };
      };
      c.L = mod.createAppPrefs({ fetchJson, toast: (text, o) => c.toasts.push([text, o && o.type]) });
      c.L.wire(c.ws);
      return c;
    };
    return { page, get state() { return state; } };
  };
  const setOf = (key) => (key === 'desktopAppScale' ? (m, app, v) => S.setScaleChoice(m, app, v) : (m, app, v) => SEAM.setFrameChoice(m, app, v));
  const VALS = { desktopAppScale: [2, 1.5, 3, 1], desktopAppFrame: ['on', 'off', 'off', 'on'] };
  const run = async (mod, key) => {
    const set = setOf(key), [v1, v2, v3, v4] = VALS[key];
    const W = world(), A = W.page(mod), B = W.page(mod);
    await settle();
    const out = {};
    // (1) B's socket drops; A stores xterm while B is down; B reconnects (its map must be the server's); B stores the calculator
    B.down();
    out.saveA = await A.L.save(key, (m) => set(m, 'xterm', v1), 'fail');
    out.srv1 = clone(W.state[key]);
    out.bDuring = clone(B.L.prefs(key));
    B.reopen(); await settle();
    out.bAfter = clone(B.L.prefs(key));
    out.saveB = await B.L.save(key, (m) => set(m, 'gnome-calculator', v2), 'fail');
    out.srv2 = clone(W.state[key]);
    await settle();
    out.aAfter = clone(A.L.prefs(key));
    // (2) B MISSES a broadcast with its socket up (the window between a write and a re-read); its save still keeps A's key
    B.dropNext = true;
    await A.L.save(key, (m) => set(m, 'xterm', v3), 'fail');
    out.bStale = clone(B.L.prefs(key));
    await B.L.save(key, (m) => set(m, 'exec:xclock', v2), 'fail');
    out.srv3 = clone(W.state[key]);
    // (3) a refused save: shown at once, rolled back to the server's map, subscribers told twice, ONE toast with the reason
    const before = clone(B.L.prefs(key)), srvBefore = clone(W.state[key]);
    let told = 0; const off = B.L.on(() => { told++; });
    B.refuse = 'disk full';
    const pr = B.L.save(key, (m) => set(m, 'xterm', v4), 'Could not save');
    out.shownAtOnce = clone(B.L.prefs(key));
    out.refused = await pr;
    out.rolledBack = clone(B.L.prefs(key)); out.before = before; out.told = told; out.toasts = B.toasts.slice(); out.srvUnchanged = JSON.stringify(W.state[key]) === JSON.stringify(srvBefore);
    off(); B.refuse = null;
    // (4) two quick saves from one page (not awaited in between) both land
    await Promise.all([A.L.save(key, (m) => set(m, 'exec:xeyes', v1), 'fail'), A.L.save(key, (m) => set(m, 'exec:xlogo', v2), 'fail')]);
    out.srv4 = clone(W.state[key]);
    // (4b) a save that lands as shown tells subscribers ONCE (the local edit) — the echo and the settle re-render nothing
    // (the launch dialog re-focuses its control on that one render; a second one would drop the keyboard)
    let told2 = 0; const off2 = A.L.on(() => { told2++; });
    await A.L.save(key, (m) => set(m, 'exec:xclock', v4), 'fail');
    await settle();
    off2(); out.toldLanded = told2;
    // (5) a whole map is not an edit: refused, nothing sent
    const p0 = A.patches;
    out.wholeMap = await A.L.save(key, { xterm: v1 }, 'fail');
    out.wholeMapSent = A.patches - p0;
    return out;
  };
  const real = await import(pathToFileURL(path.join(repo, PREFS)).href);
  for (const key of ['desktopAppScale', 'desktopAppFrame']) {
    const [v1, v2, v3, v4] = VALS[key];
    const o = await run(real, key);
    ok(o.saveA && same(o.srv1, { xterm: v1 }) && same(o.bDuring, {}), `${key} (1): A stores xterm ${JSON.stringify(v1)} while B's socket is down — the server holds ${JSON.stringify(o.srv1)}, B has not heard it (${JSON.stringify(o.bDuring)})`, o);
    ok(same(o.bAfter, o.srv1), `${key} (1): after B's reopen its map IS the server's (${JSON.stringify(o.bAfter)}) — a reconnect re-reads`, { bAfter: o.bAfter, srv1: o.srv1 });
    ok(o.saveB && same(o.srv2, { xterm: v1, 'gnome-calculator': v2 }) && same(o.aAfter, o.srv2), `${key} (1): B's save after the reopen KEEPS A's key (server ${JSON.stringify(o.srv2)}; A hears it: ${JSON.stringify(o.aAfter)})`, { srv2: o.srv2, aAfter: o.aAfter });
    ok(o.bStale.xterm === v1 && same(o.srv3, { xterm: v3, 'gnome-calculator': v2, 'exec:xclock': v2 }), `${key} (2): B MISSED A's xterm ${JSON.stringify(v3)} (B still reads ${JSON.stringify(o.bStale.xterm)}) and its save still keeps it — the edit is applied to the server's map read now (${JSON.stringify(o.srv3)})`, { bStale: o.bStale, srv3: o.srv3 });
    ok(o.shownAtOnce.xterm === v4 && o.refused === false && same(o.rolledBack, o.before) && o.told === 2 && o.srvUnchanged && o.toasts.length === 1 && o.toasts[0][0] === 'Could not save: disk full' && o.toasts[0][1] === 'error', `${key} (3): a refused save is shown at once (xterm ${JSON.stringify(o.shownAtOnce.xterm)}), then ROLLED BACK to ${JSON.stringify(o.rolledBack)} — subscribers told ${o.told}×, one toast "${o.toasts[0] && o.toasts[0][0]}", the server untouched`, { shown: o.shownAtOnce, rolled: o.rolledBack, before: o.before, told: o.told, toasts: o.toasts });
    ok(o.srv4['exec:xeyes'] === v1 && o.srv4['exec:xlogo'] === v2 && o.srv4.xterm === v3, `${key} (4): two quick saves from one page both land (${JSON.stringify(o.srv4)})`, o.srv4);
    ok(o.toldLanded === 1, `${key} (4b): a save that lands as shown tells subscribers once (${o.toldLanded}) — the settle and the echo re-render nothing`, o.toldLanded);
    ok(o.wholeMap === false && o.wholeMapSent === 0, `${key} (5): a WHOLE map is not an edit — refused, nothing PATCHed`, { wholeMap: o.wholeMap, sent: o.wholeMapSent });
  }
  // CONTROLS — patched copies of the loader (each edit spelled exactly once in the product)
  const psrc = read(PREFS);
  const RECONNECT = "    ws.onStateChange?.((connected) => { if (connected) refetch(); }); // a broadcast sent while the socket was down never arrives\n";
  const FRESH = "const st = await fj('/api/user-state'); // the map the server holds NOW — this page's copy may have missed a broadcast";
  const SETTLE = "pending[key].splice(pending[key].indexOf(entry), 1); // settled either way: a refused edit leaves the view (the rollback)";
  ok(psrc.split(RECONNECT).length === 2 && psrc.split(FRESH).length === 2 && psrc.split(SETTLE).length === 2, 'CONTROL: the reconnect re-read, the fresh read before a PATCH and the settle-either-way line are each spelled exactly once');
  const loadCopy = async (src, tag) => import(pathToFileURL(MUT.write(PREFS, src, tag)).href);
  const c1 = await run(await loadCopy(psrc.replace(RECONNECT, ''), 'no-reconnect'), 'desktopAppScale');
  ok(!same(c1.bAfter, c1.srv1), `CONTROL: without the reconnect re-read B keeps its stale map after the reopen (${JSON.stringify(c1.bAfter)} vs the server's ${JSON.stringify(c1.srv1)}) — (1)'s re-read is that line's doing`, c1.bAfter);
  const c2 = await run(await loadCopy(psrc.replace(FRESH, 'const st = { [key]: base[key] }; // the OLD save: this page\'s own map'), 'local-map'), 'desktopAppScale');
  ok(c2.srv3 && c2.srv3.xterm !== VALS.desktopAppScale[2], `CONTROL: a save that PATCHes this page's own map loses A's xterm ${VALS.desktopAppScale[2]}× (server ${JSON.stringify(c2.srv3)}) — (2) is the fresh read's doing`, c2.srv3);
  const c3 = await run(await loadCopy(psrc.replace(SETTLE, 'if (done) ' + SETTLE), 'keeps-refused'), 'desktopAppScale');
  ok(!same(c3.rolledBack, c3.before), `CONTROL: a loader that keeps a refused edit still shows xterm ${JSON.stringify(c3.rolledBack.xterm)} after the refusal (${JSON.stringify(c3.rolledBack)}) — (3)'s rollback is the settle line's doing`, c3.rolledBack);
}

console.log('\n§tree the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 6 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
