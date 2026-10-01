#!/usr/bin/env node
// A MERGE THAT CHANGES NOTHING RE-DRAWS NOTHING (lane badge-stale, 2026-09-30). app.syncSessionIdentity writes every
// session window's title meta on EVERY merge — the 5 s /api/sessions poll and every `active-sessions` frame — and
// WindowManager.setTitleMeta had no no-op guard (its twin setTitle has one, "called per 5s identity sync for every
// window"): each call re-built the window's icon slots, re-rendered the WHOLE tab strip of a grouped window (every
// tab's billing chip destroyed and re-made from `_authBadge` — measured on a real page: never the same node across a
// poll) and re-notified the manager (taskbar, autosave) per window per merge.
//   §1 the REAL setTitleMeta (window.js imported under a fake DOM, the test-title-chips pattern): a changed meta ⇒
//      applied once, the strip re-drawn (grouped) or the chips re-fitted (standalone), notified once; the SAME meta
//      again ×10, a null / '' for an absent key, a fresh object with equal values ⇒ nothing at all; dropping a key ⇒ a
//      change
//   §2 CONTROL: window.js without the guard (scripts/mutant-copy.mjs) re-draws the strip on every identical call
//   §3 wiring: no caller asks setTitleMeta for an EMPTY patch to force a re-draw (desktop-app-window.js re-draws its
//      tab icon through _renderTabBar); the identity sync still writes the meta every merge (the guard lives in the
//      manager) and asks the autosave only when the openSpec it keeps actually changed
// In-process, no browser. ~0.2 s
import fs from 'node:fs';
import path from 'node:path';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// a fake DOM just wide enough for window.js's import graph (test-title-chips / test-window-minsize)
globalThis.document = {
  createElement: (tag) => (tag === 'canvas'
    ? { getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 6 }) }) }
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

/** A WindowManager instance whose DOM-touching steps are counters (the REAL setTitleMeta runs). */
const mkWm = (WindowManager) => {
  const wm = Object.create(WindowManager.prototype);
  wm.windows = new Map();
  const n = { apply: 0, render: 0, fit: 0, notify: 0 };
  wm._applyTitleMeta = () => { n.apply++; };
  wm._renderTabBar = () => { n.render++; };
  wm._fitChipsSoon = () => { n.fit++; };
  wm._notify = () => { n.notify++; };
  const chain = { tabs: ['w-host', 'w-guest'], active: 0, layout: 'tabs' };
  wm.windows.set('w-guest', { id: 'w-guest', titleMeta: {}, _tabChain: chain });
  wm.windows.set('w-solo', { id: 'w-solo', titleMeta: {}, _tabChain: null });
  return { wm, n };
};
// what app._buildTitleMeta hands it for a primary claude session (pickAgentIdentity's shape: '' / null for the unset)
const META = { backend: 'claude', agentKind: 'primary', agentRole: '', agentNickname: '', sourceKind: '', parentThreadId: null };

console.log('§1 the REAL setTitleMeta');
const { WindowManager } = await import('../src/lib/window.js');
{
  const { wm, n } = mkWm(WindowManager);
  wm.setTitleMeta('w-guest', META);
  ok(n.apply === 1 && n.render === 1 && n.notify === 1 && n.fit === 0, 'a changed meta on a GROUPED window: applied once, its strip re-drawn once, notified once', n);
  ok(JSON.stringify(wm.windows.get('w-guest').titleMeta) === JSON.stringify({ backend: 'claude', agentKind: 'primary' }), 'the stored meta drops the empty values (as before)', wm.windows.get('w-guest').titleMeta);
  for (let i = 0; i < 10; i++) wm.setTitleMeta('w-guest', { ...META });
  ok(n.apply === 1 && n.render === 1 && n.notify === 1, 'the SAME meta again ×10 (a fresh object each time — every merge builds one) ⇒ nothing: no icon rebuild, no strip, no notify', n);
  wm.setTitleMeta('w-guest', { agentRole: null, sourceKind: '' });
  ok(n.render === 1, 'a null / \'\' for a key that is absent is no change', n);
  wm.setTitleMeta('w-guest', { agentKind: 'subagent' });
  ok(n.apply === 2 && n.render === 2 && n.notify === 2 && wm.windows.get('w-guest').titleMeta.agentKind === 'subagent', 'a value that moves ⇒ one re-draw', n);
  wm.setTitleMeta('w-guest', { agentKind: null });
  ok(n.render === 3 && !('agentKind' in wm.windows.get('w-guest').titleMeta), 'dropping a key ⇒ a change', n);
  const s = mkWm(WindowManager);
  s.wm.setTitleMeta('w-solo', META); s.wm.setTitleMeta('w-solo', META);
  ok(s.n.fit === 1 && s.n.render === 0 && s.n.apply === 1 && s.n.notify === 1, 'a STANDALONE window: re-fitted once, never a strip (test-title-chips pins the fit line)', s.n);
  s.wm.setTitleMeta('w-missing', META);
  ok(s.n.apply === 1, 'an unknown window id is ignored');
}

console.log('§2 CONTROL: the unguarded setTitleMeta');
{
  const src = read('src/lib/window.js');
  const GUARD = /\n[ \t]*if \(prevKeys\.length === nextKeys\.length && nextKeys\.every\(\(k\) => prevMeta\[k\] === nextMeta\[k\]\)\) return;/;
  ok(GUARD.test(src) && src.split('prevMeta[k] === nextMeta[k]').length === 2, 'the guard is spelled once — the control removes exactly it');
  const M = mutantCopies('badge-meta', REPO);
  const { WindowManager: Pre } = await import(M.write('src/lib/window.js', src.replace(GUARD, ''), 'unguarded'));
  const { wm, n } = mkWm(Pre);
  for (let i = 0; i < 10; i++) wm.setTitleMeta('w-guest', { ...META });
  ok(n.render === 10 && n.notify === 10 && n.apply === 10, `the pre-fix manager re-draws the strip on EVERY identical call (${n.render} of 10) — every tab chip on the page, every poll`, n);
  ok(M.files.length === 1 && path.relative(REPO, M.files[0]).startsWith('..'), 'the patched copy lives outside the checkout', M.files);
}

console.log('§3 wiring');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const lib = path.join(REPO, 'src/lib');
  const files = fs.readdirSync(lib).filter((f) => f.endsWith('.js'));
  const empty = files.filter((f) => /setTitleMeta\([^,()]+,\s*\{\s*\}\s*\)/.test(strip(fs.readFileSync(path.join(lib, f), 'utf8'))));
  ok(empty.length === 0, 'no caller asks setTitleMeta for an EMPTY patch to force a re-draw (it is a no-op now)', empty);
  const daw = strip(read('src/lib/desktop-app-window.js'));
  ok(/if \(winInfo\._tabChain\) \{ app\.wm\._renderTabBar\(winInfo\._tabChain\); app\.wm\._notify\(\); \}/.test(daw), 'desktop-app-window.js re-draws its tab\'s app icon through _renderTabBar (+ the notify it had)');
  const app = strip(read('src/lib/app.js'));
  const sync = app.slice(app.indexOf('  syncSessionIdentity('), app.indexOf('  syncSessionIdentity(') + 6000);
  ok(/this\.wm\.setTitleMeta\(winId, this\._buildTitleMeta\(match\)\);/.test(sync) && /this\.wm\.setAuthBadge\?\.\(winId, match\.auth \|\| null\);/.test(sync), 'the identity sync still writes the meta and the billing chip on every merge (the guards live in the manager)');
  ok(/const specWas = JSON\.stringify\(win\._openSpec\);/.test(sync) && /if \(JSON\.stringify\(win\._openSpec\) !== specWas\) this\.layoutManager\?\.scheduleAutoSave\?\.\(\);/.test(sync), '…and asks the layout autosave only when the openSpec it keeps changed (it used to ride the per-merge notify)');
  const wj = strip(read('src/lib/window.js'));
  const body = wj.slice(wj.indexOf('  setTitleMeta(id, meta = {}) {'), wj.indexOf('  applyLayout(layout) {'));
  ok(body.indexOf('return;', body.indexOf('prevKeys.length')) < body.indexOf('win.titleMeta = nextMeta;') && body.indexOf('win.titleMeta = nextMeta;') < body.indexOf('this._renderTabBar(win._tabChain)'), 'window.js: the guard sits BEFORE the store, the apply, the strip and the notify');
}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
