#!/usr/bin/env node
// A GROUPED TASKBAR BUTTON (lane K, 2026-09-25; the owner, on a button reading
// "VibeSpace 主开发 · 2 windows grouped" whose every click popped a two-row
// chooser instead of doing anything: "这个体验比较差"). Fast, no browser:
//   §1 the PURE module (src/lib/taskbar-group.js) imports nothing;
//   §2 the CLICK table — every pointer type, with and without an open hover
//      chooser, during a drag: activate when the group is behind, the chooser
//      when it is in front, nothing on a drag's release;
//   §3 the HOVER table — fine pointer only, never touch / a drag / another
//      popover, the intent threshold on both sides;
//   §4 the IN-FRONT table — host or any tab focused, not minimized, shown;
//   §5 the KEY table — Enter / Space = the click rule, ArrowUp = the chooser;
//   §6 NEGATIVE CONTROLS — patched copies (scripts/mutant-copy.mjs) of the old
//      always-chooser click and of a hover that forgets touch fail §2 / §3;
//   §7 wiring pins over the COMMENT-STRIPPED taskbar.js (a pin satisfied by a
//      comment proves nothing): the group's click / hover / keys route through
//      the verdicts, the single button never does, one activation path;
//   §8 the i18n words in zh + ja; the patched copies never touch the tree;
//   §7/§9 lane K verify r1 (2026-09-25): the chooser's one cleanup disposes
//      createPopover's outside-click close (a hover chooser opens and closes
//      with no click — 3 → 33 document listeners over 30 hovers); §9 runs the
//      real attachPopoverClose in node against a fake document that honours
//      { signal } — disposer after / before arming, outside closes, inside /
//      child popover / anchor keep, a popover gone by another path self-heals —
//      with the pre-fix function (master's, comments dropped) as the negative
//      control;
//   §7/§9 the five verify-r1 LOWS (2026-09-25): a pen hovers (touch never); a
//      rebuild re-anchors the open chooser (aria-expanded, Esc focus, cleanup,
//      placement and the outside-click exclusion read the LIVE anchor — §9's
//      `liveExclusion`, the r1-minor function as its control); a row's
//      right-click = that tab's window menu, the chooser pinned + re-listed;
//      restoreTabChain notifies; THE PRODUCER CENSUS over the class names the
//      two "another popover is open" guards query (_otherPopoverOpen, app.js's
//      autohide conceal guard), each guard's pre-fix spelling — the dead
//      `.taskbar-window-list` — as its control.
//   §10 WHO OPENED THE HOVER CHOOSER (2026-09-26, the 2.369.183 mirror red:
//      the heavy leg (l) read `pointerType mouse` on a chooser the PEN had
//      opened — Chrome's hover recompute moves the MOUSE pointer onto the
//      button where a pen rests one or two frames after the open's layout
//      change, and the leg's recorder kept only the LAST enter's type): the
//      shared judge (scripts/pen-hover-judge.mjs, PURE) over a FAKE-CLOCK
//      model of every interleaving — frame period, timer lateness, recompute
//      frame, the CDP sample's delay, a layout pending at the pen's arrival,
//      the mouse-only product — using the product's own hoverVerdict + intent;
//      a patched copy of the judge with the pre-fix last-enter slot is the
//      control (red exactly where the recompute beat the sample, green where
//      the sample won: the race, green standalone); wiring pins that the heavy
//      suite records typed enters, judges through the module, runs the ×20 leg;
//   §11 THE HOVER VISIT (found by the load construction — one core, 8 busy
//      loops — on master: a rebuild of the button under a pointer that had
//      CLICKED grew a hover chooser; constructed at ×1, 5 of 5): the REAL
//      hoverStep over a fake clock with the wiring's per-GROUP visit, 378
//      timed scripts (click / Esc / wiggle then a rebuild, a genuine return, a
//      return after the pointer moved AWAY during a rebuild, a pen re-targeted
//      before its open); the controls: a patched copy where every pointerenter
//      is an arrival (the pre-fix hover) and one that ignores 'away' (a stale
//      visit — a missed hover); the watcher's wiring pinned.
// Chrome end to end: scripts/test-taskbar-group-ui.mjs (heavy).
// Run: node scripts/test-taskbar-group.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };

const MODREL = 'src/lib/taskbar-group.js';
const modSrc = read(MODREL);
const real = await import(pathToFileURL(path.join(repo, MODREL)).href);

// ── the tables, as functions of a module, so a patched copy is judged by the SAME rows ──
const POINTERS = ['mouse', 'touch', 'pen', ''];
function clickRows(m) {
  const bad = []; let n = 0;
  for (const inFront of [false, true]) for (const pointerType of POINTERS) for (const dragging of [false, true]) for (const popoverOpen of [false, true]) {
    n++;
    const want = dragging ? 'none' : inFront ? 'chooser' : 'activate';
    const got = m.groupClickVerdict({ inFront, pointerType, dragging, popoverOpen });
    if (got !== want) bad.push({ inFront, pointerType, dragging, popoverOpen, want, got });
  }
  return { n, bad };
}
function hoverRows(m) {
  const bad = []; let n = 0;
  const T = m.GROUP_HOVER_INTENT_MS;
  for (const pointerFine of [false, true]) for (const touch of [false, true]) for (const dragging of [false, true]) for (const popoverOpen of [false, true]) for (const intentMs of [0, 150, T - 1, T, T + 50, 5000]) {
    n++;
    const want = (!pointerFine || touch || dragging || popoverOpen) ? 'never' : intentMs >= T ? 'open' : 'wait';
    const got = m.hoverVerdict({ pointerFine, touch, dragging, popoverOpen, intentMs });
    if (got !== want) bad.push({ pointerFine, touch, dragging, popoverOpen, intentMs, want, got });
  }
  return { n, bad };
}

console.log('§1 the PURE module');
{
  const code = modSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/\bimport\s|\brequire\s*\(|\bdocument\b|\bwindow\b/.test(code), 'src/lib/taskbar-group.js imports nothing and touches no DOM');
  ok(['groupClickVerdict', 'hoverVerdict', 'groupKeyVerdict', 'inFrontOf', 'GROUP_HOVER_INTENT_MS', 'GROUP_HOVER_LEAVE_MS'].every((k) => k in real), 'it exports the four verdicts and the two timings');
  ok(real.GROUP_HOVER_INTENT_MS >= 250 && real.GROUP_HOVER_INTENT_MS <= 400, `hover intent is a deliberate pause, not a flyout's (${real.GROUP_HOVER_INTENT_MS} ms, ~300)`);
  ok(real.GROUP_HOVER_LEAVE_MS >= 150 && real.GROUP_HOVER_LEAVE_MS <= 400, `the leave grace covers the gap between button and chooser (${real.GROUP_HOVER_LEAVE_MS} ms, ~250)`);
}

console.log('§2 the CLICK table');
{
  const r = clickRows(real);
  ok(r.n === 32 && r.bad.length === 0, `all ${r.n} rows: behind ⇒ activate, in front ⇒ chooser, a drag's release ⇒ none — for mouse / touch / pen / keyboard, with and without an open hover chooser`, r.bad.slice(0, 4));
  ok(real.groupClickVerdict({}) === 'activate', 'no facts (nothing known in front) ⇒ activate — a click never does nothing');
}

console.log('§3 the HOVER table');
{
  const r = hoverRows(real);
  ok(r.n === 96 && r.bad.length === 0, `all ${r.n} rows: only a fine pointer, never touch / a drag / another popover; wait below the intent, open at it`, r.bad.slice(0, 4));
  ok(real.hoverVerdict({}) === 'never', 'no facts ⇒ never (a hover must be PROVEN to be a mouse)');
}

console.log('§4 the IN-FRONT table');
{
  const f = (o) => real.inFrontOf({ hostId: 'h', tabIds: ['h', 'g'], minimized: false, sameDesktop: true, ...o });
  ok(f({ focusedId: 'h' }) === true && f({ focusedId: 'g' }) === true, 'the host or any of its tabs focused ⇒ in front');
  ok(f({ focusedId: 'x' }) === false && f({ focusedId: null }) === false, 'another window (or none) focused ⇒ behind');
  ok(f({ focusedId: 'g', minimized: true }) === false, 'minimized ⇒ behind (a click restores it)');
  ok(f({ focusedId: 'h', sameDesktop: false }) === false, 'not on the desktop being shown ⇒ behind');
  ok(real.inFrontOf({ focusedId: 'g', hostId: 'h' }) === false, 'no tab list ⇒ only the host id counts');
}

console.log('§5 the KEY table');
{
  const k = (key, inFront) => real.groupKeyVerdict({ key, inFront });
  ok(k('Enter', false) === 'activate' && k(' ', false) === 'activate' && k('Enter', true) === 'chooser' && k(' ', true) === 'chooser', 'Enter / Space = the click rule');
  ok(k('ArrowUp', false) === 'chooser' && k('ArrowUp', true) === 'chooser', 'ArrowUp = the chooser, in front or not');
  ok([k('ArrowDown', false), k('Escape', true), k('a', false), k('Tab', true)].every((v) => v === null), 'every other key is not the button\'s (null)');
}

console.log('§6 NEGATIVE CONTROLS (patched copies judged by the same rows)');
const MUT = mutantCopies('taskbar-group', repo);
{
  const OLD = "return inFront ? 'chooser' : 'activate';";
  ok(modSrc.includes(OLD), 'the click rule is spelled where the control patches it');
  const f = MUT.write(MODREL, modSrc.replace(OLD, "return 'chooser';"), 'always-chooser');
  const m = await import(pathToFileURL(f).href);
  const r = clickRows(m);
  ok(r.bad.length === 8 && r.bad.every((b) => b.want === 'activate' && b.got === 'chooser' && !b.dragging), `CONTROL: the old always-chooser click fails exactly the 8 "behind" clicks (every pointer, hover chooser or not) (${r.bad.length})`, r.bad.slice(0, 2));
  const HOV = 'if (!pointerFine || touch || dragging || popoverOpen) return \'never\';';
  ok(modSrc.includes(HOV), 'the hover gate is spelled where the control patches it');
  const g = MUT.write(MODREL, modSrc.replace(HOV, 'if (!pointerFine || dragging || popoverOpen) return \'never\';'), 'hover-on-touch');
  const h = hoverRows(await import(pathToFileURL(g).href));
  ok(h.bad.length > 0 && h.bad.every((b) => b.touch && b.pointerFine && !b.dragging && !b.popoverOpen), `CONTROL: a hover that forgets touch fails the fine+touch rows (${h.bad.length})`, h.bad.slice(0, 2));
}

console.log('§7 wiring pins (comment-stripped taskbar.js)');
{
  // strip // and /* */ comments outside string / template literals (taskbar.js carries no regex literal)
  const strip = (s) => {
    let out = '', i = 0, q = null;
    while (i < s.length) {
      const c = s[i], d = s[i + 1];
      if (q) { out += c; if (c === '\\') { out += d ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
      if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
      out += c; i++;
    }
    return out;
  };
  const tb = strip(read('src/lib/taskbar.js'));
  const body = (name) => { const a = tb.indexOf(`function ${name}(`); if (a < 0) return ''; const b = tb.indexOf('\nfunction ', a + 10), c = tb.indexOf('\nexport function ', a + 10); return tb.slice(a, Math.min(...[b, c].filter((x) => x > 0), tb.length)); };
  const group = body('_buildGroupItem'), single = body('_rebuildTaskbarItems'), chooser = body('showTabGroupList');
  ok(/import \{[^}]*\bgroupClickVerdict\b[^}]*\bhoverVerdict\b[^}]*\bgroupKeyVerdict\b[^}]*\binFrontOf\b[^}]*\} from '\.\/taskbar-group\.js';/.test(tb), 'taskbar.js imports the verdicts from the PURE module');
  ok(group.length > 500 && single.length > 500 && chooser.length > 500, 'the three bodies were found (non-vacuous)');
  ok(/addEventListener\('click',[\s\S]*?groupClickVerdict\(\{ inFront: _groupInFront\(app, hostId\)/.test(group), 'the grouped button\'s click asks groupClickVerdict with the live in-front fact');
  ok(!/addEventListener\('click', \(\) => showTabGroupList/.test(group) && !/'click'[^\n]*showTabGroupList\(app, item, group\.chain\)/.test(group), 'the old always-chooser click spelling is gone');
  ok(/verdict === 'activate'\) \{[^}]*activateWindow\(app, activeTabOf\(chain\)\)/.test(group), '"activate" = the ONE activation path, on the group\'s ACTIVE tab');
  ok(/addEventListener\('pointerenter'/.test(group) && /hoverVerdict\(\{ pointerFine: fine, touch: !!app\.isTouch, dragging: _dragInProgress\(app, lastButtons\), popoverOpen: _otherPopoverOpen\(\), intentMs \}\)/.test(group) && /setTimeout\(fire, GROUP_HOVER_INTENT_MS\)/.test(group), 'hover arms through hoverVerdict (fine pointer, touch device, drag, other popover) and waits GROUP_HOVER_INTENT_MS');
  {
    const line = (group.match(/\bfine = [^;\n]*pointerType[^;\n]*;/) || [''])[0];
    ok(/fine = \(e\.pointerType === 'mouse' \|\| e\.pointerType === 'pen'\) && _finePointer\(\);/.test(line) && !/touch/.test(line), `a hover is a MOUSE or a PEN on a fine-pointer device, never touch (verify r1: a pen got only the click rule) — ${line}`);
  }
  ok(/const v = hoverNow\(elapsed\);/.test(group), 'the intent is RE-JUDGED when it fires (a drag or a menu may have begun)');
  ok(/addEventListener\('pointerleave', \(\) => \{ step\('leave'\);/.test(group) && /addEventListener\('pointerdown', \(\) => step\('press'\)\)/.test(group) && /addEventListener\('dragstart', \(e\) => \{\s*step\('press'\);/.test(group) && /addEventListener\('contextmenu', \(e\) => \{\s*e\.preventDefault\(\);\s*step\('press'\);/.test(group) && /if \(r\.act === 'cancel'\) cancelIntent\(\);/.test(group), 'leaving, pressing, dragging and the window menu go through hoverStep (leave ends the visit, a press spends it) and cancel the intent');
  // 2026-09-26 (the load construction of the 2.369.183 pen red): the visit is the GROUP's, enter AND move ask hoverStep, only its 'arm' arms
  ok(/^const _hoverSpent = new Set\(\);$/m.test(tb) && /const r = hoverStep\(\{ spent: _hoverSpent\.has\(hostId\) \}, ev\);\s*if \(r\.spent\) _hoverSpent\.add\(hostId\); else _hoverSpent\.delete\(hostId\);/.test(group), 'the hover VISIT is kept per GROUP (a module-level set of host ids), never in one button element\'s closure — a rebuilt button inherits it');
  ok(/addEventListener\('pointerenter', \(e\) => \{[^}]*\}\);/.test(group) && /addEventListener\('pointerenter', \(e\) => \{[\s\S]*?if \(step\('enter'\) === 'arm' && !_chooserOf\(hostId\)\) armFrom\(e\);\s*\}\);/.test(group) && /addEventListener\('pointermove', \(e\) => \{\s*lastButtons = e\.buttons;\s*if \(step\('move'\) === 'arm' && !_chooserOf\(hostId\)\) armFrom\(e\);/.test(group) && (group.match(/setTimeout\(fire, GROUP_HOVER_INTENT_MS\)/g) || []).length === 1 && /const armFrom = \(e\) => \{\s*cancelIntent\(\);/.test(group), 'pointerenter and pointermove both ask hoverStep; the ONE arming (armFrom) runs only on its "arm"');
  ok(/function _watchHoverVisits\(\) \{[\s\S]*?document\.addEventListener\('pointermove', \(e\) => \{[\s\S]*?closest\?\.\('\.taskbar-group'\)\?\.dataset\.winId;[\s\S]*?hoverStep\(\{ spent: true \}, 'away'\)[\s\S]*?\{ capture: true, passive: true \}\);/.test(tb) && /_watchHoverVisits\(\);\s*const step = /.test(group) && /if \(_visitWatch\) return;/.test(tb), 'ONE app-lifetime capture pointermove ends a spent visit when the pointer moves anywhere but that group\'s button (hoverStep \'away\'), installed once');
  ok(/for \(const id of _hoverSpent\) if \(!entries\.some\(\(e\) => e\.id === id && e\.group\)\) _hoverSpent\.delete\(id\);/.test(tb), 'a group gone from the taskbar ends its visit (the set never grows past the live groups)');
  ok(/addEventListener\('keydown',[\s\S]*?groupKeyVerdict\(\{ key: e\.key, inFront: _groupInFront\(app, hostId\) \}\)/.test(group) && /item\.tabIndex = 0;/.test(group), 'the button is focusable and its keys go through groupKeyVerdict');
  ok(/addEventListener\('contextmenu',[\s\S]*?showWindowContextMenu\(app, hostId, e\.clientX, e\.clientY, \{ closeLabel: '\\u2715 ' \+ t\('Close group'\) \}\)/.test(group), 'right-click keeps the group\'s window menu');
  ok(!/groupClickVerdict|hoverVerdict|pointerenter|showTabGroupList/.test(single) && /activateWindow\(app, id\)/.test(single) && /app\.wm\.minimize\(id\)/.test(single), 'the SINGLE button asks none of it: its click is today\'s (minimize when focused, else the same activation), no hover');
  ok(/const leave|leave\(\) \{[\s\S]*?setTimeout\([\s\S]*?GROUP_HOVER_LEAVE_MS\)/.test(chooser) && /pop\.addEventListener\('pointerleave', \(\) => state\.leave\(\)\)/.test(chooser), 'a hover chooser closes GROUP_HOVER_LEAVE_MS after the pointer leaves it (and the button)');
  ok(/document\.addEventListener\('keydown',[^\n]*\{ capture: true, signal: ctl\.signal \}\)/.test(chooser) && /ctl\.abort\(\)/.test(chooser), 'its document Esc listener rides an AbortController aborted on removal');
  ok(/\/ Z\) \+ 'px'/.test(chooser) && /const Z = uiScale\(\);/.test(chooser), 'placed in LAYOUT px (viewport ÷ the UI scale)');
  ok(/if \(!hover\) existing\._chooser\.pin\(\{ keyboard \}\)/.test(chooser), 'a click / key on an open hover chooser PINS it (never re-created)');
  // ── lane K verify r1 (2026-09-25) ──
  ok(/mo\.disconnect\(\); ctl\.abort\(\); pop\._closeCtl\?\.abort\(\);/.test(chooser), 'the chooser\'s ONE cleanup also disposes createPopover\'s outside-click close (a hover chooser opens and closes with no click: 3 → 33 listeners over 30 hovers)');
  // ── the five verify-r1 lows (2026-09-25) ──
  ok(/_chooserOf\(hostId\)\?\._chooser\.reanchor\(item\);/.test(group) && /reanchor\(el\) \{ state\.anchor = el; el\.setAttribute\?\.\('aria-expanded', 'true'\); pop\._closeExclude\?\.push\(el\); \}/.test(chooser), 'a REBUILT grouped button under an open chooser re-anchors it (aria-expanded, the outside-click exclusion)');
  ok(/pop\.remove\(\); state\.anchor\.focus\?\.\(\);/.test(chooser) && /state\.anchor\.setAttribute\?\.\('aria-expanded', 'false'\)/.test(chooser) && /const rect = state\.anchor\.getBoundingClientRect\(\)/.test(chooser) && !/[^.]\banchor\.focus|[^.]\banchor\.setAttribute\?\.\('aria-expanded', 'false'\)|[^.]\banchor\.getBoundingClientRect/.test(chooser), 'Esc focus, the aria-expanded reset and the placement read the LIVE anchor (state.anchor), never the one captured at open');
  ok(/item\.addEventListener\('contextmenu', \(e\) => \{\s*e\.preventDefault\(\);\s*state\.pin\(\);\s*showWindowContextMenu\(app, tid, e\.clientX, e\.clientY,/.test(chooser), 'right-click on a chooser row = THAT tab\'s window menu (preventDefault, the chooser pinned beneath)');
  ok(/onAction: \(kind\) => \{ if \(pop\.isConnected\) \(kind === 'move' \? pop\.remove\(\) : state\.relist\(\)\); \}/.test(chooser) && /relist\(\) \{[\s\S]*?app\.wm\.windows\.get\(hostId\)\?\._tabChain[\s\S]*?showTabGroupList\(app, el, live\)/.test(chooser), '…and the chooser re-lists from the LIVE chain after the action (a Move closes it)');
  {
    const tg = strip(read('src/lib/tab-group.js'));
    const a = tg.indexOf('restoreTabChain(tabIds'), rb = a < 0 ? '' : tg.slice(a, tg.indexOf('\n  },', a));
    ok(rb.length > 200 && /this\._renderTabBar\(chain\);\s*this\._notify\(\);\s*$/.test(rb), 'restoreTabChain ends with _notify() like every other chain mutation — a reload shows the restored group as ONE grouped button with no input');
  }
  // THE PRODUCER CENSUS: every class the two "another popover is open" guards
  // query — _otherPopoverOpen (taskbar.js) and the autohide taskbar's conceal
  // guard (app.js) — is one the tree PRODUCES (a CSS rule, an index.html class
  // attribute, or a className / classList.add / createPopover spelling in src/).
  // A dead name is a guard that guards nothing: `.taskbar-window-list` was one
  // in both (the window list is `overlap-switcher`, a [data-popover]).
  {
    const cssText = fs.readdirSync(path.join(repo, 'public')).filter((f) => f.endsWith('.css')).map((f) => read('public/' + f)).join('\n');
    const html = read('public/index.html');
    const jsText = (() => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (r.endsWith('.js')) out.push(read(r)); } }; walk('src'); return out.join('\n'); })();
    const esc = (c) => c.replace(/[-]/g, '\\-');
    const produced = (c) => new RegExp(`\\.${esc(c)}(?![\\w-])`).test(cssText)
      || new RegExp(`class="[^"]*(?:^|[\\s"])${esc(c)}(?=[\\s"])`).test(html)
      || new RegExp(`(?:className\\s*=\\s*|classList\\.(?:add|toggle)\\(\\s*|createPopover\\([^,]+,\\s*)['"\`][^'"\`]*(?<![\\w-])${esc(c)}(?![\\w-])`).test(jsText);
    const namedIn = (src) => { const set = new Set(); for (const m of src.matchAll(/querySelector(?:All)?\(\s*'([^']*)'/g)) for (const k of m[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) set.add(k[1]); return [...set]; };
    const app = strip(read('src/lib/app.js'));
    const ca = app.indexOf('const conceal = (e) => {'), conceal = ca < 0 ? '' : app.slice(ca, app.indexOf('\n    };', ca));
    const GUARDS = [
      // [where, its body now, its pre-fix spelling verbatim — the CONTROL]
      ['_otherPopoverOpen (taskbar.js)', body('_otherPopoverOpen'), "document.querySelector('.usage-popup:not(.hidden), .taskbar-window-list')"],
      ['the autohide conceal guard (app.js)', conceal, "document.querySelector('.taskbar-window-list, .usage-popup:not(.hidden), [data-popover]')"],
    ];
    for (const [where, now, pre] of GUARDS) {
      const names = namedIn(now), dead = names.filter((c) => !produced(c));
      ok(now.length > 60 && names.length >= 1 && dead.length === 0, `every class ${where} names is produced by the tree (${names.join(', ')})`, dead);
      const deadPre = namedIn(pre).filter((c) => !produced(c));
      ok(deadPre.length === 1 && deadPre[0] === 'taskbar-window-list', `CONTROL: ${where}'s pre-fix spelling is caught — ".${deadPre.join(', .')}" is a name nothing produces`);
    }
    ok(produced('overlap-switcher') && produced('usage-popup') && produced('taskbar-group-chooser') && !produced('taskbar-window-list'), 'the census\'s own oracle: the window list / quota popup / chooser classes are produced, the dead name is not');
  }
}

console.log('§9 attachPopoverClose OWNS its listener (behaviour, in node over a fake document)');
{
  // the function bodies read out of utils.js, run against an EventTarget-shaped fake that honours { signal }. Since
  // lane M (integration 2.369.182) attachPopoverClose is ONE line over utils.js `onOutsidePress` (a capture-phase
  // pointerdown closer, PURE verdicts in src/lib/outside-press.js) — both are read out and run together, the verdicts
  // handed in, so the ownership cases below judge the REAL composed closer.
  const u = read('src/lib/utils.js');
  const fnText = (sig) => {
    const a = u.indexOf(sig);
    let i = u.indexOf('{', u.indexOf(')', a)), depth = 0, end = -1;
    for (; a >= 0 && i < u.length; i++) { if (u[i] === '{') depth++; else if (u[i] === '}') { depth--; if (!depth) { end = i + 1; break; } } }
    return a >= 0 && end > 0 ? u.slice(a, end).replace(/^export /, '') : '';
  };
  const helperSrc = fnText('export function onOutsidePress(');
  const srcNow = helperSrc && fnText('export function attachPopoverClose(') ? helperSrc + '\n' + fnText('export function attachPopoverClose(') : '';
  const OP = await import('../src/lib/outside-press.js');
  // the pre-fix function (master's, its comments dropped) — the NEGATIVE CONTROL judged by the same cases
  const srcOld = `function attachPopoverClose(popover, ...excludeEls) {
  setTimeout(() => {
    const close = (e) => {
      if (popover.contains(e.target)) return;
      for (const el of excludeEls) { if (el?.contains(e.target)) return; }
      if (e.target.closest?.('[data-popover]')) return;
      popover.remove();
      document.removeEventListener('mousedown', close);
    };
    document.addEventListener('mousedown', close);
  }, 0);
}`;
  const harness = (src) => {
    const live = new Set(), q = [];
    const doc = {
      addEventListener(type, fn, opts) { const sig = opts && opts.signal; if (sig && sig.aborted) return; const rec = { type, fn }; live.add(rec); if (sig) sig.addEventListener('abort', () => live.delete(rec)); },
      removeEventListener(type, fn) { for (const r of [...live]) if (r.type === type && r.fn === fn) live.delete(r); },
    };
    // a MOUSE press: the pre-lane closers hear its `mousedown`, the helper its capture `pointerdown` (stamped after arming)
    const fire = (target) => { for (const r of [...live]) if ((r.type === 'mousedown' || r.type === 'pointerdown') && live.has(r)) r.fn({ target, pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, timeStamp: 1e9 }); };
    const flush = () => { while (q.length) q.shift()(); };
    const fn = new Function('document', 'setTimeout', 'performance', 'pressCloses', 'pressPhase', 'tapVerdict', `${src}\nreturn attachPopoverClose;`)(doc, (f) => q.push(f), { now: () => 0 }, OP.pressCloses, OP.pressPhase, OP.tapVerdict);
    const mkPop = () => { const p = { isConnected: true, removed: 0, contains: (t) => t === 'inside', remove() { if (p.isConnected) p.removed++; p.isConnected = false; } }; return p; };
    const outside = { closest: () => null }, inChild = { closest: (sel) => (sel === '[data-popover]' ? {} : null) };
    const n = () => [...live].filter((r) => r.type === 'mousedown' || r.type === 'pointerdown').length; // the closer's PRESS listener (the helper's pointerup / pointercancel ride the same signal)
    const cases = {};
    { const p = mkPop(); fn(p); flush(); const armed = n(); p._closeCtl?.abort(); cases.disposeAfterArm = armed === 1 && n() === 0; live.clear(); }
    { const p = mkPop(); const d = fn(p); if (typeof d === 'function') d(); flush(); cases.disposeBeforeArm = typeof d === 'function' && n() === 0; live.clear(); }
    { const p = mkPop(); fn(p); flush(); fire(outside); cases.outsideCloses = p.removed === 1 && n() === 0; live.clear(); }
    { const p = mkPop(); fn(p); flush(); fire('inside'); fire(inChild); cases.insideAndChildKeep = p.removed === 0 && n() === 1; live.clear(); }
    { const p = mkPop(); fn(p); flush(); p.remove(); p.removed = 0; fire(inChild); cases.goneSelfHeals = p.removed === 0 && n() === 0; live.clear(); }
    { const ex = { contains: (t) => t === 'exA' }; const p = mkPop(); fn(p, ex); flush(); fire('exA'); cases.anchorExcluded = p.removed === 0 && n() === 1; live.clear(); }
    // verify-r1 low ②: an anchor REBUILT while the popover is open joins the LIVE exclusion list
    { const ex = { contains: (t) => t === 'exA' }, exB = { contains: (t) => t === 'exB' }; const p = mkPop(); fn(p, ex); flush(); p._closeExclude?.push(exB); fire({ closest: () => null }); const after1 = p.removed; const p2 = mkPop(); fn(p2, ex); flush(); p2._closeExclude?.push(exB); fire('exB'); cases.liveExclusion = after1 === 1 && p2.removed === 0; live.clear(); }
    return cases;
  };
  // the r1-minor function (verify r1's first commit, comments dropped): it owns its listener, but its exclusion list is frozen at open
  const srcMinor = `function attachPopoverClose(popover, ...excludeEls) {
  const ctl = new AbortController();
  popover._closeCtl = ctl;
  setTimeout(() => {
    if (ctl.signal.aborted) return;
    const close = (e) => {
      if (!popover.isConnected) { ctl.abort(); return; }
      if (popover.contains(e.target)) return;
      for (const el of excludeEls) { if (el?.contains(e.target)) return; }
      if (e.target.closest?.('[data-popover]')) return;
      popover.remove();
      ctl.abort();
    };
    document.addEventListener('mousedown', close, { signal: ctl.signal });
  }, 0);
  return () => ctl.abort();
}`;
  ok(srcNow.length > 200, 'attachPopoverClose read out of utils.js (non-vacuous)');
  const now = harness(srcNow), old = harness(srcOld), minor = harness(srcMinor);
  for (const [k, v] of Object.entries(now)) ok(v === true, `now: ${k}`);
  ok(!old.disposeAfterArm && !old.disposeBeforeArm && !old.goneSelfHeals && !old.liveExclusion && old.outsideCloses && old.insideAndChildKeep && old.anchorExcluded, 'CONTROL: the pre-fix function fails exactly the ownership cases (no disposer, no self-heal, no live exclusion) and keeps the three it always had', old);
  ok(Object.entries(minor).every(([k, v]) => (k === 'liveExclusion' ? v === false : v === true)), 'CONTROL: the r1-minor function fails ONLY the live exclusion (a rebuilt anchor\'s mousedown closed its chooser as "elsewhere")', minor);
}

console.log('§10 WHO OPENED THE HOVER CHOOSER — the pen leg\'s judge over a fake clock (the 2.369.183 mirror red)');
{
  const JREL = 'scripts/pen-hover-judge.mjs';
  const jSrc = read(JREL);
  const J = await import(pathToFileURL(path.join(repo, JREL)).href);
  const jCode = jSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/\bimport\s|\brequire\s*\(|\bdocument\b|\bwindow\b|\bprocess\b/.test(jCode) && typeof J.judgeHoverOpen === 'function', `${JREL} is PURE (imports nothing, no DOM, no process) and exports judgeHoverOpen`);
  const FIX = 'const by = enters.length ? enters[0] : null;';
  ok(jSrc.split(FIX).length === 2, 'the attribution (the FIRST enter after the reset armed the intent) is spelled once, where the control patches it');
  // THE CONTROL: the pre-fix recorder's ONE slot — the last pointerenter at the sample — through the same judge
  const pre = await import(pathToFileURL(MUT.write(JREL, jSrc.replace(FIX, 'const by = enters.filter((e) => !(e.at > record.sampledAt)).at(-1) || null;'), 'last-enter-slot')).href);

  // THE FAKE CLOCK. One trial = one interleaving of the race's participants, on the page clock:
  //   the pen ARRIVES at 0 (pointerId 2: enter + move) — the product asks its REAL hoverStep for each event (Chrome's
  //     re-targeting enter comes WITHOUT a move), arms on its 'arm' (restarting any armed timer, as armFrom does), and
  //     the timer fires GROUP_HOVER_INTENT_MS + `late` after the arming through the REAL hoverVerdict;
  //   frames tick at `phase + k·period` (a slow main thread paints less often);
  //   Chrome's hover recompute: at the `recomputeAt`-th frame after a LAYOUT change it moves the MOUSE pointer (id 1) to
  //     the last known position — the pen's — a mouse-typed pointerenter on the button (once: the mouse pointer then
  //     stays there). Layout changes: the chooser's open, and (`pending`) one the leg's previous steps left for a frame
  //     that had not come yet when the pen arrived;
  //   the leg's poll saw the open and read the record `sampleAfter` ms later (the CDP round trip);
  //   `penArms` false = the mouse-only product (CONTROL 2's revert): a pen is not a fine pointer to it.
  const T = real.GROUP_HOVER_INTENT_MS, HOVER_REAL = real.hoverVerdict; // the PRODUCT's intent, verdict and step, never a copy
  function trial({ period, phase, late, recomputeAt, sampleAfter, pending = false, penArms = true, waitRecompute = false }, stepMod = real) {
    const enters = [], opens = [];
    const frameAfter = (t, n) => { const k = Math.floor((t - phase * period) / period) + 1; return phase * period + (k + n - 1) * period; }; // the n-th frame boundary strictly after t
    let spent = false, armedAt = null, mouseOn = false;
    const feed = (ev, ptr, at) => { // the wiring: step, then arm on 'arm' (armFrom — a fine pointer only)
      if (ev === 'enter') enters.push({ type: ptr, id: ptr === 'pen' ? 2 : 1, at });
      const r = stepMod.hoverStep({ spent }, ev); spent = r.spent;
      if (r.act === 'cancel') armedAt = null;
      if (r.act === 'arm' && (ptr === 'mouse' || (ptr === 'pen' && penArms))) armedAt = at;
    };
    feed('enter', 'pen', 0); feed('move', 'pen', 0);
    if (pending) { feed('enter', 'mouse', frameAfter(0, 1)); mouseOn = true; }
    let open = null;
    if (armedAt !== null) {
      let fireAt = armedAt + T + late;
      for (let guard = 0; guard < 20 && !open; guard++) {
        const v = HOVER_REAL({ pointerFine: true, touch: false, dragging: false, popoverOpen: false, intentMs: fireAt - armedAt });
        if (v === 'open') open = { at: fireAt, mode: 'hover' };
        else if (v === 'wait') fireAt += Math.max(1, T - (fireAt - armedAt)) + late;
        else break;
      }
    }
    if (open) opens.push(open);
    let sampledAt = open ? open.at + sampleAfter : 1200; // the leg's own deadline when nothing opens
    if (open && !mouseOn) { const m = frameAfter(open.at, recomputeAt); enters.push({ type: 'mouse', id: 1, at: m }); if (waitRecompute) sampledAt = Math.max(sampledAt, m); }
    const rec = { enters: enters.filter((e) => e.at <= sampledAt), opens: opens.filter((o) => o.at <= sampledAt), sampledAt };
    return { rec, open, recomputeBeforeSample: enters.some((e) => e.type === 'mouse' && e.at <= sampledAt && (!open || e.at > open.at)) };
  }
  const grid = [];
  for (const period of [1000 / 60, 33, 50, 100, 200]) for (const phase of [0, 0.5]) for (const late of [0, 15, 60]) for (const recomputeAt of [1, 2]) for (const sampleAfter of [0, 10, 25, 40, 80, 160]) grid.push({ period, phase, late, recomputeAt, sampleAfter });
  // ① the settled page (the heavy leg settles frames before the pen moves): every interleaving, both judges
  const settled = grid.map((g) => ({ g, ...trial(g) }));
  const fixBad = settled.filter((x) => J.judgeHoverOpen(x.rec).verdict !== 'opened');
  ok(settled.length >= 40 && fixBad.length === 0, `① the judge credits the PEN in all ${settled.length} settled interleavings (frame period 16–200 ms, timer late 0–60 ms, recompute at frame 1/2, the sample 0–160 ms after the open)`, fixBad.slice(0, 2).map((x) => ({ g: x.g, v: J.judgeHoverOpen(x.rec) })));
  const lost = settled.filter((x) => x.recomputeBeforeSample), won = settled.filter((x) => !x.recomputeBeforeSample);
  const preRed = settled.filter((x) => pre.judgeHoverOpen(x.rec).verdict !== 'opened');
  ok(lost.length > 0 && won.length > 0 && preRed.length === lost.length && preRed.every((x) => x.recomputeBeforeSample), `CONTROL: the pre-fix last-enter slot is red on EXACTLY the ${lost.length} interleavings where Chrome's recompute beat the sample and green on the ${won.length} where the sample won — a race (green standalone, red on a slow runner)`, { preRed: preRed.length, lost: lost.length, won: won.length });
  // measured on chrome (--only l): the recompute lands +31 ms after the open at 60 Hz (the 2nd frame), +30–50 ms at CPU ×20,
  // and the original leg was red 0/20 at ×1 and ×6, 9/20 at ×10, 17/20 at ×20 — the model agrees: at the measured frame a
  // 60 Hz page sampled within 10 ms of the open never loses; the slow pages do
  const fastLost = lost.filter((x) => x.g.period < 20 && x.g.recomputeAt === 2 && x.g.sampleAfter <= 10).length, slowLost = lost.filter((x) => x.g.period >= 100).length;
  ok(fastLost === 0 && slowLost > 0, `…the losing order is the SLOW page's: at the measured recompute frame a 60 Hz page sampled within 10 ms of the open never loses (${fastLost}); 100–200 ms frames do (${slowLost})`);
  // ② the heavy leg's construction: it WAITS for the recompute before sampling ⇒ the race is in every record
  const waited = grid.map((g) => trial({ ...g, waitRecompute: true }));
  ok(waited.every((x) => J.judgeHoverOpen(x.rec).verdict === 'opened' && J.judgeHoverOpen(x.rec).recompute.length === 1) && waited.every((x) => pre.judgeHoverOpen(x.rec).verdict !== 'opened'), `② waiting for the recompute (the heavy leg's construction): the judge credits the pen and reports the recompute in all ${waited.length}; the pre-fix slot is red in all ${waited.length} (its control is deterministic, not a race)`);
  // ③ a layout PENDING at the pen's arrival: Chrome's mouse enter comes before the open — the judge never assumes which
  //    enters the product arms on: 'premise' (the leg retries by name), never 'opened', never a false failure verdict;
  //    and the PRODUCT does not restart the pen's intent on it (hoverStep: an enter is not an arrival)
  const pend = grid.map((g) => ({ g, ...trial({ ...g, pending: true }) }));
  const pendV = pend.map((x) => J.judgeHoverOpen(x.rec).verdict);
  ok(pendV.every((v) => v === 'premise') && pend.every((x) => x.open && x.open.at === settled.find((y) => y.g === x.g)?.open?.at), `③ a layout pending when the pen arrives (Chrome's mouse enter BEFORE the open): 'premise' in all ${pend.length} — never credited to the pen, never judged a failure (${[...new Set(pendV)].join(', ')}); the product opened at the pen's own intent in every one (not restarted by the re-target)`);
  // ④ CONTROL 2's mouse-only product: a settled page gives the pen nothing ('no-open'); with a pending layout Chrome's
  //    mouse enter is in the record before the sample — 'premise', never credited to the pen
  const mo = grid.map((g) => trial({ ...g, penArms: false })).map((x) => J.judgeHoverOpen(x.rec).verdict);
  const moPend = grid.map((g) => trial({ ...g, penArms: false, pending: true })).map((x) => J.judgeHoverOpen(x.rec).verdict);
  ok(mo.every((v) => v === 'no-open') && moPend.every((v) => v === 'premise'), `④ the mouse-only product: 'no-open' on a settled page (${mo.length}), 'premise' when Chrome's mouse entered before the sample (${moPend.length}) — the pen is never credited for Chrome's mouse`);
  // ⑤ the judge's other rows
  const E = (type, id, at) => ({ type, id, at });
  ok(J.judgeHoverOpen({ enters: [], opens: [], sampledAt: 900 }).verdict === 'premise' && J.judgeHoverOpen({ enters: [E('pen', 2, 0)], opens: [{ at: 120, mode: 'hover' }], sampledAt: 200 }).verdict === 'early' && J.judgeHoverOpen({ enters: [E('pen', 2, 0)], opens: [{ at: 320, mode: 'click' }], sampledAt: 400 }).verdict === 'wrong-mode' && J.judgeHoverOpen({ enters: [E('mouse', 1, 0)], opens: [{ at: 300, mode: 'hover' }], sampledAt: 400 }).verdict === 'premise', '⑤ no enter / an open before the intent / a click-mode open / a mouse first ⇒ premise / early / wrong-mode / premise');
  // ⑥ wiring: the heavy suite judges (l) through the module, records TYPED enters, never a last-type slot, runs the ×20 leg; the
  //    model's assumption about the product (a pointerenter with nothing open re-arms) is still the product's
  const ui = read('scripts/test-taskbar-group-ui.mjs');
  ok(/import \{ judgeHoverOpen \} from '\.\/pen-hover-judge\.mjs';/.test(ui) && /R\.enters\.push\(\{ type: e\.pointerType, id: e\.pointerId, at: R\.enterG \}\)/.test(ui) && !/enterType/.test(ui) && /const v = judgeHoverOpen\(rec, \{ type: 'pen' \}\);/.test(ui), '⑥ test-taskbar-group-ui records every enter TYPED (no last-type slot left) and judges the pen leg through judgeHoverOpen');
  ok(/Emulation\.setCPUThrottlingRate', \{ rate: 20 \}\)/.test(ui) && /l2\.every\(\(x\) => x\.v\.recompute\.length > 0 && x\.pre\.verdict !== 'opened'\)/.test(ui) && /await evalJs\(FRAMES\(3\)\);/.test(ui), '…settles frames before the pen moves, and keeps the ×20 leg with its in-record control');
}

console.log('§11 THE HOVER VISIT over a fake clock — a rebuild under a RESTING pointer is not an arrival (found by the load construction)');
{
  // the one-core load construction (8 busy loops on the suite's core) turned leg (a) red on master: the Explorer's title
  // landed after the click, the taskbar REBUILT the button under the resting pointer, Chrome re-targeted the pointer onto
  // the new element (a bare pointerenter), its fresh closure armed, a hover chooser grew 300 ms later — constructed at ×1:
  // a click, then a tab title change, 5 of 5. The fake clock drives the REAL hoverStep with the wiring's per-GROUP visit
  // (a rebuild replaces the element, never the visit) and the wiring's arming (a fine pointer, armFrom restarting):
  //   each script = timed events {at, ev: enter|move|leave|press|esc|rebuild, ptr}; Chrome's re-target = a bare 'enter'
  //   at `frames` frames of `period` after the rebuild; the timer opens at arming + intent unless cancelled; Esc closes.
  const T = real.GROUP_HOVER_INTENT_MS;
  const sim = (mod, script) => {
    let spent = false, timerAt = null, open = false; const opens = [];
    const evs = [...script].sort((a, b) => a.at - b.at);
    const flush = (t) => { if (timerAt !== null && timerAt <= t) { if (!open) { opens.push(timerAt); open = true; } timerAt = null; } };
    for (const x of evs) {
      flush(x.at);
      if (x.ev === 'esc') { open = false; continue; }
      if (x.ev === 'rebuild') continue; // the element is replaced; the visit (per group) is not
      const r = mod.hoverStep({ spent }, x.ev); spent = r.spent;
      if (r.act === 'cancel') timerAt = null;
      if (r.act === 'arm' && !open) timerAt = x.at + T; // armFrom: cancel any armed timer, arm afresh
      if (x.ev === 'leave') open = false; // (the chooser's own leave grace is not this table's subject)
    }
    flush(Infinity);
    return opens;
  };
  { // the table: every visit state × every event
    const W = { move: [{ spent: true, act: 'arm' }, { spent: true, act: null }], press: [{ spent: true, act: 'cancel' }, { spent: true, act: 'cancel' }], leave: [{ spent: false, act: 'cancel' }, { spent: false, act: 'cancel' }], away: [{ spent: false, act: null }, { spent: false, act: null }], enter: [{ spent: false, act: null }, { spent: true, act: null }], click: [{ spent: false, act: null }, { spent: true, act: null }] };
    const bad = [];
    for (const [ev, want] of Object.entries(W)) for (const spent of [false, true]) { const got = real.hoverStep({ spent }, ev), w = want[spent ? 1 : 0]; if (got.spent !== w.spent || got.act !== w.act) bad.push({ ev, spent, got, w }); }
    ok(bad.length === 0, 'hoverStep\'s table: the visit\'s FIRST move arms, a later move nothing; a press spends it and cancels; a leave ends it and cancels; a pointer moving AWAY (anywhere but this group\'s button) ends it; an enter (or any other event) arms nothing and ends nothing', bad);
  }
  const HS = 'return { spent: !!spent, act: null }; // \'enter\' (and anything else) arms nothing and ends nothing';
  ok(modSrc.split(HS).length === 2, 'the enter row is spelled once, where the control patches it (and where CONTROL 2 of the heavy suite reverts it)');
  const preMod = await import(pathToFileURL(MUT.write(MODREL, modSrc.replace(HS, "return event === 'enter' ? { spent: true, act: 'arm' } : { spent: !!spent, act: null };"), 'enter-arms')).href);
  const rows = [];
  for (const period of [1000 / 60, 50, 200]) for (const frames of [1, 2, 3]) for (const rebuildAfter of [0, 40, 120, 250, 299, 400, 800]) {
    const rt = (t0) => t0 + rebuildAfter + frames * period; // Chrome's re-targeting enter on the rebuilt button
    const arrive = (at, ptr = 'mouse') => [{ at, ev: 'enter', ptr }, { at, ev: 'move', ptr }];
    rows.push({ kind: 'click', want: 0, script: [...arrive(0), { at: 20, ev: 'press' }, { at: 20 + rebuildAfter, ev: 'rebuild' }, { at: rt(20), ev: 'enter' }] });
    rows.push({ kind: 'esc', want: 1, script: [...arrive(0), { at: T + 50, ev: 'esc' }, { at: T + 50 + rebuildAfter, ev: 'rebuild' }, { at: rt(T + 50), ev: 'enter' }] });
    rows.push({ kind: 'wiggle', want: 0, script: [...arrive(0), { at: 20, ev: 'press' }, { at: 20 + rebuildAfter, ev: 'rebuild' }, { at: rt(20), ev: 'enter' }, { at: rt(20) + 30, ev: 'move' }, { at: rt(20) + 90, ev: 'move' }] });
    rows.push({ kind: 'return', want: 1, script: [...arrive(0), { at: 20, ev: 'press' }, { at: 20 + rebuildAfter, ev: 'rebuild' }, { at: rt(20), ev: 'enter' }, { at: rt(20) + 60, ev: 'leave' }, ...arrive(rt(20) + 200)], opensAt: rt(20) + 200 + T });
    // the pointer LEFT while the button was being rebuilt: no retarget enter, no leave on the live element — it moved elsewhere
    rows.push({ kind: 'away', want: 1, script: [...arrive(0), { at: 20, ev: 'press' }, { at: 20 + rebuildAfter, ev: 'rebuild' }, { at: 20 + rebuildAfter + 5, ev: 'away' }, ...arrive(20 + rebuildAfter + 300)], opensAt: 20 + rebuildAfter + 300 + T });
    rows.push({ kind: 'pen-retarget', want: 1, script: [...arrive(0, 'pen'), { at: Math.min(rebuildAfter, T - 1), ev: 'rebuild' }, { at: Math.min(rebuildAfter, T - 1) + 1, ev: 'enter', ptr: 'mouse' }], opensAt: T });
  }
  const judge = (mod) => rows.map((r) => { const o = sim(mod, r.script); return { r, o, good: o.length === r.want && (r.opensAt === undefined || o[0] === r.opensAt) }; });
  const now = judge(real), pre = judge(preMod);
  const by = (res, k) => res.filter((x) => x.r.kind === k);
  ok(rows.length >= 40 && now.every((x) => x.good), `the product's hoverStep: in all ${rows.length} timed scripts — a click then a rebuild (${by(now, 'click').length}), a wiggle on the rebuilt button (${by(now, 'wiggle').length}): nothing grows; Esc then a rebuild: nothing comes back (${by(now, 'esc').length}); a genuine leave + return opens at its own intent (${by(now, 'return').length}), and so does a return after the pointer moved AWAY during the rebuild (no leave reached the live button) (${by(now, 'away').length}); a pen re-targeted before its open opens at the PEN's intent, not restarted (${by(now, 'pen-retarget').length})`, now.filter((x) => !x.good).slice(0, 2).map((x) => ({ kind: x.r.kind, opens: x.o })));
  const preBad = (k) => by(pre, k).filter((x) => !x.good).length;
  const AW = "  if (event === 'away') return { spent: false, act: null };";
  ok(modSrc.split(AW).length === 2, 'the away row is spelled once, where its control patches it');
  const staleMod = await import(pathToFileURL(MUT.write(MODREL, modSrc.replace(AW, "  if (event === 'away') return { spent: !!spent, act: null };"), 'away-ignored')).href);
  const stale = judge(staleMod);
  ok(by(stale, 'away').every((x) => !x.good && x.o.length === 0) && stale.filter((x) => x.r.kind !== 'away').every((x) => x.good), `CONTROL (a patched copy that ignores 'away' — the visit kept per group but never ended off the button): every return after the pointer left during a rebuild MISSES its hover (${by(stale, 'away').filter((x) => !x.good).length}/${by(stale, 'away').length}); every other script unchanged`);
  ok(preBad('click') === by(pre, 'click').length && preBad('esc') === by(pre, 'esc').length && preBad('pen-retarget') === by(pre, 'pen-retarget').filter((x) => x.r.script[3].at < T).length && preBad('return') === 0, `CONTROL (a patched copy: every pointerenter is an arrival — the pre-fix hover): a chooser grows under the pointer that clicked in ${preBad('click')}/${by(pre, 'click').length}, the Esc-dismissed one comes back in ${preBad('esc')}/${by(pre, 'esc').length}, the pen's intent restarts whenever the re-target came before the open (${preBad('pen-retarget')}/${by(pre, 'pen-retarget').length}); a genuine return is unchanged (${preBad('return')} red)`);
}

console.log('§8 words + tree');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  for (const k of ['{n} windows grouped', 'Windows in this group']) ok(zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'), `"${k}" has zh + ja`);
  for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 5 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
