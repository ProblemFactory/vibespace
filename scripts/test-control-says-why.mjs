#!/usr/bin/env node
// A CONTROL WORKS, OR IT IS NOT THERE, OR IT SAYS WHY (lane ui-controls-and-bugs, the UI walk of 2026-11-13 — 主开发's GO for
// the page: «fix by rule, not by surface»). Fast tier, PURE (acorn over src/lib; no DOM, no server). Legs land pick by pick:
// pick 2 —
// ① A MENU ROW WORKS, OR IT IS A CAPTION, OR IT SAYS WHY: showContextMenu draws `caption` (words, not a control) and `off`
//    (the why in words on the row, + `offDoor`); a legacy `disabled` row is NOT promoted (its title is often a description,
//    never a reason). No menu-row literal in
//    src/lib carries `disabled: true` (the walk: «— 不提供» rows greyed with the reason in a tooltip, a billing menu with two
//    greyed accounts and no title, a zoom menu whose heading and current choice were greyed ticks); the COMPUTED ones are a
//    frozen ledger that only shrinks
// pick 6 —
// ⑩ A CONTROL SAYS WHAT IT DOES: the sessions filter is a funnel (with a count while it filters), the sort button says its
//    order and opens a menu of the others; the For-you row's buttons are at the theme's contrast and say their word on hover /
//    focus; a phone switcher row has a visible ⋯ (the same menu as its long press); the file explorer's tools say their words
//    and fold through the chrome-bar fold (words, then icons, then ⋯), Upload with its own mark
// pick 5 —
// ⑨ THE SINGLE DEFECTS of pick 5, each pinned where it lives: the process table draws every row the server sent and says
//    «显示 350 / 共 1131 个进程» (no «show all» that showed 350); the System panel's vault / index lines in the language's
//    colon, a vault not set up offers «设置保险库…» (not «查看内容…»); a job row's menu holds the row's own verbs (one table
//    with its buttons); «下载其他版本…» is a button; a console's prerequisites are a checklist under one line; the host
//    set-up's Log fold appears with its first line
// pick 4 —
// ⑦ A MENU IS BOUNDED BY THE SCREEN (主开发's width-sweep rule 4): every context menu is placed by utils.js placeMenu — a
//    module that makes its own `.context-menu` element calls it (the file explorer's builder had a clamp of its own and grew
//    past the screen when its office rows arrived). The boxes themselves: scripts/test-menu-bounds-chrome.mjs (heavy)
// pick 3 —
// ② A BUTTON WORKS, OR IT SAYS WHY WHEN PRESSED: utils.js pressSays(btn, why) — the button stays live, a press while `why()`
//    answers does nothing and says the reason on its own line above the buttons (never a toast, never greyed with the reason
//    in a corner). A radio / switch / ⚙ that cannot be used is NOT DRAWN. A state-derived `x.disabled = <expression>` in
//    src/lib (an in-flight `= true … = false` pair is no state) is a FROZEN LEDGER per file that only shrinks; the walk's
//    sites moved: the group's «创建», the ask card's «提交», the new-profile rows nobody can pick, the cluster radio with no
//    preset of its kind, the voice row's switch before it is connected, the ⚙ of a plugin with no settings
// pick 1 —
// ③ A MENU OPENS: every `showContextMenu(` call in src/lib passes (x, y, items) — the peer card called it (e, items), which
//    threw after preventDefault, so a right-click showed no menu at all
// ④ ONE LATEST RENDER: an async function in src/lib that EMPTIES a container, then awaits, then appends to it draws twice when
//    two calls overlap (the walk: the Ports panel's forwards and input box drawn twice). The Ports panel goes through
//    utils.js latestRender (built off-DOM, the newest build lands, one replaceChildren); the rest are a FROZEN LEDGER that
//    may only shrink — a new site is RED, a site that moved onto latestRender lowers its row
// ⑤ THE SINGLE DEFECTS of pick 1, each pinned: the pool's «All subscriptions» keeps the person's own list and restores it;
//    the auto-continue chip OPENS (the act sits behind a press in its panel); the hex viewer has no «Load more» and a whole
//    file says nothing more
// ⑥ CONTROLS: a planted (e, items) call, a planted clear-await-append render, a latestRender without its generation check —
//    each RED by the same checker
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const acorn = require(path.join(REPO, 'node_modules', 'acorn'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const LIB = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => 'src/lib/' + f);
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
function walk(n, fn) { if (!n || typeof n.type !== 'string') return; fn(n); for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, fn)); else if (v && typeof v.type === 'string') walk(v, fn); } }

// ── ① menu rows: caption / off / live ──
/** object literals that look like a MENU ROW (a label / caption) and carry `disabled` — a picker row (`value`) is not a menu row */
function disabledRows(src, file) {
  const lit = [], comp = [];
  walk(parse(src), (n) => {
    if (n.type !== 'ObjectExpression') return;
    const props = n.properties.filter((p) => p.type === 'Property' && !p.computed);
    const keys = props.map((p) => p.key.name || p.key.value);
    if (!keys.includes('disabled') || keys.includes('value') || !['label', 'labelHtml', 'caption', 'captionHtml'].some((k) => keys.includes(k))) return;
    const d = props.find((p) => (p.key.name || p.key.value) === 'disabled');
    (d.value.type === 'Literal' && d.value.value === true ? lit : comp).push(`${file}:${n.loc.start.line}`);
  });
  return { lit, comp };
}
// THE FROZEN LEDGER of computed `disabled:` menu rows (2026-11-13, pick 2): still drawn the old way (greyed, a tooltip) — each
// moves onto caption / off with ITS OWN why and lowers its row (the ledger only shrinks)
const MENU_LEDGER = { 'src/lib/browser-live-window.js': 3, 'src/lib/contributions.js': 1, 'src/lib/desktop-app-launcher.js': 1, 'src/lib/desktop-app-window.js': 3, 'src/lib/file-explorer.js': 1,
  'src/lib/machine-desktop.js': 1, 'src/lib/manage-agents.js': 1, 'src/lib/plugins-ui.js': 3, 'src/lib/session-card.js': 1, 'src/lib/sidebar-render.js': 1, 'src/lib/taskbar.js': 1 };
console.log('① A MENU ROW WORKS, OR IT IS A CAPTION, OR IT SAYS WHY');
const litRows = [], compPer = {};
for (const f of LIB) { let r = { lit: [], comp: [] }; try { r = disabledRows(read(f), f); } catch {} litRows.push(...r.lit); if (r.comp.length) compPer[f] = r.comp.length; }
ok(litRows.length === 0, 'no menu-row literal carries `disabled: true` — a fact is a `caption`, a choice that cannot be taken is `off` with its why', litRows.join(', '));
const compGrown = Object.entries(compPer).filter(([f, n]) => n > (MENU_LEDGER[f] || 0)).map(([f, n]) => `${f}: ${n} (ledger ${MENU_LEDGER[f] || 0})`);
const compShrunk = Object.entries(MENU_LEDGER).filter(([f, n]) => (compPer[f] || 0) < n).map(([f, n]) => `${f}: ${compPer[f] || 0} < ledger ${n}`);
ok(compGrown.length === 0, 'no NEW computed `disabled:` menu row (a new one is `off` with its why, or not drawn)', compGrown.join(' ; '));
ok(compShrunk.length === 0, 'the computed ledger is exact (a site that moved onto caption / off lowers its row)', compShrunk.join(' ; '));
const UT = read('src/lib/utils.js');
const scm = UT.slice(UT.indexOf('export function showContextMenu('), UT.indexOf('/** What the DOM says about a press'));
ok(!/off: item\.title/.test(scm)
  && /cap\.className = className \+ '-caption';/.test(scm) && /const words = wordRow\(item\);/.test(scm) && /const words = wordRow\(child\);/.test(scm) && /row\.className = className \+ '-item ' \+ className \+ '-off disabled';/.test(scm) && /why\.className = 'door-why'; why\.textContent = String\(item\.off\);/.test(scm) && /item\.offDoor\.action\?\.\(\)/.test(scm),
  'showContextMenu draws a CAPTION and an OFF row with its why in words (+ its door) — ONE drawer, at the top level AND in a submenu; a legacy title is never promoted to a why (it is often a description: «Open this URL in a web view»)');
ok(/\.context-menu-caption \{/.test(read('public/viewers.css')) && /\.context-menu-off \.door-why \{/.test(read('public/viewers.css')), 'the caption and the off row have their styles (words at full contrast, never opacity .4)');
const MA2 = read('src/lib/manage-agents.js'), SL = read('src/lib/session-lifecycle.js'), DL = read('src/lib/desktop-app-launcher.js'), DS = read('src/lib/desktop-app-scale.js');
ok(/label: t\('\{cmd\} — not offered', \{ cmd: r\.label \}\), off: t\('it connects to the vendor’s servers \(measured\)'\), title: r\.verdict \}/.test(MA2) && /if \(live\.length === 1\) \{\s*chkBtn\.textContent = live\[0\]\.label;/.test(MA2), 'rules & checks: a check it cannot offer says why on its row IN THE PAGE\'S LANGUAGE (the English measurement is its hover detail); one live act ⇒ the button IS that act');
ok(/items\.push\(\{ label: a\.name \+ suffix, off: block, offDoor: \{ label: t\('Manage agents…'\)/.test(SL) && (SL.match(/items\.unshift\(\{ caption: t\('This session’s billing account'\) \}\);/g) || []).length === 1,
  'billing: the menu says what it is (a caption), a blocked account says why ON its row with the door where sign-in lives');
ok(/\{ caption: t\('Default scale for \{app\}', \{ app: catalogLabel\(row\) \}\) \}/.test(DL) && !/disabled: choice === cur/.test(DS)
  && /\{ label: t\('Change the scale for every app in Settings…'\), action: \(\) => app\._settingsUI\?\.open\(\{ search: t\('Desktop app scale \(xpra\)'\) \}\) \}/.test(DL) && /\.\.\.rows, setting, \.\.\.own\.tail/.test(DL),
  'desktop-app zoom: the heading is a caption; the current choice is a live ✓ row, not a greyed tick; «Auto» has its door to Settings under the choices');

// ── ② a button says why when pressed ──
/** state-derived `x.disabled = <expression>` assignments in one file (a boolean literal is an in-flight guard, no state) */
const disabledAssigns = (src) => { let n = 0; walk(parse(src), (x) => { if (x.type === 'AssignmentExpression' && x.operator === '=' && x.left.type === 'MemberExpression' && !x.left.computed && x.left.property.name === 'disabled' && !(x.right.type === 'Literal' && typeof x.right.value === 'boolean')) n++; }); return n; };
// THE FROZEN LEDGER (2026-11-13, pick 3: 114 sites in 47 files; 118 on 935960b7e — the four the walk named moved onto
// pressSays / not drawn). A site that moves lowers its row; a new one is RED.
const STATE_LEDGER = {
  'src/lib/app-install-dialog.js': 1, 'src/lib/app.js': 1, 'src/lib/browser-build-dialog.js': 1, 'src/lib/browser-live-window.js': 9,
  'src/lib/browser-new-profile.js': 4, 'src/lib/browser-proposal-card.js': 2, 'src/lib/browser-replay-window.js': 3, 'src/lib/browser-trace-view.js': 3,
  'src/lib/channel-api-dialog.js': 1, 'src/lib/channel-filter-editor.js': 2, 'src/lib/channel-group-dialogs.js': 1, 'src/lib/channel-outbox.js': 1,
  'src/lib/channel-webhook.js': 2, 'src/lib/chat-renderers.js': 2, 'src/lib/desktop-app-launcher.js': 14, 'src/lib/desktop-app-window.js': 1,
  'src/lib/desktop-picker.js': 1, 'src/lib/doc-window-ui.js': 2, 'src/lib/docx-viewer.js': 1, 'src/lib/file-explorer.js': 1,
  'src/lib/inbox-window.js': 3, 'src/lib/integrations-window.js': 1, 'src/lib/learn-card.js': 1, 'src/lib/machine-desktop-handover.js': 1,
  'src/lib/machine-desktop.js': 6, 'src/lib/manage-agents.js': 2, 'src/lib/mounts-dialog.js': 4, 'src/lib/plugins-ui.js': 1,
  'src/lib/principal-picker.js': 3, 'src/lib/refresh-live.js': 1, 'src/lib/reset-credit-dialog.js': 1, 'src/lib/session-card.js': 2,
  'src/lib/session-props.js': 1, 'src/lib/settings-ui.js': 2, 'src/lib/sidebar-mounts.js': 5, 'src/lib/sidebar-rail.js': 1,
  'src/lib/sidebar-workbench.js': 1, 'src/lib/stash-strip.js': 2, 'src/lib/task-detail.js': 4, 'src/lib/task-log.js': 2,
  'src/lib/terminal.js': 2, 'src/lib/user-todos-panel.js': 3, 'src/lib/user-todos-row.js': 2, 'src/lib/utils.js': 2,
  'src/lib/voice-teach-ui.js': 6, 'src/lib/window-share.js': 1, 'src/lib/workflow-detail.js': 1
};
console.log('② A BUTTON WORKS, OR IT SAYS WHY WHEN PRESSED (the state-derived `.disabled =` ledger only shrinks)');
const statePer = {};
for (const f of LIB) { let n = 0; try { n = disabledAssigns(read(f)); } catch {} if (n) statePer[f] = n; }
const stateGrown = Object.entries(statePer).filter(([f, n]) => n > (STATE_LEDGER[f] || 0)).map(([f, n]) => `${f}: ${n} (ledger ${STATE_LEDGER[f] || 0})`);
const stateShrunk = Object.entries(STATE_LEDGER).filter(([f, n]) => (statePer[f] || 0) < n).map(([f, n]) => `${f}: ${statePer[f] || 0} < ledger ${n}`);
ok(stateGrown.length === 0, 'no NEW state-derived `.disabled =` in src/lib — a button stays live and says why (pressSays); a choice nobody can make is not drawn', stateGrown.join(' ; '));
ok(stateShrunk.length === 0, 'the ledger is exact (a site that moved lowers its row)', stateShrunk.join(' ; '));
// pressSays, evaluated from its own source against a fake button and line
const UT2 = read('src/lib/utils.js');
const psAt = UT2.indexOf('export function pressSays(');
const psSrc = psAt < 0 ? '' : UT2.slice(psAt, UT2.indexOf('\n}\n', psAt) + 3).replace('export function', 'function');
const pressSaysFn = psSrc ? new Function(`${psSrc}; return pressSays;`)() : () => ({ refresh() {} });   // none (the release) ⇒ every check below is RED by name
const fakeLine = () => ({ textContent: '', offsetWidth: 0, classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } } });
const fakeBtn = () => ({ ls: [], addEventListener(type, fn, o) { this.ls.push({ type, fn, capture: !!(o && o.capture) }); }, parentElement: null });
const press = (b) => { const e = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; b.ls.forEach((l) => l.type === 'click' && l.fn(e)); return e; };
let reason = 'Pick at least two agents';
const b1 = fakeBtn(), l1 = fakeLine(), h1 = pressSaysFn(b1, () => reason, { line: l1 });
const e1 = press(b1);
reason = null; const e2 = press(b1); h1.refresh();
ok(b1.ls.length === 1 && b1.ls[0].capture && e1.prevented && e1.stopped && l1.textContent === '' && !e2.prevented && !e2.stopped,
  'pressSays: a capture listener (before the button\'s own onclick); pressed while why() answers it stops the act and says the reason; once nothing is missing the press goes through and refresh() clears the line', JSON.stringify({ capture: b1.ls[0] && b1.ls[0].capture, e1, e2, line: l1.textContent }));
{ const b2 = fakeBtn(), l2 = fakeLine(); pressSaysFn(b2, () => 'why', { line: l2 }); press(b2); ok(l2.textContent === 'why' && l2.classList.set.has('press-says-again'), 'pressSays: the reason is said on the line (and a second press is seen again)', l2.textContent); }
const CG = read('src/lib/channel-group-dialogs.js'), CR = read('src/lib/chat-renderers.js'), BP = read('src/lib/browser-new-profile.js'), BM = read('src/lib/browser-new-profile-model.js'), IW = read('src/lib/integrations-window.js'), PU = read('src/lib/plugins-ui.js');
ok(/pressSays\(go, whyNot, \{ line: status \}\);/.test(CG) && /body\.append\(status, actions\);/.test(CG) && !/go\.disabled = n < need/.test(CG) && /if \(!r\) \{ go\.disabled = false; refresh\(\); return; \}/.test(CG),
  'the group\'s «创建» stays live: what is missing is said ABOVE the buttons, and a press says it (the in-flight guard ends with the answer)');
ok(/const submitSays = pressSays\(submitBtn, \(\) => \{ const left = questions\.length - selections\.size;/.test(CR) && !/submitBtn\.disabled = /.test(CR) && /submitSays\.refresh\(\);/.test(CR),
  'the ask card\'s «提交» stays live and says «先选一个答案» / how many are left when pressed early');
{ const at = BM.indexOf('export function providerRowsShown(');
  const fnSrc = at < 0 ? '' : BM.slice(at, BM.indexOf('\n}\n', at) + 3).replace('export function', 'function');
  const shown = fnSrc ? new Function(`${fnSrc}; return providerRowsShown;`)() : () => ({ rows: [], windowLeftOut: false });
  const r = shown([{ id: 'win', state: 'not-a-profile' }, { id: 'cloud:x', state: 'unavailable' }, { id: 'local-window', state: 'unavailable' }, { id: 'chromium', state: 'ready' }, { id: 'remote-only', state: 'other-machine' }],
    [{ id: 'cloud:x', control: { ok: false, code: 'provider_unsupported' } }, { id: 'local-window', control: { ok: false, code: 'provider_needs_consent' } }]);
  ok(JSON.stringify(r.rows.map((c) => c.id)) === '["local-window","chromium","remote-only"]' && r.windowLeftOut === true && /providerRowsShown\(providerChoices\(\{ providers: rows, host: st\.host, t \}\), rows, \{ host: st\.host \}\)/.test(BP) && /const \{ rows: choices, windowLeftOut \} = providerRowsNow\(\);/.test(BP),
    'new profile: a row nobody can pick here (a desktop window, a backend this version cannot use) is not drawn; a row that waits for the person (the consent, This computer) stays; the list says where a desktop window goes', JSON.stringify(r)); }
ok(/\} else if \(v\.clusterWhyCode === 'no-preset' && v\.source !== 'cluster'\) \{/.test(IW) && /if \(choice\.childNodes\.length\) card\.appendChild\(choice\);/.test(IW),
  'integrations: no «用集群默认» radio pair where no cluster preset of the kind exists (the store\'s own code); a preset that went keeps its radio and its why');
ok(/function makeSwitch\(on, \{ disabled = false, label, onChange \}\) \{\n  if \(disabled\) return null;/.test(PU) && /if \(sw\) row\.appendChild\(sw\);/.test(PU) && /if \(!cat\) \{ const none = document\.createElement\('span'\); none\.className = 'mounts-btn plugin-gear plugin-gear-none';/.test(PU) && !/b\.disabled = !cat/.test(PU),
  'plugins: a switch that cannot be used is not drawn (the chip says why and is the door), a plugin with nothing to configure has no ⚙');

// ── ⑦ one menu placement ──
console.log('⑦ A MENU IS BOUNDED BY THE SCREEN — every module that makes a .context-menu places it with placeMenu');
const ownMenus = LIB.filter((f) => f !== 'src/lib/utils.js' && /\.className = 'context-menu'[;\s]/.test(read(f)));
const unplaced = ownMenus.filter((f) => !/\bplaceMenu\(/.test(read(f)));
ok(ownMenus.length >= 1 && unplaced.length === 0 && /\n  placeMenu\(pop, x, y, \{ up, placesItself \}\);\n  return pop;/.test(read('src/lib/utils.js')),
  `showContextMenu and every module with its own .context-menu builder (${ownMenus.join(', ')}) are placed by placeMenu`, unplaced.join(', '));
const PM = read('src/lib/utils.js');
ok(/if \(follow && !placesItself\) followContent\(pop, /.test(PM) && /if \(at\.maxH != null\) \{ pop\.style\.maxHeight = \(at\.maxH \/ Z\) \+ 'px'; pop\.style\.overflowY = 'auto'; if \(!placesItself\) pinTail\(\); \}/.test(PM)
  && /placeMenu\(menu, x, y, \{ follow: true \}\)/.test(read('src/lib/file-explorer-ops.js')),
  'placeMenu follows a menu\'s rows only when its builder asks (the file explorer\'s late office rows), and a capped menu keeps its closing rows in view (the boxes: test-menu-bounds-chrome)');
// THE MUST-FIX OF THE ACCEPTANCE READER: a menu that places itself is never placed again behind its back — every showContextMenu
// whose caller writes the menu's place afterwards (the desktop list keeps its TOP, the sheets) declares `placesItself`
{ const callers = LIB.map((f) => [f, read(f)]).flatMap(([f, src]) => [...src.matchAll(/(?:const|let) (\w+) = showContextMenu\(([^\n]*)/g)].filter((m) => new RegExp(`\\b(?:this\\._placeList\\(${m[1]}|placeOverColumn\\(${m[1]}|${m[1]}\\.classList\\.add\\('(?:mobile-sheet|mdesk-menu)')`).test(src)).map((m) => [f, m[1], /placesItself: true/.test(m[2])]));
  ok(callers.length >= 3 && callers.every(([, , ok2]) => ok2), `every menu its caller places afterwards (the desktop list, the sheets) declares placesItself — never followed (${callers.map(([f, n, o]) => f.split('/').pop() + ':' + n + (o ? '' : ' ✗')).join(', ')})`); }

// ── ⑦b a panel keeps its natural width and slides ──
{ const mp = read('src/lib/menu-place.js'); const at = mp.indexOf('export function panelPlace(');
  const pp = at < 0 ? null : new Function(`${mp.slice(at, mp.indexOf('\n}\n', at) + 3).replace('export function', 'function')}; return panelPlace;`)();
  const a = pp && pp({ wantLeft: 250, containerW: 320, natW: 300, minW: 130, maxW: Infinity, pad: 8 }), b = pp && pp({ wantLeft: 40, containerW: 320, natW: 150, minW: 130 }), c = pp && pp({ wantLeft: 250, containerW: 320, natW: 900, minW: 130, maxW: 440 });
  ok(!!pp && a.left === 12 && a.maxW >= 300 && b.left === 40 && c.left === 0 && c.maxW === 312,
    'panelPlace: a 300 px panel opened at x 250 of a 320 px window slides to x 12 at its width (never a 130 px strip); one that fits stays at its chip; one wider than the window takes the window', JSON.stringify({ a, b, c }));
  const CSB = read('src/lib/chat-status-bar.js'), sd = CSB.slice(CSB.indexOf('const showDropdown = (anchor,'), CSB.indexOf('\n    };', CSB.indexOf('const showDropdown = (anchor,')));
  ok(/const at = panelPlace\(\{ wantLeft, containerW, natW: dropdown\.offsetWidth, minW, maxW: maxWidth, pad: DROPDOWN_EDGE_PAD \}\);/.test(sd) && /followContent\(dropdown, settle\);/.test(sd),
    'the status bar\'s one showDropdown places a panel AFTER the caller filled it, and again when its content changes'); }

// ── ⑨ the single defects of pick 5 ──
console.log('⑨ THE SINGLE DEFECTS of pick 5 — each pinned where it lives');
{ const SR = read('src/lib/sidebar-rail.js');
  ok(!/prc-more/.test(SR) && !/const CAP = /.test(SR) && /tr\('Showing \{shown\} of \{total\} processes', \{ shown: list\.length, total \}\)/.test(SR),
    'processes: every transported row is drawn and the head says «Showing 350 of 1131 processes» — no «+ show all 350» beside «350 / 1131»'); }
{ const VW = read('src/lib/vault-window.js'), SW = read('src/lib/search-window.js');
  ok(/t\('\{label\}: \{value\}', \{ label: t\('Vault'\), value: word \}\)/.test(VW) && /\['unlocked', 'locked'\]\.includes\(f\.state\) \? t\('View contents…'\) : t\('Set up the vault…'\)/.test(VW)
    && /t\('\{label\}: \{value\}', \{ label: t\('Search index'\)/.test(SW) && /'mounts-btn sys-search-rebuild'/.test(SW),
    'the System panel: «保险库：未设置» in the language\'s colon, its door «设置保险库…» (never «查看内容…» of nothing), the theme\'s secondary buttons'); }
{ const JP = read('src/lib/jobs-panel.js');
  // EVALUATED (the acceptance reader's rowVerbs-1 / -3 mutants stayed green on a text pin): rowVerbs, the row's buttons and the
  // row's menu, built from their own source; pressing every button and every menu row records the acts — the same set
  const src = (name) => { const at = JP.search(new RegExp(`\\n(?:export )?function ${name}\\(`)); return at < 0 ? '' : JP.slice(at + 1, JP.indexOf('\n}\n', at + 1) + 3).replace('export function', 'function'); };
  const made = (() => { try { return new Function('t', 'jobAction', 'document', 'clearRecords', 'isCleared', 'clearedText', `${src('rowVerbs')}\n${src('actionButtons')}\n${src('rowMenuItems')}; return { rowVerbs, actionButtons, rowMenuItems };`); } catch { return null; } })();
  const run = (j) => { const did = []; const doc = { createElement: () => ({ className: '', textContent: '', onclick: null, title: '', setAttribute(k, v) { this['@' + k] = v; } }) };
    const m = made((x) => x, (app, jj, act) => { did.push(act); }, doc, () => Promise.resolve({ ok: true }), () => false, () => '');
    const b = m.actionButtons({}, j, () => {}, { compact: false }).map((x) => { did.length = 0; x.onclick({ stopPropagation() {} }); return did[0]; });
    const items = m.rowMenuItems({}, j, () => {}, {}); const mm = items.filter((x) => !x.separator && x.label !== 'Clear content…').map((x) => { did.length = 0; x.action(); return did[0]; });
    return { buttons: b.join(','), menu: mm.join(','), last: items[items.length - 1].label, verbs: m.rowVerbs(j).map((v) => v.act).join(',') }; };
  let r = null; try { r = made ? [{ state: 'up' }, { state: 'failed' }, { state: 'done' }, { state: 'up', pendingPanel: true }].map(run) : null; } catch (e) { r = String(e.message); }
  ok(Array.isArray(r) && r.every((x) => x.buttons === x.verbs && x.menu === x.verbs && x.last === 'Clear content…') && r[0].verbs === 'stop' && r[1].verbs === 'start,rm',
    'jobs (evaluated): the row\'s buttons and its menu draw the SAME acts — one table (rowVerbs), the menu ending in «Clear content…»', JSON.stringify(r)); }
{ // the start verb's WORD (the UI walk's jobs-5, L3 → L5)
  const JP = read('src/lib/jobs-panel.js'); const src = (name) => { const at = JP.search(new RegExp(`\\n(?:export )?function ${name}\\(`)); return at < 0 ? '' : JP.slice(at + 1, JP.indexOf('\n}\n', at + 1) + 3).replace('export function', 'function'); };
  const made = (() => { try { return new Function('t', 'jobAction', 'document', 'clearRecords', 'isCleared', 'clearedText', `${src('rowVerbs')}; return { rowVerbs };`); } catch { return null; } })();   // what it does to THIS row — the same act 'start'
  let w = null; try { const m = made((x) => x, () => {}, null, null, null, null); w = [{ kind: 'task', state: 'failed' }, { kind: 'task', state: 'missed' }, { kind: 'service', state: 'down' }, { kind: 'service', state: 'failed' }, { kind: 'cron', state: 'scheduled', desiredUp: false }, { kind: 'cron', state: 'missed', desiredUp: true }]
    .map((j) => m.rowVerbs(j).filter((v) => v.act === 'start').map((v) => v.label).join('')); } catch (e) { w = String(e.message); }
  ok(Array.isArray(w) && w.join('|') === 'Run again|Run again|Start|Start|Resume|Start',
    'jobs (evaluated): the start verb says what it does to the row — a task that ran «Run again», a service «Start», a cron that is off «Resume» (never «Start» on all three)', JSON.stringify(w)); }
{ // …and a GLYPH face says its word (the rail's compact row drew a bare ▸; the window's ✕) — actionButtons EVALUATED
  const JP = read('src/lib/jobs-panel.js'); const src = (name) => { const at = JP.search(new RegExp(`\\n(?:export )?function ${name}\\(`)); return at < 0 ? '' : JP.slice(at + 1, JP.indexOf('\n}\n', at + 1) + 3).replace('export function', 'function'); };
  let g = null; try { const m = new Function('t', 'jobAction', 'document', `${src('rowVerbs')}\n${src('actionButtons')}; return { actionButtons };`)((x) => x, () => {}, { createElement: () => ({ className: '', textContent: '', onclick: null, title: '', setAttribute(k, v) { this['@' + k] = v; } }) });
    g = [true, false].flatMap((compact) => [{ kind: 'task', state: 'failed' }, { kind: 'service', state: 'up' }].flatMap((j) => m.actionButtons({}, j, () => {}, { compact })))
      .filter((b) => !/[\p{L}]{2,}/u.test(b.textContent)).map((b) => `${b.textContent}=${b['@aria-label'] || ''}/${b.title || ''}`); } catch (e) { g = String(e.message); }
  ok(Array.isArray(g) && g.length >= 3 && g.every((x) => /=[^/]+\/[^/]+$/.test(x)),
    'jobs (evaluated): every glyph-faced row button (the rail\'s ▸ / ■, the window\'s ✕) carries its verb\'s word as its name and title', JSON.stringify(g)); }
{ const BB = read('src/lib/browser-build-dialog.js');
  ok(/const btn = el\('button', 'mounts-btn bbuild-download-btn'\);/.test(BB) && !/bwho-answer bbuild-row bbuild-download/.test(BB), '«下载其他版本…» is a button (its source line a hint under it), never a radio row\'s head'); }
{ const MD = read('src/lib/mounts-dialog.js'), CA = read('src/lib/channel-account-dialogs.js');
  ok(/head\.textContent = tr\('Before you start, check:'\);/.test(MD) && /ul\.className = 'integ-prereq';/.test(MD) && /const prereqs = spec\.setup \? \(spec\.setup\.prerequisites \|\| \[\]\)\.map\(\(p\) => tr\(p\)\) : \[\];/.test(CA),
    'a console\'s prerequisites: «开始前请确认：» over a list — never three run-on hint sentences'); }
{ const SM = read('src/lib/sidebar-mounts.js');
  ok(/<details class="bs-log-wrap" hidden>/.test(SM) && /const appendLog = \(line\) => \{ logWrap\.hidden = false;/.test(SM), 'the host set-up\'s Log fold appears with its first line — never a fold onto an empty box'); }

// ── ⑩ a control says what it does ──
console.log('⑩ A CONTROL SAYS WHAT IT DOES — filter / sort, For-you buttons, the phone ⋯, the explorer toolbar');
{ const SB2 = read('src/lib/sidebar.js');
  ok(/btn\.innerHTML = UI_ICONS\.filter;/.test(SB2) && /n\.className = 'backend-filter-count'; n\.textContent = String\(this\._backendFilter\.size\);/.test(SB2) && !/backend-filter-icon-stack/.test(SB2)
    && /<span class="sort-words">\$\{escHtml\(words\)\} ▾<\/span>/.test(SB2) && (SB2.match(/\[\{ caption: tr\('Sort by'\) \}, \.\.\./g) || []).length === 2 && !/this\._sortMode = this\._sortMode === 'recent' \? 'folder' : 'recent';/.test(SB2),
    'sessions: the filter is a funnel with a count while it filters; sort says its order («最近 ▾») and opens a menu on both tabs — never a clock that silently toggles'); }
{ const SB3 = read('src/lib/sidebar.js');
  ok(/sortBtn\.onclick = \(e, from = sortBtn\) => \{/.test(SB3) && (SB3.match(/const r = from\.getBoundingClientRect\(\);/g) || []).length === 2 && /\{ label: tr\('Sort by'\), action: \(\) => document\.getElementById\('sort-toggle'\)\?\.onclick\?\.\(null, listMenuBtn\) \}/.test(SB3) && !/getElementById\('sort-toggle'\)\?\.click\(\)/.test(SB3),
    'the sort menu opens where it was asked from — in the regular class (the button hidden, sort a row of the list\'s ⋯) at that ⋯, never at a hidden button\'s corner'); }
{ const CSS = read('public/style.css');
  ok(!/\.ut-actions \{[^}]*opacity: 0\.35/.test(CSS) && /\.ut-act\[data-label\]:is\(:hover, :focus-visible\)::after \{ content: attr\(data-label\);/.test(CSS) && /\.ut-detail-exp > summary \{ font-size: inherit;/.test(CSS),
    'For-you: the row\'s buttons at the theme\'s contrast (no 35 % dimming), each says its word on hover / focus, «▸ 详情» at the body size'); }
{ const MN = read('src/lib/mobile-nav.js');
  ok(/moreBtn\.onclick = \(e\) => \{ e\.stopPropagation\(\); const r = moreBtn\.getBoundingClientRect\(\); showWindowContextMenu\(this\.app, win\.id,/.test(MN) && /item\.append\(icon, label, moreBtn, closeBtn\)/.test(MN),
    'the phone switcher: a visible ⋯ on each row opens the window\'s own menu (the long press stays)'); }
{ const FE = read('src/lib/file-explorer.js');
  ok(/btnUpload\.innerHTML = UI_ICONS\.upload;/.test(FE) && !/'\\u2B06'/.test(FE) && /const fold = createBarFold\(toolbar, \{/.test(FE) && /compactClass: 'ftw-compact'/.test(FE) && /w\.className = 'ftw-word'; w\.textContent = word;/.test(FE),
    'the file explorer: every tool says its word, Upload has its own mark (no second up-arrow), the bar folds through createBarFold (words, then icons, then ⋯)'); }

// ── ⑤b the auto-continue words say what a press does (the acceptance reader's minor: «点击取消» while a press opens a panel) ──
{ const CSB2 = read('src/lib/chat-status-bar.js'), ZH2 = read('src/lib/i18n-zh.js'), JA2 = read('src/lib/i18n-ja.js');
  const m = CSB2.match(/export const CANCEL_TAIL = (\/.*\/);/); const TAIL = m ? new Function(`return ${m[1]};`)() : null;
  const keys = [...CSB2.matchAll(/t\('([^']*Click to cancel\.)'/g)].map((x) => x[1]);
  const rowOf = (dict, k) => { const q = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const r = dict.match(new RegExp(`^  ['"]${q}['"]: ['"]([^'"]*)['"]`, 'm')); return r ? r[1] : null; };
  const miss = TAIL ? keys.flatMap((k) => [['en', k], ['zh', rowOf(ZH2, k)], ['ja', rowOf(JA2, k)]].filter(([, v]) => !v || !TAIL.test(v)).map(([l]) => `${l}: ${k.slice(0, 40)}`)) : ['no CANCEL_TAIL'];
  ok(keys.length >= 4 && miss.length === 0 && /title = title\.replace\(CANCEL_TAIL, ''\);/.test(CSB2),
    `the auto-continue tooltip and panel line drop the old «Click to cancel.» in every language (${keys.length} keys × en / zh / ja) — a press opens the panel, cancelling is its row`, miss.join(' ; ')); }

// ── ⑩b no press goes around a pressSays button; every touched control has its words (the acceptance reader's pressSays-3 and
//    words-1 / -2 / -3 mutants stayed green on text pins) ──
console.log('⑩b NO PRESS AROUND THE WHY · EVERY CONTROL HAS ITS WORDS — censuses over the source');
{ const around = [];
  for (const f of LIB) { const src = read(f); if (!/\bpressSays\(/.test(src)) continue; let ast; try { ast = parse(src); } catch { continue; }
    const btns = new Set(); walk(ast, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'pressSays' && n.arguments[0]) btns.add(src.slice(n.arguments[0].start, n.arguments[0].end)); });
    walk(ast, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'onclick' && btns.has(src.slice(n.callee.object.start, n.callee.object.end))) around.push(`${f}:${n.loc.start.line}`); }); }
  ok(around.length === 0, 'no code calls a pressSays button\'s onclick() directly — every press goes through its why (a click event, or nothing)', around.join(', ')); }
{ const FE = read('src/lib/file-explorer.js'); const fa = parse(FE); const made = new Map(); let appended = [], toolEls = [];
  walk(fa, (n) => {
    if (n.type === 'VariableDeclarator' && n.init && n.init.type === 'CallExpression' && n.init.callee.type === 'MemberExpression' && n.init.callee.property.name === '_btn' && n.id.type === 'Identifier') made.set(n.id.name, n.loc.start.line);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'toolbar' && n.callee.property.name === 'append') appended = n.arguments.filter((a) => a.type === 'Identifier').map((a) => a.name);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'tools' && n.init && n.init.type === 'ObjectExpression') for (const p of n.init.properties) if (p.value && p.value.type === 'ObjectExpression') for (const q of p.value.properties) if (q.key && q.key.name === 'el' && q.value.type === 'Identifier') toolEls.push(q.value.name); });
  const wordless = appended.filter((x) => made.has(x) && !toolEls.includes(x) && x !== 'btnMore');
  ok(appended.length >= 7 && toolEls.length >= 6 && wordless.length === 0, `the explorer toolbar: every tool button it appends carries its word (the tools table) — none icon-only (${wordless.join(', ') || 'none'})`); }
{ // the explorer's ⋯ (the acceptance reader's finding 4): a folded tool acts AGAINST THE ⋯ — foldedMenuItems EVALUATED from its source
  const BF = read('src/lib/bar-fold.js'), at = BF.indexOf('export function foldedMenuItems(');
  const fm = at < 0 ? null : new Function(`${BF.slice(at, BF.indexOf('\n}\n', at) + 3).replace('export function', 'function')}; return foldedMenuItems;`)();
  const got = []; const hidden = { id: 'the hidden button' };
  const items = fm ? fm(['view', 'gone', 'upload'], { view: { el: hidden, word: 'View', act: (a) => got.push(['view', a]) }, upload: { el: hidden, word: 'Upload', act: (a) => got.push(['upload', a]) } }, 'THE-MORE') : [];
  items.forEach((x) => x.action());
  ok(!!fm && items.map((x) => x.label).join(',') === 'View,Upload' && got.length === 2 && got.every(([, a]) => a === 'THE-MORE') && /showContextMenu\(r\.left, r\.bottom \+ 2, foldedMenuItems\(fold\.folded\(\), tools, btnMore\)\)/.test(read('src/lib/file-explorer.js')),
    'the explorer\'s ⋯ (evaluated): a folded tool\'s row acts against the ⋯ — View\'s and Upload\'s popovers open there, never at a hidden button\'s corner', JSON.stringify(got)); }
{ // THE SESSIONS FILTER ROW (the round's walk: the sort's words ran the row past a 200 / 260 px sidebar — ja at 260 cut the ⋯):
  // it is a chrome bar — THE fold (bar-fold.js) with the sort's icon as its short form, manage and sort foldable, the ⋯ as `more`;
  // a FOLDED control is a row of that ⋯ — listMenuKeys EVALUATED from its source
  const SB4 = read('src/lib/sidebar.js'), CSS4 = read('public/style.css'), at = SB4.indexOf('export function listMenuKeys(');
  const keys = at < 0 ? null : new Function(`${SB4.slice(at, SB4.indexOf('\n}\n', at) + 3).replace('export function', 'function')}; return listMenuKeys;`)();
  const r = keys ? [keys({}), keys({ folded: ['sort'] }), keys({ folded: ['manage', 'sort'] }), keys({ regular: true })].map((x) => x.join('+')) : [];
  const wired = /this\._filterFold = createBarFold\(row, \{\s*more: listMenuBtn,/.test(SB4) && /\.\.\.\(key === 'sort' \? \{ compactClass: 'sort-compact' \} : \{\}\)/.test(SB4) && /const FOLD = \{ search: 0, filter: 0, live: 0, manage: 20, sort: 10 \};/.test(SB4)
    && /listMenuKeys\(\{ regular: this\._regularMode, folded: this\._filterFold\?\.folded\(\) \}\)\.map\(\(k\) => ROWS\[k\]\)/.test(SB4);
  const css = /\.sfr-bar > \.bar-folded \{ display: none !important; \}/.test(CSS4) && /\.sort-btn\.sort-compact \.sort-ico \{ display: inline; \}/.test(CSS4) && !/#sort-toggle \{[^}]*(white-space: normal|max-width)/.test(CSS4);
  ok(r.join('|') === 'refresh|refresh+sort|refresh+sort+manage|refresh+sort+manage' && wired && css,
    'the sessions filter row never runs past the sidebar (evaluated): the sort\'s words, else its icon, else it and manage are rows of the ⋯ — the chrome-bar fold', JSON.stringify({ r, wired, css })); }
{ const UT2 = read('src/lib/user-todos-row.js');
  const btns = [...UT2.matchAll(/<button([^>]*class="ut-act[^"]*"[^>]*)>([\s\S]*?)<\/button>/g)];
  const glyphOnly = btns.filter((m) => !/\bt\(|\btc\(|escHtml\(/.test(m[2]) && !/data-label=/.test(m[1])).map((m) => m[1].match(/class="([^"]*)"/)[1]);
  ok(btns.length >= 10 && glyphOnly.length === 0, `For-you: every ut-act button whose face is a glyph or an icon says its word (data-label) — ${btns.length} buttons (${glyphOnly.join(', ') || 'none without'})`); }
{ const MN2 = read('src/lib/mobile-nav.js'); const at = MN2.indexOf('  _buildWindowItem('); const body = MN2.slice(at, MN2.indexOf('\n  }\n', at));
  const made2 = [...body.matchAll(/const (\w+) = document\.createElement\('button'\)/g)].map((m) => m[1]);
  const silent = made2.filter((b) => !new RegExp(`\\b${b}\\.title = |\\b${b}\\.setAttribute\\('aria-label'`).test(body));
  ok(made2.length >= 2 && silent.length === 0, `the phone switcher's row: every button has its word (title / aria-label) — ${made2.join(', ')} (${silent.join(', ') || 'none silent'})`); }

// ── ③ a menu opens: (x, y, items) ──
const EVENT_NAMES = new Set(['e', 'ev', 'evt', 'event']);
function badMenuCalls(src, file) {
  const out = [];
  walk(parse(src), (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'showContextMenu') return;
    const a0 = n.arguments[0];
    if (n.arguments.length < 3 || (a0 && a0.type === 'Identifier' && EVENT_NAMES.has(a0.name))) out.push(`${file}:${n.loc.start.line} (${n.arguments.length} args)`);
  });
  return out;
}
console.log('③ A MENU OPENS — every showContextMenu( call passes (x, y, items)');
let menuCalls = 0; const bad = [];
for (const f of LIB) { const s = read(f); menuCalls += (s.match(/\bshowContextMenu\(/g) || []).length; try { bad.push(...badMenuCalls(s, f)); } catch (e) { bad.push(`${f}: unparsable (${e.message})`); } }
ok(menuCalls >= 20, `the census sees the tree's menu calls (${menuCalls})`);
ok(bad.length === 0, 'no call passes the event (or fewer than three arguments) — the menu would throw before it opens', bad.join(', '));

// ── ④ one latest render ──
/** async functions whose own body empties identifier X, then awaits, then appends to X (nested functions are their own). */
function clearAwaitAppend(src, file) {
  const hits = [];
  walk(parse(src), (fnNode) => {
    if (!/Function/.test(fnNode.type) || !fnNode.async) return;
    const ev = [];
    const inner = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n !== fnNode && /Function/.test(n.type)) return;
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier' && ['innerHTML', 'textContent'].includes(n.left.property.name) && n.right.type === 'Literal' && n.right.value === '') ev.push(['clear', n.left.object.name, n.start, n.loc.start.line]);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.property.name === 'replaceChildren' && n.arguments.length === 0) ev.push(['clear', n.callee.object.name, n.start, n.loc.start.line]);
      if (n.type === 'AwaitExpression') ev.push(['await', null, n.start, n.loc.start.line]);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && ['appendChild', 'append', 'prepend', 'insertBefore'].includes(n.callee.property.name)) ev.push(['add', n.callee.object.name, n.start, n.loc.start.line]);
      for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(inner); else if (v && typeof v.type === 'string') inner(v); }
    };
    inner(fnNode.body);
    ev.sort((a, b) => a[2] - b[2]);
    for (const c of ev.filter((e) => e[0] === 'clear')) {
      const after = ev.filter((e) => e[2] > c[2]), ai = after.findIndex((e) => e[0] === 'await');
      if (ai >= 0 && after.slice(ai).some((e) => e[0] === 'add' && e[1] === c[1])) { hits.push(`${file}:${c[3]} ${c[1]}`); break; }
    }
  });
  return hits;
}
// THE FROZEN LEDGER (2026-11-13, 935960b7e less the Ports panel): each a render that can draw twice when two calls overlap —
// not in the walk's list; a site that moves onto latestRender LOWERS its row (the ledger only shrinks)
const LEDGER = { 'src/lib/app-install-dialog.js': 1, 'src/lib/browser-build-dialog.js': 1, 'src/lib/channel-window.js': 2, 'src/lib/jobs-panel.js': 2, 'src/lib/manage-agents.js': 1, 'src/lib/sidebar-mounts.js': 1 };
console.log('④ ONE LATEST RENDER — no async render empties, awaits, then appends (the ledger only shrinks)');
const per = {}; const allHits = [];
for (const f of LIB) { let h = []; try { h = clearAwaitAppend(read(f), f); } catch {} if (h.length) { per[f] = h.length; allHits.push(...h); } }
const grown = Object.entries(per).filter(([f, n]) => n > (LEDGER[f] || 0)).map(([f, n]) => `${f}: ${n} (ledger ${LEDGER[f] || 0})`);
const shrunk = Object.entries(LEDGER).filter(([f, n]) => (per[f] || 0) < n).map(([f, n]) => `${f}: ${per[f] || 0} < ledger ${n}`);
ok(grown.length === 0, 'no NEW clear-await-append render (a new one goes through utils.js latestRender)', grown.join(' ; ') + ' — ' + allHits.join(', '));
ok(shrunk.length === 0, 'the ledger is exact (a site that moved onto latestRender lowers its row)', shrunk.join(' ; '));
ok(!per['src/lib/sidebar-rail.js'] && /const render = latestRender\(c, async \(out\) =>/.test(read('src/lib/sidebar-rail.js')), 'the Ports panel renders through latestRender (its forwards and its input box are drawn once)');
ok(/const offPorts = this\.app\.ws\.onGlobal\(/.test(read('src/lib/sidebar-rail.js')) && /if \(!c\.isConnected\) \{ offPorts\(\); return; \}/.test(read('src/lib/sidebar-rail.js')), 'the Ports panel\'s broadcast listener goes with the panel (one per open was kept forever)');
// latestRender itself, evaluated from its own source against a fake container (two overlapping calls ⇒ ONE landing, the newest)
const U = read('src/lib/utils.js');
const fnSrc = (() => { let out = null; walk(parse(U), (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'latestRender') out = U.slice(n.start, n.end); }); return out; })();
async function overlap(src) {
  const doc = { createElement: () => ({ childNodes: [], appendChild(x) { this.childNodes.push(x); return x; } }) };
  const LR = new Function('document', `${src}; return latestRender;`)(doc);
  const landed = []; const c = { isConnected: true, replaceChildren: (...k) => landed.push(k.map((x) => x.label)) };
  let n = 0; const gates = [];
  const render = LR(c, async (out) => { const me = ++n; await new Promise((r) => gates.push(() => r())); out.appendChild({ label: `build ${me}` }); });
  const a = render(), b = render();
  await new Promise((r) => setTimeout(r, 0)); gates.forEach((g) => g()); await Promise.all([a, b]);
  return landed;
}
const two = fnSrc ? await overlap(fnSrc) : null;
ok(!!fnSrc && JSON.stringify(two) === JSON.stringify([['build 2']]), 'latestRender: two overlapping calls land ONCE — the newest build; the older is dropped', JSON.stringify(two));

// ── ⑤ the single defects of pick 1 ──
console.log('⑤ THE SINGLE DEFECTS — each pinned where it lives');
const MA = read('src/lib/manage-agents.js');
ok(/picked: explicit \? explicit\.slice\(\) : null/.test(MA) && /if \(st\.all\) \{ st\.picked = st\.checked\.slice\(\); st\.checked = subs\.map\(\(x\) => x\.id\); \} else if \(st\.picked\) st\.checked = st\.picked\.slice\(\);/.test(MA),
  'pool members: ticking «All» keeps the person\'s own list aside; unticking brings THAT list back (never every subscription silently ticked)');
ok(!/\$\{st\.all \? 'disabled' : ''\}/.test(MA) && /\$\{st\.all \? '' : `<input type="checkbox" class="pool-mem-cb"/.test(MA) && /t\('Every subscription is in the pool, including ones you add later'\)/.test(MA),
  'pool members: while «All» is on the member boxes are NOT drawn (no greyed ticked box) and one line says every subscription is in');
const SB = read('src/lib/chat-status-bar.js');
const arAt = SB.indexOf("const arEl = e.target.closest('.chat-status-autoresume');");
const arBlock = arAt >= 0 ? SB.slice(arAt, SB.indexOf('\n    }\n', arAt)) : '';
ok(arBlock.length > 200 && arBlock.indexOf('showDropdown(arEl') >= 0 && arBlock.indexOf('showDropdown(arEl') < arBlock.indexOf("type: 'auto-resume'") && /act\.onclick = \(ev\) => \{[\s\S]*type: 'auto-resume'/.test(arBlock),
  'auto-continue: a press OPENS the chip\'s panel; the on / off act sits behind a press inside it');
ok(/t\('continues at \{t\}', \{ t: when \}\)/.test(SB) && /t\('Auto-continue: off'\)/.test(SB), 'auto-continue: the chip says «… 自动继续» / «自动继续：关», never a bare time or a bare icon');
const HX = read('src/lib/hex-viewer.js');
ok(!/t\('Load more'\)/.test(HX) && /upTo >= this\.fileSize \? '' :/.test(HX) && /new IntersectionObserver/.test(HX), 'hex viewer: no «Load more» (the scroll loads), and a whole file says nothing more');

// ── ⑥ controls ──
console.log('⑥ CONTROLS — the same checkers on planted code');
ok(disabledAssigns("go.disabled = n < need; busy.disabled = true; done.disabled = false;") === 1, 'a planted state-derived `x.disabled = <expr>` is counted, an in-flight `= true` / `= false` is not');
if (psSrc) { const b = { ls: [], addEventListener(t, fn, o) { this.ls.push({ t, fn, o }); } }; const broken = new Function(`${psSrc.replace('e.preventDefault(); e.stopImmediatePropagation();', '')}; return pressSays;`)(); broken(b, () => 'x', { line: { textContent: '', offsetWidth: 0, classList: { add() {}, remove() {} } } }); const e = { p: 0, s: 0, preventDefault() { this.p = 1; }, stopImmediatePropagation() { this.s = 1; } }; b.ls[0].fn(e); ok(!e.p && !e.s, 'a pressSays that does not stop the act is caught by the same press (the checker is a judge)'); }
ok(disabledRows("showContextMenu(1, 2, [{ label: 'x', disabled: true }, { caption: 'fact' }, { label: 'y', disabled: busy }]);", 'planted').lit.length === 1 && disabledRows("m([{ label: 'y', disabled: busy }])", 'p').comp.length === 1 && disabledRows("pick([{ label: 'z', value: 'z', disabled: true }])", 'p').lit.length === 0, 'a planted `disabled: true` menu row is caught, a computed one is counted, a picker row (value) is not a menu row');
ok(badMenuCalls("el.oncontextmenu = (e) => { showContextMenu(e, [{ label: 'x' }]); };", 'planted').length === 1, 'a planted (e, items) call is caught');
ok(clearAwaitAppend('async function r(c) { c.innerHTML = \'\'; const x = await load(); c.appendChild(x); }', 'planted').length === 1, 'a planted clear-await-append render is caught');
ok(clearAwaitAppend('async function r(c) { const x = await load(); c.replaceChildren(); c.appendChild(x); }', 'planted').length === 0, '…and a render that awaits FIRST, then clears and fills, is not');
const noGen = fnSrc && fnSrc.replace('if (mine !== gen || !container.isConnected) return false;', 'if (!container.isConnected) return false;');
const bad2 = noGen && noGen !== fnSrc ? await overlap(noGen) : null;
ok(!!bad2 && bad2.length === 2, 'a latestRender without its generation check lands BOTH builds — the overlap leg would be red', JSON.stringify(bad2));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
