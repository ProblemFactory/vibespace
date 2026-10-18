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
ok(BG.bootStep({ phone: true, enabled: true, state: null }) === 'push', 'boot: a phone pushes the sentinel');
ok(BG.bootStep({ phone: true, enabled: true, state: { vs: 1 } }) === 'keep', 'boot: a reload / restored tab ON the sentinel keeps it (no second one)');
ok(BG.bootStep({ phone: true, enabled: false, state: { vs: 1 } }) === 'keep', 'boot: setting off but standing on a sentinel: kept (its next back leaves)');
ok(BG.bootStep({ phone: true, enabled: false, state: null }) === 'none', 'boot: the setting off pushes nothing');
ok(BG.bootStep({ phone: false, enabled: true, state: null }) === 'none', 'boot: a desktop pushes nothing');
ok(BG.isSentinel({ vs: 1 }) && !BG.isSentinel(null) && !BG.isSentinel({ vs: 2 }) && !BG.isSentinel('vs'), 'isSentinel: only {vs:1}');

// ── §2 the real wiring over a fake history + clock ──
async function bundleWiring(src, tag) {
  const stub = { name: 'stubs', setup(b) {
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
function world({ search = '', startState = null, enabled = true, sidebarOpen = false } = {}) {
  let now = 1e6, seq = 0; const q = [];
  globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; q.push({ id, at: now + ms, fn }); return id; };
  globalThis.clearTimeout = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
  Date.now = () => now;
  const advance = (ms) => { const end = now + ms; for (;;) { q.sort((a, b) => a.at - b.at || a.id - b.id); const x = q[0]; if (!x || x.at > end) break; q.shift(); now = x.at; x.fn(); } now = end; };
  const BASE = 'http://vs.test/' + search;
  const H = { entries: [{ prev: true, state: null, href: 'data:prev' }, { state: startState, href: BASE }], index: 1, pushes: 0, left: false, popsHandled: 0 };
  const pop = [];
  const w = { H, toasts: [], gestures: 0, advance, toggles: [], hides: 0, settingCbs: [], enabled };
  globalThis.__w = w;
  globalThis.window = { addEventListener: (t, fn) => { if (t === 'popstate') pop.push(fn); } };
  globalThis.location = { search, href: BASE };
  globalThis.history = {
    get state() { return H.entries[H.index].state; },
    get length() { return H.entries.length; },
    pushState(state) { H.entries.splice(H.index + 1); H.entries.push({ state, href: globalThis.location.href }); H.index++; H.pushes++; },
    go(n) { globalThis.setTimeout(() => { const to = H.index + n; if (to < 0 || to >= H.entries.length) return; H.index = to; if (H.entries[to].prev) { H.left = true; return; } globalThis.location.href = H.entries[to].href; H.popsHandled++; for (const fn of pop) fn({ state: H.entries[to].state }); }, 0); },
    back() { this.go(-1); },
  };
  const L = { popovers: [], shells: [], switchers: [], sheets: [] };
  const stat = el('dialog-overlay hidden', { id: 'dialog-overlay' });
  const backRow = el('mobile-folder-back');
  w.L = L; w.stat = stat; w.backRow = backRow;
  w.add = (kind, e) => { e.list = L[kind]; L[kind].push(e); return e; };
  globalThis.document = {
    querySelector: (s) => (s === '[data-popover]' ? L.popovers[0] : s === '.mobile-win-switcher' ? L.switchers[0] : null) || null,
    querySelectorAll: (s) => (s === '[data-popover]' ? [...L.popovers] : s === '.mobile-win-switcher' ? [...L.switchers] : s === '.dialog-overlay' ? [stat, ...L.shells] : s === '.usage-popup' ? [...L.sheets] : []),
    getElementById: (id) => (id === 'dialog-overlay' ? stat : null),
  };
  w.app = {
    settings: { get: (p) => (p === 'mobile.backGuard' ? (w.enabled ? undefined : false) : undefined), on: (p, fn) => { if (p === 'mobile.backGuard') w.settingCbs.push(fn); } },
    sidebar: { isOpen: sidebarOpen, toggle(v) { this.isOpen = v; w.toggles.push(v); }, _mobileDrilldown: null, listEl: { querySelector: (s) => (s === '.mobile-folder-back' ? backRow : null) } },
    hideDialogs() { stat.classList.add('hidden'); w.hides++; },
  };
  /** A same-document navigation to a #fragment (a link in rendered markdown): a new entry, then a popstate with state null. */
  w.fragment = (hash) => { H.entries.splice(H.index + 1); const href = BASE + hash; H.entries.push({ state: null, href }); H.index++; globalThis.location.href = href; for (const fn of pop) fn({ state: null }); advance(1); };
  /** The person's back gesture = the browser's history back. */
  w.back = () => { globalThis.history.go(-1); advance(1); };
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

// ── §4 wiring pins ──
console.log('\n§4 wiring pins');
const app = read('src/lib/app.js');
ok((app.match(/installMobileBack\(/g) || []).length === 1 && app.includes('this._mobileBack = this.isMobile ? installMobileBack(this) : null;'), 'app.js installs the guard once, only when app.isMobile (a desktop\'s back is never touched)');
const importers = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js') && /from '\.\/mobile-back\.js'/.test(read('src/lib/' + f)));
ok(importers.join() === 'app.js', 'mobile-back.js has ONE importer (app.js)', importers);
ok((wiringSrc.match(/history\.pushState\(/g) || []).length === 1 && /const push = \(\) => \{ baseHref = location\.href; history\.pushState\(\{ vs: 1 \}, ''\); \};/.test(wiringSrc) && wiringSrc.includes('history.go(1);'), 'the wiring has ONE pushState (the sentinel) and re-arms by traversal (history.go(1))');
ok(!/from '\.\/|import /.test(bgSrc.replace(/^\/\/.*$/gm, '')), 'back-guard.js imports nothing (PURE)');
const todos = read('src/lib/user-todos-panel.js');
ok(/popup\.addEventListener\(BACK_DISMISS_EVENT, \(e\) => \{ e\.preventDefault\(\); hidePopup\(\); \}\);/.test(todos) && BG.BACK_DISMISS_EVENT === 'vs-back-dismiss', 'the For-you tray answers the back\'s dismiss through hidePopup (drafts stashed, rows dropped)');
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
