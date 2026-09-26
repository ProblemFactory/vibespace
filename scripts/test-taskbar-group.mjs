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
  ok(['pointerleave', 'pointerdown', 'dragstart'].every((ev) => new RegExp(`addEventListener\\('${ev}',[^\\n]*cancelIntent`).test(group) || new RegExp(`addEventListener\\('${ev}', \\(e\\) => \\{\\n\\s*cancelIntent\\(\\)`).test(group)), 'leaving, pressing and dragging cancel the intent');
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

console.log('§8 words + tree');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  for (const k of ['{n} windows grouped', 'Windows in this group']) ok(zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'), `"${k}" has zh + ja`);
  for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 2 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
