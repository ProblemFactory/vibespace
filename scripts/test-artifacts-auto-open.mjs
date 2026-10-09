#!/usr/bin/env node
// THE QUIET AUTOMATIC OPEN (lane artifacts-auto-open-quiet; owner 2026-10-08 "自动打开产物时不要自动 focus 窗口，很影响使用；
// 加个配置开关"). A document the agent wrote opens beside the chat WITHOUT taking the focused window, the caret or the
// keyboard owner; the phone opens nothing; the switch (artifacts.autoOpenDocs) is in the Artifacts chip too; one toast
// per device teaches it.
//   ① PURE src/lib/artifact-auto-open.js — quietOpenVerdict's table + teachVerdict.
//   ② the REAL WindowManager.createWindow + the tab-group mixin over fake elements: a caller's `quiet:true` in every
//      placement (a split beside the source / a chain ALREADY split / a tab / a free window) — focusWindow never runs,
//      the active window and its .window-active stay, the source's pane is never hidden (not even for a frame), the new
//      tab pulses, the keyboard owner is unchanged; the same call WITHOUT quiet (a user's open) still focuses.
//   ③ the REAL chat-view _onArtifactCard / _openArtifact and app.openFile / doc-window openDoc bodies run on fakes:
//      the automatic open passes quiet, the phone and the setting off open nothing, the toast once per device and its
//      action turns the setting off; the user's own open (the card's click) never passes quiet.
//   CONTROLS (patched copies, each RED): createWindow focusing a quiet open; _onArtifactCard opening without quiet;
//   the toast without its device mark.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(REPO, 'src/lib');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, why = '') => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (why ? ' — ' + why : '')); } };
const J = (v) => JSON.stringify(v);

console.log('① PURE quietOpenVerdict / teachVerdict');
const A = await import(pathToFileURL(path.join(LIB, 'artifact-auto-open.js')).href);
{
  const rows = [
    [{ auto: true, phone: false, setting: true }, 'quiet'], [{ auto: true, phone: false }, 'quiet'],
    [{ auto: true, phone: true, setting: true }, 'skip'], [{ auto: true, phone: false, setting: false }, 'skip'], [{ auto: true, phone: true, setting: false }, 'skip'],
    [{ auto: false, phone: false, setting: true }, 'focus'], [{ auto: false, phone: true, setting: false }, 'focus'], [{}, 'focus'],
  ];
  for (const [inp, want] of rows) ok(A.quietOpenVerdict(inp) === want, `quietOpenVerdict(${J(inp)}) = ${want}`, A.quietOpenVerdict(inp));
  ok(A.teachVerdict({ verdict: 'quiet', taught: false }) === true && A.teachVerdict({ verdict: 'quiet', taught: true }) === false && A.teachVerdict({ verdict: 'skip', taught: false }) === false && A.teachVerdict({ verdict: 'focus', taught: false }) === false, 'teachVerdict: the first QUIET open on a device only');
  ok(A.TAUGHT_KEY === 'vs-auto-open-taught', 'the device mark is localStorage vs-auto-open-taught');
  ok(!/^\s*import\b/m.test(read('src/lib/artifact-auto-open.js')), 'artifact-auto-open.js imports nothing (PURE)');
}

console.log('② the REAL createWindow with a caller\'s quiet (fake elements)');
globalThis.requestAnimationFrame ||= (fn) => setTimeout(fn, 0);
const cls = () => { const s = new Set(), adds = []; return { s, adds, contains: (n) => s.has(n), add: (...n) => n.forEach((x) => { s.add(x); adds.push(x); }), remove: (...n) => n.forEach((x) => s.delete(x)), toggle: (n, on) => { const v = on === undefined ? !s.has(n) : !!on; if (v) { s.add(n); adds.push(n); } else s.delete(n); return v; } }; };
function fakeEl(tag = 'div') {
  const q = new Map();
  return { tagName: tag.toUpperCase(), style: { cssText: '', setProperty() { } }, dataset: {}, classList: cls(), children: [], attrs: {}, textContent: '', title: '',
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, prepend(...c) { this.children.unshift(...c); }, insertBefore(c) { this.children.push(c); return c; }, remove() { }, removeChild() { },
    addEventListener() { }, removeEventListener() { }, querySelector(sel) { if (!q.has(sel)) q.set(sel, fakeEl()); return q.get(sel); }, querySelectorAll: () => [], closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }), offsetWidth: 800, offsetHeight: 600, offsetLeft: 0, offsetTop: 0, innerHTML: '' };
}
globalThis.document ||= { addEventListener() { }, removeEventListener() { }, createElement: (tag) => fakeEl(tag), body: fakeEl('body'), documentElement: fakeEl('html'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible' };
globalThis.window ||= { addEventListener() { }, removeEventListener() { }, matchMedia: () => ({ matches: false, addEventListener() { } }), localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1571, innerHeight: 854 };
globalThis.localStorage ||= globalThis.window.localStorage; globalThis.getComputedStyle ||= globalThis.window.getComputedStyle;
const { installTabGroupMixin } = await import(pathToFileURL(path.join(LIB, 'tab-group.js')).href);
const { displayedPanes } = await import(pathToFileURL(path.join(LIB, 'chain-layout.js')).href);
const KO = await import(pathToFileURL(path.join(LIB, 'keyboard-owner.js')).href);
/** window.js as a module — the real file, or a PATCHED COPY (a data: module whose relative imports are absolute file URLs) */
async function loadWM(patch = null) {
  if (!patch) return (await import(pathToFileURL(path.join(LIB, 'window.js')).href)).WindowManager;
  let src = read('src/lib/window.js').replace(/from '\.\/([^']+)'/g, (_, f) => `from '${pathToFileURL(path.join(LIB, f)).href}'`).replace(/from '\.\.\/([^']+)'/g, (_, f) => `from '${pathToFileURL(path.join(REPO, 'src', f)).href}'`);
  const before = src; src = patch(src);
  if (src === before) throw new Error('the patch matched nothing');
  return (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).WindowManager;
}
function scene(WM) {
  const wm = Object.create(WM.prototype);
  Object.assign(wm, { windows: new Map(), zIndex: 100, windowCounter: 0, activeWindowId: null, workspace: fakeEl(), _settings: { get: () => undefined }, _hideMq: { matches: false } });
  installTabGroupMixin(wm);
  const calls = { focus: [], sync: 0, sidebar: 0 };
  for (const k of ['_notify', '_scheduleOverlapUpdate', '_renderTabBar', '_setupDrag', '_setupResize', '_setupIconDrag', '_applyTitleMeta', '_resizePanes', '_setupSplitDivider', '_withdrawMergeToast', '_noteChainAct', '_fitChipsSoon', '_markStrip', '_captureGridBounds']) wm[k] = () => { };
  wm._defaultPlacement = (w, h) => ({ left: 10, top: 10, width: w, height: h });
  wm._mobileYieldSidebar = () => { calls.sidebar++; };
  wm.syncHiddenViews = () => { calls.sync++; };
  const realFocus = wm.focusWindow;
  wm.focusWindow = function (id, o) { calls.focus.push(id); return realFocus.call(this, id, o); };
  wm._app = { stage: null, layoutManager: null };
  const mk = (id, type = 'chat') => {
    const w = { id, type, element: fakeEl(), content: fakeEl(), titleBar: fakeEl(), titleSpan: fakeEl(), title: id, gridBounds: { left: 0, top: 0, width: 0.5, height: 1 }, _listenerCtl: new AbortController() };
    w.element.style.zIndex = String(wm.zIndex++); wm.windows.set(id, w); return w;
  };
  return { wm, calls, mk };
}
const hidden = (w) => w.content.classList.adds.includes('tab-hidden');
async function quietLegs(WM, { say = ok } = {}) {
  const r = {};
  { // (a) a split beside the source: the chat is free and ACTIVE (the composer holds the caret)
    const { wm, calls, mk } = scene(WM);
    const chat = mk('chat'); wm.focusWindow('chat'); calls.focus.length = 0; calls.sidebar = 0;
    const ko = KO.keyboardOwner();
    const doc = wm.createWindow({ title: 'BRIEF.md', type: 'doc', intoChain: { hostId: 'chat', split: true, side: 'right' }, quiet: true });
    const ch = chat._tabChain;
    r.a = calls.focus.length === 0 && wm.activeWindowId === 'chat';
    say(calls.focus.length === 0, '(a) split: focusWindow never runs for a quiet open', J(calls.focus));
    say(wm.activeWindowId === 'chat' && chat.element.classList.contains('window-active'), '(a) the chat stays THE active window and keeps .window-active', J({ active: wm.activeWindowId }));
    say(!!ch && ch.layout === 'split' && displayedPanes(ch).includes('chat') && displayedPanes(ch).includes(doc.id) && ch.tabs[ch.active] === 'chat', '(a) the doc is SHOWN beside the chat (a split of the two), the chat\'s pane is the chain\'s active one', J(ch && { layout: ch.layout, shown: displayedPanes(ch), active: ch.tabs[ch.active] }));
    say(!hidden(chat), '(a) the chat\'s pane was never hidden on the way (no frame where the composer is display:none — the browser would blur it)', J(chat.content.classList.adds));
    say(!!ch && ch._pulseTab && ch._pulseTab.id === doc.id, '(a) the doc\'s tab pulses once (MULTIVIEW D5 (a)\'s mark — never a toast per doc)', J(ch && ch._pulseTab));
    say(KO.keyboardOwner() === ko && calls.sidebar === 0, '(a) the keyboard owner is unchanged and the sidebar is not yanked', J({ sidebar: calls.sidebar }));
  }
  { // (b) the focus is ELSEWHERE (a terminal the user types into) — the chat on screen beside it
    const { wm, calls, mk } = scene(WM);
    mk('chat'); mk('term', 'terminal'); wm.focusWindow('term'); calls.focus.length = 0;
    wm.createWindow({ title: 'BRIEF.md', type: 'doc', intoChain: { hostId: 'chat', split: true, side: 'right' }, quiet: true });
    r.b = wm.activeWindowId === 'term';
    say(calls.focus.length === 0 && wm.activeWindowId === 'term' && wm.windows.get('term').element.classList.contains('window-active') && !wm.windows.get('chat').element.classList.contains('window-active'), '(b) the terminal the user types into stays the active window (not even the chat takes it)', J({ active: wm.activeWindowId, focus: calls.focus }));
  }
  { // (c) the chat is ALREADY in a split with a terminal (the caret may be in either pane)
    const { wm, calls, mk } = scene(WM);
    const chat = mk('chat'), term = mk('term', 'terminal');
    wm.bindSplit(chat, term, { side: 'right', focus: 'guest' }); wm.focusWindow('term'); calls.focus.length = 0;
    const pair0 = [...chat._tabChain.split.pair];
    chat.content.classList.adds.length = 0; term.content.classList.adds.length = 0;
    const doc = wm.createWindow({ title: 'BRIEF.md', type: 'doc', intoChain: { hostId: 'chat', split: true, side: 'right' }, quiet: true });
    const ch = chat._tabChain;
    r.c = calls.focus.length === 0 && wm.activeWindowId === 'term';
    say(calls.focus.length === 0 && wm.activeWindowId === 'term' && J(ch.split.pair) === J(pair0) && !displayedPanes(ch).includes(doc.id), '(c) a chain already split: the two shown panes stay (showing the doc would hide the pane that may hold the caret) — the doc arrives as a quiet tab', J({ pair: ch.split.pair, shown: displayedPanes(ch), active: wm.activeWindowId }));
    say(ch.tabs.includes(doc.id) && ch._pulseTab && ch._pulseTab.id === doc.id && !hidden(chat) && !hidden(term), '(c) …it is in the strip and pulses; neither shown pane was hidden', J({ tabs: ch.tabs, pulse: ch._pulseTab }));
  }
  { // (d) window.openLinkPlacement = tab: a tab after the chat, the chat stays the shown tab
    const { wm, calls, mk } = scene(WM);
    const chat = mk('chat'); wm.focusWindow('chat'); calls.focus.length = 0;
    const doc = wm.createWindow({ title: 'BRIEF.md', type: 'doc', intoChain: { hostId: 'chat', split: false, side: 'right' }, quiet: true });
    const ch = chat._tabChain;
    r.d = calls.focus.length === 0 && !!ch && ch.tabs[ch.active] === 'chat';
    say(calls.focus.length === 0 && wm.activeWindowId === 'chat' && !!ch && ch.tabs[ch.active] === 'chat' && !hidden(chat) && hidden(doc) && ch._pulseTab?.id === doc.id, '(d) tab placement: the doc joins as a pulsing tab, the chat stays the shown + active tab (never hidden)', J(ch && { active: ch.tabs[ch.active], adds: chat.content.classList.adds, pulse: ch._pulseTab }));
  }
  { // (e) a free window (placement 'window' / no source on screen)
    const { wm, calls, mk } = scene(WM);
    mk('chat'); wm.focusWindow('chat'); calls.focus.length = 0;
    const doc = wm.createWindow({ title: 'BRIEF.md', type: 'doc', quiet: true });
    r.e = calls.focus.length === 0 && wm.activeWindowId === 'chat';
    say(calls.focus.length === 0 && wm.activeWindowId === 'chat' && !doc.element.classList.contains('window-active') && wm.windows.has(doc.id), '(e) a free window: created (the taskbar lists it) but never focused', J({ active: wm.activeWindowId, focus: calls.focus }));
  }
  return r;
}
const WMreal = await loadWM();
await quietLegs(WMreal);
{ // the USER's own open (no quiet) still focuses — the legs above are not vacuous
  const { wm, calls, mk } = scene(WMreal);
  mk('chat'); wm.focusWindow('chat'); calls.focus.length = 0;
  const doc = wm.createWindow({ title: 'BRIEF.md', type: 'doc', intoChain: { hostId: 'chat', split: true, side: 'right' } });
  ok(calls.focus.includes(doc.id) && wm.activeWindowId === doc.id, 'the user\'s OWN open (no quiet) focuses the new window as before', J({ focus: calls.focus, active: wm.activeWindowId }));
  const { wm: wm2, calls: c2, mk: mk2 } = scene(WMreal);
  const chat2 = mk2('chat'); wm2.focusWindow('chat'); c2.focus.length = 0; c2.sidebar = 0;
  const free = wm2.createWindow({ title: 'x', type: 'doc' });
  ok(c2.focus.includes(free.id) && c2.sidebar >= 1 && !chat2._tabChain, 'a user\'s free open focuses + yields the phone sidebar as before', J(c2));
}
{
  const WMbad = await loadWM((s) => s.replace("    if (asked) { if (this.activeWindowId !== prevActive) { this.activeWindowId = prevActive; this.syncHiddenViews(); } }\n    else if (!quiet) this.focusWindow(id);", '    if (!quiet) this.focusWindow(id);'));
  const r = await quietLegs(WMbad, { say: () => { } });
  ok(!r.a && !r.b && !r.d && !r.e, 'CONTROL createWindow that focuses a quiet open ⇒ the (a) (b) (d) (e) legs are RED', J(r));
}

console.log('③ the callers: chat-view _onArtifactCard / _openArtifact, app.openFile, openDoc (real bodies on fakes)');
const CV = read('src/lib/chat-view.js'), AP = read('src/lib/app.js'), DW = read('src/lib/doc-window.js');
const method = (src, head) => { const i = src.indexOf('\n  ' + head); if (i < 0) throw new Error('no ' + head); const b = src.indexOf('{\n', i) + 2; const j = src.indexOf('\n  }\n', b); return src.slice(b, j); };
const argsOf = (src, head) => { const i = src.indexOf('\n  ' + head); const s = src.indexOf('(', i) + 1; let d = 1, k = s; for (; d; k++) { if (src[k] === '(') d++; else if (src[k] === ')') d--; } return src.slice(s, k - 1); };
function cardRig(body, { phone = false, setting = true, store = new Map() } = {}) {
  const opened = [], toasts = [], sets = [];
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const fn = new Function('quietOpenVerdict', 'teachVerdict', 'TAUGHT_KEY', 'showToast', 't', 'localStorage', 'window', 'document', 'msg', 'live', body);
  const self = { _refreshArtifacts() { }, _loadingHistory: false, _suspended: false, _openArtifact: (b, o) => opened.push({ b, o: o || null }),
    app: { isMobile: phone, settings: { get: (k) => (k === 'artifacts.autoOpenDocs' ? setting : undefined), set: (k, v) => sets.push([k, v]) } } };
  const run = () => fn.call(self, A.quietOpenVerdict, A.teachVerdict, A.TAUGHT_KEY, (m, o) => toasts.push({ m, o }), (s) => s, ls, { innerWidth: phone ? 390 : 1400 }, { visibilityState: 'visible' }, { content: [{ kind: 'doc', path: '/w/docs/BRIEF.md', autoOpen: true }] }, true);
  return { run, opened, toasts, sets, store };
}
{
  const body = method(CV, '_onArtifactCard(msg, live) {');
  const g = cardRig(body);
  g.run(); g.run();
  ok(g.opened.length === 2 && g.opened.every((x) => x.o && x.o.quiet === true), 'a doc\'s live birth opens it with { quiet: true } (desktop, setting on)', J(g.opened.map((x) => x.o)));
  ok(g.toasts.length === 1 && g.toasts[0].m === 'A document the agent wrote opened beside the chat' && g.store.get('vs-auto-open-taught') === '1', 'the toast shows ONCE per device (the second auto-open says nothing; vs-auto-open-taught marks it)', J(g.toasts.map((x) => x.m)));
  const act = g.toasts[0]?.o?.actions?.[0];
  ok(act && act.label === 'Turn off', 'the toast\'s one action is "Turn off"', J(act && act.label));
  act?.run();
  ok(J(g.sets) === J([['artifacts.autoOpenDocs', false]]), '"Turn off" writes artifacts.autoOpenDocs = false (the synced setting)', J(g.sets));
  const p = cardRig(body, { phone: true }); p.run();
  ok(p.opened.length === 0 && p.toasts.length === 0, 'the phone (≤768 px) opens nothing — the card + the chip only — and teaches nothing', J(p));
  const off = cardRig(body, { setting: false }); off.run();
  ok(off.opened.length === 0 && off.toasts.length === 0, 'the setting off opens nothing', J(off));
  const again = cardRig(body, { store: new Map([['vs-auto-open-taught', '1']]) }); again.run();
  ok(again.opened.length === 1 && again.toasts.length === 0, 'a device already taught: the open, no toast', J(again.toasts));
  const bad = cardRig(body.replace('this._openArtifact(b, { quiet: true });', 'this._openArtifact(b);')); bad.run();
  ok(!(bad.opened[0]?.o?.quiet === true), 'CONTROL _onArtifactCard opening without quiet ⇒ the quiet leg is RED');
  const bad2 = cardRig(body.replace("try { localStorage.setItem(TAUGHT_KEY, '1'); } catch { }", '')); bad2.run(); bad2.run();
  ok(bad2.toasts.length === 2, 'CONTROL the toast without its device mark ⇒ the once leg is RED (2 toasts)');
}
{
  const body = method(CV, '_openArtifact(b, { quiet = false } = {}) {');
  const fn = new Function('b', '{ quiet = false } = {}', 'serviceOpenSpec', 'serviceHref', 'window', 'location', body);
  const calls = []; const self = { winInfo: { id: 'chat' }, app: { openFile: (...a) => calls.push(a) } };
  fn.call(self, { kind: 'doc', path: '/w/docs/BRIEF.md', name: 'BRIEF.md' }, { quiet: true });
  fn.call(self, { kind: 'doc', path: '/w/docs/NOTES.md', name: 'NOTES.md' });
  ok(calls[0]?.[2]?.quiet === true && calls[0]?.[2]?.from === 'chat', '_openArtifact(b, {quiet}) hands quiet to app.openFile with the chat as `from`', J(calls[0]));
  ok(calls[1] && !('quiet' in calls[1][2]), 'the card\'s click (no quiet) opens exactly as before — no quiet key', J(calls[1]));
  const callers = [...CV.matchAll(/_openArtifact\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => a !== 'b, { quiet = false } = {}');
  ok(callers.filter((a) => /quiet/.test(a)).length === 1 && J(callers.filter((a) => /quiet/.test(a))) === J(['b, { quiet: true }']), '_onArtifactCard is the ONLY quiet caller in chat-view', J(callers));
  // every line of the client that asks an open door for quiet (a pass-through `x.quiet ? { quiet: true }` is the door's own)
  const libQuiet = fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).flatMap((f) => fs.readFileSync(path.join(LIB, f), 'utf8').split('\n').filter((l) => /quiet: true/.test(l) && /openFile|openDoc|_openArtifact|createWindow/.test(l) && !/\bquiet \? \{ quiet: true \}/.test(l)).map((l) => f + ': ' + l.trim().slice(0, 60)));
  ok(libQuiet.length === 1 && libQuiet[0].startsWith('chat-view.js: this._openArtifact(b, { quiet: true });'), 'no other client line opens a file quietly (a user\'s open always focuses)', J(libQuiet));
}
{
  const body = method(AP, 'openFile(filePath, fileName, opts = {}) {');
  const fn = new Function('filePath', 'fileName', 'opts', 'FileViewer', body);
  const seen = []; const FV = { open: (...a) => seen.push(['fv', a[3]]) };
  const self = { sessions: new Map([['chat', { sessionId: 's1' }]]), linkPlacement: (id) => ({ hostId: id, split: true, side: 'right' }), _focusOpenInChain: (from, o) => { seen.push(['dedupe', o.quiet]); return false; }, openDoc: (o) => seen.push(['doc', o.quiet === true, o.intoChain && o.intoChain.hostId]) };
  fn.call(self, '/w/docs/BRIEF.md', 'BRIEF.md', { from: 'chat', quiet: true }, FV);
  fn.call(self, '/w/docs/data.csv', 'data.csv', { from: 'chat', quiet: true }, FV);
  fn.call(self, '/w/docs/NOTES.md', 'NOTES.md', { from: 'chat' }, FV);
  ok(J(seen.slice(0, 2)) === J([['dedupe', true], ['doc', true, 'chat']]), 'openFile(.md, {quiet}) → openDoc({quiet:true}) beside the chat; the in-chain dedupe hears quiet too', J(seen));
  ok(seen[2]?.[0] === 'dedupe' && seen[2][1] === true && seen[3]?.[0] === 'fv' && seen[3][1].quiet === true && seen[3][1].intoChain?.hostId === 'chat', 'a non-markdown doc rides FileViewer.open with quiet + the placement', J(seen.slice(2, 4)));
  ok(J(seen.slice(4)) === J([['dedupe', false], ['doc', false, 'chat']]), 'the user\'s open of a .md: no quiet anywhere', J(seen.slice(4)));
  const fc = method(AP, '_focusOpenInChain(fromId, { path: p, host, line, dir = false, quiet = false } = {}) {');
  ok(/if \(quiet\) return true;[^\n]*\n\s*this\.wm\.revealWindow\(id\);/.test(fc), 'a file already in the chat\'s chain: a quiet open moves nothing (no revealWindow)');
  const fv = read('src/lib/file-viewer.js');
  ok((fv.match(/intoChain: opts\.intoChain, quiet: !!opts\.quiet \}\)/g) || []).length === 4 && /type: 'editor', syncId: opts\.syncId, openSpec, intoChain: opts\.intoChain, quiet: !!opts\.quiet \}\);/.test(AP), 'FileViewer.open\'s four createWindow calls and openEditor pass quiet');
  ok(/if \(!quiet\) app\.wm\.revealWindow\(w\.id, \{ replay: !!syncId \}\);/.test(DW) && /type: 'doc', syncId, openSpec, intoChain, quiet, width: 900/.test(DW) && /export function openDoc\(app, \{ host = '', path = '', from = '', syncId, intoChain, quiet = false \} = \{\}\)/.test(DW), 'openDoc: a quiet open of a doc already open reveals nothing; a new one is created quiet');
}

console.log('④ the switch: Settings → Chat words + the chip\'s row');
{
  const S = (await import(pathToFileURL(path.join(LIB, 'settings-schema.js')).href));
  const schema = S.SETTINGS_SCHEMA || S.default || S.schema || Object.values(S).find((v) => v && typeof v === 'object' && v['artifacts.autoOpenDocs']);
  const row = schema && schema['artifacts.autoOpenDocs'];
  ok(!!row && row.default === true && row.type === 'boolean', 'artifacts.autoOpenDocs: key and default (true) unchanged', J(row && { d: row.default, t: row.type }));
  ok(!!row && row.label === 'Open a new document beside the chat automatically' && /without taking the keyboard/.test(row.description) && /Artifacts chip/.test(row.description), 'the label says "automatically"; the description says it never takes the keyboard and where the second switch is', J(row && row.label));
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  for (const k of ['Open a new document beside the chat automatically', 'Open new documents automatically', 'A document the agent wrote opened beside the chat', 'Turn off', row?.description || '?']) ok(zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'), `zh + ja carry "${k.slice(0, 60)}"`);
  ok(!zh.includes('"Open new documents beside the chat":') && !ja.includes('"Open new documents beside the chat":'), 'the retired label is gone from zh + ja');
  const AC = read('src/lib/artifact-card.js');
  ok(/app\.settings\.set\('artifacts\.autoOpenDocs', cb\.checked\)/.test(AC) && /t\('Open new documents automatically'\)/.test(AC) && /app\.settings\.get\('artifacts\.autoOpenDocs'\) \?\? true\) !== false/.test(AC), 'the chip popover\'s checkbox row reads and writes the SAME setting (re-read on every draw)');
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASSED'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
