#!/usr/bin/env node
// A PHONE ROW'S ACTIONS FOLD BEYOND THREE, AND A SUITE JUDGES THE CLI SHAPE IT INJECTS (lane phone-roster-fold — nightly380's
// roster red, B-7671: with claude AND codex on the owner's ~/.local/bin, the Codex row of Manage Agents drew Re-check · Log
// in · Update · Rules & checks — 362 px in the 352 px phone section — while every lane and the runner, whose boxes had no
// CLI, judged «not installed» and passed). FAST, in-process:
//   ① THE VERDICT — PURE src/lib/row-fold-model.js rowActionsFold over hand-computed tables: three that fit stand; four that
//     FIT still fold beyond three (the count); three that do not fit fold by width right-to-left; the primary never folds;
//     the «…» charged once, exactly (the boundary px); a width sweep is monotone. Four patched copies are each RED by name:
//     no count cap (barLayout alone), no width step, a «…» the count opened charged nothing, a primary that folds.
//   ② THE RENDERER'S WIRING — src/lib/manage-agents.js: every status row that holds buttons is handed to foldRowByTier with
//     the tier's reader (r2: the fold follows the CURRENT tier — the Agents form outlives a phone ↔ desktop crossing, so ONE
//     verdict reads app.isMobile on every pass, on the row's width change and on viewport-switch's vs-viewport-class; the
//     desktop tier is the base's inline bar, byte for byte); a button is measured in layout px (rect / uiScale); the «…» is
//     the row's own agent-btn with the dots glyph, named «More actions» (zh + ja), opening ONE context menu (one class + its
//     modifier); the fold's class is bar-fold.js's FOLDED and style.css hides it in a strip; «Rules & checks» opens its menu
//     from the «…» while folded. r3 — A RENDER'S LISTENERS DIE WITH IT: the row's window listener is bound to the signal of
//     the render that drew it and its ResizeObserver is disconnected by that abort; the surface owns ONE controller (its end:
//     the form's onClose, the rail panel's dispose) and each render its own, aborted by the next render before it draws. THE
//     LEAK PROBE runs foldRowByTier's own text over a stub page whose rows never get a resize callback (a display:none
//     surface): five renders stay flat, the end ⇒ 0; r2's teardown inside layout() is the planted control, RED by name.
//   ③ THE CLI-PRESENCE CENSUS (the twin-sets law; r2: its universe is DERIVED FROM THE PRODUCT, never a selector's spelling):
//     THE DOORS — every call of the Agents renderer (_showAgentsDialog) in src/ is a door, named here with the names a suite
//     reaches it by (each must stand in the product's text); a call the table does not name reds the census. THE SUITES —
//     every suite that boots a hub (test-architecture §57's spawn spelling, or a harness that does) and whose code reaches
//     any door is a row naming its doors, and either INJECTS the CLI shape (its mark is in its text) or says why its verdict
//     cannot depend on it (a Machines-tab-only open is checked line by line; any other «why not» suite reads no CLI row
//     selector). CONTROLS: a new product door, a planted suite with no row (the dialog's and the rail panel's), a row whose
//     doors are not its code's, a «Machines only» suite that opens the Accounts tab, a «why not» suite that reads
//     .agent-actions — each named; the r1 predicate (a selector's spelling) misses the rail / re-login / overview suites, RED
//     by name.
// The chrome legs (both shapes ×2 at 352 and a 320 px section, the «…» menu, the desktop modal, en + zh; r2: a rotation both
// ways on the open dialog, a crossing out of a zoomed desktop, a row the WIDTH folds) are scripts/test-roster-reset-eta.mjs
// §3 + §6.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.basename(fileURLToPath(import.meta.url));
const MUT = mutantCopies('roster-row-fold', repo);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── ① the verdict ──
console.log('① rowActionsFold — beyond three a phone row folds; three that do not fit fold too');
const MODEL = 'src/lib/row-fold-model.js', MODEL_SRC = read(MODEL);
const RF = await import('../' + MODEL);
ok(RF.ROW_INLINE_MAX === 3, `at most THREE buttons stand inline (ROW_INLINE_MAX = ${RF.ROW_INLINE_MAX})`);
// Re-check 76 · Log in 56 (primary) · Update 64 · Rules & checks 109 — gap 6, «…» 34 (the default font's widths, rounded)
const R = { key: 'recheck', px: 76 }, L = { key: 'login', px: 56, primary: true }, U = { key: 'update', px: 64 }, C = { key: 'rules', px: 109 };
const judge = (M) => {
  const bad = [];
  const T = (name, args, want) => { const v = M.rowActionsFold({ gapPx: 6, moreW: 34, ...args }); const got = { shown: v.shown, folded: v.folded, fits: v.fits }; const { need, ...w } = want; if (!same(got, w) || (need !== undefined && v.need !== need)) bad.push(`${name}: got ${JSON.stringify({ ...got, need: v.need })}, want ${JSON.stringify(want)}`); };
  T('three that fit stand — nothing folds, no «…» charged', { items: [R, L, U], widthPx: 300 }, { shown: ['recheck', 'login', 'update'], folded: [], fits: true, need: 208 });
  T('four that FIT still fold beyond three (THE COUNT): the last non-primary goes, the «…» charged its width + one gap', { items: [R, L, U, C], widthPx: 400 }, { shown: ['recheck', 'login', 'update'], folded: ['rules'], fits: true, need: 248 });
  T('the measured nightly shape (the wide font\'s widths, a 322 px row): three inline + «…»', { items: [{ key: 'recheck', px: 84 }, { key: 'login', px: 60, primary: true }, { key: 'update', px: 68 }, { key: 'rules', px: 117 }], widthPx: 322, moreW: 36 }, { shown: ['recheck', 'login', 'update'], folded: ['rules'], fits: true, need: 266 });
  T('three that do NOT fit fold by WIDTH, right-to-left — the primary stays', { items: [R, L, U], widthPx: 200 }, { shown: ['recheck', 'login'], folded: ['update'], fits: true, need: 178 });
  T('count AND width: four in a narrow row — the count takes Rules & checks, the width takes Update', { items: [R, L, U, C], widthPx: 230 }, { shown: ['recheck', 'login'], folded: ['update', 'rules'], fits: true, need: 178 });
  T('the boundary is exact: a row exactly as wide as three + «…» keeps three', { items: [R, L, U, C], widthPx: 248 }, { shown: ['recheck', 'login', 'update'], folded: ['rules'], fits: true, need: 248 });
  T('…one px narrower folds the next (right-to-left)', { items: [R, L, U, C], widthPx: 247 }, { shown: ['recheck', 'login'], folded: ['update', 'rules'], fits: true, need: 178 });
  T('the primary never folds — even as the rightmost button the count takes the last NON-primary', { items: [R, U, C, L], widthPx: 400 }, { shown: ['recheck', 'update', 'login'], folded: ['rules'], fits: true, need: 248 });
  T('an absent button (px 0 — hidden) is neither shown, folded nor counted', { items: [R, L, U, { key: 'rules', px: 0 }], widthPx: 400 }, { shown: ['recheck', 'login', 'update'], folded: [], fits: true, need: 208 });
  T('a row narrower than the primary + «…»: every foldable button folds and the verdict says it does not fit', { items: [R, L, U, C], widthPx: 60 }, { shown: ['login'], folded: ['recheck', 'update', 'rules'], fits: false, need: 96 });
  // the sweep: a wider row never folds more; at most three stand; a verdict that fits occupies no more than the row
  let prev = Infinity, sweepBad = null;
  for (let w = 0; w <= 500 && !sweepBad; w++) {
    const v = M.rowActionsFold({ items: [R, L, U, C], widthPx: w, gapPx: 6, moreW: 34 });
    if (v.folded.length > prev) sweepBad = `at ${w} px ${v.folded.length} folded after ${prev}`;
    else if (v.shown.length > 3) sweepBad = `at ${w} px ${v.shown.length} stand inline`;
    else if (v.fits && v.need > w) sweepBad = `at ${w} px need ${v.need} > the row`;
    prev = v.folded.length;
  }
  if (sweepBad) bad.push('the width sweep: ' + sweepBad);
  return bad;
};
{ const bad = judge(RF); ok(bad.length === 0, `rowActionsFold matches every hand-computed table and the 0–500 px sweep (${bad.length} wrong)`, bad); }
const MUTANTS = [
  ['no count cap (barLayout alone — the base\'s rule for a bar)', 'order.slice(0, Math.max(0, list.length - cap))', 'order.slice(0, 0)'],
  ['no width step (the count alone)', 'barLayout({ widthPx: width,', 'barLayout({ widthPx: 1e9,'],
  ['a «…» the count opened is charged nothing', "items: byCount.size ? [...kept, { key: OPENED, px: width + 1, priority: Number.MAX_SAFE_INTEGER }] : kept", 'items: kept'],
  ['the primary folds like any other button', 'priority: it.primary ? 0 : 1', 'priority: 1'],
];
for (const [name, from, to] of MUTANTS) {
  if (!MODEL_SRC.includes(from)) { ok(false, `CONTROL (${name}): the patch site is gone from ${MODEL}`, from); continue; }
  const f = MUT.write(MODEL, MODEL_SRC.replace(from, to), 'm');
  const bad = judge(await import(pathToFileURL(f).href));
  ok(bad.length > 0, `CONTROL: ${name} — RED by name (${bad.length} wrong: ${bad.map((b) => b.split(':')[0]).join(' | ').slice(0, 300)})`);
}

// ── ② the renderer's wiring ──
console.log('② manage-agents.js — the fold follows the CURRENT tier: a phone row folds, a desktop row is the base\'s');
const MA = read('src/lib/manage-agents.js'), CSS = read('public/style.css'), VS = read('src/lib/viewport-switch.js');
const fn = (() => { const i = MA.indexOf('function foldRowByTier('); if (i < 0) return ''; const j = MA.indexOf('\n}\n', i); return MA.slice(i, j + 2); })();
const sites = (MA.match(/actions\.className = 'agent-actions'/g) || []).length;
const calls = [...MA.matchAll(/^.*\bfoldRowByTier\(.*$/gm)].map((m) => m[0].trim()).filter((l) => !l.startsWith('function foldRowByTier('));
ok(sites === 3 && calls.length === 3 && calls.every((l) => l.startsWith('foldRowByTier(row, actions, () => this.isMobile, renderCtl.signal);')) && !/\bfoldPhoneRow\b/.test(MA), `every status row that holds buttons is handed to the fold WITH THE TIER'S READER (never decided once at render) and THE SIGNAL OF THE RENDER THAT DREW IT — ${calls.length} calls for ${sites} strips (the dial row's strip holds a note, no button, and shares its strip with the remote row)`, calls);
ok(/const phone = !!isPhone\(\);\n    if \(phone !== tier\) \{ tier = phone; px = new WeakMap\(\); lastW = -1; if \(more\) \{ more\.remove\(\); more = null; \} \}\n    if \(!phone\) \{ for \(const b of actions\.querySelectorAll\(':scope > \.' \+ FOLDED\)\) b\.classList\.remove\(FOLDED\); return; \}/.test(fn),
  'ONE verdict reads the tier on EVERY pass: a tier change forgets the widths measured on the other side; the desktop tier takes every folded class off and the «…» away (the base\'s inline bar, byte for byte)');
ok(/const ro = new ResizeObserver\(\(\) => layout\(\)\);/.test(fn) && /window\.addEventListener\('vs-viewport-class', layout, \{ signal \}\);/.test(fn) && /width === lastW\) return;/.test(fn),
  'the verdict runs on the row\'s WIDTH change (its ResizeObserver) and on the tier\'s signal (vs-viewport-class)');
ok(/^function foldRowByTier\(row, actions, isPhone, signal\) \{\n  if \(signal\.aborted\) return;/.test(fn) && /signal\.addEventListener\('abort', \(\) => ro\.disconnect\(\), \{ once: true \}\);/.test(fn) && !/removeEventListener|\bstop\(|row\.isConnected/.test(fn),
  'A RENDER\'S LISTENERS DIE WITH IT (r3): the window listener is bound to the render\'s signal, the ResizeObserver is disconnected by its abort, a row drawn under a dead signal attaches nothing — and no teardown waits inside layout() for a callback a hidden row never gets');
{ const iRen = MA.indexOf("      if (stale() || surface.signal.aborted) return;\n      renderCtl?.abort(); renderCtl = new AbortController();"), iDraw = MA.indexOf("body.innerHTML = '';", iRen);
  const RAIL = read('src/lib/sidebar-rail.js');
  ok(/const surface = new AbortController\(\);\n    const shell = container \?/.test(MA) && /escapeToClose: true, onClose: \(\) => \{ surface\.abort\(\); onClose\?\.\(\); \}, opener,/.test(MA)
    && /let renderCtl = null;\n    surface\.signal\.addEventListener\('abort', \(\) => renderCtl\?\.abort\(\), \{ once: true \}\);/.test(MA) && iRen > 0 && iDraw > iRen && iDraw - iRen < 400
    && /refresh\(\);\n    if \(container\) return \(\) => surface\.abort\(\);/.test(MA)
    && /else if \(this\._activeTab === 'agents'\) \{ const d = this\.app\._showAgentsDialog\?\.\(\{ container: c \}\); this\._panelDispose = typeof d === 'function' \? d : null; \}/.test(RAIL),
  'THE OWNER: one controller per drawn surface, aborted by its end (every door of the form runs onClose; the rail panel takes the returned dispose as its _panelDispose) — each render holds its own, aborted by the NEXT render right before it draws (a surface that ended draws nothing)', { iRen, iDraw }); }
// THE LEAK PROBE (r3): foldRowByTier's own text over a stub page — a window that honours { signal }, observers that count
// what they watch, rows that NEVER get a resize callback (a display:none surface: 0×0 → 0×0). Five renders, each aborting
// the last before it draws four rows, then the surface's end, then a row drawn under a dead signal
const leakProbe = (src) => {
  const live = new Set(), obs = new Set();
  const win = {
    addEventListener(type, f, o) { if (o?.signal?.aborted) return; const e = { type, f }; live.add(e); o?.signal?.addEventListener('abort', () => live.delete(e), { once: true }); },
    removeEventListener(type, f) { for (const e of live) if (e.type === type && e.f === f) live.delete(e); },
  };
  class RO { observe() { obs.add(this); } unobserve() { obs.delete(this); } disconnect() { obs.delete(this); } }
  const fold = new Function('window', 'ResizeObserver', 'uiScale', `${src}\nreturn foldRowByTier;`)(win, RO, () => 1);
  const at = () => live.size + '+' + obs.size, counts = [];
  let ctl = null;
  for (let k = 0; k < 5; k++) { ctl?.abort(); ctl = new AbortController(); for (let i = 0; i < 4; i++) fold({ isConnected: true }, { children: [] }, () => false, ctl.signal); counts.push(at()); }
  ctl.abort(); counts.push(at());
  const dead = new AbortController(); dead.abort(); fold({ isConnected: true }, { children: [] }, () => false, dead.signal); counts.push(at());
  return counts;
};
{ let got = null; try { got = leakProbe(fn); } catch (e) { got = 'threw: ' + e.message; }
  ok(same(got, ['4+4', '4+4', '4+4', '4+4', '4+4', '0+0', '0+0']), `THE LEAK PROBE: a hidden surface re-rendered five times keeps its four rows' listeners + observers FLAT (${Array.isArray(got) ? got.slice(0, 5).join(' → ') : got}), its end ⇒ ${Array.isArray(got) ? got[5] : '?'}, a row drawn under a dead signal attaches nothing`, got);
  // CONTROL — r2's teardown (inside layout(), on a resize callback or a tier signal a hidden row never gets): RED by name
  const R2 = [["  if (signal.aborted) return;\n", ''], ["  const layout = () => {\n", "  const layout = () => {\n    if (!row.isConnected) { stop(); return; }\n"],
    ["window.addEventListener('vs-viewport-class', layout, { signal });", "window.addEventListener('vs-viewport-class', layout);"],
    ["signal.addEventListener('abort', () => ro.disconnect(), { once: true });", "const stop = () => { ro.disconnect(); window.removeEventListener('vs-viewport-class', layout); };"]];
  const gone = R2.filter(([a]) => !fn.includes(a));
  let bad = null; if (!gone.length) { try { bad = leakProbe(R2.reduce((x, [a, b]) => x.replace(a, b), fn)); } catch (e) { bad = 'threw: ' + e.message; } }
  ok(!gone.length && Array.isArray(bad) && bad[4] === '20+20' && bad[5] === '20+20', `CONTROL (r2's teardown inside layout()): the probe is RED by name — ${Array.isArray(bad) ? bad.join(' → ') : bad || 'patch site gone: ' + gone.map(([a]) => a.trim()).join(' | ')} (every render left its rows' listeners behind; the end freed none)`); }
{ const iMob = VS.indexOf('app.isMobile = isPhoneClass(next);'), iTier = VS.indexOf('(v.phone ? enterPhone : enterDesktop)(app);'), iSig = VS.indexOf("window.dispatchEvent(new CustomEvent('vs-viewport-class'");
  ok(iMob > 0 && iTier > iMob && iSig > iTier, 'viewport-switch signals vs-viewport-class AFTER app.isMobile is the new tier and the forms are re-hosted (the verdict reads the tier it signals, on the host it lands in)', { iMob, iTier, iSig }); }
ok(/const layoutPx = \(el\) => el\.getBoundingClientRect\(\)\.width \/ \(uiScale\(\) \|\| 1\);/.test(fn) && /const width = row\.clientWidth - /.test(fn), 'a button is measured in LAYOUT px (its rect ÷ uiScale — the row\'s clientWidth is layout px; a crossing out of a zoomed desktop is measured under the zoom the page still wears)');
ok(/import \{ rowActionsFold \} from '\.\/row-fold-model\.js'/.test(MA) && /rowActionsFold\(\{ items: btns\.map/.test(fn), 'the fold decides through the PURE rowActionsFold, over the buttons the row actually holds');
ok(/showContextMenu\(r\.left, r\.bottom \+ 4, items, 'context-menu', \{ extraClass: 'row-more-menu' \}\)/.test(fn), 'the «…» opens ONE context menu — one class name, its modifier as extraClass (Esc closes it: the global [data-popover] door)');
ok(/more\.innerHTML = UI_ICONS\.more;/.test(fn) && /t\('More actions'\)/.test(fn) && /aria-haspopup', 'menu'/.test(fn) && /'agent-btn ' \+ ROW_MORE/.test(fn), 'the «…» is the row\'s own agent-btn wearing the SVG dots glyph, named «More actions», announcing its menu');
{ const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js'); ok(/^\s*"More actions": "[^"]+",/m.test(zh) && /^\s*"More actions": "[^"]+",/m.test(ja), '«More actions» has its zh + ja words'); }
ok(/label: b\.textContent, title: b\.title \|\| '', disabled: b\.disabled, action: \(\) => b\.click\(\)/.test(fn), 'each menu item is a folded button by its own words, its own title and its own click (a disabled button stays disabled)');
{ const BF = read('src/lib/bar-fold.js'); ok(/import \{ FOLDED \} from '\.\/bar-fold\.js'/.test(MA) && /export const FOLDED = 'bar-folded';/.test(BF) && /^\.agent-actions > \.bar-folded \{ display: none !important; \}$/m.test(CSS), 'the fold\'s ONE class is bar-fold.js FOLDED (the chrome bars wear it too); style.css takes a folded button out of the strip'); }
ok(/chkBtn\.onclick = \(\) => \{ const rect = foldAnchor\(chkBtn\)\.getBoundingClientRect\(\);/.test(MA), '«Rules & checks» opens its menu from the «…» while it is folded (a folded button has no box)');
ok(/@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{ \.row-more-menu \.context-menu-item \{ min-height: 44px; font-size: 16px;/.test(CSS), 'on a phone the «…» menu\'s rows are 44 px with 16 px words (the touch scale)');

// ── ③ the CLI-presence census ──
console.log('③ every door into Manage Agents\' CLI rows is named from the product; every suite that boots a hub and reaches one injects the CLI shape — or says why its verdict cannot depend on it');
// test-architecture §57's spelling of «boots a hub»
const SPAWN_HUB = /\b(?:spawn|fork)\(\s*(?:(?:process\.execPath|'node'|"node")\s*,\s*\[[^\]]*?|[A-Za-z_$][\w$.]*\s*,\s*\[[^\]]*?(?:process\.execPath|'node'|"node")\s*,[^\]]*?)(?:['"`]server\.js['"`]|path\.join\([^)]*?['"`]server\.js['"`]\s*\))\s*\]/;
const RENDERER = 'src/lib/manage-agents.js';
// a CALL of the renderer (`x._showAgentsDialog(` / `x._showAgentsDialog?.(`) — its definition (a method at a line's start) is none
const DOOR_CALL = /\.\s*_showAgentsDialog\s*(?:\?\.)?\s*\(/g;
const codeOf = (src) => src.split('\n').filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join('\n'); // a comment line names a door, it never reaches one
// THE DOORS into the rows. `at` — the product file of each call of the renderer (once per call: the doors census counts
// them); `names` — the door's own words in the product's text (each must stand there: a door is reached by what the product
// spells); `reach` — a suite's CODE reaches the door by those names (any one; an inner array = all of them)
const DOORS = {
  renderer: { door: 'the Agents manager itself — the renderer called, or its modal / its own sections and rows read', at: [],
    names: { [RENDERER]: ['_showAgentsDialog({ container', 'agents-dialog-overlay', 'agents-machine-sec', "'ob-backend", 'agent-actions'] },
    reach: [/_showAgentsDialog\s*(?:\?\.)?\s*\(/, /agents-dialog-overlay/, /\.ob-backend\b|agent-actions|ob-backends|agents-machine-sec/] },
  rail: { door: 'the Agents rail panel (the desktop\'s door: the renderer drawn into the panel)', at: ['src/lib/sidebar-rail.js'],
    names: { 'src/lib/sidebar-rail.js': ['_railGo(id)', "item('agents'", 'b.dataset.rail', "'rail-panel-'", "this._activeTab === 'agents'"] },
    reach: [/_railGo\(\s*['"`]agents/, /data-rail=\\?["']agents/, /rail-panel-agents/, [/_railGo\(\s*(?!['"`])/, /['"`]agents['"`]/]] },
  relogin: { door: 'the resume bar\'s 「重新登录」 (openResumeAccountDoor)', at: ['src/lib/session-lifecycle.js'],
    names: { 'src/lib/session-lifecycle.js': ['openResumeAccountDoor(door)'], 'src/lib/resume-account-bar.js': ["button('chat-account-relogin'"] },
    reach: [/chat-account-relogin|openResumeAccountDoor/] },
  billing: { door: 'the billing switcher\'s OFF row «Manage agents…» (an account this session cannot switch to — lane ui-controls-and-bugs: the why and its door on the row)', at: ['src/lib/session-lifecycle.js'],
    names: { 'src/lib/session-lifecycle.js': ["offDoor: { label: t('Manage agents…')", "opener: 'billing'"] }, reach: [/opener: ['"`]billing|context-menu-off-door/] },
  gear: { door: 'the gear menu\'s «Manage agents…»', at: ['src/lib/gear-menu.js'],
    names: { 'src/lib/gear-menu.js': ["t('Manage agents…')", 'gs-menu-item'] },
    reach: [[/Manage agents/, /gs-menu|btn-global-settings|_pressGlobalSettings/]] },
  climissing: { door: 'the «{cli} was not found» dialog\'s «Open Manage agents»', at: ['src/lib/cli-missing-dialog.js'],
    names: { 'src/lib/cli-missing-dialog.js': ["'btn-create cli-missing-manage'"] }, reach: [/cli-missing-manage/] },
  wizard: { door: 'the setup wizard\'s «Accounts & pool…»', at: ['src/lib/setup-flows.js'],
    names: { 'src/lib/setup-flows.js': ["'.ob-accounts'"] }, reach: [/ob-accounts/] },
  usage: { door: 'the usage popup\'s «Full overview»', at: ['src/lib/usage-meter.js'],
    names: { 'src/lib/usage-meter.js': ["'.usage-overview-link'"] }, reach: [/usage-overview-link/] },
  todos: { door: 'a For-you item KEYED «accounts» / «machines» (its jump)', at: ['src/lib/user-todos-actions.js', 'src/lib/user-todos-actions.js'],
    names: { 'src/lib/user-todos-actions.js': ["key === 'accounts'", "key === 'machines'", 'const jump = (key, item'] },
    // the item's KEY (its sessionKey, or the key a seed hands between the id and the item's fields) — an item's origin, a tab, a
    // filter, a check's word are no key
    reach: [[/sessionKey\s*:\s*['"`](?:accounts|machines)['"`]|,\s*['"`](?:accounts|machines)['"`]\s*,\s*\{/, /\.ut-item\b|\bjump\(/]] },
  vault: { door: 'the Vault window\'s Add… → «Account…»', at: ['src/lib/vault-window.js'],
    names: { 'src/lib/vault-window.js': ["t('Account…')", "'vw-add vw-primary'"] }, reach: [[/vw-add\b/, /Account…/]] },
  loginwatch: { door: 'a machine login the watch noticed re-opens the manager', at: [RENDERER],
    names: { [RENDERER]: ['_watchHostLogin(hostId'] }, reach: [/_watchHostLogin|_hostLoginWatch/] },
};
function doorsCensus(prod, doors) {
  const sites = {};
  for (const [f, src] of Object.entries(prod)) { if (!src.includes('_showAgentsDialog')) continue; const n = (codeOf(src).match(DOOR_CALL) || []).length; if (n) sites[f] = n; }
  const named = {};
  for (const d of Object.values(doors)) for (const f of d.at) named[f] = (named[f] || 0) + 1;
  const bad = [];
  for (const [f, n] of Object.entries(sites)) if ((named[f] || 0) !== n) bad.push(`${f}: ${n} call(s) of the Agents renderer, the census names ${named[f] || 0} — ${n > (named[f] || 0) ? 'a NEW door: name it in DOORS with the names a suite reaches it by' : 'a door is gone: drop it'}`);
  for (const f of Object.keys(named)) if (!sites[f]) bad.push(`${f}: the census names ${named[f]} door(s) here and the product no longer calls the renderer from it (stale)`);
  for (const [k, d] of Object.entries(doors)) for (const [f, ws] of Object.entries(d.names)) for (const w of ws) if (!(prod[f] || '').includes(w)) bad.push(`door «${k}»: «${w}» is not in ${f} — a door is reached by the product's own names`);
  return { sites, bad };
}
const READS_ROWS = /\.ob-backend\b|agent-actions|ob-backends/;
const MACHINES_TAB = "localStorage.setItem('vibespace.agentsTab', 'machines')";
const WHY_MACHINES = 'opens the Machines tab only — the local CLI rows are never drawn (checked: every _showAgentsDialog line sets the tab)';
const NO_ROW = 'no verdict reads a CLI row, a button or a width';
const CLI_PRESENCE = {
  'test-roster-reset-eta.mjs': { doors: ['renderer', 'rail'], injects: 'both shapes: a scratch login shell + claude / codex stand-ins minted in its own HOME; §6 re-boots with neither', mark: /SHELL: path\.join\(SHAPE\[shape\], 'login-shell'\)/ },
  'test-roster-badges-chrome.mjs': { doors: ['renderer', 'rail'], injects: 'the INSTALLED shape: a scratch login shell + claude / codex stand-ins minted in its own HOME (hotfix .401 — the owner\'s four rows)', mark: /SHELL: path\.join\(SHAPE, 'login-shell'\)/ },
  'test-cli-missing-chrome.mjs': { doors: ['renderer', 'climissing'], injects: 'a scratch login shell (a codex, no claude) + the hub\'s own PATH (a claude the shell cannot see); CLAUDE_CMD / CODEX_CMD deleted', mark: /SHELL: LOGIN_SH/ },
  'test-dialog-yield-chrome.mjs': { doors: ['renderer'], whyNot: `㉓ counts the Agents manager's roots and reads its refresh hook — ${NO_ROW}` },
  'test-vault-window-chrome.mjs': { doors: ['renderer', 'vault'], whyNot: `reads one API-key account row's ⋯ menu (Show key…) and the Vault's Add… list (Account… among its doors, never pressed) — ${NO_ROW}` },
  'test-exit-access-ui.mjs': { doors: ['renderer'], whyNot: WHY_MACHINES, machinesOnly: true },
  'test-host-stale-dialer-ui.mjs': { doors: ['renderer'], whyNot: WHY_MACHINES, machinesOnly: true },
  'test-pair-dialog-ui.mjs': { doors: ['renderer'], whyNot: WHY_MACHINES, machinesOnly: true },
  'test-sidebar-rail.mjs': { doors: ['rail'], whyNot: `the rail panel: reads that it renders, the roster head's + and the account rows' ⋯ (acct-key-row) — ${NO_ROW}` },
  'test-agents-overview.mjs': { doors: ['renderer', 'rail', 'usage'], whyNot: `the rail panel and the usage popup's Full overview: reads the machine sections, the tabs, the account rows (acct-key-row) and their refresh errors — ${NO_ROW}` },
  'test-resume-account-chrome.mjs': { doors: ['renderer', 'relogin'], whyNot: `the resume bar's 「重新登录」: reads that Manage agents opened (the rail tab or the modal) and the spied re-login of ITS account — ${NO_ROW}` },
  'test-gear-menu.mjs': { doors: ['gear'], whyNot: `reads the gear menu's «Manage agents…» row — its place, its words, the arrow keys over it; never presses it — ${NO_ROW}` },
  'test-inbox-reply-ui.mjs': { doors: ['todos'], whyNot: `seeds For-you items keyed «accounts» (spend / login notices) and reads the For-you rows — ${NO_ROW}` },
  'test-inbox-window-ui.mjs': { doors: ['todos'], whyNot: `seeds For-you items keyed «accounts» (spend notices) and reads the For-you window's rows — ${NO_ROW}` },
  'test-vault-totp-add-chrome.mjs': { doors: ['vault'], whyNot: `reads the Vault's Add… list (Account… among its doors) and picks Two-step code… — never Account… — ${NO_ROW}` },
};
const hitOf = (code, alts) => alts.some((x) => Array.isArray(x) ? x.every((r) => r.test(code)) : x.test(code));
const memo = (fn) => { const m = new Map(); return (src) => { let v = m.get(src); if (v === undefined) { v = fn(src); m.set(src, v); } return v; }; }; // the controls re-judge the same texts
const spawnsHub = memo((src) => SPAWN_HUB.test(src));
const doorsMemo = new Map();
function census(srcs, table, doors, { reach = null } = {}) {
  const names = Object.keys(srcs);
  const harnesses = names.filter((f) => /-harness\.mjs$/.test(f) && spawnsHub(srcs[f]));
  const boots = (f) => spawnsHub(srcs[f]) || harnesses.some((h) => srcs[f].includes(`'./${h}'`));
  if (!doorsMemo.has(doors)) doorsMemo.set(doors, memo((src) => { const code = codeOf(src); return Object.keys(doors).filter((k) => hitOf(code, doors[k].reach)); }));
  const doorsOf = (f) => doorsMemo.get(doors)(srcs[f]);
  const reaches = reach || ((f) => doorsOf(f).length > 0);
  const universe = names.filter((f) => /^test-.*\.mjs$/.test(f) && f !== SELF && boots(f) && reaches(f)).sort();
  const bad = [];
  for (const f of universe) {
    const row = table[f], src = srcs[f], ds = doorsOf(f);
    if (!row) { bad.push(`${f}: boots a hub and reaches the door(s) ${ds.join(' + ') || '?'} — and has no row (inject the CLI shape, or say why not)`); continue; }
    if (JSON.stringify([...(row.doors || [])].sort()) !== JSON.stringify([...ds].sort())) bad.push(`${f}: its row names the door(s) ${(row.doors || []).join(' + ') || 'none'}, its code reaches ${ds.join(' + ') || 'none'}`);
    if (row.injects && !(row.mark && row.mark.test(src))) bad.push(`${f}: says it injects (${row.injects}) and its mark is not in its text`);
    if (row.whyNot && row.machinesOnly) {
      const opens = src.split('\n').filter((l) => /_showAgentsDialog\s*\(/.test(l));
      if (!opens.length || opens.some((l) => !l.includes(MACHINES_TAB))) bad.push(`${f}: «Machines only» — and an open draws another tab: ${opens.find((l) => !l.includes(MACHINES_TAB))?.trim().slice(0, 140)}`);
      if (ds.some((d) => d !== 'renderer')) bad.push(`${f}: «Machines only» is checked on the renderer's own opens — and it reaches another door (${ds.filter((d) => d !== 'renderer').join(', ')})`);
    }
    if (row.whyNot && !row.machinesOnly && READS_ROWS.test(src)) bad.push(`${f}: says its verdict cannot depend on the CLI shape — and it reads a CLI row selector (${src.match(READS_ROWS)[0]})`);
    if (!row.injects && !row.whyNot) bad.push(`${f}: its row neither injects nor says why not`);
  }
  const stale = Object.keys(table).filter((f) => !universe.includes(f));
  return { universe, harnesses, bad, stale, doorsOf };
}
// the doors, from the product
const SRC = path.join(repo, 'src');
const prod = Object.fromEntries(fs.readdirSync(SRC, { recursive: true }).filter((f) => /\.js$/.test(f)).map((f) => ['src/' + f.split(path.sep).join('/'), fs.readFileSync(path.join(SRC, f), 'utf8')]));
const dc = doorsCensus(prod, DOORS);
console.log(`  · the doors (${Object.values(dc.sites).reduce((x, y) => x + y, 0)} calls of the renderer in ${Object.keys(dc.sites).length} of ${Object.keys(prod).length} product files):`);
for (const [k, d] of Object.entries(DOORS)) console.log(`      ${k} — ${d.door}${d.at.length ? ' (' + [...new Set(d.at)].join(', ') + ')' : ''}`);
ok(dc.bad.length === 0 && Object.keys(dc.sites).length >= 8, `every call of the Agents renderer in src/ is a named door, each door's names stand in the product's text (${dc.bad.length} wrong)`, dc.bad.length ? dc.bad : dc.sites);
{
  const planted = doorsCensus({ ...prod, 'src/lib/zz-planted.js': "export function zz(app) { document.querySelector('.zz').onclick = () => app._showAgentsDialog?.(); }\n" }, DOORS);
  const twice = doorsCensus({ ...prod, 'src/lib/gear-menu.js': prod['src/lib/gear-menu.js'] + "\nexport const zz = (c) => c.app._showAgentsDialog();\n" }, DOORS);
  const comment = doorsCensus({ ...prod, 'src/lib/zz-planted.js': '// app._showAgentsDialog() — a comment names a door, it never opens one\n' }, DOORS);
  ok(planted.bad.some((b) => b.startsWith('src/lib/zz-planted.js: 1 call(s) of the Agents renderer, the census names 0 — a NEW door')) && twice.bad.some((b) => b.startsWith('src/lib/gear-menu.js: 2 call(s)')) && comment.bad.length === 0,
    'CONTROL: a new product door (a planted file) and a second call in a named door\'s file are each named; a comment that names the renderer is no door', { planted: planted.bad.slice(-1), twice: twice.bad.slice(-1), comment: comment.bad });
}
// the suites that reach a door
const SCRIPTS = path.join(repo, 'scripts');
const srcs = Object.fromEntries(fs.readdirSync(SCRIPTS).filter((f) => /^test-.*\.mjs$/.test(f) || /-harness\.mjs$/.test(f)).map((f) => [f, fs.readFileSync(path.join(SCRIPTS, f), 'utf8')]));
const c = census(srcs, CLI_PRESENCE, DOORS);
console.log(`  · the suites (${c.universe.length} boot a hub and reach a door; harnesses that boot a hub: ${c.harnesses.join(', ') || 'none'}):`);
for (const f of c.universe) { const r = CLI_PRESENCE[f]; console.log(`      ${f} [${c.doorsOf(f).join(' + ')}] — ${r ? (r.injects ? 'INJECTS: ' + r.injects : 'WHY NOT: ' + r.whyNot) : 'NO ROW'}`); }
ok(c.universe.length >= 12 && ['test-roster-reset-eta.mjs', 'test-exit-access-ui.mjs'].every((f) => c.universe.includes(f)), `the census scope is non-vacuous (${c.universe.length} suites — a harness's boot counts for the suites that import it)`, c.universe);
{ const want = { 'test-sidebar-rail.mjs': ['rail'], 'test-agents-overview.mjs': ['renderer', 'rail', 'usage'], 'test-resume-account-chrome.mjs': ['renderer', 'relogin'] };
  const got = Object.fromEntries(Object.keys(want).map((f) => [f, c.universe.includes(f) ? c.doorsOf(f) : null]));
  ok(Object.entries(want).every(([f, ds]) => JSON.stringify(got[f]) === JSON.stringify(ds) && !!CLI_PRESENCE[f]), 'the suites a selector\'s spelling missed are rows by their doors: test-sidebar-rail (the rail panel), test-agents-overview (the rail panel + the usage popup\'s Full overview), test-resume-account-chrome (the resume bar\'s 「重新登录」)', got); }
ok(c.bad.length === 0, `every suite that reaches a door names its doors and injects the shape or says why not, each claim checked (${c.bad.length} wrong)`, c.bad);
ok(c.stale.length === 0, `no row names a suite outside the census (${c.stale.length} stale)`, c.stale);
{
  const boot = "const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env } });\n";
  const planted = census({ ...srcs, 'test-zz-planted.mjs': boot + "await evalJs(`app._showAgentsDialog(); document.querySelector('.ob-backend .agent-actions')`);\n" }, CLI_PRESENCE, DOORS);
  const railOnly = census({ ...srcs, 'test-zz-planted.mjs': boot + "await evalJs(`app.sidebar._railGo('agents'); document.querySelector('.rail-panel').scrollWidth`);\n" }, CLI_PRESENCE, DOORS);
  const wrongDoors = census({ ...srcs, 'test-zz-planted.mjs': boot + "await evalJs(`app.sidebar._railGo('agents')`);\n" }, { ...CLI_PRESENCE, 'test-zz-planted.mjs': { doors: ['renderer'], whyNot: 'reads nothing about the CLI' } }, DOORS);
  const tabbed = census({ ...srcs, 'test-zz-planted.mjs': boot + "await evalJs(`localStorage.setItem('vibespace.agentsTab', 'machines'); app._showAgentsDialog()`);\nawait evalJs(`app._showAgentsDialog()`);\n" }, { ...CLI_PRESENCE, 'test-zz-planted.mjs': { doors: ['renderer'], whyNot: WHY_MACHINES, machinesOnly: true } }, DOORS);
  const reads = census({ ...srcs, 'test-zz-planted.mjs': boot + "await evalJs(`app._showAgentsDialog(); document.querySelectorAll('.agent-actions button').length`);\n" }, { ...CLI_PRESENCE, 'test-zz-planted.mjs': { doors: ['renderer'], whyNot: 'reads nothing about the CLI' } }, DOORS);
  const pick = (r, re) => r.bad.some((b) => re.test(b));
  ok(pick(planted, /^test-zz-planted\.mjs: boots a hub and reaches the door\(s\) renderer — and has no row/) && pick(railOnly, /^test-zz-planted\.mjs: boots a hub and reaches the door\(s\) rail — and has no row/) && pick(wrongDoors, /^test-zz-planted\.mjs: its row names the door\(s\) renderer, its code reaches rail/) && pick(tabbed, /^test-zz-planted\.mjs: «Machines only» — and an open draws another tab/) && pick(reads, /^test-zz-planted\.mjs: says its verdict cannot depend/),
    'CONTROL: a planted suite with no row (through the dialog, and through the rail panel alone), a row whose doors are not its code\'s, a «Machines only» suite that also opens the Accounts tab and a «why not» suite that reads .agent-actions are each named',
    { planted: planted.bad.slice(-1), railOnly: railOnly.bad.slice(-1), wrongDoors: wrongDoors.bad.slice(-1), tabbed: tabbed.bad.slice(-1), reads: reads.bad.slice(-1) });
  // MUTANT (r1's predicate — a selector's spelling): the rail / re-login / overview suites fall outside it, their rows stale, RED by name
  const R1_DRAWS = /_showAgentsDialog\s*\(|\.ob-backend\b|agent-actions|ob-backends/;
  const r1 = census(srcs, CLI_PRESENCE, DOORS, { reach: (f) => R1_DRAWS.test(srcs[f]) });
  const missed = ['test-sidebar-rail.mjs', 'test-agents-overview.mjs', 'test-resume-account-chrome.mjs'];
  ok(missed.every((f) => r1.stale.includes(f) && !r1.universe.includes(f)), `MUTANT (r1's predicate, a selector's spelling): ${r1.universe.length} suites — ${missed.join(', ')} fall outside it, RED by name (${r1.stale.length} rows stale: ${r1.stale.join(', ')})`, { universe: r1.universe, stale: r1.stale });
}

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 4 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
