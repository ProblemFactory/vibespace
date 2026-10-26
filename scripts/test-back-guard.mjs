#!/usr/bin/env node
// THE PHONE'S BACK GESTURE (lane mobile-back-guard, 2026-10-18 — the owner: 「在手机版上能不能 block 一下那个返回手势
// 啊？我有时候不小心返回返回着，就多返回了几下」). Fast, no browser:
//   §1 the PURE verdict table (src/lib/back-guard.js backVerdict): close / arm / leave, a desktop is never ours, the
//      2 s window at its exact edges, the Mobile setting off, the deep-link first back (closes no window, still closes
//      a menu), then the same rule; backTarget's order (Esc's floats → dialog → switcher → sheet → the window area →
//      the drill-down → home); bootStep (push / keep on a reload that landed on the sentinel / none)
//   §2 THE REAL WIRING (src/lib/mobile-back.js, esbuild-bundled with utils/i18n stubbed) over a fake history + a fake
//      clock: one sentinel at boot and none on a reload onto it; each layer closes the way its own closer does and the
//      page steps back onto the SAME sentinel (no new entry — the Chrome intervention rule); at home the toast + the
//      person's own gesture, a second back inside 2 s is the browser's own and leaves, after 2 s it re-arms; the
//      setting off leaves; a vanished forward sentinel is pushed again; the deep-link first back; a #fragment link is no back
//   §3 NEGATIVE CONTROLS on patched copies: the window edge `<` → `<=`, deepLinkFirst ignored, a wiring that re-arms
//      with pushState (the measured-fragile shape), a wiring without the URL check — each fails its legs
//   §5 A BACK NEVER COSTS A LOAD (lane phone-back-reload — the owner on Android: the back press reloaded VibeSpace): the
//      PURE bootStep rebuild / exitPlan / backCostLoad rows, then the real wiring over a fake history that knows
//      DOCUMENTS (a traversal onto another document's entry = a load) and a fake Navigation API: a discarded tab shown
//      again (its dead entry reported sameDocument, as Chrome does) rebuilds and its first back is same-document; a
//      renderer kill's reload, a second load of the app in the tab: the exit leaves past every older entry in ONE
//      go(-n); the whole tab VibeSpace's: the first entry, ONE named load; nothing before the block after all: the
//      700 ms fallback; the diary's rows (boot / pop / go1 / leave); a load after a back press files ONE incident per
//      half hour, never after the exit's own named load; RED controls: the pre-fix bootStep, no exit plan, a dropped go(1).
//      ACCEPTANCE ROUND 2: exitHop's table; the fake history counts JOINT steps (an iframe link inside an older document
//      adds one the Navigation API never shows) and a traversal onto another document fires beforeunload at once and
//      commits when the page answers: the exit's go(-3) LANDS on the older document, which reads the intent and goes on
//      back without booting the app; nothing below + an unseen step: the hops end at the cap, the page stays (ONE named
//      load); a person's tap ends a hop; an intent that is not this load's is dropped; a go() onto a slow page never
//      fires the fallback (beforeunload, not pagehide); a FORWARD press files nothing (navigation.activation's way in);
//      RED controls: no intent (lands on the older document and stays), a direction-blind detector, pagehide as the judge.
//      ACCEPTANCE ROUND 3: the fake history fires pagehide at each commit, knows a traversal that is CANCELLED (beforeunload,
//      then nothing — a 204, a stopped load) and a document the back/forward cache KEPT (shown again, never loaded): a
//      hop's cancelled go() — the page stays after 3 s (why cancelled) and boots, no listener of its own left, the intent
//      gone; a tap while it is pending stays at once; the exit's own cancelled go() drops the intent and says so; the
//      exit landing on a KEPT older document goes on; no key, no hop (no Navigation API, entries() without activation),
//      and such a browser's exit writes no intent; without activation backCostLoad is round 1's rule again. RED controls
//      from round 2: no bound + a tap ignored while pending, the pageshow that cleared, the clock-alone exitHop + an
//      intent written anyway, the pop-row cost rule.
//      ACCEPTANCE ROUND 4: slowExit's table; the fake history knows a traversal still PENDING — another traversal aborts
//      it (navigation.forward() included), a pushState does not, a `race` entry's commit beats an abort — per-entry
//      commit times and the entry a commit left FROM: a stay keeps the intent (its window, then dropped; the late watch's
//      listeners until 30 s); the exit's cancelled go() re-arms (a new sentinel: the next back is the toast, not a load);
//      the exit on a slow link (the older document at 3.5 s) lands, its late pagehide keys the intent to the new sentinel,
//      and the older document goes on; at 12 s (past the window) it boots and files ONE «a slow exit»; a tap while the
//      exit's go() is pending ABORTS it (the step onto the sentinel: re-armed, nothing commits) — or, the commit first,
//      the diary says so and the older document goes on; a hop slower than the bound leaves late and says so. RED
//      controls from round 3: the intent dropped at the bound, no re-arm, no abort, no incident for the late landing;
//      and the late pagehide's re-key removed (the measured from of a pending traversal after a new sentinel)
//   §4 wiring pins: app.js installs it only when isMobile, ONE pushState in the wiring, the For-you tray closes
//      through hidePopup, the setting row (Mobile, default on) is read, the overscroll rule is coarse-pointer only,
//      zh + ja words
// Run: node scripts/test-back-guard.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8');
const MUT = mutantCopies('back-guard', repo);
const BG = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', read('src/lib/back-guard.js'), 'as-is')).href); // an .mjs copy: the tree's package.json has no "type"

// ── §1 the PURE table ──
const TABLE = [
  // [name, input, action, toast?]
  ['a desktop is never ours (no sentinel there)', { phone: false, target: 'popover' }, 'none'],
  ['a desktop, at home', { phone: false, target: null, lastBackAt: 1000, now: 1500 }, 'none'],
  ['a popover open ⇒ close', { target: 'popover' }, 'close'],
  ['a dialog open ⇒ close', { target: 'dialog' }, 'close'],
  ['the window area on show ⇒ close (it yields to the sidebar)', { target: 'window' }, 'close'],
  ['the drill-down ⇒ close (the ‹ row)', { target: 'drilldown' }, 'close'],
  ['a popover open while armed ⇒ close still wins', { target: 'popover', lastBackAt: 1000, now: 1500 }, 'close'],
  ['at home, first back ⇒ arm + the toast', { target: null, lastBackAt: 0, now: 5000 }, 'arm', true],
  ['at home, a second back 1 ms in ⇒ leave', { target: null, lastBackAt: 5000, now: 5001 }, 'leave'],
  ['at home, a second back at 1999 ms ⇒ leave', { target: null, lastBackAt: 5000, now: 6999 }, 'leave'],
  ['at home, a second back at exactly 2000 ms ⇒ re-arm', { target: null, lastBackAt: 5000, now: 7000 }, 'arm', true],
  ['at home, a second back after 3 s ⇒ re-arm', { target: null, lastBackAt: 5000, now: 8000 }, 'arm', true],
  ['a clock that went backwards ⇒ arm (never a leave on a negative gap)', { target: null, lastBackAt: 5000, now: 4000 }, 'arm', true],
  ['the Mobile setting off ⇒ leave (the press was meant to leave)', { enabled: false, target: 'popover' }, 'leave'],
  ['the deep-link first back closes no window ⇒ arm', { target: 'window', deepLinkFirst: true }, 'arm', true],
  ['the deep-link first back still closes a menu', { target: 'popover', deepLinkFirst: true }, 'close'],
  ['the deep-link first back still closes a dialog', { target: 'dialog', deepLinkFirst: true }, 'close'],
  ['after the deep-link first back: the same rule (the window closes)', { target: 'window', deepLinkFirst: false }, 'close'],
];
function judgeTable(M) {
  const bad = [];
  for (const [name, inp, action, toast] of TABLE) {
    const v = M.backVerdict(inp);
    if (v.action !== action || (toast ? v.toast !== M.BACK_TOAST : v.toast !== null)) bad.push({ name, got: v });
  }
  return bad;
}
console.log('\n§1 the PURE verdict');
for (const [name, inp, action, toast] of TABLE) {
  const v = BG.backVerdict(inp);
  ok(v.action === action && (toast ? v.toast === 'Press back again to exit' : v.toast === null), `${name} → ${action}`, v);
}
ok(BG.BACK_WINDOW_MS === 2000, 'the window is 2 s');
const T = (o) => BG.backTarget(o);
ok(T({ popover: true, dialog: true, switcher: true, sheet: true, sidebarOpen: false, drilldown: true }) === 'popover', 'order: the floats first (Esc\'s rule)');
ok(T({ dialog: true, switcher: true, sheet: true }) === 'dialog', 'order: then a dialog');
ok(T({ switcher: true, sheet: true }) === 'switcher', 'order: then the window switcher');
ok(T({ sheet: true, sidebarOpen: true, drilldown: true }) === 'sheet', 'order: then a sheet');
ok(T({ sidebarOpen: false, drilldown: true }) === 'window', 'order: then the window area (sidebar closed)');
ok(T({ sidebarOpen: true, drilldown: true }) === 'drilldown', 'order: then the sidebar\'s drill-down');
ok(T({ sidebarOpen: true }) === null, 'the sidebar at its top level = home (null)');
// lane phone-first-screen (design q-044 decision 5): HOME = the attention page while its first screen holds a row
ok(T({ sidebarOpen: false, home: true, homeRows: true }) === null, 'the attention page on show = home (null)');
ok(T({ sidebarOpen: false, home: false, homeRows: true }) === 'window', 'a window on show, rows in the attention list: the window area yields (to the page)');
ok(T({ sidebarOpen: true, homeRows: true }) === 'sidebar', 'the sidebar open while the list has rows: one layer above home — it closes');
ok(T({ sidebarOpen: true, homeRows: true, drilldown: true }) === 'drilldown', '…its drill-down first');
ok(T({ sheet: true, home: true, homeRows: true }) === 'sheet' && T({ dialog: true, home: true, homeRows: true }) === 'dialog', 'a sheet / a dialog over the page closes first');
ok(T({ sidebarOpen: true, homeRows: false }) === null && T({ sidebarOpen: false, homeRows: false }) === 'window', 'an empty list: the sidebar is home again (the rule before)');
ok(BG.bootStep({ phone: true, enabled: true, state: null }) === 'push', 'boot: a phone pushes the sentinel');
ok(BG.bootStep({ phone: true, enabled: true, state: { vs: 1 } }) === 'keep', 'boot: a reload / restored tab ON the sentinel keeps it (no second one)');
ok(BG.bootStep({ phone: true, enabled: false, state: { vs: 1 } }) === 'keep', 'boot: setting off but standing on a sentinel: kept (its next back leaves)');
ok(BG.bootStep({ phone: true, enabled: false, state: null }) === 'none', 'boot: the setting off pushes nothing');
ok(BG.bootStep({ phone: false, enabled: true, state: null }) === 'none', 'boot: a desktop pushes nothing');
ok(BG.isSentinel({ vs: 1 }) && !BG.isSentinel(null) && !BG.isSentinel({ vs: 2 }) && !BG.isSentinel('vs'), 'isSentinel: only {vs:1}');
const REBUILD_ROWS = [ // lane phone-back-reload: [name, input, step]
  ['a discarded tab shown again (wasDiscarded) ON the sentinel ⇒ rebuild', { phone: true, enabled: true, state: { vs: 1 }, navType: 'back_forward', wasDiscarded: true, belowSame: true }, 'rebuild'],
  ['wasDiscarded alone (any navigation type) ⇒ rebuild', { phone: true, enabled: true, state: { vs: 1 }, navType: 'reload', wasDiscarded: true }, 'rebuild'],
  ['a history load onto the sentinel (back_forward — a restored tab reports it too) ⇒ rebuild', { phone: true, enabled: true, state: { vs: 1 }, navType: 'back_forward', belowSame: true }, 'rebuild'],
  ['the Navigation API says the entry below is another document ⇒ rebuild', { phone: true, enabled: true, state: { vs: 1 }, navType: 'reload', belowSame: false }, 'rebuild'],
  ['a reload, the entry below same-document (measured) ⇒ keep', { phone: true, enabled: true, state: { vs: 1 }, navType: 'reload', belowSame: true }, 'keep'],
  ['a reload without the Navigation API (belowSame unknown) ⇒ keep', { phone: true, enabled: true, state: { vs: 1 }, navType: 'reload', belowSame: null }, 'keep'],
  ['the setting off, a discarded tab on a sentinel ⇒ keep (nothing written)', { phone: true, enabled: false, state: { vs: 1 }, navType: 'back_forward', wasDiscarded: true }, 'keep'],
  ['a renderer kill\'s reload lost the state (null) ⇒ push', { phone: true, enabled: true, state: null, navType: 'reload', belowSame: false }, 'push'],
  ['a desktop, discarded ⇒ none', { phone: false, enabled: true, state: { vs: 1 }, navType: 'back_forward', wasDiscarded: true }, 'none'],
];
const judgeRebuild = (M) => REBUILD_ROWS.filter(([, inp, want]) => M.bootStep(inp) !== want).map(([n, inp]) => ({ n, got: M.bootStep(inp) }));
for (const [name, inp, want] of REBUILD_ROWS) ok(BG.bootStep(inp) === want, `boot: ${name}`, BG.bootStep(inp));
const EXIT_ROWS = [ // [name, input, plan]
  ['the page entry first in its block (nothing of ours below) ⇒ null (the browser\'s own back leaves)', { current: 0, block: 2, length: 4 }, null],
  ['two older entries below, a page before the block ⇒ one go(-3)', { current: 2, block: 4, length: 7 }, { skip: 3, load: false }],
  ['one older entry below ⇒ go(-2)', { current: 1, block: 3, length: 4 }, { skip: 2, load: false }],
  ['the WHOLE tab is VibeSpace\'s (length = block) ⇒ the first entry, ONE named load', { current: 2, block: 4, length: 4 }, { skip: 2, load: true }],
  ['no Navigation API reading ⇒ null', {}, null],
];
const judgeExit = (M) => EXIT_ROWS.filter(([, inp, want]) => JSON.stringify(M.exitPlan(inp)) !== JSON.stringify(want)).map(([n, inp]) => ({ n, got: M.exitPlan(inp) }));
for (const [name, inp, want] of EXIT_ROWS) ok(JSON.stringify(BG.exitPlan(inp)) === JSON.stringify(want), `exit: ${name}`, BG.exitPlan(inp));
{
  const plan = { skip: 3, load: false };
  const a0 = BG.backVerdict({ target: null, lastBackAt: 0, now: 5000 }), a1 = BG.backVerdict({ target: null, lastBackAt: 0, now: 5000, exit: plan });
  const l0 = BG.backVerdict({ target: null, lastBackAt: 5000, now: 5500 }), l1 = BG.backVerdict({ target: null, lastBackAt: 5000, now: 5500, exit: plan });
  const l2 = BG.backVerdict({ target: null, lastBackAt: 5000, now: 5500, exit: { skip: 2, load: true } }), off = BG.backVerdict({ enabled: false, target: 'popover', exit: plan });
  const c1 = BG.backVerdict({ target: 'window', exit: plan });
  ok(a0.action === 'arm' && a0.stay === true && a1.action === 'arm' && a1.stay === false && a1.toast === BG.BACK_TOAST, 'verdict: the arm stays on the page\'s entry with nothing of ours below, re-arms at once with an exit plan', { a0, a1 });
  ok(l0.action === 'leave' && l0.skip === 1 && !l0.load && l1.skip === 3 && !l1.load && l2.skip === 2 && l2.load === true && off.action === 'leave' && off.skip === 3, 'verdict: a leave carries the plan (skip 1 = history.back(); the whole tab = the named load; the setting off too)', { l0, l1, l2, off });
  ok(c1.action === 'close', 'verdict: an exit plan never stops a layer from closing first', c1);
}
const T0 = 100000;
const COST_ROWS = [ // [name, input, bool] — came: how the load was reached (navigation.activation — round 2)
  ['back_forward 0.8 s after the previous document\'s close + pagehide, a BACK from its own entry ⇒ a back cost a load', { navType: 'back_forward', came: 'back', prev: [{ k: 'pop', v: 'close', t: T0 - 1000 }, { k: 'hide', t: T0 - 800 }], now: T0 }, true],
  ['…its rows a boot + pagehide, no pop — the discarded tab\'s first back never reaches its page (measured) ⇒ true', { navType: 'back_forward', came: 'back', prev: [{ k: 'boot', t: T0 - 3000 }, { k: 'hide', t: T0 - 900 }], now: T0 }, true],
  ['a FORWARD press (the stay arm, the browser\'s own back out, forward inside 5 s — round 2) ⇒ false', { navType: 'back_forward', came: 'forward', prev: [{ k: 'pop', v: 'arm', ex: 0, t: T0 - 1500 }, { k: 'hide', t: T0 - 1200 }], now: T0 }, false],
  ['…forward from a page of another site (activation names no entry of ours) ⇒ false', { navType: 'back_forward', came: 'other', prev: [{ k: 'pop', v: 'arm', ex: 0, t: T0 - 1500 }, { k: 'hide', t: T0 - 1200 }], now: T0 }, false],
  ['no navigation.activation (iOS Safari 26.1), the stay arm\'s back that LOADS an older document — round 1\'s rule files it (round 3; a forward press files there too: the way in cannot be told) ⇒ true', { navType: 'back_forward', came: '', prev: [{ k: 'pop', v: 'arm', ex: 0, t: T0 - 1500 }, { k: 'hide', t: T0 - 1200 }], now: T0 }, true],
  ['no navigation.activation, the DISCARD road (a boot + pagehide, no pop row — its first back never reaches the page) ⇒ true (round 3)', { navType: 'back_forward', came: '', prev: [{ k: 'boot', t: T0 - 3000 }, { k: 'hide', t: T0 - 900 }], now: T0 }, true],
  ['no navigation.activation, a close the page saw, then this load ⇒ true', { navType: 'back_forward', came: '', prev: [{ k: 'pop', v: 'close', t: T0 - 1000 }, { k: 'go1', ms: 3, t: T0 - 990 }, { k: 'hide', t: T0 - 800 }], now: T0 }, true],
  ['no navigation.activation, the exit\'s own named load (a leave row) ⇒ false', { navType: 'back_forward', came: '', prev: [{ k: 'pop', v: 'leave', t: T0 - 900 }, { k: 'leave', skip: 2, load: 1, t: T0 - 899 }, { k: 'hide', t: T0 - 850 }], now: T0 }, false],
  ['the exit\'s own named load (a leave row) ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'pop', v: 'leave', t: T0 - 900 }, { k: 'leave', skip: 2, load: 1, t: T0 - 899 }, { k: 'hide', t: T0 - 850 }], now: T0 }, false],
  ['the exit going on through an older document (a hop row) ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'hop', n: 1, skip: 1, t: T0 - 300 }], now: T0 }, false],
  ['a reload ⇒ false', { navType: 'reload', came: 'back', prev: [{ k: 'hide', t: T0 - 500 }], now: T0 }, false],
  ['a fresh navigation ⇒ false', { navType: 'navigate', prev: [{ k: 'hide', t: T0 - 500 }], now: T0 }, false],
  ['the previous document\'s last row 5 s old ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'hide', t: T0 - 5000 }], now: T0 }, false],
  ['a clock that went backwards ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'hide', t: T0 + 10 }], now: T0 }, false],
  ['no previous document in the diary ⇒ false', { navType: 'back_forward', came: 'back', prev: [], now: T0 }, false],
];
const judgeCost = (M) => COST_ROWS.filter(([, inp, want]) => M.backCostLoad(inp) !== want).map(([n]) => n);
for (const [name, inp, want] of COST_ROWS) ok(BG.backCostLoad(inp) === want, `cost: ${name}`);
const I0 = { t: T0 - 400, hop: 0, key: 'kpage001', to: 'below' };
const HOP_ROWS = [ // round 2 — exitHop: [name, input, step]
  ['no intent ⇒ none (boot)', { intent: null, navType: 'back_forward', fromKey: 'kpage001', now: T0 }, 'none'],
  ['an intent 0.4 s old, this load a history traversal FROM the entry it names ⇒ hop', { intent: I0, navType: 'back_forward', fromKey: 'kpage001', now: T0 }, 'hop'],
  ['…no key (fromKey undefined: no Navigation API at all, or entries() without navigation.activation — Chromium 102–122, Safari 26.0–26.1) ⇒ clear: NO KEY, NO HOP (round 3; round 2 let the clock alone hop)', { intent: I0, navType: 'back_forward', now: T0 }, 'clear'],
  ['…an empty key on both sides ⇒ clear (no key is no match)', { intent: { ...I0, key: '' }, navType: 'back_forward', fromKey: '', now: T0 }, 'clear'],
  ['…two hops made ⇒ hop (the third)', { intent: { ...I0, hop: 2 }, navType: 'back_forward', fromKey: 'kpage001', now: T0 }, 'hop'],
  ['…EXIT_HOPS (3) made ⇒ stay (the ONE named load)', { intent: { ...I0, hop: 3 }, navType: 'back_forward', fromKey: 'kpage001', now: T0 }, 'stay'],
  ['a boot that is no history traversal (a fresh visit) ⇒ clear', { intent: I0, navType: 'navigate', fromKey: null, now: T0 }, 'clear'],
  ['a reload ⇒ clear', { intent: I0, navType: 'reload', fromKey: 'kpage001', now: T0 }, 'clear'],
  ['a forward press from another site\'s page (from null) ⇒ clear', { intent: I0, navType: 'back_forward', fromKey: null, now: T0 }, 'clear'],
  ['a traversal from ANOTHER entry of ours ⇒ clear', { intent: I0, navType: 'back_forward', fromKey: 'kother01', now: T0 }, 'clear'],
  ['an intent 10 s old ⇒ clear', { intent: { ...I0, t: T0 - 10000 }, navType: 'back_forward', fromKey: 'kpage001', now: T0 }, 'clear'],
  ['a clock that went backwards ⇒ clear', { intent: { ...I0, t: T0 + 5 }, navType: 'back_forward', fromKey: 'kpage001', now: T0 }, 'clear'],
];
const judgeHop = (M) => HOP_ROWS.filter(([, inp, want]) => M.exitHop(inp) !== want).map(([n]) => n);
for (const [name, inp, want] of HOP_ROWS) ok(BG.exitHop(inp) === want, `hop: ${name}`, BG.exitHop(inp));
ok(BG.EXIT_HOPS === 3 && BG.EXIT_INTENT_MS === 10000, 'hop: at most 3 hops; an intent lives 10 s');
const SLOW_ROWS = [ // round 4 — slowExit: [name, input, bool]
  ['back_forward 0.1 s after the previous document\'s stay (leave why cancelled, rearm) and its LATE pagehide (leave slow 12000) ⇒ a slow exit', { navType: 'back_forward', came: 'back', prev: [{ k: 'leave', why: 'cancelled', t: T0 - 9000 }, { k: 'rearm', why: 'cancelled', t: T0 - 9000 }, { k: 'hide', t: T0 - 100 }, { k: 'leave', slow: 12000, t: T0 - 100 }], now: T0 }, true],
  ['…a stayed HOP that left late (hop 1 slow 4000) ⇒ true', { navType: 'back_forward', came: 'back', prev: [{ k: 'hop', n: 1, stay: 1, why: 'cancelled', t: T0 - 1000 }, { k: 'hide', t: T0 - 50 }, { k: 'hop', n: 1, slow: 4000, t: T0 - 50 }], now: T0 }, true],
  ['…no navigation.activation (came \'\': the way in cannot be told — the slow row says the exit left late) ⇒ true', { navType: 'back_forward', came: '', prev: [{ k: 'leave', why: 'cancelled', t: T0 - 1000 }, { k: 'hide', t: T0 - 100 }, { k: 'leave', slow: 4000, t: T0 - 100 }], now: T0 }, true],
  ['an exit whose go() ended in time (leave, hide — no slow row) ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'leave', skip: 3, load: 0, t: T0 - 200 }, { k: 'hide', t: T0 - 100 }], now: T0 }, false],
  ['a stay whose go() never committed, the page left later its own way (leave why cancelled, rearm, hide — no slow row) ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'leave', why: 'cancelled', t: T0 - 1000 }, { k: 'rearm', why: 'cancelled', t: T0 - 1000 }, { k: 'hide', t: T0 - 100 }], now: T0 }, false],
  ['a slow row, but a FORWARD press ⇒ false', { navType: 'back_forward', came: 'forward', prev: [{ k: 'hide', t: T0 - 100 }, { k: 'leave', slow: 4000, t: T0 - 100 }], now: T0 }, false],
  ['…from another site\'s page ⇒ false', { navType: 'back_forward', came: 'other', prev: [{ k: 'hide', t: T0 - 100 }, { k: 'leave', slow: 4000, t: T0 - 100 }], now: T0 }, false],
  ['a reload ⇒ false', { navType: 'reload', came: 'back', prev: [{ k: 'hide', t: T0 - 100 }, { k: 'leave', slow: 4000, t: T0 - 100 }], now: T0 }, false],
  ['the previous document\'s last row 5 s old ⇒ false', { navType: 'back_forward', came: 'back', prev: [{ k: 'hide', t: T0 - 5000 }, { k: 'leave', slow: 4000, t: T0 - 5000 }], now: T0 }, false],
];
const judgeSlow = (M) => SLOW_ROWS.filter(([, inp, want]) => M.slowExit(inp) !== want).map(([n]) => n);
for (const [name, inp, want] of SLOW_ROWS) ok(BG.slowExit(inp) === want, `slow: ${name}`);

// ── §2 the real wiring over a fake history + clock ──
async function bundleWiring(src, tag, guardSrc = null) { // guardSrc: a patched back-guard.js under the wiring (round 3's RED controls)
  const stub = { name: 'stubs', setup(b) {
    if (guardSrc) b.onLoad({ filter: /src[\\/]lib[\\/]back-guard\.js$/ }, () => ({ contents: guardSrc, loader: 'js' }));
    b.onResolve({ filter: /^\.\/(utils|i18n)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: a.path === './i18n.js'
      ? 'export const t = (s) => s;'
      : 'export const showToast = (m, o) => globalThis.__w.toasts.push([m, o && o.duration]); export const noteOwnGesture = () => { globalThis.__w.gestures++; };', loader: 'js' }));
  } };
  const out = await esbuild.build({ stdin: { contents: src, resolveDir: path.join(repo, 'src/lib'), sourcefile: 'mobile-back.js', loader: 'js' }, bundle: true, format: 'esm', write: false, plugins: [stub], logLevel: 'silent' });
  const f = path.join(MUT.dir, `mobile-back-${tag}.mjs`);
  fs.writeFileSync(f, out.outputFiles[0].text); MUT.files.push(f);
  return import(pathToFileURL(f).href);
}
const realClock = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
function el(cls, { id = '' } = {}) {
  const e = { id, cls: new Set(cls.split(' ').filter(Boolean)), _l: {}, removed: false, clicks: 0, list: null };
  e.classList = { contains: (c) => e.cls.has(c), add: (c) => e.cls.add(c), remove: (c) => e.cls.delete(c) };
  e.remove = () => { e.removed = true; if (e.list) { const i = e.list.indexOf(e); if (i >= 0) e.list.splice(i, 1); } };
  e.addEventListener = (t, fn) => { (e._l[t] ||= []).push(fn); };
  e.dispatchEvent = (ev) => { for (const fn of e._l[ev.type] || []) fn(ev); return !ev.defaultPrevented; };
  e.click = () => { e.clicks++; e.onclick?.(); };
  e.querySelector = () => null;
  return e;
}
/** One phone page: history [prev page, VibeSpace] (index 1), the layers, the app duck. */
function world({ search = '', startState = null, enabled = true, sidebarOpen = false, entries = null, index = 1, doc = 'A', navType = '', discarded = false, navApi = false, store = null, activation = undefined, commitMs = 0 } = {}) {
  let now = 1e6, seq = 0; const q = [];
  globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; q.push({ id, at: now + ms, fn }); return id; };
  globalThis.clearTimeout = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
  Date.now = () => now;
  const advance = (ms) => { const end = now + ms; for (;;) { q.sort((a, b) => a.at - b.at || a.id - b.id); const x = q[0]; if (!x || x.at > end) break; q.shift(); now = x.at; x.fn(); } now = end; };
  const BASE = 'http://vs.test/' + search;
  // an entry: prev / other = another site's page (leaving); doc = the document it belongs to (another doc's entry = a LOAD); lie = the
  // Navigation API reports it sameDocument although it is not (a discarded tab's restored entries, measured on Chrome 154);
  // sub = a JOINT step of the entry before it (an iframe link inside that document: history.go() counts it, the
  // Navigation API never shows it — round 2); commitMs = how long a traversal onto another document takes to commit;
  // cancel = a traversal onto it is announced (beforeunload) and never commits (a 204, a stopped load — round 3); a
  // document in H.kept was kept by the back/forward cache: a traversal onto it SHOWS it again (pageshow persisted), never a load;
  // ms = how long a traversal onto THIS entry takes to commit (round 4; commitMs otherwise); race = its commit comes
  // before any abort (it answered just then — round 4); H.lost = the document a traversal committed onto after a
  // pushState made while it was pending: its Navigation API says index -1 (measured on Chrome 154 — round 4)
  const H = { entries: entries || [{ prev: true, state: null, href: 'data:prev' }, { state: startState, href: BASE, doc }], index, doc, pushes: 0, replaces: 0, left: false, loads: 0, loadedAt: -1, popsHandled: 0, commitMs, kept: {}, restores: 0, pending: null, aborts: 0, from: -1, lost: false };
  let pop = [], wl = {}, keySeq = 0;
  const w = { H, toasts: [], gestures: 0, advance, toggles: [], hides: 0, settingCbs: [], enabled, activation };
  globalThis.__w = w;
  globalThis.window = { addEventListener: (t, fn, o) => { if (t === 'popstate') pop.push(fn); else (wl[t] ||= []).push({ fn, once: !!(o && o.once) }); }, removeEventListener: (t, fn) => { if (wl[t]) wl[t] = wl[t].filter((x) => x.fn !== fn); } };
  const fire = (t, ev = {}) => { const l = wl[t] || []; wl[t] = l.filter((x) => !x.once); for (const x of l) x.fn(ev); };
  /** The main entry a joint step belongs to (an iframe step is its document's entry). */
  const mainOf = (i) => { while (i > 0 && H.entries[i].sub) i--; return i; };
  const keyOf = (i) => (H.entries[i].key ||= 'key' + String(++keySeq).padStart(5, '0'));
  globalThis.location = { search, href: BASE, pathname: '/' };
  /** One traversal by n joint steps (history.go's task). One still PENDING when another begins is ABORTED by it — the
   *  Navigation API's forward() too (measured on Chrome 154, round 4) — unless its commit came first (`race`: the
   *  abort's own step is lost then); a pushState never aborts one. Returns whether the page moved (same-document). */
  const traverse = (n) => {
    if (H.pending) {
      const p = H.pending; H.pending = null; globalThis.clearTimeout(p.id);
      if (p.race) { p.commit(); return false; }
      H.aborts++;
    }
    const to = H.index + n; if (to < 0 || to >= H.entries.length) return false; // out of range: nothing at all (no beforeunload)
    const e = H.entries[to];
    if (e.prev || e.other || e.doc !== H.doc) { // ANOTHER document: beforeunload at once, the commit when it answers (pagehide then)
      fire('beforeunload');
      const pend = { id: null, race: !!e.race, pushed: false };
      pend.commit = () => {
        H.pending = null;
        const from = mainOf(H.index); H.from = from; H.lost = pend.pushed;
        fire('pagehide', { persisted: false }); H.index = to;
        if (e.prev || e.other) { H.left = true; return; }
        if (H.kept[e.doc]) { show(e.doc, from); return; }
        H.loads++; H.loadedAt = to;
      };
      if (e.cancel) { pend.commit = () => { }; H.pending = pend; return false; } // answered 204 / stopped: nothing more, ever (an abort still ends it)
      const ms = e.ms ?? H.commitMs;
      if (ms) { H.pending = pend; pend.id = globalThis.setTimeout(pend.commit, ms); } else pend.commit();
      return false;
    }
    const same = mainOf(to) === mainOf(H.index); H.index = to;
    if (same) return true; // an iframe-only step: no popstate on the page
    globalThis.location.href = e.href; H.popsHandled++; for (const fn of pop) fn({ state: e.state });
    return true;
  };
  globalThis.history = {
    get state() { return H.entries[H.index].state; },
    get length() { return H.entries.length; },
    pushState(state) { if (H.pending) H.pending.pushed = true; H.lost = false; H.entries.splice(H.index + 1); H.entries.push({ state, href: globalThis.location.href, doc: H.doc }); H.index++; H.pushes++; },
    replaceState(state) { H.entries[H.index] = { ...H.entries[H.index], state, doc: H.doc, lie: false }; H.replaces++; },
    go(n) { globalThis.setTimeout(() => traverse(n), 0); },
    back() { this.go(-1); },
  };
  /** The Navigation API over H: the contiguous block of the app's entries around the current one (another site's are hidden). */
  const block = () => { let a = H.index, b = H.index; const app = (e) => e && !e.prev && !e.other; while (app(H.entries[a - 1])) a--; while (app(H.entries[b + 1])) b++; const at = []; for (let i = a; i <= b; i++) if (!H.entries[i].sub) at.push(i); return at; };
  if (navApi) globalThis.navigation = {
    entries: () => { const l = block().map((i, k) => ({ url: H.entries[i].href, sameDocument: !!H.entries[i].lie || H.entries[i].doc === H.doc, key: keyOf(i), index: k })); return H.lost ? [...l.slice(0, -1), { ...l[block().indexOf(mainOf(H.index))], index: -1 }] : l; }, // H.lost: the pushed entry's place holds a copy of the current one (measured)
    get currentEntry() { const m = mainOf(H.index); return { index: H.lost ? -1 : block().indexOf(m), key: keyOf(m) }; },
    get activation() { return w.activation; },
    /** The step onto the entry above: its committed promise rejects when it did not land there (round 4). */
    forward() {
      const list = block(), up = list[list.indexOf(mainOf(H.index)) + 1];
      if (up === undefined) throw new Error('InvalidStateError: no entry above');
      let yes = null, no = null; const committed = new Promise((a, b) => { yes = a; no = b; });
      globalThis.setTimeout(() => { if (traverse(up - H.index) && H.index === up) yes(); else no(new Error('AbortError: the step did not land')); }, 0);
      return { committed, finished: committed };
    },
  };
  else delete globalThis.navigation;
  /** A KEPT document shown again: its own listeners back, navigation.activation names the entry it came from (measured
   *  on Chrome 154: a restore updates it), pageshow persisted. */
  const show = (d, from) => {
    ({ wl, pop } = H.kept[d]); delete H.kept[d]; H.doc = d; H.restores++;
    globalThis.location.href = H.entries[H.index].href;
    w.activation = { from: { index: 9, key: keyOf(from) }, entry: { index: 0 } };
    fire('pageshow', { persisted: true });
  };
  Object.defineProperty(globalThis, 'performance', { value: { getEntriesByType: (k) => (k === 'navigation' && navType ? [{ type: navType }] : []), now: () => now }, configurable: true, writable: true });
  const S = store || new Map();
  globalThis.sessionStorage = { getItem: (k) => (S.has(k) ? S.get(k) : null), setItem: (k, v) => { S.set(k, String(v)); }, removeItem: (k) => { S.delete(k); } };
  w.store = S; w.diary = () => JSON.parse(S.get('vibespace.navLog') || '[]'); w.captures = [];
  const L = { popovers: [], shells: [], switchers: [], sheets: [] };
  const stat = el('dialog-overlay hidden', { id: 'dialog-overlay' });
  const backRow = el('mobile-folder-back');
  w.L = L; w.stat = stat; w.backRow = backRow;
  w.add = (kind, e) => { e.list = L[kind]; L[kind].push(e); return e; };
  globalThis.document = {
    querySelector: (s) => (s === '[data-popover]' ? L.popovers[0] : s === '.mobile-win-switcher' ? L.switchers[0] : null) || null,
    querySelectorAll: (s) => (s === '[data-popover]' ? [...L.popovers] : s === '.mobile-win-switcher' ? [...L.switchers] : s === '.dialog-overlay' ? [stat, ...L.shells] : s === '.usage-popup' ? [...L.sheets] : []),
    getElementById: (id) => (id === 'dialog-overlay' ? stat : null),
    wasDiscarded: discarded, referrer: '', visibilityState: 'visible',
  };
  w.app = {
    settings: { get: (p) => (p === 'mobile.backGuard' ? (w.enabled ? undefined : false) : undefined), on: (p, fn) => { if (p === 'mobile.backGuard') w.settingCbs.push(fn); } },
    sidebar: { isOpen: sidebarOpen, toggle(v) { this.isOpen = v; w.toggles.push(v); }, _mobileDrilldown: null, listEl: { querySelector: (s) => (s === '.mobile-folder-back' ? backRow : null) } },
    hideDialogs() { stat.classList.add('hidden'); w.hides++; },
    ready: Promise.resolve(),
    autoCaptureIncident: (reason, detail, opts) => { w.captures.push({ reason, detail, opts }); return Promise.resolve('inc-test-' + w.captures.length); },
  };
  /** A same-document navigation to a #fragment (a link in rendered markdown): a new entry, then a popstate with state null. */
  w.fragment = (hash) => { H.entries.splice(H.index + 1); const href = BASE + hash; H.entries.push({ state: null, href, doc: H.doc }); H.index++; globalThis.location.href = href; for (const fn of pop) fn({ state: null }); advance(1); };
  /** The person's back gesture = the browser's history back. */
  w.back = () => { globalThis.history.go(-1); advance(1); };
  /** The person's tap. */
  w.input = () => fire('pointerdown', { isTrusted: true });
  w.intent = () => JSON.parse(S.get('vibespace.exitIntent') || 'null');
  w.keyAt = (i) => keyOf(mainOf(i)).slice(0, 8);
  /** The entry the last commit LEFT from — what the next document's navigation.activation names as «from» (round 4). */
  w.lastFrom = () => (H.from >= 0 ? keyOf(H.from).slice(0, 8) : null);
  /** navigation.activation of the document the last commit landed on, as Chrome 154 gives it: both indexes -1 when
   *  that commit's traversal saw a pushState while pending (H.lost — measured, round 4). */
  w.arrivalNow = () => (H.lost ? { from: { index: -1, key: w.lastFrom() }, entry: { index: -1 } } : { from: { index: 9, key: w.lastFrom() }, entry: { index: 0 } });
  /** The document a traversal LOADED boots: a fresh window (its own listeners), its navigation type, how it was reached. */
  w.newDoc = ({ doc: d, navType: ty = 'back_forward', activation: a } = {}) => {
    H.doc = d; pop = []; wl = {}; w.activation = a;
    globalThis.location.href = H.entries[H.index].href;
    Object.defineProperty(globalThis, 'performance', { value: { getEntriesByType: (k) => (k === 'navigation' && ty ? [{ type: ty }] : []), now: () => now }, configurable: true, writable: true });
  };
  /** An iframe link followed inside this document: a joint step (sub) the Navigation API never shows. */
  w.iframeStep = () => { H.entries.splice(H.index + 1); H.entries.push({ ...H.entries[H.index], sub: true }); H.index++; };
  /** A cross-document navigation to `href` (a `?` link): this document's pagehide — kept by the cache when `keep` — then
   *  the next document (a fresh window) on a new entry. */
  w.navigateTo = ({ doc: d, href, keep = false, activation: a = { from: null, entry: { index: 0 } } }) => {
    fire('pagehide', { persisted: keep });
    if (keep) H.kept[H.doc] = { wl, pop };
    H.entries.splice(H.index + 1); H.entries.push({ state: null, href, doc: d }); H.index++;
    H.doc = d; pop = []; wl = {}; w.activation = a;
    globalThis.location.href = href; globalThis.location.search = new URL(href).search;
    Object.defineProperty(globalThis, 'performance', { value: { getEntriesByType: (k) => (k === 'navigation' ? [{ type: 'navigate' }] : []), now: () => now }, configurable: true, writable: true });
  };
  /** The window's listeners of one type right now. */
  w.listeners = (t) => (wl[t] || []).length;
  w.onSentinel = () => BG.isSentinel(globalThis.history.state);
  return w;
}
function wiringLegs(M) {
  const R = {};
  { const w = world(); M.installMobileBack(w.app);
    R.boot = w.H.pushes === 1 && w.onSentinel() && w.H.entries.length === 3; }
  { const w = world({ startState: { vs: 1 } }); M.installMobileBack(w.app);
    R.reload = w.H.pushes === 0 && w.onSentinel(); }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    const a = w.add('popovers', el('context-menu')), b = w.add('popovers', el('chat-img-overlay'));
    w.back(); w.advance(600);
    R.popover = a.removed && b.removed && w.onSentinel() && w.H.entries.length === 3 && w.H.pushes === 1 && w.toasts.length === 0 && !w.H.left; }
  { const w = world({ sidebarOpen: false }); M.installMobileBack(w.app);
    w.back(); w.advance(600);
    R.window = w.toggles.join() === 'true' && w.app.sidebar.isOpen && w.onSentinel() && w.H.entries.length === 3 && w.H.pushes === 1; }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    w.app.sidebar._mobileDrilldown = { type: 'folder', key: '/x' };
    w.back(); w.advance(600);
    R.drilldown = w.backRow.clicks === 1 && w.onSentinel() && w.toggles.length === 0 && w.H.pushes === 1; }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    const s1 = w.add('shells', el('dialog-overlay')), s2 = w.add('shells', el('dialog-overlay'));
    const x2 = el('dialog-close'); x2.onclick = () => s2.remove(); s2.querySelector = (s) => (s === '.dialog-close' ? x2 : null);
    w.back(); w.advance(600);
    const first = x2.clicks === 1 && s2.removed && !s1.removed;
    w.back(); w.advance(600); // s1 has no ✕ → removed
    w.stat.classList.remove('hidden');
    w.back(); w.advance(600); // the static overlay → hideDialogs
    R.dialog = first && s1.removed && w.hides === 1 && w.stat.classList.contains('hidden') && w.onSentinel() && w.H.entries.length === 3 && w.H.pushes === 1; }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    const sw = w.add('switchers', el('mobile-win-switcher'));
    w.back(); w.advance(600);
    R.switcher = sw.removed && w.onSentinel(); }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    const own = w.add('sheets', el('usage-popup')); let hid = 0;
    own.addEventListener('vs-back-dismiss', (e) => { e.preventDefault(); hid++; own.classList.add('hidden'); w.L.sheets.splice(w.L.sheets.indexOf(own), 1); });
    w.back(); w.advance(600);
    const plain = w.add('sheets', el('usage-popup'));
    w.back(); w.advance(600);
    R.sheet = hid === 1 && plain.classList.contains('hidden') && w.onSentinel(); }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    w.back();
    const armed = w.toasts.length === 1 && w.toasts[0][0] === 'Press back again to exit' && w.toasts[0][1] === 2000 && w.gestures === 1 && !w.onSentinel() && !w.H.left;
    w.advance(900); w.back(); // a second back 0.9 s later: the browser's own — VibeSpace is left
    R.armLeave = armed && w.H.left && w.H.popsHandled === 1; R.armDetail = { toasts: w.toasts, gestures: w.gestures, left: w.H.left, pops: w.H.popsHandled }; }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    w.back(); w.advance(2100); // the window lapsed: back on the sentinel
    const restood = w.onSentinel() && w.H.entries.length === 3 && w.H.pushes === 1;
    w.back();
    R.rearm = restood && w.toasts.length === 2 && !w.H.left; }
  { const w = world({ sidebarOpen: true }); M.installMobileBack(w.app);
    w.enabled = false; for (const fn of w.settingCbs) fn(false);
    w.back(); w.advance(10);
    R.off = w.H.left && w.toasts.length === 0; }
  { const w = world({ sidebarOpen: true, enabled: false }); M.installMobileBack(w.app);
    const none = w.H.pushes === 0;
    w.enabled = true; for (const fn of w.settingCbs) fn(true);
    R.onLater = none && w.H.pushes === 1 && w.onSentinel(); }
  { const w = world({ sidebarOpen: false }); M.installMobileBack(w.app);
    const p = w.add('popovers', el('context-menu'));
    w.fragment('#install'); // a #fragment link: NOT a back — nothing closes, a sentinel stands above the new entry
    const kept = !p.removed && w.toggles.length === 0 && w.onSentinel() && w.H.pushes === 2;
    w.back(); w.advance(600); // a real back onto the fragment entry: the popover closes, back on the sentinel
    R.fragment = kept && p.removed && w.onSentinel() && w.H.pushes === 2; R.fragDetail = { kept, removed: p.removed, pushes: w.H.pushes, toggles: w.toggles }; }
  // lane phone-first-screen: the attention page (app.phoneHome — a duck: on show?, rows?, show() → false when nothing is on its first screen)
  const pageDuck = (w, ph) => { w.app.phoneHome = { shown: () => ph.on, hasRows: () => ph.rows, show: () => { ph.shows++; if (!ph.rows) return false; ph.on = true; return true; } }; };
  { const w = world({ sidebarOpen: false }); const ph = { on: false, rows: true, shows: 0 }; pageDuck(w, ph); M.installMobileBack(w.app);
    w.back(); w.advance(600);
    const toPage = ph.on && ph.shows === 1 && w.toggles.length === 0 && w.onSentinel();
    w.back(); // on the page = at home: the exit toast arms, nothing closes
    R.homePage = toPage && ph.on && w.toasts.length === 1 && w.toggles.length === 0; R.homeDetail = { toPage, ph, toggles: w.toggles, toasts: w.toasts.length }; }
  { const w = world({ sidebarOpen: false }); const ph = { on: false, rows: false, shows: 0 }; pageDuck(w, ph); M.installMobileBack(w.app);
    w.back(); w.advance(600);
    R.homeEmpty = !ph.on && w.toggles.join() === 'true' && w.app.sidebar.isOpen && w.onSentinel(); }
  { const w = world({ sidebarOpen: true }); const ph = { on: true, rows: true, shows: 0 }; pageDuck(w, ph); M.installMobileBack(w.app);
    w.back(); w.advance(600);
    R.homeSidebar = w.toggles.join() === 'false' && !w.app.sidebar.isOpen && ph.on && w.toasts.length === 0 && w.onSentinel(); }
  return R;
}
console.log('\n§2 the real wiring (fake history + clock)');
const wiringSrc = read('src/lib/mobile-back.js');
const MW = await bundleWiring(wiringSrc, 'real');
const R = wiringLegs(MW);
ok(R.boot, 'boot: ONE sentinel pushed above the page\'s entry');
ok(R.reload, 'boot on the sentinel (a reload / restored tab): nothing pushed, still standing on it');
ok(R.popover, 'a back with floats open: every [data-popover] removed (Esc\'s rule), no toast, back on the SAME sentinel (no new entry)');
ok(R.window, 'a back with the window area on show: the sidebar opens (home), back on the sentinel');
ok(R.drilldown, 'a back in the sidebar\'s drill-down: its ‹ row is pressed, the sidebar stays open');
ok(R.dialog, 'a back with dialogs: the topmost shell through its ✕, a shell without one removed, then the static overlay via hideDialogs');
ok(R.switcher, 'a back with the window switcher open: removed');
ok(R.sheet, 'a back with a sheet: one that answers vs-back-dismiss closes itself (the For-you tray → hidePopup), a plain one gets .hidden');
ok(R.armLeave, 'at home: the toast (2 s, the person\'s own gesture noted), the page stays on its own entry; a second back inside 2 s is the browser\'s and leaves', R.armDetail);
ok(R.rearm, 'at home, the window lapsed: a timer steps back onto the sentinel (no new entry); the next back re-arms');
ok(R.off, 'the Mobile setting turned off mid-session: the next back leaves at once, no toast');
ok(R.onLater, 'the setting off at boot (nothing pushed), turned on later: a sentinel is pushed then');
ok(R.fragment, 'a #fragment link (a same-document navigation to another URL) is no back: nothing closes, a sentinel stands above it; the next real back closes the menu', R.fragDetail);
ok(R.homePage, 'lane phone-first-screen: a back from a window while the attention list has rows shows the PAGE (home — the sidebar stays shut); a back on the page arms the exit toast', R.homeDetail);
ok(R.homeEmpty, '…the list empty: the page refuses and the sidebar opens (the conversation list, the home before)');
ok(R.homeSidebar, '…the sidebar opened over the page (☰): a back closes it — back on the page, no toast');
{ // the forward sentinel vanished (a same-document navigation dropped it): go(1) answers nothing ⇒ pushed again after 500 ms
  const w = world({ sidebarOpen: true }); MW.installMobileBack(w.app);
  const p = w.add('popovers', el('context-menu')), rm = p.remove;
  p.remove = () => { rm(); w.H.entries.splice(w.H.index + 1); }; // while the back is handled, the forward entry goes (a same-document navigation would)
  w.back(); w.advance(10);
  const notYet = p.removed && !w.onSentinel() && w.H.pushes === 1;
  w.advance(600);
  ok(notYet && w.onSentinel() && w.H.pushes === 2 && w.H.entries.length === 3, 'a vanished forward sentinel: go(1) answers nothing ⇒ ONE sentinel pushed after 500 ms', { pushes: w.H.pushes, len: w.H.entries.length });
}
{ // the deep-link first back closes no window; the second is the usual rule
  const w = world({ search: '?session=abc', sidebarOpen: false }); MW.installMobileBack(w.app);
  w.back();
  const first = w.toggles.length === 0 && w.toasts.length === 1;
  w.advance(2100); w.back(); w.advance(600);
  ok(first && w.toggles.join() === 'true', 'a `?` deep link: the first back closes no window (arms), a later back yields the window as usual', { toggles: w.toggles, toasts: w.toasts.length });
}
{ const w = world({ search: '?session=abc', sidebarOpen: false }); MW.installMobileBack(w.app);
  const p = w.add('popovers', el('context-menu'));
  w.back(); w.advance(600);
  ok(p.removed && w.toasts.length === 0, 'a `?` deep link: a menu opened since still closes on the first back');
}
Object.assign(globalThis, { setTimeout: realClock.setTimeout, clearTimeout: realClock.clearTimeout }); Date.now = realClock.now;

// ── §5 a back never costs a load (lane phone-back-reload) ──
const PG = 'http://vs.test/';
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const ACT = { from: null, entry: { index: 0 } }; // navigation.activation of a load from another site's page (Chrome 123+)
async function reloadLegs(M, M2) { // M2: a second instance of the same wiring — the NEXT document of the tab (its own DOC_ID)
  const R = {};
  { // a DISCARDED tab shown again: standing on {vs:1}, the entry below dead but reported sameDocument
    const w = world({ navApi: true, doc: 'B', navType: 'back_forward', discarded: true, index: 2,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A', lie: true }, { state: { vs: 1 }, href: PG, doc: 'B' }] });
    M.installMobileBack(w.app);
    const rebuilt = w.H.replaces === 1 && w.H.entries[2].state === null && w.H.pushes === 1 && w.H.index === 3 && w.onSentinel();
    w.back(); w.advance(600); // a window on show: it yields — same document, back on the sentinel
    const boot = w.diary().find((r) => r.k === 'boot');
    R.discard = rebuilt && w.H.loads === 0 && w.toggles.join() === 'true' && w.onSentinel();
    R.discardRow = !!boot && boot.type === 'back_forward' && boot.step === 'rebuild' && boot.disc === 1 && boot.st === 'vs1' && boot.ents === 'S*S';
    R.discardDetail = { rebuilt, loads: w.H.loads, toggles: w.toggles, boot };
  }
  { // a renderer kill + reload: history.state lost, the older document's entry below (truthfully another document)
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 2,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'B' }] });
    M.installMobileBack(w.app);
    const stood = w.H.pushes === 1 && w.H.replaces === 0 && w.onSentinel();
    w.back(); // at home: the toast — and with an older entry below, straight back onto the sentinel
    const armed = w.toasts.length === 1 && w.onSentinel();
    w.advance(900); w.back(); w.advance(10); // a second back inside 2 s: ONE go(-2) past the older document
    const rows = w.diary();
    R.crash = stood && armed && w.H.left && w.H.loads === 0;
    R.crashRows = rows.map((r) => r.k).join(' ') === 'boot pop go1 pop leave hide' && rows[0].step === 'push' && rows[0].st === 'null' && rows[0].ents === 'x*S'
      && rows[1].v === 'arm' && rows[1].ex === 2 && rows[2].ms >= 0 && rows[3].v === 'leave' && rows[4].skip === 2 && rows[4].load === 0;
    R.crashDetail = { stood, armed, left: w.H.left, loads: w.H.loads, rows };
  }
  { // a second load of the app in the tab (a `?` link over an older document), at home: the toast, then ONE go(-3) past every older entry
    const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 3,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: null, href: PG + '?session=x', doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); const armed = w.toasts.length === 1 && w.onSentinel() && w.toggles.length === 0;
    w.advance(500); w.back(); w.advance(10);
    R.second = armed && w.H.left && w.H.loads === 0 && w.diary().some((r) => r.k === 'leave' && r.skip === 3);
    R.secondDetail = { armed, left: w.H.left, loads: w.H.loads, rows: w.diary().slice(-3) };
  }
  { // the WHOLE tab is VibeSpace's: the exit goes to the first entry — ONE named load — and the next boot files nothing
    const S = new Map();
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 2, store: S,
      entries: [{ state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(300); w.back(); w.advance(10);
    const named = w.H.loads === 1 && w.H.loadedAt === 0 && w.diary().some((r) => r.k === 'leave' && r.skip === 2 && r.load === 1);
    w.diary(); S.set('vibespace.navLog', JSON.stringify([...w.diary(), { t: Date.now(), d: 'zzzzz', k: 'hide', p: 0 }].map((r) => (r.d === undefined ? r : { ...r, d: 'zzzzz' }))));
    const w2 = world({ navApi: true, doc: 'C', navType: 'back_forward', sidebarOpen: true, index: 0, store: S, entries: [{ state: null, href: PG, doc: 'C' }, { state: { vs: 1 }, href: PG, doc: 'A' }] });
    M.installMobileBack(w2.app); await flush();
    R.whole = named && w2.captures.length === 0 && !w2.diary().some((r) => r.k === 'cost');
    R.wholeDetail = { loads: w.H.loads, at: w.H.loadedAt, rows: w.diary().slice(-2), captures: w2.captures.length };
  }
  { // nothing before the block after all (an entry outside it is a FORWARD one): go(-3) does nothing ⇒ the 700 ms fallback, named
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 3,
      entries: [{ state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'B' }, { state: { vs: 1 }, href: PG, doc: 'B' }, { other: true, state: null, href: 'https://other.test/' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(300); w.back(); w.advance(10);
    const noop = !w.H.left && w.H.loads === 0;
    w.advance(800);
    R.fallback = noop && w.H.loads === 1 && w.H.loadedAt === 0 && w.diary().filter((r) => r.k === 'leave').map((r) => `${r.skip}/${r.load}`).join() === '3/0,2/1' && !w.intent();
    R.fallbackDetail = { noop, loads: w.H.loads, at: w.H.loadedAt, rows: w.diary().filter((r) => r.k === 'leave') };
  }
  { // round 2 — the exit's intent ends at a person's tap (go() started nothing here: they are using the page)
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 3, activation: ACT,
      entries: [{ state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'B' }, { state: { vs: 1 }, href: PG, doc: 'B' }, { other: true, state: null, href: 'https://other.test/' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(300); w.back(); w.advance(10);
    const had = w.intent(); w.input();
    R.leaveInput = !!had && had.hop === 0 && had.to === 'below' && had.key === w.keyAt(2) && !w.intent();
    R.leaveInputDetail = { had };
  }
  { // round 2 — ONE iframe link inside the OLDER document adds a joint step the entries never show: the exit's go(-3) LANDS
    // on that document (measured: the owner's symptom again); it reads the intent at its boot, goes on back with ONE
    // go(-(0+1)) — no app boot — and the tab stands on the page before VibeSpace
    const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 4, activation: ACT,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A', sub: true }, { state: null, href: PG + '?session=x', doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(500); w.back(); w.advance(10);
    const landed = w.H.loads === 1 && w.H.loadedAt === 1 && !w.H.left, intent = w.intent();
    w.newDoc({ doc: 'A', activation: { from: { index: 2, key: intent?.key || 'none' }, entry: { index: 0 } } });
    const hop = M2.continueExit(); w.advance(10);
    let stays = false;
    if (!hop) { M2.installMobileBack(w.app); stays = !w.H.left && w.diary().some((r) => r.k === 'boot' && r.d !== w.diary()[0].d); } // the copy without the intent: it boots there
    const rows = w.diary(), mine = rows.filter((r) => r.d !== rows[0].d);
    R.iframe = landed && !!hop && w.H.left && w.H.loads === 1 && intent?.hop === 0 && rows.some((r) => r.k === 'leave' && r.skip === 3)
      && mine.length === 1 && mine[0].k === 'hop' && mine[0].n === 1 && mine[0].skip === 1 && mine[0].ents === '*SSxx' && w.intent()?.hop === 1;
    R.iframeDetail = { landed, hop: !!hop, left: w.H.left, loads: w.H.loads, intent, mine, stays };
  }
  { // round 2 — the whole tab VibeSpace's AND an older iframe step (length ≠ block: no named-load plan): go(-2) lands ON the
    // first document; its own go(-1) starts nothing (no beforeunload) — once more each 700 ms, then the cap: the page stays
    // and boots — the ONE named load, said in the diary, no incident
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 2, activation: ACT,
      entries: [{ state: null, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'A', sub: true }, { state: null, href: PG, doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(300); w.back(); w.advance(10);
    const landed = w.H.loads === 1 && w.H.loadedAt === 0;
    w.newDoc({ doc: 'A', activation: { from: { index: 1, key: w.intent()?.key || 'none' }, entry: { index: 0 } } });
    const hop = M2.continueExit(); let settled = false; hop?.then(() => { settled = true; });
    w.advance(10); await flush(); const early = settled;
    w.advance(2200); await flush();
    if (settled) { M2.installMobileBack(w.app); await flush(); }
    const mine = w.diary().filter((r) => r.d !== w.diary()[0].d);
    R.hopCap = landed && !!hop && !early && settled && mine.filter((r) => r.k === 'hop').map((r) => (r.stay ? `stay:${r.why}` : r.n)).join() === '1,2,3,stay:cap'
      && mine.some((r) => r.k === 'boot' && r.type === 'back_forward' && r.came === 'back') && !w.intent() && w.captures.length === 0 && !mine.some((r) => r.k === 'cost');
    R.hopCapDetail = { landed, hop: !!hop, early, settled, mine };
  }
  { // round 2 — a person's tap during a hop: the page stays there and then (why input), the intent gone
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 2, activation: ACT,
      entries: [{ state: null, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'A', sub: true }, { state: null, href: PG, doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(300); w.back(); w.advance(10);
    w.newDoc({ doc: 'A', activation: { from: { index: 1, key: w.intent()?.key || 'none' }, entry: { index: 0 } } });
    const hop = M2.continueExit(); let settled = false; hop?.then(() => { settled = true; });
    w.advance(100); w.input(); await flush();
    const last = w.diary().at(-1);
    R.hopInput = !!hop && settled && last?.k === 'hop' && last.stay === 1 && last.why === 'input' && !w.intent();
    R.hopInputDetail = { hop: !!hop, settled, last };
  }
  { // round 2 — an exit's intent still in the tab, but THIS load came forward from another site's page: dropped, the app boots
    const S = new Map([['vibespace.exitIntent', JSON.stringify({ t: 1e6 - 2000, hop: 1, key: 'kpage001', to: 'below' })]]);
    const w = world({ navApi: true, doc: 'C', navType: 'back_forward', index: 1, store: S, activation: { from: null, entry: { index: 0 } }, entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'C' }] });
    const hop = M.continueExit();
    R.intentDrop = hop === null && !S.has('vibespace.exitIntent') && w.diary().at(-1)?.k === 'hop' && w.diary().at(-1)?.drop === 1 && !w.H.left;
    R.intentDropDetail = { hop, rows: w.diary() };
  }
  { // round 2 — a go() onto a SLOW page: beforeunload at once, the commit 2.5 s later — the 700 ms fallback never fires on
    // it (pagehide, its old judge, comes only at the commit); round 3: one slower than the 3 s bound still leaves, never
    // a load; round 4: the bound's stay re-arms (a new sentinel — the commit still comes) and the late pagehide is told
    // after the stay's own row (leave slow 4000)
    for (const [tag, ms] of [['slow', 2500], ['slower', 4000]]) {
      const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 2, commitMs: ms, activation: ACT,
        entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'B' }] });
      M.installMobileBack(w.app);
      w.back(); w.advance(300); w.back(); w.advance(10);
      w.advance(5000);
      const leaves = w.diary().filter((r) => r.k === 'leave' || r.k === 'rearm').map((r) => (r.k === 'rearm' ? `rearm:${r.why}` : r.why || (r.slow ? `slow:${r.slow}` : `${r.skip}/${r.load}`))).join();
      R[tag] = w.H.left && w.H.loads === 0 && leaves === (tag === 'slow' ? '2/0' : '2/0,cancelled,rearm:cancelled,slow:4000') && w.listeners('beforeunload') === 0;
      R[tag + 'Detail'] = { left: w.H.left, loads: w.H.loads, leaves };
    }
  }
  { // round 3 — a hop's go() CANCELLED (the entry it goes for answers 204, the load is stopped: beforeunload, then nothing
    // ever): after 3 s the page stays (hop stay why cancelled) and boots; round 4: its intent SUSPENDED — kept, the late
    // watch's pagehide + tap listeners held — until its window ends (then dropped) and the watch's 30 s (no listener left);
    // a tap while that go() is pending stays at once (why input — round 2's once-only listener ignored it while leaving)
    // and, round 4, ABORTS it by the step onto the same-document entry above: it lands there, the intent dropped
    for (const tag of ['cancel', 'cancelTap']) {
      const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 4, activation: ACT,
        entries: [{ prev: true, state: null, href: 'data:prev', cancel: true }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A', sub: true }, { state: null, href: PG + '?session=x', doc: 'B' }] });
      M.installMobileBack(w.app);
      w.back(); w.advance(500); w.back(); w.advance(10); // the exit's go(-3) lands ON the older document (the iframe road)
      w.newDoc({ doc: 'A', activation: { from: { index: 2, key: w.intent()?.key || 'none' }, entry: { index: 0 } } });
      const hop = M2.continueExit(); let why = null; hop?.then((x) => { why = x; });
      w.advance(10); await flush();
      const pending = why === null && w.listeners('beforeunload') === 1 && !!w.intent();
      if (tag === 'cancelTap') { w.advance(1000); w.input(); w.advance(10); await flush(); } else { w.advance(2900); await flush(); }
      const early = why;
      w.advance(tag === 'cancel' ? 200 : 0); await flush();
      const last = w.diary().filter((r) => r.k === 'hop').at(-1), kept = w.intent(), held = ['beforeunload', 'pagehide', 'pageshow', 'pointerdown', 'keydown'].map((t) => w.listeners(t));
      w.advance(7000); await flush(); const windowEnd = w.intent();
      w.advance(25000); await flush();
      const none = ['beforeunload', 'pagehide', 'pageshow', 'pointerdown', 'keydown'].every((t) => w.listeners(t) === 0);
      R[tag] = !!hop && pending && last?.stay === 1 && last.why === why && none && !w.H.left && (tag === 'cancel'
        ? early === null && why === 'cancelled' && kept?.hop === 1 && held.join() === '0,1,0,1,1' && windowEnd === null
        : why === 'input' && w.H.aborts === 1 && w.H.index === 2 && kept === null);
      R[tag + 'Detail'] = { hop: !!hop, pending, early, why, last, kept, held, windowEnd, aborts: w.H.aborts, index: w.H.index, none };
    }
  }
  { // round 3 — the EXIT's own go() cancelled (the page before VibeSpace answers 204): the booted page stays (leave why
    // cancelled), none of the exit's beforeunload listeners left; round 4: its intent SUSPENDED (kept — dropped when its
    // window ends) and the page RE-ARMED by a new sentinel (rearm why cancelled), so the NEXT back is ours: the
    // 「再返回一次退出」 toast — round 3 left the page with no sentinel above it, and that back was the browser's own onto
    // the older document: a load
    const w = world({ navApi: true, doc: 'B', navType: 'reload', sidebarOpen: true, index: 3, activation: ACT,
      entries: [{ prev: true, state: null, href: 'data:prev', cancel: true }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(300); w.back(); w.advance(10);
    const had = !!w.intent();
    w.advance(3100);
    const rows = w.diary().slice(-2), kept = w.intent(), armed = w.onSentinel() && w.H.pushes === 2;
    w.back(); w.advance(600); // the next back
    R.rearm = w.toasts.length === 2 && w.onSentinel() && !w.H.left && w.H.loads === 0;
    w.advance(7000);
    R.exitCancel = had && !!kept && kept.hop === 0 && !w.intent() && !w.H.left && w.H.loads === 0 && rows.map((r) => `${r.k}:${r.why}`).join() === 'leave:cancelled,rearm:cancelled' && armed && w.listeners('beforeunload') === 0;
    R.exitCancelDetail = { had, kept, intent: w.intent(), left: w.H.left, loads: w.H.loads, rows, armed, pushes: w.H.pushes, toasts: w.toasts.length };
  }
  { // round 4 — THE EXIT ON A SLOW LINK (G7's road, the older document's HTML answering in 3.5 s): the exit's go(-3) is not
    // gone within the 3 s bound — the page stays, re-armed by a new sentinel (the commit still comes — measured), its
    // intent KEPT; the commit lands 0.5 s later on the older document, whose activation names that new sentinel (the late
    // pagehide keyed the intent to it — measured: a sentinel stood up while a traversal is pending is its from) — so it
    // goes on (hop 1) — its Navigation API saying index -1 there, as Chrome's does (measured: it finds its own entry by
    // key) — and the tab stands on the page before VibeSpace; the diary has both rows (leave why cancelled,
    // rearm, then leave slow 3500). Round 3 dropped the intent at the bound: the older document booted with none and filed
    // nothing — the owner's silent load. At 12 s (past the intent's window — dropped at its end) the older document boots
    // and files ONE incident «a slow exit»
    for (const [tag, ms] of [['late', 3500], ['later', 12000]]) {
      const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 4, activation: ACT,
        entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A', ms }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A', sub: true }, { state: null, href: PG + '?session=x', doc: 'B' }] });
      M.installMobileBack(w.app);
      w.back(); w.advance(500); w.back(); w.advance(10);
      w.advance(ms); // the commit, ms after the go()
      const landed = w.H.loads === 1 && w.H.loadedAt === 1, intent = w.intent(), from = w.lastFrom(), first = w.diary()[0].d;
      const bRows = w.diary().filter((r) => r.d === first && (r.k === 'leave' || r.k === 'rearm')).map((r) => (r.k === 'rearm' ? `rearm:${r.why}` : r.why || (r.slow ? `slow:${r.slow}` : `${r.skip}/${r.load}`))).join();
      const lost = w.H.lost;
      w.newDoc({ doc: 'A', activation: w.arrivalNow() });
      const hop = M2.continueExit(); w.advance(10); await flush();
      let booted = false;
      if (!hop) { M2.installMobileBack(w.app); await flush(); booted = true; }
      const mine = w.diary().filter((r) => r.d !== first);
      R[tag] = landed && lost && bRows === `3/0,cancelled,rearm:cancelled,slow:${ms}` && (tag === 'late'
        ? !!hop && w.H.left && intent?.hop === 0 && intent?.key === from && mine.some((r) => r.k === 'hop' && r.n === 1 && r.skip === 1) && w.captures.length === 0
        : !hop && booted && intent === null && !w.H.left && w.captures.length === 1 && w.captures[0].reason === 'a slow exit' && /slow 12000 ms/.test(w.captures[0].detail) && mine.some((r) => r.k === 'cost' && r.why === 'slow'));
      R[tag + 'Detail'] = { landed, lost, bRows, intent, from, hop: !!hop, booted, left: w.H.left, captures: w.captures.map((c) => c.reason), mine: mine.map((r) => (r.k === 'hop' && r.stay ? `hop-stay:${r.why}` : r.k)) };
    }
  }
  { // round 4 — a TAP while the exit's go() is pending (G7's road, the older document answering in 6 s; the tap 1 s in): the
    // go() is ABORTED by the step onto the sentinel above (measured on Chrome 154: window.stop() aborts no traversal;
    // navigation.forward() does, and lands there) — the page stays, re-armed (leave why input, rearm why input), the intent
    // dropped, nothing ever commits. Round 3 dropped the intent and let the traversal go on: the older document booted,
    // the tap lost. Should the commit come FIRST (it answered just then — `race`): the diary says so (leave why input,
    // then leave slow) and the intent, kept for it, makes the older document go on — the landing document's rule
    for (const tag of ['tapAbort', 'tapRace']) {
      const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 4, activation: ACT,
        entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A', ms: 6000, race: tag === 'tapRace' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A', sub: true }, { state: null, href: PG + '?session=x', doc: 'B' }] });
      M.installMobileBack(w.app);
      w.back(); w.advance(500); w.back(); w.advance(10);
      w.advance(1000); w.input(); w.advance(10); await flush();
      const mid = { index: w.H.index, sentinel: w.onSentinel(), intent: w.intent(), loads: w.H.loads, from: w.lastFrom() }, first = w.diary()[0].d;
      w.advance(7000); await flush();
      const bRows = w.diary().filter((r) => r.d === first && (r.k === 'leave' || r.k === 'rearm')).map((r) => (r.k === 'rearm' ? `rearm:${r.why}` : r.why || (r.slow ? `slow:${r.slow}` : `${r.skip}/${r.load}`))).join();
      let hop = null;
      if (tag === 'tapRace') { w.newDoc({ doc: 'A', activation: { from: { index: 9, key: mid.from }, entry: { index: 0 } } }); hop = M2.continueExit(); w.advance(10); await flush(); }
      R[tag] = tag === 'tapAbort'
        ? w.H.aborts === 1 && w.H.loads === 0 && !w.H.left && w.onSentinel() && mid.intent === null && bRows === '3/0,input,rearm:input' && w.listeners('beforeunload') === 0 && w.listeners('pointerdown') === 0
        : mid.loads === 1 && w.H.aborts === 0 && /^3\/0,input,slow:10\d\d$/.test(bRows) && mid.intent?.hop === 0 && !!hop && w.H.left;
      R[tag + 'Detail'] = { mid, aborts: w.H.aborts, loads: w.H.loads, left: w.H.left, bRows, hop: !!hop };
    }
  }
  { // round 4 — a HOP's go() slower than the bound (G7's road; the page before VibeSpace answering in 4 s): the older
    // document stays at 3 s (hop stay why cancelled — its intent kept) and boots, then the commit leaves it after all: the
    // diary says so (hop 1 slow 4000) and the tab stands on the page before VibeSpace
    const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 4, activation: ACT,
      entries: [{ prev: true, state: null, href: 'data:prev', ms: 4000 }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A', sub: true }, { state: null, href: PG + '?session=x', doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(500); w.back(); w.advance(10);
    w.newDoc({ doc: 'A', activation: { from: { index: 2, key: w.intent()?.key || 'none' }, entry: { index: 0 } } });
    const hop = M2.continueExit(); let why = null; hop?.then((x) => { why = x; });
    w.advance(3100); await flush();
    const stayed = why === 'cancelled' && w.intent()?.hop === 1;
    if (why) { M2.installMobileBack(w.app); await flush(); }
    w.advance(1000); await flush();
    const first = w.diary()[0].d, mine = w.diary().filter((r) => r.d !== first && r.k === 'hop').map((r) => (r.slow ? `slow:${r.slow}` : r.stay ? `stay:${r.why}` : `n${r.n}`)).join();
    R.hopSlow = !!hop && stayed && w.H.left && mine === 'n1,stay:cancelled,slow:4000' && w.captures.length === 0;
    R.hopSlowDetail = { hop: !!hop, why, stayed, left: w.H.left, mine };
  }
  { // round 3 — the exit's go() lands on an older document the back/forward cache KEPT: shown again (pageshow persisted, its
    // activation FROM the entry the intent names) it goes on — ONE go(-1) onto the page before VibeSpace (round 2: its
    // pageshow dropped the intent and the person stood on the older document)
    const S = new Map();
    const w = world({ navApi: true, doc: 'A', navType: 'navigate', sidebarOpen: true, index: 1, store: S, activation: ACT,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }] });
    M2.installMobileBack(w.app); // the older document: its sentinel
    w.iframeStep(); // one iframe link followed inside it
    w.navigateTo({ doc: 'B', href: PG + '?session=x', keep: true }); // a `?` load over it; the cache keeps it
    M.installMobileBack(w.app);
    w.back(); w.advance(500); w.back(); w.advance(10); // at home: the toast, then the exit's go(-3) onto its page entry
    w.advance(50);
    const rows = w.diary(), a = rows.filter((r) => r.d === rows[0].d).map((r) => r.k + (r.k === 'hop' ? (r.stay ? ':stay' : `:${r.n}/${r.skip}`) : '')).join(' ');
    R.kept = w.H.restores === 1 && w.H.loads === 0 && w.H.left && / show hop:1\/1 hide$/.test(a) && w.intent()?.hop === 1;
    R.keptDetail = { restores: w.H.restores, loads: w.H.loads, left: w.H.left, a };
  }
  { // round 3 — NO KEY, NO HOP: an intent in the tab and a back_forward load inside 10 s, but nothing says where it came
    // from — (a) no Navigation API at all, (b) entries() without navigation.activation: dropped, the app boots
    for (const [tag, navApi] of [['noApi', false], ['noAct', true]]) {
      const S = new Map([['vibespace.exitIntent', JSON.stringify({ t: 1e6 - 2000, hop: 0, key: 'kpage001', to: 'below' })]]);
      const w = world({ navApi, doc: 'C', navType: 'back_forward', index: 1, store: S, entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'C' }] });
      const hop = M.continueExit();
      R[tag] = hop === null && !S.has('vibespace.exitIntent') && w.diary().at(-1)?.drop === 1 && !w.H.left;
      R[tag + 'Detail'] = { hop: hop === null ? null : 'a promise', rows: w.diary() };
    }
    // …and such a browser's exit writes NO intent: one go() past every older entry (round 1's ONE named load at most)
    const w = world({ navApi: true, doc: 'B', navType: 'navigate', search: '?session=x', sidebarOpen: true, index: 3,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }, { state: null, href: PG + '?session=x', doc: 'B' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(500);
    const seen = [];
    const set = globalThis.sessionStorage.setItem; globalThis.sessionStorage.setItem = (k, v) => { seen.push(k); set(k, v); };
    w.back(); w.advance(10);
    globalThis.sessionStorage.setItem = set;
    R.noActExit = w.H.left && w.H.loads === 0 && !seen.includes('vibespace.exitIntent') && w.diary().some((r) => r.k === 'leave' && r.skip === 3);
    R.noActExitDetail = { left: w.H.left, seen };
  }
  { // a reload ON the sentinel, the entry below same-document (the measured road): kept — nothing written
    const w = world({ navApi: true, doc: 'A', navType: 'reload', index: 2,
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: { vs: 1 }, href: PG, doc: 'A' }] });
    M.installMobileBack(w.app);
    w.back(); w.advance(600);
    R.reloadKeep = w.H.pushes === 0 && w.H.replaces === 0 && w.H.loads === 0 && w.onSentinel() && w.diary()[0]?.step === 'keep';
  }
  { // the re-arm lands: the diary's go1 row carries the ms (never the 500 ms belt)
    const w = world({ navApi: true, sidebarOpen: false }); M.installMobileBack(w.app);
    w.back(); w.advance(600);
    const g = w.diary().filter((r) => r.k === 'go1');
    R.go1 = g.length === 1 && g[0].ms >= 0 && g[0].ms < 500 && !('landed' in g[0]) && w.H.pushes === 1; R.go1Detail = g;
  }
  { // a load that FOLLOWED a back press inside VibeSpace (the previous document's close, then its pagehide on entry
    // kold0001; this load navigation.activation's back FROM that entry): ONE incident, the words say so
    const S = new Map([['vibespace.navLog', JSON.stringify([{ t: 1e6 - 1200, d: 'old00', k: 'pop', v: 'close' }, { t: 1e6 - 900, d: 'old00', k: 'hide', p: 0, ek: 'kold0001' }])]]);
    const back = { from: { index: 1, key: 'kold0001' }, entry: { index: 0 } };
    const w = world({ navApi: true, doc: 'C', navType: 'back_forward', index: 1, store: S, activation: back, entries: [{ prev: true, state: null, href: 'data:prev' }, { state: { vs: 1 }, href: PG, doc: 'C' }] });
    M.installMobileBack(w.app); await flush();
    const one = w.captures.length === 1 && /back press cost a page load/.test(w.captures[0].reason) && /pop:close > hide/.test(w.captures[0].detail) && /A back press reloaded the page/.test(w.captures[0].opts?.toastKey || '')
      && w.diary().some((r) => r.k === 'cost' && r.capture === 1) && w.diary().some((r) => r.k === 'capture' && r.id === 'inc-test-1') && w.diary().some((r) => r.k === 'boot' && r.came === 'back');
    S.set('vibespace.navLog', JSON.stringify([...w.diary(), { t: 1e6 - 100, d: 'old01', k: 'hide', p: 0, ek: 'kold0001' }]));
    const w2 = world({ navApi: true, doc: 'D', navType: 'back_forward', index: 1, store: S, activation: back, entries: [{ prev: true, state: null, href: 'data:prev' }, { state: { vs: 1 }, href: PG, doc: 'D' }] });
    w2.advance(0); M.installMobileBack(w2.app); await flush();
    R.capture = one && w2.captures.length === 0 && w2.diary().some((r) => r.k === 'cost' && r.capture === 0);
    R.captureDetail = { captures: w.captures, again: w2.captures.length, rows: w2.diary().slice(-3) };
  }
  { // round 2 — a FORWARD press: the stay arm (ex 0), the browser's own back out, forward inside 5 s — the page loads again
    const rows = [{ t: 1e6 - 3000, d: 'old00', k: 'boot', type: 'navigate' }, { t: 1e6 - 1500, d: 'old00', k: 'pop', v: 'arm', ex: 0 }, { t: 1e6 - 1200, d: 'old00', k: 'hide', p: 0, ek: 'kpage001' }];
    const w = world({ navApi: true, doc: 'C', navType: 'back_forward', index: 1, store: new Map([['vibespace.navLog', JSON.stringify(rows)]]), activation: { from: null, entry: { index: 0 } },
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'C' }] });
    M.installMobileBack(w.app); await flush();
    const site = w.captures.length === 0 && w.diary().some((r) => r.k === 'boot' && r.came === 'other') && !w.diary().some((r) => r.k === 'cost');
    const w2 = world({ navApi: true, doc: 'C', navType: 'back_forward', index: 2, store: new Map([['vibespace.navLog', JSON.stringify(rows)]]), activation: { from: { index: 0, key: 'kpage001' }, entry: { index: 1 } },
      entries: [{ prev: true, state: null, href: 'data:prev' }, { state: null, href: PG, doc: 'A' }, { state: null, href: PG, doc: 'C' }] });
    M.installMobileBack(w2.app); await flush();
    const ours = w2.captures.length === 0 && w2.diary().some((r) => r.k === 'boot' && r.came === 'forward');
    R.forward = site && ours;
    R.forwardDetail = { site: w.captures.length, ours: w2.captures.length, rows: w.diary().slice(-2) };
  }
  Object.assign(globalThis, { setTimeout: realClock.setTimeout, clearTimeout: realClock.clearTimeout }); Date.now = realClock.now;
  return R;
}
console.log('\n§5 a back never costs a load (the real wiring over documents + the Navigation API)');
const legsOf = async (src, tag) => reloadLegs(await bundleWiring(src, tag), await bundleWiring(src, tag + '-next'));
const R5 = await reloadLegs(MW, await bundleWiring(wiringSrc, 'real-next'));
ok(R5.discard, 'a discarded tab shown again (standing on {vs:1}, the dead entry below reported sameDocument): REBUILT — replaceState(null) + one sentinel; its first back closes the window, same document, no load', R5.discardDetail);
ok(R5.discardRow, '…the diary\'s boot row: back_forward, rebuild, disc 1, state vs1, entries S*S (what the API claimed)', R5.discardDetail.boot);
ok(R5.crash, 'a renderer kill\'s reload (state lost, an older document below): the exit toast re-arms at once; the second back leaves past the older entry in ONE go(-2) — no load', R5.crashDetail);
ok(R5.crashRows, '…the diary: boot (reload, push, null, x*S) · pop arm ex 2 · go1 ms · pop leave · leave skip 2 load 0 · hide (its pagehide at the commit)', R5.crashDetail.rows);
ok(R5.second, 'a second load of the app in the tab (a `?` link over an older document): at home the toast, the exit skips all three older entries in ONE go(-3)', R5.secondDetail);
ok(R5.whole, 'the whole tab VibeSpace\'s: the exit goes to the first entry — ONE load, named in the diary (leave load 1) — and the next boot files no incident for it', R5.wholeDetail);
ok(R5.fallback, 'nothing before the block after all (a forward entry outside it): go(-3) does nothing; 700 ms later the first entry, named (leave 3/0 then 2/1)', R5.fallbackDetail);
ok(R5.reloadKeep, 'a reload ON the sentinel with the entry below same-document (the measured road): kept — no replaceState, no push, the boot row says keep');
ok(R5.go1, 'the re-arm lands: ONE go1 row with its ms (< 500 — never the belt\'s push)', R5.go1Detail);
ok(R5.capture, 'a load that followed a back press inside VibeSpace (previous document: close, pagehide; this one back_forward, a back FROM its entry): ONE incident in the back\'s own words; another such load inside half an hour: a cost row, no second capture', R5.captureDetail);
ok(R5.leaveInput, 'round 2: the exit writes its intent (hop 0, below, the page entry\'s key) before its go(); a person\'s tap ends it', R5.leaveInputDetail);
ok(R5.iframe, 'round 2: ONE iframe link inside the older document — the exit\'s go(-3) LANDS on that document; it reads the intent, goes on with ONE go(-1) (diary: hop 1, skip 1, *SSxx) and never boots the app — the tab stands on the page before VibeSpace, ONE load', R5.iframeDetail);
ok(R5.hopCap, 'round 2: the whole tab VibeSpace\'s and an unseen step: the hops that start nothing go on each 700 ms to the cap (hop 1, 2, 3, stay cap), then the page boots — the ONE named load, no incident', R5.hopCapDetail);
ok(R5.hopInput, 'round 2: a person\'s tap during a hop — the page stays there and then (hop stay, why input), the intent gone', R5.hopInputDetail);
ok(R5.intentDrop, 'round 2: an intent that is not this load\'s (forward from another site\'s page) is dropped — a hop drop row — and the app boots', R5.intentDropDetail);
ok(R5.slow, 'round 2: a go() onto a SLOW page (beforeunload at once, the commit 2.5 s later): the 700 ms fallback never fires — the tab lands outside, no load', R5.slowDetail);
ok(R5.slower, 'round 3: one slower than the 3 s bound (4 s) still leaves, never a load; round 4: the stay re-armed (rearm why cancelled) and the late pagehide told after it (leave slow 4000); no beforeunload listener left', R5.slowerDetail);
ok(R5.cancel, 'round 3: a hop\'s go() CANCELLED (a 204, a stopped load — beforeunload, then nothing ever): 3 s later the page stays (hop stay why cancelled) and the promise settles — the App boots; round 4: the intent SUSPENDED (kept, the late watch\'s pagehide + tap listeners held, no beforeunload / pageshow one), dropped when its window ends, no listener left after 30 s', R5.cancelDetail);
ok(R5.cancelTap, 'round 3: a tap while that go() is pending (beforeunload came, the page not gone): the page stays at once (why input); round 4: the go() ABORTED by the step onto the same-document entry above — it lands there, the intent dropped, no listener left', R5.cancelTapDetail);
ok(R5.exitCancel, 'round 3: the EXIT\'s own go() cancelled (the page before VibeSpace answers 204): the booted page stays (leave why cancelled), no beforeunload listener left; round 4: the intent KEPT until its window ends, the page RE-ARMED by a new sentinel (rearm why cancelled)', R5.exitCancelDetail);
ok(R5.rearm, 'round 4: …and the NEXT back after that stay is ours — the 「再返回一次退出」 toast, back on the sentinel, no load (round 3: the browser\'s own back onto the older document)', R5.exitCancelDetail);
ok(R5.late, 'round 4: THE EXIT ON A SLOW LINK — the older document answering in 3.5 s: the page stays at the bound and re-arms, the late pagehide keys the intent to the new sentinel (leave why cancelled, rearm, leave slow 3500), and the older document the commit lands on GOES ON (hop 1) — the tab outside, no incident', R5.lateDetail);
ok(R5.later, 'round 4: …answering in 12 s (past the intent\'s window — dropped at its end): the older document boots and files ONE incident «a slow exit» (its detail: slow 12000 ms; the diary\'s cost row why slow)', R5.laterDetail);
ok(R5.tapAbort, 'round 4: a TAP while the exit\'s go() is pending (the older document answering in 6 s): the go() ABORTED by the step onto the sentinel above — re-armed (leave why input, rearm why input), the intent dropped, nothing commits, no listener left', R5.tapAbortDetail);
ok(R5.tapRace, 'round 4: …the commit FIRST (it answered just then): the diary says so (leave why input, then leave slow) and the intent, kept for it, makes the older document go on — the landing document\'s rule', R5.tapRaceDetail);
ok(R5.hopSlow, 'round 4: a HOP\'s go() slower than the bound (4 s): the older document stays at 3 s and boots, then leaves after all — the diary says so (hop 1 slow 4000), the tab outside, no incident', R5.hopSlowDetail);
ok(R5.kept, 'round 3: the exit\'s go() lands on an older document the cache KEPT — shown again, activation from the entry the intent names: it goes on (show, hop 1 skip 1), onto the page before VibeSpace; no load', R5.keptDetail);
ok(R5.noApi && R5.noAct, 'round 3: NO KEY, NO HOP — an intent inside 10 s on a back_forward load (a) with no Navigation API, (b) with entries() but no navigation.activation: dropped (a drop row), the app boots', { a: R5.noApiDetail, b: R5.noActDetail });
ok(R5.noActExit, 'round 3: …and on such a browser the exit writes NO intent — one go(-3) past every older entry', R5.noActExitDetail);
ok(wiringSrc.includes('export function installMobileBack(') && !/^  window\.addEventListener\('beforeunload'/m.test(wiringSrc.slice(wiringSrc.indexOf('export function installMobileBack('))), 'round 2: no beforeunload listener for the page\'s life — only around the exit\'s go() and a hop (a held one makes each reload wait for it)');
ok(R5.forward, 'round 2: a FORWARD press after the stay arm\'s exit (from another site\'s page; from an older entry of ours) files nothing — the boot row says came other / forward', R5.forwardDetail);

// ── §3 negative controls ──
console.log('\n§3 negative controls (patched copies)');
const bgSrc = read('src/lib/back-guard.js');
{
  const from = 'now - lastBackAt < BACK_WINDOW_MS';
  const M = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from, 'now - lastBackAt <= BACK_WINDOW_MS'), 'edge')).href);
  const bad = judgeTable(M);
  ok(bgSrc.includes(from) && bad.length === 1 && /exactly 2000/.test(bad[0].name), 'CONTROL: the window edge `<=` fails exactly the 2000-ms row', bad);
}
{
  const from = 'if (target && !(deepLinkFirst && target === \'window\')) return';
  const M = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from, 'if (target) return'), 'no-deeplink')).href);
  const bad = judgeTable(M);
  ok(bgSrc.includes(from) && bad.length === 1 && /closes no window/.test(bad[0].name), 'CONTROL: deepLinkFirst ignored fails exactly the deep-link window row', bad);
}
{
  const from = '    history.go(1);\n';
  const M = await bundleWiring(wiringSrc.replace(from, '    push();\n'), 'repush');
  const RR = wiringLegs(M);
  Object.assign(globalThis, { setTimeout: realClock.setTimeout, clearTimeout: realClock.clearTimeout }); Date.now = realClock.now;
  ok(wiringSrc.includes(from) && !RR.popover && !RR.window && !RR.drilldown && !RR.dialog && !RR.rearm, 'CONTROL: a wiring that re-arms with pushState (a new entry per back — the shape Chrome\'s intervention skips) fails the no-new-entry legs', { popover: RR.popover, window: RR.window, drilldown: RR.drilldown, dialog: RR.dialog, rearm: RR.rearm });
}

{
  const from = '    if (location.href !== baseHref) { clearTimeout(restand); restand = null; push(); return; }\n';
  const M = await bundleWiring(wiringSrc.replace(from, ''), 'no-href');
  const RR = wiringLegs(M);
  Object.assign(globalThis, { setTimeout: realClock.setTimeout, clearTimeout: realClock.clearTimeout }); Date.now = realClock.now;
  ok(wiringSrc.includes(from) && !RR.fragment && RR.popover && RR.window, 'CONTROL: a wiring without the URL check reads a #fragment link as a back (closes the menu) — the fragment leg fails, the others hold', RR.fragDetail);
}

{
  const from = 'window: () => { if (!home?.show?.()) sb.toggle(true); },';
  const M = await bundleWiring(wiringSrc.replace(from, 'window: () => sb.toggle(true),'), 'no-home');
  const RR = wiringLegs(M);
  Object.assign(globalThis, { setTimeout: realClock.setTimeout, clearTimeout: realClock.clearTimeout }); Date.now = realClock.now;
  ok(wiringSrc.includes(from) && !RR.homePage && RR.homeEmpty && RR.homeSidebar && RR.window, 'CONTROL (lane phone-first-screen): a wiring whose window area yields to the sidebar only fails the page leg (the empty-list, sidebar and window legs hold)', RR.homeDetail);
}

{ // lane phone-back-reload: the PURE rows' own controls
  const from = "if (isSentinel(state)) return enabled !== false && (wasDiscarded || navType === 'back_forward' || belowSame === false) ? 'rebuild' : 'keep';";
  const M = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from, "if (isSentinel(state)) return 'keep';"), 'no-rebuild')).href);
  const bad = judgeRebuild(M);
  ok(bgSrc.includes(from) && bad.length === 4 && bad.every((b) => /rebuild/.test(b.n)), 'CONTROL: bootStep without the rebuild (the pre-fix rule) fails exactly the four rebuild rows', bad);
  const from2 = '  return length > 0 && length === block ? { skip: current, load: true } : { skip: current + 1, load: false };';
  const M2 = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from2, '  return { skip: current + 1, load: false };'), 'no-whole')).href);
  const bad2 = judgeExit(M2);
  ok(bgSrc.includes(from2) && bad2.length === 1 && /WHOLE tab/.test(bad2[0].n), 'CONTROL: an exit plan that never names the whole-tab load fails exactly that row', bad2);
  const from3 = "  return !prev.some((r) => r && (r.k === 'leave' || r.k === 'hop'));\n";
  const M3 = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from3, '  return true;\n'), 'cost-leave')).href);
  const bad3 = judgeCost(M3);
  ok(bgSrc.includes(from3) && bad3.length === 3 && bad3.filter((n) => /named load/.test(n)).length === 2 && bad3.some((n) => /hop row/.test(n)), 'CONTROL: a detector blind to the exit\'s own traversals fails exactly the named-load rows (with and without activation) and the hop row', bad3);
  const from4a = "  if (navType !== 'back_forward' || !prev.length || came === 'forward' || came === 'other') return false;";
  const M4 = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from4a, "  if (navType !== 'back_forward' || !prev.length) return false;"), 'cost-blind')).href);
  const bad4 = judgeCost(M4);
  ok(bgSrc.includes(from4a) && bad4.length === 2 && bad4.every((n) => /FORWARD|another site/.test(n)), 'CONTROL (RED from round 1): a detector blind to the way in fails exactly the forward and other-site rows', bad4);
  const M4b = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from3, "  if (prev.some((r) => r && (r.k === 'leave' || r.k === 'hop'))) return false;\n  if (came === 'back') return true;\n  const pop = [...prev].reverse().find((r) => r && r.k === 'pop');\n  return !!pop && !(pop.v === 'arm' && !pop.ex);\n"), 'cost-round-2')).href);
  const bad4b = judgeCost(M4b);
  ok(bad4b.length === 2 && bad4b.some((n) => /DISCARD road/.test(n)) && bad4b.some((n) => /stay arm/.test(n)), 'CONTROL (RED from round 2): the «a pop row, never the stay arm» rule without activation fails exactly the discard road and the stay arm\'s loading back', bad4b);
  const from5 = "  if (!(typeof fromKey === 'string' && fromKey !== '' && fromKey === intent.key)) return 'clear';\n";
  const M5 = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from5, ''), 'hop-any-from')).href);
  const bad5 = judgeHop(M5);
  ok(bgSrc.includes(from5) && bad5.length === 4 && bad5.every((n) => /another site|ANOTHER entry|no key|empty key/.test(n)), 'CONTROL: an exitHop that never asks where the load came from fails exactly the from-another-site, other-entry, no-key and empty-key rows', bad5);
  const M5b = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from5, "  if (fromKey !== undefined && fromKey !== intent.key) return 'clear';\n"), 'hop-clock-alone')).href);
  const bad5b = judgeHop(M5b);
  ok(bad5b.length === 2 && bad5b.every((n) => /no key|empty key/.test(n)), 'CONTROL (RED from round 2): the clock-alone exitHop fails exactly the no-key and empty-key rows', bad5b);
  const from6s = "  return prev.some((r) => r && (r.k === 'leave' || r.k === 'hop') && r.slow > 0);\n";
  const M6 = await import(pathToFileURL(MUT.write('src/lib/back-guard.js', bgSrc.replace(from6s, "  return prev.some((r) => r && (r.k === 'leave' || r.k === 'hop'));\n"), 'slow-any-leave')).href);
  const bad6 = judgeSlow(M6);
  ok(bgSrc.includes(from6s) && bad6.length === 2 && bad6.every((n) => /in time|never committed/.test(n)), 'CONTROL: a slowExit that never asks for the slow row fails exactly the in-time exit and the never-committed stay', bad6);
}
{ // the wiring's controls — the pre-fix shapes over the same documents
  const from = 'const step = bootStep({ phone: true, enabled: enabled(), state: stateAtBoot, navType: facts.type, wasDiscarded: facts.disc, belowSame });';
  const RR = await legsOf(wiringSrc.replace(from, 'const step = bootStep({ phone: true, enabled: enabled(), state: stateAtBoot });'), 'pre-rebuild');
  ok(wiringSrc.includes(from) && !RR.discard && RR.discardDetail.loads === 1 && RR.crash && RR.second, 'CONTROL (RED from the base rule): a boot that keeps the discarded tab\'s sentinel — its first back is a LOAD (the owner\'s splash); the other roads hold', RR.discardDetail);
  const from2 = 'const exit = ents ? exitPlan({ current: ents.current, block: ents.list.length, length: history.length }) : null;';
  const RX = await legsOf(wiringSrc.replace(from2, 'const exit = null;'), 'no-exit');
  ok(wiringSrc.includes(from2) && !RX.crash && RX.crashDetail.loads === 1 && !RX.second && RX.secondDetail.loads === 1 && RX.discard, 'CONTROL (RED from the base rule): without the exit plan the 「再返回一次退出」 back is the browser\'s own onto the OLDER document — a LOAD after the kill and after the second load; the discard leg holds', { crash: RX.crashDetail, second: RX.secondDetail });
  const from3 = '    history.go(1);\n';
  const RG = await legsOf(wiringSrc.replace(from3, ''), 'dropped-go1');
  ok(wiringSrc.includes(from3) && !RG.go1 && RG.go1Detail.length === 1 && RG.go1Detail[0].landed === 0 && RG.go1Detail[0].push === 1, 'CONTROL: a DROPPED go(1) (hypothesis 2) — the diary says so: go1 landed 0 + the 500 ms push', RG.go1Detail);
  const from4 = '  const intent = exitIntentRead();\n';
  const RI = await legsOf(wiringSrc.replace(from4, '  const intent = null;\n'), 'no-intent');
  ok(wiringSrc.includes(from4) && !RI.iframe && RI.iframeDetail.landed && RI.iframeDetail.stays && RI.crash && RI.second && RI.discard, 'CONTROL (RED from round 1): without the intent the iframe road\'s exit lands on the OLDER document and it boots there — the page stays, a load; the other roads hold', RI.iframeDetail);
  const from5 = 'now: Date.now(), came })) {';
  const RB = await legsOf(wiringSrc.replace(from5, "now: Date.now(), came: 'back' })) {"), 'cost-blind');
  ok(wiringSrc.includes(from5) && !RB.forward && RB.forwardDetail.site === 1 && RB.capture, 'CONTROL (RED from round 1): a wiring blind to the way in files «a back press cost a page load» for the FORWARD press; the back\'s own capture holds', RB.forwardDetail);
  const from6 = "  window.addEventListener('beforeunload', onLeave); window.addEventListener('pagehide', onHide);\n";
  const RU = await legsOf(wiringSrc.replace(from6, "  window.addEventListener('pagehide', onHide);\n"), 'pagehide-judge');
  ok(wiringSrc.includes(from6) && !RU.slow && RU.slowDetail.loads === 1, 'CONTROL (RED from round 1): pagehide as the fallback\'s judge — the go() onto a slow page is taken for one that started nothing, and the fallback LOADS the tab\'s first entry', RU.slowDetail);
  // round 3's controls — round 2's shapes over the same documents
  const from7a = "  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); stayed('cancelled', null); linger(); }, GONE_WAIT_MS); };\n";
  const from7b = '  const onInput = () => {\n    off();\n    if (!began) { drop(); input(); return; }\n    const abort = abortGo();\n    if (!abort) drop();\n    stayed(\'input\', abort);\n    const end = linger();\n    abort?.then((landed) => { if (landed) { drop(); end(); } });\n  };\n';
  const RC = await legsOf(wiringSrc.replace(from7a, '  const onLeave = () => { began = true; };\n').replace(from7b, '  const onInput = () => { if (!began) { off(); drop(); input(); } };\n'), 'unbounded');
  ok(wiringSrc.includes(from7a) && wiringSrc.includes(from7b) && !RC.cancel && RC.cancelDetail.why === null && RC.cancelDetail.held[0] === 1 && !RC.cancelTap && !RC.exitCancel && RC.iframe && RC.slow,
    'CONTROL (RED from round 2): an unbounded go() whose tap is ignored while pending — the hop\'s cancelled go() never settles (the splash for good, its beforeunload listener held), the tap does nothing, the exit\'s intent lingers; the iframe and slow roads hold', { cancel: RC.cancelDetail, tap: RC.cancelTapDetail, exit: RC.exitCancelDetail });
  const from8 = "    if (step === 'hop') goOn(Number(intent.hop) || 0); // the exit's go() landed on this KEPT document: it goes on (round 3)\n    else if (intent) dropIntent(intent, step);\n";
  const RK = await legsOf(wiringSrc.replace(from8, '    exitIntentClear();\n'), 'show-clears');
  ok(wiringSrc.includes(from8) && !RK.kept && RK.keptDetail.restores === 1 && !RK.keptDetail.left && RK.iframe, 'CONTROL (RED from round 2): a pageshow that drops the intent — the exit stops on the KEPT older document (the person stands on it); the loaded road holds', RK.keptDetail);
  const from9 = "    if (tellsArrival()) exitIntentWrite({ t: Date.now(), hop: 0, key: entryKey(), to: 'below' });\n";
  const keyLine = "  if (!(typeof fromKey === 'string' && fromKey !== '' && fromKey === intent.key)) return 'clear';\n";
  const clockAlone = bgSrc.replace(keyLine, "  if (fromKey !== undefined && fromKey !== intent.key) return 'clear';\n");
  const RN = await reloadLegs(await bundleWiring(wiringSrc.replace(from9, "    exitIntentWrite({ t: Date.now(), hop: 0, key: entryKey(), to: 'below' });\n"), 'clock-alone', clockAlone),
    await bundleWiring(wiringSrc, 'clock-alone-next', clockAlone));
  ok(wiringSrc.includes(from9) && bgSrc.includes(keyLine) && !RN.noApi && !RN.noAct && !RN.noActExit && RN.iframe && RN.kept, 'CONTROL (RED from round 2): the clock-alone exitHop + an intent written without activation — a back_forward load inside 10 s HOPS with no key (a, b) and the exit writes its intent anyway; the keyed roads hold', { a: RN.noApiDetail, b: RN.noActDetail, exit: RN.noActExitDetail });
  // round 4's controls — round 3's shapes over the same documents, one finding each
  const RD = await legsOf(wiringSrc.replace(from7a, "  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); drop(); stayed('cancelled', null); }, GONE_WAIT_MS); };\n"), 'drop-at-bound');
  ok(!RD.late && RD.lateDetail.booted && RD.lateDetail.captures.length === 0 && !RD.later && RD.laterDetail.captures.length === 0 && !RD.exitCancel && !RD.hopSlow && RD.tapAbort && RD.iframe && RD.kept,
    'CONTROL (RED from round 3): the bound DROPS the intent and watches nothing after — the exit on a slow link lands on the older document, which boots with no intent and files NOTHING (the owner\'s silent load), the 12 s landing too; the abort and the loaded roads hold', { late: RD.lateDetail, later: RD.laterDetail });
  const fromA = "        else if (enabled() && app.isMobile !== false) { push(); navNote({ k: 'rearm', why }); }\n";
  const RA = await legsOf(wiringSrc.replace(fromA, ''), 'no-rearm');
  ok(wiringSrc.includes(fromA) && !RA.rearm && RA.exitCancelDetail.loads === 1 && RA.lateDetail.hop && RA.tapAbort && RA.iframe,
    'CONTROL (RED from round 3): a stay that never re-arms — the next back after the cancelled exit is the browser\'s own onto the older document: a LOAD, no toast; the slow road (it still goes on) and the abort hold', RA.exitCancelDetail);
  const fromB = "  const onInput = () => { off(); drop(); if (began) stayed('input', null); else input(); };\n";
  const RB2 = await legsOf(wiringSrc.replace(from7b, fromB), 'no-abort');
  ok(!RB2.tapAbort && RB2.tapAbortDetail.loads === 1 && !RB2.tapRace && !RB2.cancelTap && RB2.late && RB2.exitCancel && RB2.leaveInput,
    'CONTROL (RED from round 3): a tap that only drops the intent — the pending traversal goes on and the older document LOADS (the tap lost), the race leaves it with no intent, the hop\'s tap aborts nothing; the slow and cancelled roads hold', { tap: RB2.tapAbortDetail, race: RB2.tapRaceDetail, hop: RB2.cancelTapDetail });
  const fromK = "      if (ours()) exitIntentWrite({ t: mine.t, hop: mine.hop, key: entryKey(), to: 'below' });\n";
  const RK2 = await legsOf(wiringSrc.replace(fromK, ''), 'no-rekey');
  ok(wiringSrc.includes(fromK) && !RK2.late && RK2.lateDetail.hop === false && RK2.lateDetail.captures.join() === 'a slow exit' && RK2.tapRace && RK2.later,
    'CONTROL: no re-key at the late pagehide — the older document\'s activation names the NEW sentinel, not the entry the intent was written on: no hop (it boots and files «a slow exit»); the race, which left from the page entry, holds', RK2.lateDetail);
  const fromI = 'const indexIn = (nav, list) => { const c = nav?.currentEntry; return !c ? -1 : c.index >= 0 ? c.index : list.findIndex((e) => e && e.key === c.key); };\n';
  const RI2 = await legsOf(wiringSrc.replace(fromI, 'const indexIn = (nav) => (nav?.currentEntry ? nav.currentEntry.index : -1);\n'), 'index-as-told');
  ok(wiringSrc.includes(fromI) && !RI2.late && /hop-stay:api/.test(RI2.lateDetail.mine.join()) && RI2.tapAbort && RI2.iframe,
    'CONTROL (Chrome 154, measured): currentEntry.index taken as told — the document the late commit lands on says -1, so its hop finds no entries and STAYS (hop stay why api: the older document boots); the other roads hold', RI2.lateDetail);
  const fromW = "    if (!(f.index >= 0) && e && !(e.index >= 0)) return { fromKey: String(f.key || '').slice(0, 8), came: '' };\n";
  const RW = await legsOf(wiringSrc.replace(fromW, ''), 'way-other');
  ok(wiringSrc.includes(fromW) && !RW.later && RW.laterDetail.captures.length === 0 && RW.late,
    'CONTROL (Chrome 154, measured): both activation indexes -1 read as another site\'s page — the late landing past the window files nothing; the hop holds', RW.laterDetail);
  const fromL = '  const late = slowExit({ navType: facts.type, prev, now: Date.now(), came });\n';
  const RL = await legsOf(wiringSrc.replace(fromL, '  const late = false;\n'), 'no-late-incident');
  ok(wiringSrc.includes(fromL) && !RL.later && RL.laterDetail.captures.length === 0 && RL.late && RL.capture,
    'CONTROL (RED from round 3): no slowExit at the boot — the landing past the window boots and files nothing; the back\'s own capture holds', RL.laterDetail);
}

// ── §4 wiring pins ──
console.log('\n§4 wiring pins');
const app = read('src/lib/app.js');
ok((app.match(/installMobileBack\(/g) || []).length === 1 && app.includes('this._mobileBack = this.isMobile ? installMobileBack(this) : null;'), 'app.js installs the guard once, only when app.isMobile (a desktop\'s back is never touched)');
const importers = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js') && /from '\.\/mobile-back\.js'/.test(read('src/lib/' + f)));
ok(importers.join() === 'app.js,viewport-switch.js' && read('src/lib/viewport-switch.js').includes('if (!app._mobileBack) app._mobileBack = installMobileBack(app);'),
  'mobile-back.js has TWO importers: app.js (a phone boot) and viewport-switch.js (the first fold to the phone, once — lane duo-build-1)', importers);
ok((wiringSrc.match(/history\.pushState\(/g) || []).length === 1 && /const push = \(\) => \{ baseHref = location\.href; history\.pushState\(\{ vs: 1 \}, ''\); \};/.test(wiringSrc) && wiringSrc.includes('history.go(1);'), 'the wiring has ONE pushState (the sentinel) and re-arms by traversal (history.go(1))');
const noComments = wiringSrc.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(wiringSrc.includes("        else if (enabled() && app.isMobile !== false) { push(); navNote({ k: 'rearm', why }); }") && /if \(!up \|\| !up\.sameDocument\) return null;\n    const step = nav\.forward\(\);/.test(wiringSrc) && !/window\.stop\(/.test(noComments),
  'round 4: a stay re-arms with push() — never a traversal, which would ABORT a pending one (measured) — and a tap aborts one only by the step onto a same-document entry above (navigation.forward()); window.stop() appears nowhere (it aborts no traversal — measured)');
ok(!/from '\.\/|import /.test(bgSrc.replace(/^\/\/.*$/gm, '')), 'back-guard.js imports nothing (PURE)');
ok((wiringSrc.match(/history\.replaceState\(/g) || []).length === 1 && wiringSrc.includes("  if (step === 'rebuild') history.replaceState(null, '');\n  if (step === 'push' || step === 'rebuild') push();"), 'lane phone-back-reload: ONE replaceState — null state, no URL — and only on the rebuild, right before the sentinel\'s push');
ok(read('src/lib/incident-recorder.js').includes('try { out.navLog = navLogRead(); } catch { }'), 'the incident snapshot carries the tab\'s diary (snapshot.navLog)');
const client = read('src/client.js');
ok(client.includes("const exitHop = continueExit();\ninstallTelemetry();") && client.includes("window.addEventListener('DOMContentLoaded', async () => {\n  if (exitHop) await exitHop;\n  applyUiPrefs();"),
  'round 2: client.js asks continueExit before anything boots, and builds the App only when it settles (an older page the exit lands on never boots)');
ok(/\n    if \(tellsArrival\(\)\) exitIntentWrite\(\{ t: Date\.now\(\), hop: 0, key: entryKey\(\), to: 'below' \}\);\n    const g = \+\+gen;\n    watchedGo\(-skip, \{/.test(wiringSrc) && /exitIntentWrite\(\{ t: Date\.now\(\), hop, key: entryKey\(\), to: 'below' \}\);[^\n]*\n[^\n]*\n\s*watchedGo\(-\(e\.current \+ 1\), /.test(wiringSrc),
  'round 2: the intent is written BEFORE each go() — the exit\'s (round 3: only where navigation.activation can name the landing) and every hop\'s');
ok(/  window\.addEventListener\('beforeunload', onLeave\); window\.addEventListener\('pagehide', onHide\);\n  for \(const ev of INPUTS\) window\.addEventListener\(ev, onInput, true\);\n  history\.go\(n\);/.test(wiringSrc)
  && /window\.removeEventListener\('beforeunload', onLeave\); window\.removeEventListener\('pagehide', onHide\);\n    for \(const ev of INPUTS\) window\.removeEventListener\(ev, onInput, true\);/.test(wiringSrc) && (wiringSrc.replace(/^\s*\/\/.*$/gm, '').match(/history\.go\(-/g) || []).length === 2,
  'round 3: the exit\'s go()s go through watchedGo — its judges listen BEFORE the go(), and off() removes each listener it added (the only bare go(-n) left: the named load and the fallback\'s)');
const todos = read('src/lib/user-todos-panel.js');
ok(/popup\.addEventListener\(BACK_DISMISS_EVENT, \(e\) => \{ e\.preventDefault\(\); hidePopup\('back'\); \}\);/.test(todos) && BG.BACK_DISMISS_EVENT === 'vs-back-dismiss', 'the For-you tray answers the back\'s dismiss through hidePopup (drafts stashed, rows dropped)');
const schema = read('src/lib/settings-schema.js');
const row = /'mobile\.backGuard': \{\n    type: 'boolean', default: true,\n[\s\S]{0,700}?category: t\('Mobile'\)/.exec(schema);
ok(!!row && /export const BACK_SETTING = 'mobile\.backGuard';/.test(wiringSrc) && /app\.settings\?\.get\(BACK_SETTING\)/.test(wiringSrc), 'the setting row (Mobile, default on) exists and the wiring reads it live');
ok(/t\('Session Card'\), t\('Mobile'\)\] \}/.test(schema) && /  t\('Session Card'\),\n  t\('Mobile'\),\n\];/.test(schema), 'the Mobile category is listed and grouped under Appearance & layout');
const css = read('public/style.css');
ok((css.match(/overscroll-behavior: none/g) || []).length >= 1 && css.includes('@media (pointer: coarse) { html, body { overscroll-behavior: none; } }') && !/^html, body \{[^}]*overscroll-behavior/m.test(css), 'the overscroll rule sits under (pointer: coarse) only — a desktop keeps its trackpad back swipe');
for (const lang of ['zh', 'ja']) {
  const d = read(`src/lib/i18n-${lang}.js`);
  const keys = ['Mobile', 'Back closes the open panel first; press again to exit', 'Press back again to exit'];
  ok(keys.every((k) => d.includes(JSON.stringify(k) + ':')), `${lang}: the setting, its category and the toast are translated`);
}
ok(read('src/lib/i18n-zh.js').includes('"Press back again to exit": "再返回一次退出"'), 'zh toast: 再返回一次退出');

console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 5 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
