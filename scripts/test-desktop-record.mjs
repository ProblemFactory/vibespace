#!/usr/bin/env node
// A DESKTOP'S RECORD IS A VIEW; A WRITE MERGES — the fast gate of inc-mun7qjmw-iksh (userW, 2026-09-29, 2.369.196;
// present on 2.369.198): a page builds a desktop's windows only the first time it is switched to. A title-bar drop onto
// the preview of a desktop NOT opened since the page loaded rebuilt that desktop's cached record from the windows the
// page had built there (the moved one — `cached.windows = wins`), the switch read that cache, and the next autosave
// sent [the moved window]: the server replaced the desktop's record — HR 3 → 1, recoverable only through the layout
// rollback points. The same wipe through the menu, command mode d/D and resume placement (no gesture at all).
// No DOM, no ports — the real DesktopManager + LayoutManager over a fake app:
//   §1 PURE mergeDesktopRecord — the record kept, the page's capture in its place, adds appended, removes dropped,
//      order kept, inputs never mutated; userW's shape (HR 3 + the moved window = 4, Fin 1 → 0)
//   §2 PURE shrinkVerdict (the server belt) — a sync losing ≥ 2 windows nothing explains is refused; a close / move /
//      replace / an unbuildable window in the evidence, or the window's session gone, explains it; a replace of 3 by
//      3 others loses 3; a bulk close with its closes passes; verify r1: ONE unexplained drop of a window ANOTHER
//      client added lately (`recent`) is refused, named in `arrived`
//   §3 PURE desktopChanges (the rollback point's "Then: HR 3 → 1")
//   §4 THE DOORS on the real classes: the drop (moveWindowToDesktop) onto an UNVISITED desktop keeps its 3 windows in
//      the held record + adds the moved one, the source drops it; the preview draws 4; the next autosave SENDS the
//      target's held record (4) and the source's (0) — never a list derived from the page — with the move as
//      evidence; the switch then builds all 4; the visited-first control; the menu door; resume placement
//      `replaces` its old never-opened entry; a close leaves every record (evidence 'closed'); a window the page tried
//      to build and could not leaves only after the grace (evidence 'unbuilt'), one with no openSpec at once; a
//      REFUSED record reconciles (the view = the server's record + what the page built, re-sent); a remote record for
//      the desktop on show becomes the base minus a held close; verify r1 (D4/D2): a record landing under a gate (the
//      pointer, `_restoring`) is DEFERRED per desktop and applied when it opens — never dropped; a REMOTE MOVE is
//      applied as a move (the target's record lists a window this page holds elsewhere ⇒ retagged, shown / hidden,
//      never closed); a RECONNECT re-reads /api/layouts (the desktop on show follows it, closing only what the wire
//      listed; the others cached); verify r2: THE HELD MOVE — a record deferred under a drag that ends as a drop on
//      another desktop's preview cannot know the move: the window stays where the user dropped it and the move is
//      re-sent as the user's own act (r1's move-in put it back and the apply's dirty clear swallowed the save); the
//      settle-at-once rule keys on the SESSION (a fork's parent is replayed); a record of the desktop on show leaves a
//      hidden desktop's tab group alone; a remote delete's windows follow the record that lists them (never desktop
//      #1), the deleted desktop leaves no ghost, the page on it never writes it; a record still deferred when the
//      re-read lands is ordered by receipt; a failed re-read is retried; the drain's seq order and the cached sweep's
//      adopt have legs of their own
//   §5 THE RAW-WRITER CENSUS over desktop-manager.js / layout.js / session-lifecycle.js / stage-manager.js: one
//      `_savedStates.set(` (inside _setRecord), no `.windows =` / `.windows.push(…)`, and every `_setRecord(` call
//      hands it a mergeDesktopRecord / recordFor result or a record named here with its why — a new raw writer is
//      RED by name
//   §6 WIRING — the doors (drop, menu, command mode, resume placement + its `replaces`), the server belt in
//      ws-handler (before the write, the record handed back), the client's refusal route, the rollback change field
//   §7 NEGATIVE CONTROLS (scripts/mutant-copy.mjs): a merge that REPLACES, the pre-fix _updateCachedDesktop, an
//      autosave that never sends a changed desktop it does not show, a new raw writer, a belt blind to evidence, a
//      belt blind to arrivals, the one-slot defer, a remote move applied as a close, a reconnect that re-reads
//      nothing, a delete that sends nothing, a rearmSave that does nothing, a switch broadcast without evidence, and
//      verify r2's: a move with no witness, the settle rule keyed on the conversation, the chain loop without its
//      desktop guard, a delete's windows to desktop #1, a re-read that keeps a stale deferred record, a re-read that
//      never retries, a drain in insertion order, a cached sweep that closes, a re-read closing what the wire never
//      listed, a re-read in the server's order — each turns its own legs RED; verify r3: the geometry witness stamped by
//      a press that dragged nothing (the §6 pin's control; the real click is test-desktop-move N)
//      verify r3 ②: the re-read's horizon at its answer, a queued save stamped as sent (legs w/x)
//      verify r3 ③: a close in the cooldown refused as the apply's, a save under a gate dropped (legs y/z)
//      verify r3 ④: a save from the stale base after a failed re-read, the failure told to the console only (leg st)
//      verify r3 revert table: r2 ④'s unknown-desktop guards in _setRecord / noteWire (leg orph — an orphan record on the re-read)
//      verify r4 ①: THE UNSAVED ACT — a record received after a drop / a drag but before its save left reverted it (legs ua/ub/uc)
//      verify r4 ②: adoptRemoteMove told `to === from` searched the held records and moved a listed window out (leg ue)
//      verify r4 ③: the keyboard / button geometry doors (maximize, minimize, restore, snap, move mode) stamped no witness — the §6 doors pin; the real doors are test-desktop-move O
//      verify r4 ④: a stale hold outliving the 60 s expiry — the page follows the server and says how many changes were not kept (leg st2)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
const MODEL = 'src/lib/desktop-record.js';

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };

// a fake DOM just wide enough for the client modules' imports, showToast (its history lands in localStorage) and the
// desktop previews (#desktop-previews, counted rect by rect)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const mkEl = () => {
  const el = { style: {}, dataset: {}, children: [], className: '', textContent: '', title: '', classList: { add(c) { el.className += ' ' + c; }, remove() {}, toggle() {}, contains: () => false }, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); return c; }, remove() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.children.length = 0; } });
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] });
  return el;
};
let previews = null; // the container the switcher renders into (per world)
globalThis.document = { createElement: mkEl, getElementById: (id) => (id === 'desktop-previews' ? previews : null), querySelector: () => null, querySelectorAll: () => [], body: mkEl(), documentElement: { style: { getPropertyValue: () => '', getPropertyPriority: () => '', setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} };
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const toasts = () => { try { return JSON.parse(store.get('vibespace.toastHistory') || '[]').map((h) => h.m); } catch { return []; } };
const clearToasts = () => store.delete('vibespace.toastHistory');

const GB = (l, t) => ({ left: l, top: t, width: 0.45, height: 0.45 });
const R = (id, o = {}) => ({ winId: id, title: id, type: 'files', isMinimized: false, isMaximized: false, gridBounds: GB(0, 0), zIndex: 10, openSpec: { action: 'openFileExplorer', path: '/x/' + id }, explorerPath: '/x/' + id, ...o });
const ids = (rec) => ((rec && rec.windows) || rec || []).map((w) => w.winId || w.id);

// ── §1–§3 PURE ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The PURE legs over one copy of the model — the controls re-run them on a patched copy. */
function pureLegs(P, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const { mergeDesktopRecord: merge, shrinkVerdict, desktopChanges } = P;
  const HR = { windows: [R('hr-1'), R('hr-2', { gridBounds: GB(0.5, 0) }), R('hr-3', { gridBounds: GB(0, 0.5) })], grid: { rows: 2, cols: 2 }, theme: 'dark' };
  const before = J(HR);
  const m0 = merge({ record: HR, built: [] });
  leg(J(ids(m0)) === J(['hr-1', 'hr-2', 'hr-3']) && m0.grid.rows === 2 && m0.theme === 'dark', '§1 a desktop the page has not built (nothing built there): the record comes back whole, every other field carried', J(m0));
  const fin1 = R('fin-1', { gridBounds: GB(0.2, 0.2) });
  const m1 = merge({ record: HR, add: [fin1] });
  leg(J(ids(m1)) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']), '§1 userW\'s drop: HR 3 + the moved window = 4, the record\'s order kept, the move appended — never [the moved one] alone', J(ids(m1)));
  leg(J(HR) === before && m1 !== HR && m1.windows !== HR.windows, '§1 the inputs are never mutated (a new record, a new list)');
  const hr2page = R('hr-2', { gridBounds: GB(0.6, 0.1), title: 'moved by the page' });
  const m2 = merge({ record: HR, built: [hr2page, R('new-1')] });
  leg(J(ids(m2)) === J(['hr-1', 'hr-2', 'hr-3', 'new-1']) && m2.windows[1] === hr2page, '§1 a window present in both takes the page\'s capture WHOLE, in the record\'s place; one only the page has is appended', J(m2.windows.map((w) => [w.winId, w.gridBounds.left])));
  const chained = { windows: [R('a', { tabChain: { tabs: ['a', 'b'], active: 0 } })] };
  leg(!('tabChain' in merge({ record: chained, built: [R('a')] }).windows[0]), '§1 …whole: a field the capture lacks (a chain the window left) is gone, never kept from the record');
  const m3 = merge({ record: { windows: [R('fin-1'), R('fin-2')] }, remove: ['fin-1'] });
  leg(J(ids(m3)) === J(['fin-2']), '§1 a move\'s SOURCE: the moved window dropped, nothing else touched', J(ids(m3)));
  leg(J(ids(merge({ record: HR, add: [R('hr-2')], remove: ['hr-2'] }))) === J(['hr-1', 'hr-3']), '§1 a remove wins over an add of the same id (a replaced entry never comes back)');
  const m4 = merge({ record: { windows: [R('x'), { title: 'no id' }, R('x', { title: 'dup' }), { id: 'legacy', title: 'L' }] }, built: [{ id: 'legacy', title: 'page' }] });
  leg(J(m4.windows.map((w) => w.title)) === J(['x', 'no id', 'page']), '§1 a duplicate id keeps its first entry; an entry with no id is kept as it is; `id` and `winId` are one key', J(m4.windows));
  leg(J(ids(merge({ record: null, built: [R('b1')], add: [R('a1')] }))) === J(['b1', 'a1']) && J(merge({}).windows) === '[]', '§1 no record ⇒ the page\'s windows then the adds; nothing at all ⇒ an empty list');
  leg(J(ids(merge({ record: HR, remove: [{ winId: 'hr-1' }] }))) === J(['hr-2', 'hr-3']), '§1 remove takes entries as well as ids');

  // §2 the server belt
  const prev = HR.windows;
  const v1 = shrinkVerdict({ prev, next: [fin1] });
  leg(v1.ok === false && v1.reason === 'shrink-without-close' && J(v1.unexplained) === J(['hr-1', 'hr-2', 'hr-3']), '§2 userW\'s write (HR 3 → [the moved window]) is REFUSED — shrink-without-close, the three named', J(v1));
  leg(shrinkVerdict({ prev, next: [], evidence: [{ id: 'hr-1', why: 'closed' }, { id: 'hr-2', why: 'closed' }, { id: 'hr-3', why: 'closed' }] }).ok === true, '§2 a legitimate bulk close (the user closed 3 windows) carries a close for each and PASSES');
  leg(shrinkVerdict({ prev, next: [R('hr-3')], evidence: ['hr-1'] }).ok === true && shrinkVerdict({ prev, next: [R('hr-3')] }).ok === false, '§2 one window lost with nothing to explain it passes (below 2); two do not; evidence may be bare ids');
  leg(shrinkVerdict({ prev, next: [], evidence: [{ id: 'hr-1', why: 'moved' }, { id: 'hr-2', why: 'replaced' }, { id: 'hr-3', why: 'unbuilt' }] }).ok === true, '§2 a move, a replace, a window the page could not build — each is evidence');
  const chats = [R('c1', { type: 'chat', serverSessionId: 's1' }), R('c2', { type: 'terminal', serverSessionId: 's2' }), R('c3', { type: 'chat' })];
  leg(shrinkVerdict({ prev: chats, next: [], alive: () => false }).ok === true && J(shrinkVerdict({ prev: chats, next: [], alive: () => false }).unexplained) === J(['c3']), '§2 a session window whose session is GONE (killed / exited) leaves explained; a read-only view with no session is not', J(shrinkVerdict({ prev: chats, next: [], alive: () => false })));
  leg(shrinkVerdict({ prev: chats, next: [], alive: () => true }).ok === false, '§2 …the same windows with their sessions ALIVE ⇒ refused');
  leg(shrinkVerdict({ prev, next: [R('n1'), R('n2'), R('n3')] }).ok === false, '§2 the count is of windows LOST, not the net size: 3 replaced by 3 others loses 3');
  leg(shrinkVerdict({ prev, next: [...prev, fin1] }).ok === true && shrinkVerdict({ prev: [], next: [] }).ok === true, '§2 growth and an empty record pass');
  const vr = shrinkVerdict({ prev, next: [R('hr-2'), R('hr-3')], recent: ['hr-1'] });
  leg(vr.ok === false && vr.reason === 'shrink-without-close' && J(vr.arrived) === J(['hr-1']), '§2 ONE unexplained drop of a window ANOTHER client added lately (`recent`) is refused and named in `arrived` (verify r1: the moved window, dropped by a client writing from a base older than its arrival)', J(vr));
  leg(shrinkVerdict({ prev, next: [R('hr-2'), R('hr-3')], recent: ['hr-1'], evidence: ['hr-1'] }).ok === true && shrinkVerdict({ prev, next: [R('hr-2'), R('hr-3')], recent: new Set(['hr-9']) }).ok === true && J(shrinkVerdict({ prev, next: [R('hr-2'), R('hr-3')], recent: new Set(['hr-9']) }).arrived) === '[]', '§2 …with evidence it leaves; a recent id not among the dropped changes nothing (a Set is accepted too)');

  // §3 the rollback point's change
  const L = (map) => ({ desktopMeta: Object.keys(map).map((id) => ({ id, name: id.toUpperCase() })), desktops: Object.fromEntries(Object.entries(map).map(([d, w]) => [d, { autoSave: { windows: w.map((i) => R(i)) } }])) });
  const c1 = desktopChanges(L({ hr: ['hr-1', 'hr-2', 'hr-3'], fin: ['fin-1'] }), L({ hr: ['fin-1'], fin: [] }));
  leg(J(c1) === J([['HR', 3, 1], ['FIN', 1, 0]]), '§3 userW\'s write reads "HR 3 → 1 · FIN 1 → 0"', J(c1));
  leg(J(desktopChanges(L({ a: ['x', 'y'] }), L({ a: ['y', 'x'] }))) === '[]' && J(desktopChanges(L({ a: ['x'] }), L({ a: ['x'], b: ['z'] }))) === J([['B', 0, 1]]), '§3 the same set in another order is no change; a new desktop counts from 0');
  const swapped = desktopChanges(L({ a: ['x', 'y'] }), L({ a: ['x', 'z'] }));
  leg(J(swapped) === J([['A', 2, 2]]), '§3 the same count with another window is a change (it names the desktop)', J(swapped));
  return failed;
}
console.log('— §1–§3 PURE: the merge, the belt, the change');
const P = require(path.join(REPO, MODEL));
const pureFailed = pureLegs(P);

// ── §4 THE DOORS on the real classes ─────────────────────────────────────────────────────────────────────────────
const { DesktopManager: RealDM } = await import('../src/lib/desktop-manager.js');
const { LayoutManager: RealLM } = await import('../src/lib/layout.js');

/** Two desktops, the page booted on `active` with its windows BUILT (as the boot restore builds them); the other
 *  desktop's record lives only in the held cache (lazy — never opened). */
function world(DM, LM, { records, active = 'desk-fin', failReplay = [], desks = null } = {}) {
  const sent = [], handlers = [], stateHandlers = [], closed = [], detached = [], ungrouped = [], pending = [];
  const wins = new Map();
  // THE ACK (verify r5 ⑤): the fake server answers every layout-sync it READ ~20 ms later (`app._acks = false` = an older
  // server); a send while `connected === false` waits in ws.js's pending queue and leaves at the open (after the state handlers)
  let ackSeq = 0;
  const deliver = (m) => {
    sent.push(m);
    if (app._swallow) return; // the socket looks open; the server reads nothing (verify r5 ⑤)
    if (m.type === 'layout-sync' && app._refuse?.(m)) { setTimeout(() => { for (const h of handlers) h({ type: 'layout-sync-refused', desktopId: m.desktopId, reason: 'shrink-without-close', unexplained: [], arrived: [], state: { windows: app._refuse.kept || [] }, sentAt: m.sentAt ?? null }); }, 20); return; }
    if (m.type === 'layout-sync' && app._acks !== false) setTimeout(() => { for (const h of handlers) h({ type: 'layout-sync-ack', desktopId: m.desktopId || null, sentAt: m.sentAt ?? null, seq: ++ackSeq }); }, 20);
  };
  const mkWin = (id, desk, o = {}) => { const el = mkEl(); el.style.zIndex = '10'; const w = { id, type: 'files', title: id, _desktopId: desk, gridBounds: GB(0.1, 0.1), isMinimized: false, isMaximized: false, element: el, _openSpec: { action: 'openFileExplorer', path: '/x/' + id }, _explorerPath: '/x/' + id, ...o }; wins.set(id, w); return w; };
  let dm = null, lm = null;
  const app = {
    ws: { onGlobal: (fn) => handlers.push(fn), onStateChange: (fn) => stateHandlers.push(fn), send: (m) => { const c = JSON.parse(JSON.stringify(m)); if (app.ws.connected === false) pending.push(c); else deliver(c); } },
    settings: null, sessions: new Map(), stage: null,
    wm: { windows: wins, grid: null, zIndex: 100, setGrid() {}, _reflowWindows() {}, _applyGridBounds() {}, _captureGridBounds() {}, focusWindow() {}, setWindowHidden(w, r = {}) { if (!w) return; if ('desktop' in r) w._hiddenByDesktop = !!r.desktop; if ('stage' in r) w._hiddenByStage = !!r.stage; }, toggleMaximize() {}, minimize() {}, restore() {},
      // the ONE retirement, as window.js does it: purge every held record + the held close
      closeWindow: (id) => { if (!wins.has(id)) return; wins.delete(id); closed.push(id); dm.purgeClosedWindow(id); lm.noteClosed?.(id, null); },
      // the chain's two breakers (tab-group.js), spied (verify r2: a record of the desktop on show broke hidden groups)
      _detachFromChain: (chain, id) => { detached.push(id); const i = chain.tabs.indexOf(id); if (i >= 0) chain.tabs.splice(i, 1); const w = wins.get(id); if (w) w._tabChain = null; },
      _ungroupLast: (chain) => { ungrouped.push(chain.tabs.join(',')); for (const id of chain.tabs) { const w = wins.get(id); if (w) w._tabChain = null; } },
      setSplitRatio() {}, applyChainRecord: (chain, rec) => { chain.layout = rec.layout === 'split' ? 'split' : 'tabs'; chain.order = rec.order; return false; },
      setWindowHidden(win, r = {}) { if (win && r && 'desktop' in r) win._hiddenByDesktop = !!r.desktop; if (win && r && 'stage' in r) win._hiddenByStage = !!r.stage; }, // lane stage-blank's ONE hider, as its window.js spells it (the reasons set the flags) — inert on this tree, the merged desktop manager's _hideWin / _showWin route through it
      witnessChain(chain, extra = []) { const t = Date.now(); for (const id of [...((chain && chain.tabs) || []), ...extra]) { const w = wins.get(id); if (w) w._chainAt = t; } } }, // tab-group's ONE stamp (verify r5 ②)
    themeManager: { current: 'dark' }, _fontSize: 14, _fontFamily: 'mono', sidebar: { isOpen: true, _allSessions: [] },
    updateTaskbar() {}, _checkWelcome() {},
    replayOpenSpec: (spec, winId) => { if (!failReplay.includes(winId)) mkWin(winId, dm.activeDesktopId, { _openSpec: spec }); },
  };
  lm = new LM(app); app.layoutManager = lm;
  dm = new DM(app); app.desktopManager = dm;
  stateHandlers.push((connected) => { if (connected) for (const m of pending.splice(0)) deliver(m); }); // ws.js: the flush runs AFTER the state handlers
  dm._desktops = desks ? desks.map((d) => ({ ...d })) : [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }]; // BEFORE the records: _setRecord refuses a desktop the page does not know (r2 ④)
  dm._activeId = active;
  for (const [d, ws] of Object.entries(records)) { const rec = { windows: ws, grid: null }; dm._setRecord(d, rec); dm.noteWire(d, rec); }
  for (const w of records[active] || []) mkWin(w.winId, active, { gridBounds: w.gridBounds });
  lm._restoring = false; lm._userDirty = true; lm._lastUserInputAt = Date.now();
  previews = mkEl();
  const rects = (desk) => { dm._switcherDigest = null; dm._renderSwitcher(); const wrap = previews.children.find((w) => w.children[0]?.dataset?.desktopId === desk); return wrap ? wrap.children[0].children.filter((c) => /desktop-preview-win/.test(c.className)).length : -1; };
  const syncs = (desk) => sent.filter((m) => m.type === 'layout-sync' && m.desktopId === desk);
  return { app, dm, lm, wins, sent, pending, mkWin, handlers, stateHandlers, closed, detached, ungrouped, rects, syncs };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const INCIDENT = () => ({ 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) })], 'desk-hr': [R('hr-1'), R('hr-2', { gridBounds: GB(0.5, 0) }), R('hr-3', { gridBounds: GB(0, 0.5) })] });

async function doorLegs(DM, LM, { quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k); // a control re-runs the legs its patch can redden (the timer legs cost seconds each)
  // a) THE INCIDENT: the drop onto HR's preview (window.js calls exactly this), HR never opened
  if (want('a')) {
    const W = world(DM, LM, { records: INCIDENT() });
    leg(W.rects('desk-hr') === 3, '§4 before the drop HR\'s preview draws its 3 windows (from the held record — the page built none of them)', W.rects('desk-hr'));
    const r = W.dm.moveWindowToDesktop('fin-1', 'desk-hr');
    const hr = W.dm._savedStates.get('desk-hr'), fin = W.dm._savedStates.get('desk-fin');
    leg(r.ok && r.moved && J(ids(hr)) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']), '§4 THE DROP onto an UNVISITED desktop: its held record keeps its 3 windows and ADDS the moved one (2.369.198: [fin-1] alone)', J(ids(hr)));
    const moved = hr.windows[3];
    leg(moved && moved.type === 'files' && moved.openSpec?.action === 'openFileExplorer' && moved.title === 'fin-1' && moved.explorerPath === '/x/fin-1', '§4 …the moved window is added as the ONE capture makes it (type, title, openSpec, path — not the old four-field stub)', J(moved));
    leg(J(ids(fin)) === '[]', '§4 …and the source\'s held record drops it (nothing else touched)', J(ids(fin)));
    leg(W.rects('desk-hr') === 4, '§4 HR\'s preview draws 4 after the drop (2.369.198: 3 → 1 — the cache fallback ran only when no live window was there)', W.rects('desk-hr'));
    await W.lm._doAutoSave();
    const hrSync = W.syncs('desk-hr'), finSync = W.syncs('desk-fin');
    leg(hrSync.length === 1 && J(ids(hrSync[0].state)) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']), '§4 THE AUTOSAVE after the drop SENDS HR\'s HELD record — 4 windows, never a list derived from the page', J(hrSync.map((m) => ids(m.state))));
    leg(finSync.length === 1 && J(ids(finSync[0].state)) === '[]', '§4 …and Fin\'s (the window left it) — the server holds the move whatever the page does next (2.369.198 sent Fin alone: a reload before visiting HR lost the moved window too)', J(finSync.map((m) => ids(m.state))));
    leg([...hrSync, ...finSync].every((m) => (m.evidence || []).some((e) => e.id === 'fin-1' && e.why === 'moved')), '§4 …both carry the move as evidence for the server\'s belt', J(finSync[0]?.evidence));
    W.sent.length = 0; await W.lm._doAutoSave();
    leg(W.syncs('desk-hr').length === 1, '§4 …a save before the server READ the first one re-sends HR (owed until the ack — verify r5 ⑤; an idempotent duplicate)');
    await tick(40); W.sent.length = 0; await W.lm._doAutoSave(); // the ack landed
    leg(W.syncs('desk-hr').length === 0, '§4 …once the ack landed the next save does not re-send HR (the dirty mark is spent by the server\'s read)');
    // the switch to HR builds all four
    await W.dm.switchTo('desk-hr');
    const onHr = [...W.wins.values()].filter((w) => w._desktopId === 'desk-hr').map((w) => w.id).sort();
    leg(J(onHr) === J(['fin-1', 'hr-1', 'hr-2', 'hr-3']), '§4 THE SWITCH to HR builds its 3 windows beside the moved one (2.369.198: the moved one alone)', J(onHr));
    W.dm._restoring = false; W.sent.length = 0; W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    await W.lm._doAutoSave();
    leg(J(ids(W.syncs('desk-hr')[0]?.state).sort()) === J(['fin-1', 'hr-1', 'hr-2', 'hr-3']), '§4 …and the autosave on HR sends all 4 (2.369.198: [fin-1] — the server record 3 → 1)', J(W.syncs('desk-hr').map((m) => ids(m.state))));
  }
  // b) the visited-first control: HR opened once before the drop (the page built it)
  if (want('b')) {
    const W = world(DM, LM, { records: INCIDENT() });
    await W.dm.switchTo('desk-hr'); W.dm._restoring = false;
    await W.dm.switchTo('desk-fin'); W.dm._restoring = false;
    W.dm.moveWindowToDesktop('fin-1', 'desk-hr');
    leg(J(ids(W.dm._savedStates.get('desk-hr')).sort()) === J(['fin-1', 'hr-1', 'hr-2', 'hr-3']) && W.rects('desk-hr') === 4, '§4 CONTROL visited first: the same 4 (and 2.369.198 got this one right — the page had built HR)', J(ids(W.dm._savedStates.get('desk-hr'))));
  }
  // c) the menu door + command mode's door are the same call with speak
  if (want('c')) {
    const W = world(DM, LM, { records: INCIDENT() });
    const items = W.dm.getDesktopMenuItems('fin-1');
    items.find((i) => i.label === 'HR')?.action();
    leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']), '§4 the "Move to Desktop ▸ HR" menu row: the same 4', J(ids(W.dm._savedStates.get('desk-hr'))));
  }
  // d) resume placement: a resumed conversation lands where its OLD never-opened window was — it takes that entry's place
  if (want('d')) {
    const recs = INCIDENT(); recs['desk-hr'].push(R('hr-old', { type: 'chat', openSpec: { action: 'viewSession', backendSessionId: 'conv-1' } }));
    const W = world(DM, LM, { records: recs });
    W.mkWin('new-1', 'desk-fin', { type: 'chat', _openSpec: undefined });
    const r = W.dm.moveWindowToDesktop('new-1', 'desk-hr', { replaces: 'hr-old' });
    leg(r.ok && J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'new-1']), '§4 RESUME PLACEMENT (no gesture): the unvisited desktop keeps its windows, the resumed one REPLACES its old entry (never two windows of one conversation on the next visit)', J(ids(W.dm._savedStates.get('desk-hr'))));
    leg(W.dm.evidence().some((e) => e.id === 'hr-old' && e.why === 'replaced'), '§4 …the replaced entry is evidence (\'replaced\')');
  }
  // e) a close leaves every held record, with evidence
  if (want('e')) {
    const W = world(DM, LM, { records: INCIDENT() });
    W.dm.purgeClosedWindow('hr-2');
    leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-3']) && W.dm.evidence().some((e) => e.id === 'hr-2' && e.why === 'closed'), '§4 a CLOSE leaves every held record (purgeClosedWindow through the door) and is evidence (\'closed\')');
    leg(J(W.dm.takeDirty()) === J(['desk-hr']), '§4 …a desktop not on show that listed it is sent with the next save (the close reaches the server while its evidence is fresh)');
    leg(J(W.dm.takeDirty()) === J(['desk-hr']), '§4 …and stays owed until the server READ it (verify r5 ⑤: a save on a dead socket took it out of the set and the re-send carried the desktop on show alone)');
    W.dm.noteCarried('desk-hr'); // the ack
    W.lm._applying = true; W.dm.purgeClosedWindow('hr-3'); W.lm._applying = false; // inside the apply's own span (verify r3 ③: the cooldown after it is the user's)
    leg(J(W.dm.takeDirty()) === '[]' && J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1']), '§4 …but a close an apply made (inside the apply\'s own span) is not this page\'s change to send');
  }
  // e2) a window the page holds on ANOTHER desktop is not this desktop's (it left by a path that is not a move)
  if (want('e2')) {
    const recs = INCIDENT(); recs['desk-hr'].push(R('fin-1'));
    const W = world(DM, LM, { records: recs });
    leg(J(ids(W.dm.recordFor('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3']) && W.dm.evidence().some((e) => e.id === 'fin-1' && e.why === 'moved'), '§4 a record entry for a window the page has BUILT on another desktop leaves the record it is not in (evidence \'moved\'); the unbuilt ones stay', J(ids(W.dm.recordFor('desk-hr'))));
    leg(!('updatedAt' in W.dm.recordFor('desk-fin')), '§4 the record the page writes never carries the server\'s updatedAt stamp (the server stamps every write)');
  }
  // f) build attempts: in flight ⇒ kept; past the grace ⇒ dropped with evidence; no openSpec ⇒ at once
  if (want('f')) {
    const recs = INCIDENT(); recs['desk-hr'].push(R('hr-dead', { openSpec: { action: 'openFile', path: '/gone' } }), R('hr-nospec', { openSpec: undefined }));
    const W = world(DM, LM, { records: recs, failReplay: ['hr-dead'] });
    await W.dm.switchTo('desk-hr'); W.dm._restoring = false;
    const r1 = ids(W.dm.recordFor('desk-hr'));
    leg(r1.includes('hr-dead') && !r1.includes('hr-nospec'), '§4 a window still being built stays in the record (the fast-switch protection); one with no openSpec cannot be built and leaves at once', J(r1));
    W.dm._buildAttempts.get('hr-dead').at -= 21000;
    const r2 = ids(W.dm.recordFor('desk-hr'));
    leg(!r2.includes('hr-dead') && J(W.dm.evidence().filter((e) => e.why === 'unbuilt').map((e) => e.id).sort()) === J(['hr-dead', 'hr-nospec']), '§4 …past the grace it is one the page CANNOT build: it leaves, named to the server (\'unbuilt\')', J({ r2, ev: W.dm.evidence() }));
    const W2 = world(DM, LM, { records: INCIDENT(), failReplay: ['hr-1'] });
    leg(J(ids(W2.dm.recordFor('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3']), '§4 …and a desktop never opened is never judged (no attempt, nothing dropped)');
    // verify r1 (⑥): a record entry for a webui SESSION this page already shows LIVE under another window id cannot be
    // built (attachSession's "already open" shortcut, keyed on `serverId`, focuses that window) — settled at once,
    // never replayed. verify r2: the key is the SESSION id — a fork's window carries its parent's conversation id
    // (`backendSessionId`), and keying on that settled the parent's own never-opened entry as a duplicate
    const recs3 = INCIDENT(); recs3['desk-hr'].push(
      R('hr-dup', { type: 'chat', openSpec: { action: 'attachSession', serverId: 'sess-live', backendSessionId: 'conv-live' } }),
      R('hr-parent', { type: 'chat', openSpec: { action: 'attachSession', serverId: 'sess-parent', backendSessionId: 'conv-parent' } }));
    const W3 = world(DM, LM, { records: recs3 });
    W3.mkWin('fin-live', 'desk-fin', { type: 'chat', _openSpec: { action: 'attachSession', serverId: 'sess-live', backendSessionId: 'conv-live' } });
    W3.mkWin('fin-fork', 'desk-fin', { type: 'chat', _openSpec: { action: 'attachSession', serverId: 'sess-fork', backendSessionId: 'conv-parent' } }); // a fork of the parent: its own session, the parent's conversation id
    const replayed = []; const rs = W3.app.replayOpenSpec; W3.app.replayOpenSpec = (spec, id) => { replayed.push(id); return rs(spec, id); };
    await W3.dm.switchTo('desk-hr'); W3.dm._restoring = false;
    const r3 = ids(W3.dm.recordFor('desk-hr'));
    leg(!replayed.includes('hr-dup') && !r3.includes('hr-dup') && W3.dm.evidence().some((e) => e.id === 'hr-dup' && e.why === 'unbuilt') && r3.includes('hr-1'), '§4 a record entry for a session already open here under another window id is never replayed and leaves at once (evidence \'unbuilt\'; the lane\'s ①: a 20 s build attempt the server held against every other client)', J({ replayed, r3, ev: W3.dm.evidence() }));
    leg(replayed.includes('hr-parent') && r3.includes('hr-parent') && !W3.dm.evidence().some((e) => e.id === 'hr-parent'), '§4 …but the PARENT of a fork open here is another session and IS replayed and kept — the conversation id its fork borrows never settles it (verify r2: keyed on the conversation id, the parent\'s never-opened window left its desktop\'s record for good)', J({ replayed, r3, ev: W3.dm.evidence() }));
  }
  // g) THE REFUSAL (the server's belt answered): the view = the server's record + what the page built, re-sent
  if (want('g')) {
    const W = world(DM, LM, { records: INCIDENT() });
    W.dm.moveWindowToDesktop('fin-1', 'desk-hr');
    W.dm._setRecord('desk-hr', { windows: [R('fin-1')] }); // a future writer's damage, the belt's case
    W.dm.takeDirty();
    clearToasts();
    for (const h of W.handlers) h({ type: 'layout-sync-refused', desktopId: 'desk-hr', reason: 'shrink-without-close', unexplained: ['hr-1', 'hr-2', 'hr-3'], state: { windows: INCIDENT()['desk-hr'] } });
    leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']), '§4 a REFUSED record (ws `layout-sync-refused`, routed by the socket) reconciles: the view = the server\'s record + the window the page built there', J(ids(W.dm._savedStates.get('desk-hr'))));
    leg(/3 windows on “HR” were kept/.test(toasts()[0] || ''), '§4 …said in a toast, never silent', J(toasts()));
    W.sent.length = 0; await W.lm._doAutoSave();
    leg(J(ids(W.syncs('desk-hr')[0]?.state)) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']), '§4 …and the corrected record goes out with the next save', J(W.syncs('desk-hr').map((m) => ids(m.state))));
  }
  // h) a remote record for the desktop on show becomes the base — minus a close this page holds
  if (want('h')) {
    const W = world(DM, LM, { records: INCIDENT() });
    W.lm._heldCloses = new Map([['fin-2', { at: Date.now(), desk: 'desk-fin' }]]);
    W.dm.cacheShownState('desk-fin', { windows: [R('fin-1'), R('fin-2')] });
    leg(J(ids(W.dm._savedStates.get('desk-fin'))) === J(['fin-1']), '§4 a remote record for the desktop ON SHOW becomes the held base, minus a close this page holds (the record is older than the close)', J(ids(W.dm._savedStates.get('desk-fin'))));
  }
  // i) verify r1 D4 — a record landing under a gate is DEFERRED per desktop, applied when the gate opens, never dropped
  if (want('i')) {
    const W = world(DM, LM, { records: INCIDENT() });
    const HR4 = { windows: [...INCIDENT()['desk-hr'], R('fin-1', { gridBounds: GB(0.3, 0.3) })] };
    W.lm._pointerDown = true;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-hr', state: HR4 });
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-fin', state: { windows: [] } });
    leg(W.lm._pendingRemote instanceof Map && W.lm._pendingRemote.size === 2 && J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3']), '§4 under the pointer a burst for TWO desktops (a move: the target\'s record, then the source\'s) is held one per desktop, nothing applied yet', J([W.lm._pendingRemote.size, ids(W.dm._savedStates.get('desk-hr'))]));
    W.lm._flushPending();
    await tick(650); // 300 ms after the pointerup, the drain's 200 ms, the two applies
    leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']) && W.lm._pendingRemote.size === 0 && W.wins.get('fin-1')?._desktopId === 'desk-hr', '§4 …the pointerup applies BOTH, the target first (by seq): HR\'s held record gains the moved window and the page moves it there (the lane\'s ①: ONE slot, the last record of ANY desktop won — the HR record was lost, and this page\'s next save of HR dropped the moved window on the server)', J([ids(W.dm._savedStates.get('desk-hr')), W.lm._pendingRemote.size, W.wins.get('fin-1')?._desktopId]));
    W.lm._restoring = true;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 3, desktopId: 'desk-hr', state: { windows: [R('hr-1'), R('fin-1')] } });
    await tick(450);
    leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'fin-1']) && W.lm._pendingRemote.size === 1, '§4 under `_restoring` (the apply\'s cooldown, the boot\'s 5 s) a record WAITS — not applied, not dropped', J([ids(W.dm._savedStates.get('desk-hr')), W.lm._pendingRemote.size]));
    W.lm._restoring = false;
    await tick(300);
    leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'fin-1']) && W.lm._pendingRemote.size === 0, '§4 …and is applied once the gate opens (the lane\'s ①: dropped outright — a page booting while another moved a window onto its desktop never learned of it)', J([ids(W.dm._savedStates.get('desk-hr')), W.lm._pendingRemote.size]));
  }
  // j) verify r1 D4 — a REMOTE MOVE is applied as a move, never as a close (no gate, no race: the common case)
  if (want('j')) {
    const W = world(DM, LM, { records: INCIDENT() });
    await W.dm.switchTo('desk-hr'); W.dm._restoring = false; await W.dm.switchTo('desk-fin'); W.dm._restoring = false; // both desktops built
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-hr', state: { windows: [...INCIDENT()['desk-hr'], R('fin-1', { gridBounds: GB(0.3, 0.3) })] } });
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-fin', state: { windows: [] } });
    const w = W.wins.get('fin-1');
    leg(!!w && w._desktopId === 'desk-hr' && w._hiddenByDesktop === true && !W.closed.includes('fin-1') && !W.dm.evidence().some((e) => e.id === 'fin-1'), '§4 a REMOTE MOVE OUT: the source\'s record no longer lists a window the target\'s record (sent first) does — the page MOVES it there, hidden; never closed, no evidence (the lane\'s ①: closed it, and that close was \'closed\' evidence — this page\'s next save of the target dropped the moved window on the server, explained)', J([w?._desktopId, w?._hiddenByDesktop, W.closed, W.dm.evidence()]));
    W.lm._restoring = false;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 3, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) })] } });
    W.lm._restoring = false;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 4, desktopId: 'desk-hr', state: { windows: INCIDENT()['desk-hr'] } });
    await tick(400);
    leg(w?._desktopId === 'desk-fin' && w?._hiddenByDesktop === false && W.wins.has('fin-1') && !W.closed.includes('fin-1'), '§4 a REMOTE MOVE IN: the record of the desktop on show lists a window this page holds hidden elsewhere — moved here and shown; the source\'s record that follows does not close it', J([w?._desktopId, w?._hiddenByDesktop, W.closed]));
    W.lm._restoring = false;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 5, desktopId: 'desk-fin', state: { windows: [] } });
    leg(W.closed.includes('fin-1'), '§4 …and a drop no other record explains is still a close');
  }
  // k) verify r1 D2 — a RECONNECT re-reads the layout (§6b guard 9)
  if (want('k')) {
    const W = world(DM, LM, { records: INCIDENT() });
    W.mkWin('fin-own', 'desk-fin'); // this page's own, never on the wire (its save is still queued)
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-2')] } }, 'desk-hr': { autoSave: { windows: [R('hr-1'), R('hr-2'), R('hr-3'), R('hr-4')] } } } };
    const fetches = [], realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => { fetches.push(String(url)); return { ok: true, json: async () => JSON.parse(J(server)) }; }; // a fresh parse, as the wire is — never the fixture by reference (the held record would alias it)
    try {
      for (const h of W.stateHandlers) h(true); // the first connect
      await tick(400);
      leg(fetches.length === 0, '§4 the FIRST connect re-reads nothing (the boot read IS the layout)');
      W.lm._restoring = false;
      for (const h of W.stateHandlers) h(false); for (const h of W.stateHandlers) h(true); // an outage, a reconnect
      await tick(450); W.lm._restoring = false; await tick(300); // 250 ms to the read + the apply; the cooldown lifted by hand; the deferred HR record's drain
      leg(fetches.some((u) => /\/api\/layouts$/.test(u)), '§4 a RECONNECT re-reads /api/layouts (the lane\'s ①: the held records stayed at the last broadcast before the outage, and the next save wrote that base over what arrived meanwhile — one window another client had opened was wiped)', J(fetches));
      leg(W.wins.has('fin-2') && !W.wins.has('fin-1') && W.wins.has('fin-own'), '§4 …the desktop on show follows the server: fin-2 opened; fin-1 closed (the wire listed it, the server dropped it); this page\'s OWN unsent window kept (the wire never listed it)', J([...W.wins.keys()]));
      leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'hr-4']), '§4 …a desktop not on show is cached from the server (hr-4 arrived during the outage)', J(ids(W.dm._savedStates.get('desk-hr'))));
      // a second outage, during which fin-2 was MOVED to HR: the desktop on show is read last, so the move is a move
      server.desktops['desk-fin'].autoSave.windows = []; server.desktops['desk-hr'].autoSave.windows.push(R('fin-2'));
      W.lm._restoring = false; W.closed.length = 0;
      for (const h of W.stateHandlers) h(false); for (const h of W.stateHandlers) h(true);
      await tick(450); W.lm._restoring = false; await tick(300);
      const f2 = W.wins.get('fin-2');
      leg(!!f2 && f2._desktopId === 'desk-hr' && f2._hiddenByDesktop === true && !W.closed.includes('fin-2'), '§4 …a window moved off the desktop on show during the outage is MOVED (the desktop on show is read last, its new desktop\'s record already cached), never closed', J([f2?._desktopId, f2?._hiddenByDesktop, W.closed]));
    } finally { globalThis.fetch = realFetch; }
  }
  // l) verify r1 D1 — deleting the desktop ON SHOW hands its windows to the target's RECORD and sends it before the delete
  if (want('l')) {
    const W = world(DM, LM, { records: INCIDENT(), active: 'desk-hr' });
    await W.dm.deleteDesktop('desk-hr');
    const finSyncs = W.syncs('desk-fin');
    const delAt = W.sent.findIndex((m) => m.type === 'desktop-delete');
    const finAt = W.sent.map((m, i) => (m.type === 'layout-sync' && m.desktopId === 'desk-fin' ? i : -1)).filter((i) => i >= 0);
    leg(finSyncs.length >= 1 && J(ids(finSyncs[finSyncs.length - 1].state).sort()) === J(['fin-1', 'hr-1', 'hr-2', 'hr-3']), '§4 deleting the desktop ON SHOW: the target\'s record with all 4 goes out AT ONCE — not left to an autosave the switch\'s gate drops (the lane\'s ①: the server forgot the desktop and held its 3 windows in no record until the next input; a reload in between lost them)', J(finSyncs.map((m) => ids(m.state))));
    leg(finAt.length && delAt > finAt[finAt.length - 1], '§4 …and BEFORE the desktop-delete (never a moment with the windows in no record)', J([finAt, delAt]));
    leg(J(ids(W.dm._savedStates.get('desk-fin')).sort()) === J(['fin-1', 'hr-1', 'hr-2', 'hr-3']) && !W.dm._savedStates.has('desk-hr'), '§4 …the held records agree: Fin holds 4, HR is gone');
  }
  // m) verify r1 D6 — a refused record of the desktop ON SHOW is re-sent by rearmSave alone (no dirty desk marks it)
  if (want('m')) {
    const W = world(DM, LM, { records: INCIDENT() });
    W.lm._userDirty = false; W.lm._lastSentJson = 'x'; W.sent.length = 0;
    for (const h of W.handlers) h({ type: 'layout-sync-refused', desktopId: 'desk-fin', reason: 'shrink-without-close', unexplained: ['fin-2', 'fin-3'], state: { windows: [R('fin-1'), R('fin-2'), R('fin-3')] } });
    leg(W.lm._userDirty === true && W.lm._lastSentJson === null, '§4 a refusal of the desktop ON SHOW re-arms the save (dirty at the last real input, the no-op guard cleared) — rearmSave is its only way out');
    await tick(700);
    leg(W.syncs('desk-fin').length >= 1 && J(ids(W.syncs('desk-fin').pop().state).sort()) === J(['fin-1', 'fin-2', 'fin-3']), '§4 …and the corrected record of the desktop on show goes out on its own (D6: a rearmSave that did nothing was caught by no gate)', J(W.syncs('desk-fin').map((m) => ids(m.state))));
  }
  // o) verify r2 — THE HELD MOVE: a record of the desktop on show deferred under a drag, and the drag ends as a drop on
  // another desktop's preview — the record (older than the move) must not put the window back, and the move must reach
  // the server (r1's move-in re-adopted it onto the desktop the user had just dragged it off, and the apply's dirty
  // clear swallowed the move's own save: fin-2 back on Fin on both pages, the server never told, no toast)
  if (want('o')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    W.lm._pointerDown = true; // the drag begins
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); // another client's save of Fin (it still lists fin-2)
    await tick(30);
    const n0 = W.sent.length;
    W.lm._flushPending(); // the pointerup (the capture listener) …
    const r = W.dm.moveWindowToDesktop('fin-2', 'desk-hr'); // … then the drop on HR's preview (window.js's mouseup)
    leg(r.ok && r.moved && W.wins.get('fin-2')?._desktopId === 'desk-hr', '§4 the drop moved fin-2 to HR');
    await tick(650); // the deferred record lands
    const w = W.wins.get('fin-2');
    leg(!!w && w._desktopId === 'desk-hr' && w._hiddenByDesktop === true, '§4 THE HELD MOVE: a record received BEFORE the user\'s move cannot know it — the window stays where the user dropped it (verify r2: r1\'s move-in put it back on Fin)', J([w?._desktopId, w?._hiddenByDesktop]));
    await tick(2000); // the apply's 1 s cooldown, the held move's re-send at its end, the autosave it arms (500 ms)
    const since = W.sent.slice(n0).filter((m) => m.type === 'layout-sync');
    const hrS = since.filter((m) => m.desktopId === 'desk-hr'), finS = since.filter((m) => m.desktopId === 'desk-fin');
    leg(hrS.length >= 1 && ids(hrS[hrS.length - 1].state).includes('fin-2') && finS.length >= 1 && !ids(finS[finS.length - 1].state).includes('fin-2'), '§4 …and the move goes out once more, as the user\'s own act (HR with fin-2, Fin without) — the apply\'s dirty clear does not swallow it', J({ hr: hrS.map((m) => ids(m.state)), fin: finS.map((m) => ids(m.state)), dirty: W.lm._userDirty }));
    // …while a record received AFTER the move is a genuine remote move and still applies
    W.lm._restoring = false;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-fin', state: { windows: [R('fin-1'), R('fin-2')] } });
    leg(W.wins.get('fin-2')?._desktopId === 'desk-fin', '§4 …a record received AFTER the move is a real remote move and applies (the hold is the record\'s age, never a lock)', W.wins.get('fin-2')?._desktopId);
  }
  // p) verify r2 — a record of the desktop ON SHOW leaves a tab group on ANOTHER desktop alone (every save of Fin by
  // another client broke every group this page held on HR — gone on the page, then on the server with its next save)
  if (want('p')) {
    const W = world(DM, LM, { records: INCIDENT() });
    const chain = { tabs: ['hr-1', 'hr-2'], active: 0, layout: 'tabs', order: ['hr-1', 'hr-2'] };
    W.mkWin('hr-1', 'desk-hr', { _hiddenByDesktop: true, _tabChain: chain }); W.mkWin('hr-2', 'desk-hr', { _hiddenByDesktop: true, _tabChain: chain, _isTabGuest: true }); // HR built once, hidden now
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) })] } }); // another client's save of Fin (no chain there)
    leg(W.detached.length === 0 && W.ungrouped.length === 0 && W.wins.get('hr-1')._tabChain === chain && chain.tabs.length === 2, '§4 a record of the desktop ON SHOW (Fin) leaves the tab group on hidden HR intact (verify r2: the chain loop judged every chain on the page against the shown desktop\'s record and broke HR\'s)', J({ detached: W.detached, ungrouped: W.ungrouped, tabs: chain.tabs }));
    // …while a chain on the desktop on show that the record lacks IS broken (as before)
    W.lm._restoring = false;
    const finChain = { tabs: ['fin-1', 'fin-x'], active: 0, layout: 'tabs', order: ['fin-1', 'fin-x'] };
    W.wins.get('fin-1')._tabChain = finChain; W.mkWin('fin-x', 'desk-fin', { _tabChain: finChain, _isTabGuest: true });
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-fin', state: { windows: [R('fin-1'), R('fin-x')] } });
    leg(W.detached.includes('fin-x') && W.detached.length === 1 && !W.detached.includes('hr-2') && chain.tabs.length === 2, '§4 …a chain on the desktop on show that the record does not carry is broken, as before; HR\'s still stands', J({ detached: W.detached, tabs: chain.tabs }));
  }
  // q) verify r2 ④ — another page's `desktop-updated` after a delete: the deleted desktop's windows go where the
  // deleter's record put them (its target — b21c2d40 sends that record first), not to desktop #1
  if (want('q')) {
    const THREE = [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }, { id: 'd3', name: 'D3' }];
    for (const gated of [false, true]) {
      const W = world(DM, LM, { records: { d1: [R('d1-1')], d2: [R('d2-1')], d3: [R('d3-1')] }, active: 'd1', desks: THREE });
      W.mkWin('d3-1', 'd3', { _hiddenByDesktop: true }); // D3 visited once, hidden now
      if (gated) W.lm._pointerDown = true;
      for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'd2', state: { windows: [R('d2-1'), R('d3-1')] } }); // the deleter (on D3, target D2) sends D2's record first…
      for (const h of W.handlers) h({ type: 'desktop-updated', desktops: [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }] }); // …then the delete lands on every page
      const w = W.wins.get('d3-1');
      leg(w?._desktopId === 'd2' && w?._hiddenByDesktop === true, `§4 ${gated ? 'under a gate (D2\'s record still deferred) ' : ''}another page puts the deleted desktop\'s window where the deleter\'s record put it (D2, hidden) — not on desktop #1 (verify r2: #1 on every other page ⇒ a second record on the server, and on the deleter\'s page the windows then jumped from its target to #1)`, J([w?._desktopId, w?._hiddenByDesktop]));
      leg(!W.dm._savedStates.has('d3') && !W.dm._wireIds.has('d3') && !W.lm._pendingRemote.has('d3'), '§4 …and the deleted desktop leaves no held record, wire base or deferred record behind');
      if (gated) { W.lm._flushPending(); await tick(650); }
      W.sent.length = 0; await tick(1100); W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); await W.lm._doAutoSave();
      leg(!W.syncs('d1').some((m) => ids(m.state).includes('d3-1')), '§4 …so this page\'s next save of D1 never writes it under D1 too', J(W.syncs('d1').map((m) => ids(m.state))));
    }
    // the page ON the deleted desktop follows its windows to the deleter's target and never writes the deleted desktop
    const W = world(DM, LM, { records: { d1: [R('d1-1')], d2: [R('d2-1')], d3: [R('d3-1')] }, active: 'd3', desks: THREE });
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'd2', state: { windows: [R('d2-1'), R('d3-1')] } });
    W.sent.length = 0;
    for (const h of W.handlers) h({ type: 'desktop-updated', desktops: [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }] });
    await tick(1200);
    leg(W.dm.activeDesktopId === 'd2' && W.wins.get('d3-1')?._desktopId === 'd2', '§4 the page ON the deleted desktop switches to where its windows went (D2), not to #1', J([W.dm.activeDesktopId, W.wins.get('d3-1')?._desktopId]));
    leg(!W.syncs('d3').length && !W.dm._savedStates.has('d3'), '§4 …and never writes the deleted desktop\'s record (verify r2: the switch off it broadcast one — an orphan record on the server, named by no meta)', J(W.sent.map((m) => [m.type, m.desktopId])));
  }
  // r) verify r2 ⑤ — a record still deferred when the reconnect's re-read lands
  if (want('r')) {
    const W = world(DM, LM, { records: INCIDENT() });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1')] } }, 'desk-hr': { autoSave: { windows: [R('hr-1'), R('hr-2'), R('hr-3'), R('hr-4')] } } } };
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(J(server)) });
    try {
      // (a) a record deferred under the boot gate BEFORE the read is asked: older than the read
      W.lm._restoring = true;
      for (const h of W.handlers) h({ type: 'layout-sync', seq: 5, desktopId: 'desk-hr', state: { windows: [R('hr-1'), R('hr-2'), R('hr-3')] } });
      await tick(30);
      W.lm._restoring = false; // the gate opens…
      await W.lm._resyncFromServer(); // …and the read answers before the drain's next tick
      leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'hr-4']) && !W.lm._pendingRemote.has('desk-hr'), '§4 the re-read cached HR with hr-4 and dropped the older record still deferred for HR');
      await tick(1600);
      leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'hr-4']), '§4 …so the older deferred record never lands AFTER the re-read (verify r2: it drained a stale HR over the fresh one — this page\'s next save of HR then dropped hr-4, refused as an arrival, reopened with a toast)', J(ids(W.dm._savedStates.get('desk-hr'))));
      // (b) a broadcast that lands while the read is in flight may be NEWER than what the read saw: it stays and wins
      let answer = null; globalThis.fetch = async () => ({ ok: true, json: () => new Promise((r) => { answer = () => r(server); }) });
      W.lm._restoring = true;
      const p = W.lm._resyncFromServer();
      await tick(20);
      for (const h of W.handlers) h({ type: 'layout-sync', seq: 6, desktopId: 'desk-hr', state: { windows: [R('hr-1'), R('hr-2'), R('hr-3'), R('hr-4'), R('hr-5')] } }); // in flight: hr-5 added after the read
      await tick(20); answer(); await p;
      leg(W.lm._pendingRemote.get('desk-hr')?.seq === 6, '§4 a broadcast that landed while the read was in flight is kept over the read\'s record of that desktop (it may be newer than what the read saw)', J([...W.lm._pendingRemote.keys()]));
      W.lm._restoring = false; await tick(1700); // the read's Fin record drains first (seq 0) and its apply holds the gate 1 s; HR's follows
      leg(J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'hr-4', 'hr-5']), '§4 …and it is what lands (hr-5 kept)', J(ids(W.dm._savedStates.get('desk-hr'))));
    } finally { globalThis.fetch = realFetch; }
  }
  // s) verify r2 ⑥ — the reconnect's re-read fails (a 5xx, a cut): retried, bounded
  if (want('s')) {
    const W = world(DM, LM, { records: INCIDENT() });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1')] } }, 'desk-hr': { autoSave: { windows: [R('hr-1'), R('hr-2'), R('hr-3'), R('hr-4')] } } } };
    let calls = 0;
    const realFetch = globalThis.fetch; globalThis.fetch = async () => { calls++; if (calls === 1) throw new Error('cut'); if (calls === 2) return { ok: false, status: 503 }; return { ok: true, json: async () => server }; };
    try {
      for (const h of W.stateHandlers) h(true); for (const h of W.stateHandlers) h(false); for (const h of W.stateHandlers) h(true);
      const poll = async (pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await tick(50); } return pred(); }; // bounded polls, never a fixed tick (the box's load lags timers)
      leg(await poll(() => calls === 1, 3000) && J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3']), '§4 the re-read was asked once and failed (a cut) — the page still holds its stale HR', J([calls, ids(W.dm._savedStates.get('desk-hr'))]));
      leg(await poll(() => calls >= 3 && J(ids(W.dm._savedStates.get('desk-hr'))) === J(['hr-1', 'hr-2', 'hr-3', 'hr-4']), 9000), '§4 a failed re-read is retried (a cut, then a 503, then the answer) and the page catches up — never left on the stale base after one failure (verify r2: one try, and the next save wrote that base over what arrived during the outage)', J([calls, ids(W.dm._savedStates.get('desk-hr'))]));
    } finally { globalThis.fetch = realFetch; }
  }
  // t) verify r2 R7 — the drain's ORDER is by seq, not by the map's insertion order (r1's part no gate caught)
  if (want('t')) {
    const W = world(DM, LM, { records: INCIDENT() });
    W.lm._pointerDown = true;
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1')] } }); // a stale Fin (before the move)
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-hr', state: { windows: [...INCIDENT()['desk-hr'], R('fin-1')] } }); // the move's target
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 3, desktopId: 'desk-fin', state: { windows: [] } }); // the move's source (replaces Fin's slot — the map keeps Fin FIRST)
    leg([...W.lm._pendingRemote.keys()].join() === 'desk-fin,desk-hr' && W.lm._pendingRemote.get('desk-fin').seq === 3, '§4 a burst Fin, HR, Fin under the pointer: the map holds Fin (seq 3) first, HR (seq 2) second');
    W.lm._flushPending(); await tick(900);
    leg(W.wins.get('fin-1')?._desktopId === 'desk-hr' && W.wins.get('fin-1')?._hiddenByDesktop === true && !W.closed.includes('fin-1'), '§4 the drain lands the target (seq 2) BEFORE the source (seq 3) — fin-1 moved to HR, never closed (drained in insertion order the source came first and closed it)', J([W.wins.get('fin-1')?._desktopId, W.closed]));
  }
  // u) verify r2 R7 — the CACHED sweep's adopt: the page shows a third desktop while a window it holds hidden moves
  if (want('u')) {
    const W = world(DM, LM, { records: { x: [R('x-1')], 'desk-fin': [R('fin-1')], 'desk-hr': [R('hr-1')] }, active: 'x', desks: [{ id: 'x', name: 'X' }, { id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }] });
    W.mkWin('fin-1', 'desk-fin', { _hiddenByDesktop: true }); // Fin visited once
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-hr', state: { windows: [R('hr-1'), R('fin-1')] } });
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-fin', state: { windows: [] } });
    leg(W.wins.get('fin-1')?._desktopId === 'desk-hr' && W.wins.get('fin-1')?._hiddenByDesktop === true && !W.closed.includes('fin-1'), '§4 a remote move between two desktops the page is NOT showing: the cached sweep moves the hidden window to the target, never closes it (the third adopt site — no leg drove it)', J([W.wins.get('fin-1')?._desktopId, W.closed]));
  }
  // v) verify r2 ⑩ — THE HELD GEOMETRY: a drag on the desktop on show ends after the record deferred under it arrived
  if (want('v')) {
    const W = world(DM, LM, { records: INCIDENT(), active: 'desk-hr' });
    W.lm._pointerDown = true; // the drag of hr-2 begins
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-hr', state: { windows: [R('hr-1', { gridBounds: GB(0.05, 0.05) }), R('hr-2', { gridBounds: GB(0.5, 0) }), R('hr-3', { gridBounds: GB(0, 0.5) })] } }); // another client's save of HR: hr-2 where it last saw it
    await tick(30);
    const n0 = W.sent.length;
    W.lm._flushPending(); // the pointerup…
    const w = W.wins.get('hr-2'); w.gridBounds = GB(0.7, 0.3); w._boundsAt = Date.now(); // …window.js's onUp: the drop's box, stamped
    await tick(650); // the deferred record lands
    leg(w.gridBounds.left === 0.7 && w.gridBounds.top === 0.3, '§4 THE HELD GEOMETRY: the record deferred under the drag does not snap the window back to where the other client last saw it (verify r2: guard 3 applied it at the pointerup — the box jumped back, the server kept the old place, no toast)', J(w.gridBounds));
    leg(W.wins.get('hr-1').gridBounds.left === 0.05, '§4 …the record\'s other windows still apply (hr-1 took the remote box)', J(W.wins.get('hr-1').gridBounds));
    await tick(2000); // the apply's cooldown, the held act's re-send, the autosave it arms
    const since = W.sent.slice(n0).filter((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr');
    const last = since[since.length - 1];
    leg(!!last && last.state.windows.find((x) => x.winId === 'hr-2')?.gridBounds?.left === 0.7, '§4 …and the drag goes out once more as the user\'s own act (HR with hr-2 at the dropped box — the apply\'s dirty clear had swallowed its save)', J(since.map((m) => m.state.windows.map((x) => [x.winId, x.gridBounds?.left]))));
  }
  // n) verify r1 D6 — the switch's broadcast of the desktop being left carries the evidence of the closes made there
  if (want('n')) {
    const W = world(DM, LM, { records: INCIDENT(), active: 'desk-hr' });
    W.app.wm.closeWindow('hr-1'); W.app.wm.closeWindow('hr-2'); // two closes, then a switch before any autosave could run
    W.sent.length = 0;
    await W.dm.switchTo('desk-fin');
    const hrSync = W.syncs('desk-hr')[0];
    leg(!!hrSync && J(ids(hrSync.state)) === J(['hr-3']) && ['hr-1', 'hr-2'].every((id) => (hrSync.evidence || []).some((e) => e.id === id && e.why === 'closed')), '§4 the switch\'s broadcast of the desktop being left (two closes, no autosave yet) carries their evidence — else the belt refuses the user\'s own closes and a false "were kept" toast follows (D6: caught by no gate)', J(hrSync));
  }
  // w) verify r3 ② — a move made while the reconnect's re-read is IN FLIGHT: the answer predates it and must not reverse it
  if (want('w')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1'), R('fin-2')] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } } } };
    let release = null;
    const realFetch = globalThis.fetch; globalThis.fetch = () => new Promise((res) => { release = () => res({ ok: true, json: async () => server }); });
    try {
      const p = W.lm._resyncFromServer(); // asked
      await tick(30);
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
      const r = W.dm.moveWindowToDesktop('fin-2', 'desk-hr'); // the drop while the read is in flight
      leg(r.ok && r.moved, '§4 the drop moved fin-2 to HR while the re-read was in flight');
      await tick(700); release(); await p; await tick(30); // the answer: the server's records from BEFORE the move, landing after the move's save LEFT (verify r4 ①: an answer before the save is held by the unsaved-act rule; this one is held by the horizon alone)
      const w = W.wins.get('fin-2');
      leg(!!w && w._desktopId === 'desk-hr' && w._hiddenByDesktop === true, '§4 verify r3 ②: the re-read (asked before the move) does not put fin-2 back on Fin — its horizon is the ask, never the answer', w?._desktopId);
      await tick(2600); // the apply's cooldown, the held move's re-send, its autosave
      const hrS = W.syncs('desk-hr'), finS = W.syncs('desk-fin');
      leg(hrS.length >= 1 && ids(hrS[hrS.length - 1].state).includes('fin-2') && finS.length >= 1 && !ids(finS[finS.length - 1].state).includes('fin-2'), '§4 …and the move goes out after the re-read (HR with fin-2, Fin without)', J([hrS.map((m) => ids(m.state)), finS.map((m) => ids(m.state))]));
    } finally { globalThis.fetch = realFetch; }
  }
  // x) verify r3 ② — a move made while DISCONNECTED (its save queued in ws.js) vs a re-read whose answer raced the queued save on the server
  if (want('x')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const fixture = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1'), R('fin-2')] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } } } };
    // the answer is the server AFTER the flush: the queued frame precedes the GET by 250 ms and readLayouts / writeLayouts are
    // synchronous on one thread (verify r5: an answer from BEFORE a save the server acked cannot exist — the ack proves the read)
    const server = () => ({ ...fixture, desktops: Object.fromEntries(Object.entries(fixture.desktops).map(([d, v]) => [d, { autoSave: { windows: W.syncs(d).length ? W.syncs(d)[W.syncs(d).length - 1].state.windows : v.autoSave.windows } }])) });
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => server() });
    try {
      for (const h of W.stateHandlers) h(true);
      W.app.ws.connected = false; for (const h of W.stateHandlers) h(false); // the outage
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
      W.dm.moveWindowToDesktop('fin-2', 'desk-hr');
      await tick(700); // the autosave "sent" — queued in ws.js while disconnected
      const queued = W.pending.filter((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr');
      leg(queued.length >= 1 && ids(queued[queued.length - 1].state).includes('fin-2') && W.syncs('desk-hr').length === 0 && W.lm._unacked.some((x) => x.at == null), '§4 the move\'s save was queued while disconnected (nothing left; its no-ack clock not started)');
      W.app.ws.connected = true; for (const h of W.stateHandlers) h(true); // the reconnect: the queue flushes, the re-read 250 ms later
      await tick(700);
      const w = W.wins.get('fin-2');
      leg(!!w && w._desktopId === 'desk-hr' && W.syncs('desk-hr').length >= 1 && W.lm._carriedAt('desk-hr') > 0, '§4 verify r3 ② / r5 ⑤: a move whose save left only at the reconnect is carried by the flush (before the re-read asks), acked, and never reversed', J([w?._desktopId, W.syncs('desk-hr').length, W.lm._carriedAt('desk-hr')]));
    } finally { globalThis.fetch = realFetch; }
  }
  // ch) verify r5 ② — THE HELD CHAIN: a merge / a side-by-side / a tear-off made in the second after another client's record landed vs a record (captured before) deferred under the cooldown
  if (want('ch')) {
    const FINREC = (seq, wins) => ({ type: 'layout-sync', seq, desktopId: 'desk-fin', receivedAt: Date.now(), state: { windows: wins.map((w) => R(w.id, { gridBounds: GB(0.2 + seq / 1000, 0.2), ...(w.o || {}) })) } });
    // ch1) the merge (the icon drag): a record with fin-1, fin-2 unchained lands; 200 ms later the user merges; a second record under the cooldown
    {
      const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
      for (const h of W.handlers) h(FINREC(1, [{ id: 'fin-1' }, { id: 'fin-2' }]));
      await tick(200);
      const h1 = W.wins.get('fin-1'), g1 = W.wins.get('fin-2');
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); const chain = { tabs: ['fin-1', 'fin-2'], active: 1, layout: 'tabs', order: ['fin-1', 'fin-2'] }; h1._tabChain = chain; g1._tabChain = chain; W.app.wm.witnessChain(chain); W.lm.scheduleAutoSave(); // createTabChain, as the merge drop does
      await tick(100);
      for (const h of W.handlers) h(FINREC(2, [{ id: 'fin-1' }, { id: 'fin-2' }]));
      await tick(1500);
      leg(h1._tabChain === chain && g1._tabChain === chain && chain.tabs.length === 2 && W.detached.length === 0 && W.ungrouped.length === 0, '§4 verify r5 ②: a MERGE made in the cooldown is not undone by the record deferred under it (the chain loop broke the group the older record did not list — 300 ms after the drop)', J([h1._tabChain?.tabs, W.detached, W.ungrouped]));
      await tick(3000);
      const fin = W.syncs('desk-fin').pop(), rec = fin && (fin.state.windows || []).find((w) => w.winId === 'fin-1');
      leg(!!rec?.tabChain?.tabs && rec.tabChain.tabs.length === 2, '§4 …and the deferred save carries the group to the server (its save had been swallowed)', J(fin && (fin.state.windows || []).map((w) => [w.winId, w.tabChain?.tabs])));
    }
    // ch2) the side-by-side (the strip's button): a record with the group as TABS lands; 200 ms later the user splits; a second tabs record under the cooldown
    {
      const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
      const h2 = W.wins.get('fin-1'), g2 = W.wins.get('fin-2');
      const ch2 = { tabs: ['fin-1', 'fin-2'], active: 1, layout: 'tabs', order: ['fin-1', 'fin-2'] }; h2._tabChain = ch2; g2._tabChain = ch2;
      const TABS = (seq) => FINREC(seq, [{ id: 'fin-1', o: { tabChain: { tabs: ['fin-1', 'fin-2'], active: 1, layout: 'tabs', order: ['fin-1', 'fin-2'] } } }, { id: 'fin-2', o: { isTabGuest: true } }]);
      for (const h of W.handlers) h(TABS(1));
      await tick(200);
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); ch2.layout = 'split'; ch2.split = { pair: ['fin-1', 'fin-2'], ratio: 0.5, dir: 'row', left: ['fin-1'], right: ['fin-2'] }; W.app.wm.witnessChain(ch2); W.lm.scheduleAutoSave(); // bindSplit
      await tick(100);
      for (const h of W.handlers) h(TABS(2));
      await tick(1500);
      leg(ch2.layout === 'split' && h2._tabChain === ch2, '§4 verify r5 ②: a SIDE-BY-SIDE made in the cooldown keeps its layout over the tabs record deferred under it (applyChainRecord put the older layout back)', ch2.layout);
    }
    // ch3) the tear-off: a 3-group; a record listing it lands; 200 ms later the user tears fin-3 out; a second record (the 3-group) under the cooldown
    {
      const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) }), R('fin-3', { gridBounds: GB(0.3, 0.5) })], 'desk-hr': INCIDENT()['desk-hr'] } });
      const a = W.wins.get('fin-1'), b = W.wins.get('fin-2'), c = W.wins.get('fin-3');
      const ch3 = { tabs: ['fin-1', 'fin-2', 'fin-3'], active: 0, layout: 'tabs', order: ['fin-1', 'fin-2', 'fin-3'] }; a._tabChain = ch3; b._tabChain = ch3; c._tabChain = ch3;
      const THREE = (seq) => FINREC(seq, [{ id: 'fin-1', o: { tabChain: { tabs: ['fin-1', 'fin-2', 'fin-3'], active: 0, layout: 'tabs', order: ['fin-1', 'fin-2', 'fin-3'] } } }, { id: 'fin-2', o: { isTabGuest: true } }, { id: 'fin-3', o: { isTabGuest: true } }]);
      for (const h of W.handlers) h(THREE(1));
      await tick(200);
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); ch3.tabs = ['fin-1', 'fin-2']; ch3.order = ['fin-1', 'fin-2']; c._tabChain = null; W.app.wm.witnessChain(ch3, ['fin-3']); W.lm.scheduleAutoSave(); // the tear-off's detach
      await tick(100);
      let queued = 0; const realQ = W.lm._queueChain; W.lm._queueChain = function (...args) { queued++; return realQ.apply(this, args); };
      for (const h of W.handlers) h(THREE(2));
      await tick(1500);
      leg(c._tabChain === null && a._tabChain === ch3 && ch3.tabs.length === 2 && queued === 0, '§4 verify r5 ②: a TEAR-OFF made in the cooldown is not undone by the record deferred under it — the group of two stands and the older record\'s 3-group is not rebuilt around the window that left', J([c._tabChain?.tabs, ch3.tabs, queued]));
      await tick(3000);
      const fin = W.syncs('desk-fin').pop(), rec = fin && (fin.state.windows || []).find((w) => w.winId === 'fin-1'), rec3 = fin && (fin.state.windows || []).find((w) => w.winId === 'fin-3');
      leg(!!rec?.tabChain?.tabs && rec.tabChain.tabs.length === 2 && rec3 && !rec3.isTabGuest, '§4 …and the deferred save carries the two-group and the free window', J(fin && (fin.state.windows || []).map((w) => [w.winId, w.tabChain?.tabs, !!w.isTabGuest])));
    }
  }
  // a5) verify r5 ⑥ — a move whose window the record never names (a peer closed it, captured before the move): the apply's dirty clear vs the move's pending save
  if (want('a5')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    W.dm.moveWindowToDesktop('fin-2', 'desk-hr'); // held; its save 500 ms away
    await tick(100);
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', receivedAt: Date.now(), state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) })] } }); // a peer's Fin record WITHOUT fin-2 (the peer closed it; captured before the move)
    await tick(3500);
    const hr = W.syncs('desk-hr');
    leg(W.wins.get('fin-2')?._desktopId === 'desk-hr' && hr.length >= 1 && ids(hr[hr.length - 1].state).includes('fin-2') && !W.dm._dirtyDesks.has('desk-hr'), '§4 verify r5 ⑥: the move wins over the peer\'s concurrent close AND reaches the server — the owed desk re-arms the re-send (the apply\'s dirty clear swallowed the move\'s save and no loop re-armed it: the window sat on HR on the page only, until the next act)', J([W.wins.get('fin-2')?._desktopId, hr.map((m) => ids(m.state)), [...W.dm._dirtyDesks]]));
  }
  // ak) verify r5 ⑤ — THE ACK: a save SENT on a socket that looks open but the server never reads; the socket dies; the reconnect re-reads
  if (want('ak')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1'), R('fin-2')] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } } } }; // the server never saw the move
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => server });
    try {
      for (const h of W.stateHandlers) h(true);
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); await W.lm._doAutoSave(); await tick(40); // an earlier save, acked: this server acks (the no-ack fallback is off for good)
      leg(W.lm._serverAcks === true, '§4 an earlier save was acked — the page knows this server acks');
      W.app._swallow = true;
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
      W.dm.moveWindowToDesktop('fin-2', 'desk-hr');
      await tick(700); // the autosave "sent" on the open socket — read by nobody
      const n0 = W.syncs('desk-hr').length;
      leg(n0 >= 1 && ids(W.syncs('desk-hr')[n0 - 1].state).includes('fin-2') && W.dm._dirtyDesks.has('desk-hr'), '§4 the move\'s save left on the (dead) socket; HR stays owed (no ack read it)');
      W.app._swallow = false;
      W.app.ws.connected = false; for (const h of W.stateHandlers) h(false); // the browser learns of the death
      await tick(100);
      W.app.ws.connected = true; for (const h of W.stateHandlers) h(true); // the reconnect; the re-read 250 ms later
      await tick(800);
      const w = W.wins.get('fin-2');
      leg(!!w && w._desktopId === 'desk-hr', '§4 verify r5 ⑤: a move whose save the server never READ is not reversed by the re-read (released at the server\'s ack, never at the send — r4\'s held (a))', w?._desktopId);
      await tick(2600); // the held move's re-send + its ack
      const hrS = W.syncs('desk-hr');
      leg(hrS.length > n0 && ids(hrS[hrS.length - 1].state).includes('fin-2') && !W.dm._dirtyDesks.has('desk-hr') && W.lm._carriedAt('desk-hr') > 0, '§4 …and the held act is RE-SENT after the reconnect, HR from its still-owed dirty record (a dead save had taken it out of the set), and released at the ack', J([hrS.length, n0, [...W.dm._dirtyDesks], W.lm._carriedAt('desk-hr')]));
    } finally { globalThis.fetch = realFetch; }
  }
  // ak2) verify r5 ⑤ — the same on the desktop ON SHOW (the real page's shape): the re-send is the very text the swallowed save carried
  if (want('ak2')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } } } }; // the server never saw the drag
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => server });
    try {
      for (const h of W.stateHandlers) h(true);
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); await W.lm._doAutoSave(); await tick(40); // an earlier save, acked
      server.desktops['desk-fin'].autoSave = JSON.parse(J(W.syncs('desk-fin')[0].state)); // the server's record IS that save's own text, chrome included (as on the real page): the re-send after the re-read spells exactly the swallowed text
      W.app._swallow = true;
      const w = W.wins.get('fin-2'); W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); w.gridBounds = GB(0.7, 0.7); w._boundsAt = Date.now(); W.lm.scheduleAutoSave(); // the drag on the desktop on show
      await tick(700);
      const n0 = W.syncs('desk-fin').length;
      leg(n0 >= 2 && (W.syncs('desk-fin')[n0 - 1].state.windows || []).find((x) => x.winId === 'fin-2')?.gridBounds?.left === 0.7 && W.lm._unacked.length === 1, '§4 the drag\'s save left on the (dead) socket — owed');
      W.app._swallow = false;
      W.app.ws.connected = false; for (const h of W.stateHandlers) h(false);
      await tick(100);
      W.app.ws.connected = true; for (const h of W.stateHandlers) h(true);
      await tick(800);
      leg(w.gridBounds.left === 0.7, '§4 verify r5 ⑤: the drag is kept over the re-read (held: the server never read its save)', J(w.gridBounds));
      await tick(2600);
      const finS = W.syncs('desk-fin');
      leg(finS.length > n0 && (finS[finS.length - 1].state.windows || []).find((x) => x.winId === 'fin-2')?.gridBounds?.left === 0.7 && W.lm._unacked.length === 0, '§4 …and RE-SENT after the reconnect although its text equals the last record sent — that send was never READ, so it is no no-op (the real page kept the drag and never re-sent it)', J([finS.length, n0, W.lm._unacked.length]));
    } finally { globalThis.fetch = realFetch; }
  }
  // ar) verify r5 ⑤ — a REFUSED record carries nothing: its desktop's acts stay held through the reconcile and the re-send's ack
  if (want('ar')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const kept = [...INCIDENT()['desk-hr'], R('hr-4'), R('hr-5')]; // the server's HR grew behind this page's back
    let refusedOnce = false; W.app._refuse = (m) => { if (m.desktopId === 'desk-hr' && !refusedOnce && ids(m.state).length < 5) { refusedOnce = true; return true; } return false; }; W.app._refuse.kept = kept;
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    W.dm.moveWindowToDesktop('fin-2', 'desk-hr');
    await tick(650); // the save left; HR refused, Fin acked
    leg(refusedOnce && W.lm._carriedAt('desk-fin') > 0 && W.lm._carriedAt('desk-hr') === 0, '§4 the HR record was refused and Fin\'s acked: Fin is carried, HR is not');
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 7, desktopId: 'desk-fin', receivedAt: Date.now(), state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); // a stale Fin record (fin-2 on Fin) right after the refusal
    await tick(100);
    leg(W.wins.get('fin-2')?._desktopId === 'desk-hr', '§4 verify r5 ⑤: the act on the REFUSED desktop stays held — a stale record cannot put fin-2 back on Fin (the send-stamp released it here)', W.wins.get('fin-2')?._desktopId);
    await tick(3000);
    const hrS = W.syncs('desk-hr');
    leg(hrS.length >= 2 && J(ids(hrS[hrS.length - 1].state).sort()) === J(['fin-2', 'hr-1', 'hr-2', 'hr-3', 'hr-4', 'hr-5']) && W.lm._carriedAt('desk-hr') > 0 && W.wins.get('fin-2')?._desktopId === 'desk-hr', '§4 …the reconcile re-sent HR = the server\'s 5 + the moved one, acked, carried', J([hrS.map((m) => ids(m.state)), W.lm._carriedAt('desk-hr')]));
  }
  // cj) verify r5 ① — THE CLOCK JUMP: the machine sleeps in the second after a drag (its save pending); at the wake the socket is dead, reconnects, re-reads
  if (want('cj')) {
    const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const server = () => ({ desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: W.syncs('desk-fin').length ? W.syncs('desk-fin')[W.syncs('desk-fin').length - 1].state.windows : [R('fin-1'), R('fin-2')] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } } } });
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => server() });
    try {
      for (const h of W.stateHandlers) h(true);
      for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', receivedAt: Date.now(), state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); // applied: the cooldown
      await tick(200);
      const w = W.wins.get('fin-2'); W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); w.gridBounds = GB(0.7, 0.7); w._boundsAt = Date.now(); W.lm.scheduleAutoSave(); // the drag (its save deferred under the cooldown, r3 ③)
      await tick(100);
      skew += 20 * 60 * 1000; // THE SLEEP: the wall clock leaps; the pending timers fire at the wake, at the new time
      W.app.ws.connected = false; for (const h of W.stateHandlers) h(false); // the socket died in the sleep
      await tick(1300);
      W.app.ws.connected = true; for (const h of W.stateHandlers) h(true); // the reconnect; the re-read
      await tick(1500);
      const sentBox = W.syncs('desk-fin').map((m) => (m.state.windows || []).find((x) => x.winId === 'fin-2')?.gridBounds?.left);
      leg(w.gridBounds.left === 0.7 && sentBox.includes(0.7), '§4 verify r5 ①: a drag made in the second before a SLEEP survives the wake — the clock watch re-armed its witness and the pending save\'s input time by the gap; the save left and the re-read kept it (every hold expired at once before: guard 2 dropped the save, the re-read reversed the box, nothing said)', J([w.gridBounds.left, sentBox]));
      leg(!toasts().some((m) => /not kept/.test(m)), '§4 …and nothing was "not kept"', J(toasts()));
    } finally { globalThis.fetch = realFetch; Date.now = realNow; }
  }
  // y) verify r3 ③ — a drop made in the second after another client's record landed (the apply's cooldown) is saved on its own
  if (want('y')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); // applied at once: the cooldown starts
    await tick(200);
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); // the pointerdown
    const n0 = W.sent.length;
    const r = W.dm.moveWindowToDesktop('fin-2', 'desk-hr'); // the drop, 200 ms into the cooldown (it calls scheduleAutoSave)
    leg(r.ok && r.moved, '§4 the drop (200 ms into the cooldown) moved fin-2 to HR');
    await tick(2600);
    const hrS = W.sent.slice(n0).filter((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr');
    leg(hrS.length >= 1 && ids(hrS[hrS.length - 1].state).includes('fin-2'), '§4 verify r3 ③: the move is saved on its own — a user act under the apply\'s cooldown is deferred past the gate, never dropped (it waited for the next act; a reload undid it)', J(W.sent.slice(n0).map((m) => [m.desktopId, ids(m.state)])));
  }
  // z) verify r3 ③ — a close made in the cooldown is the user's: held against an older record, the hidden desktop dirty, carried by the next save
  if (want('z')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    W.mkWin('hr-1', 'desk-hr', { _hiddenByDesktop: true }); // HR built once, hidden now
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } });
    await tick(200);
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    const n0 = W.sent.length;
    W.app.wm.closeWindow('fin-2'); W.app.wm.closeWindow('hr-1'); W.lm.scheduleAutoSave(); // the user closes a shown and a hidden window from the taskbar, 200 ms into the cooldown (wm._notify schedules the save)
    leg(W.lm._closeHeld('fin-2') && W.lm._closeHeld('hr-1'), '§4 verify r3 ③: a close made in the cooldown is HELD (noteClosed refused every close under _restoring — the apply\'s and the user\'s alike)');
    leg(W.dm._dirtyDesks.has('desk-hr'), '§4 …and HR (not on show) is dirty for it (purgeClosedWindow read the same gate)');
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 2, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); // an older record of Fin (captured before the close) deferred under the cooldown
    await tick(3600);
    leg(!W.wins.has('fin-2'), '§4 …the stale record does not re-create the closed window');
    const since = W.sent.slice(n0).filter((m) => m.type === 'layout-sync');
    const finS = since.filter((m) => m.desktopId === 'desk-fin'), hrS = since.filter((m) => m.desktopId === 'desk-hr');
    leg(finS.length >= 1 && !ids(finS[finS.length - 1].state).includes('fin-2') && hrS.length >= 1 && !ids(hrS[hrS.length - 1].state).includes('hr-1') && (finS[finS.length - 1].evidence || []).some((e) => e.id === 'fin-2' && e.why === 'closed'), '§4 …and the closes are carried by the next save (Fin without fin-2, HR without hr-1, evidence closed)', J(since.map((m) => [m.desktopId, ids(m.state), (m.evidence || []).map((e) => e.id + ':' + e.why)])));
  }
  // st) verify r3 ④ — the re-read fails for good: the user is told once, a stale base is never saved, the next success releases the held save
  if (want('st')) {
    const W = world(DM, LM, { records: INCIDENT() });
    let calls = 0, good = false;
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1')] } }, 'desk-hr': { autoSave: { windows: [R('hr-1'), R('hr-2'), R('hr-3'), R('hr-4')] } } } }; // hr-4 arrived during the outage
    const told = () => { try { return JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').map((h) => h.m).filter((m) => /could not be re-read/.test(m)); } catch { return []; } };
    const poll = async (pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await tick(50); } return pred(); };
    const realFetch = globalThis.fetch; globalThis.fetch = async () => { calls++; if (!good) return { ok: false, status: 503 }; return { ok: true, json: async () => server }; };
    try {
      for (const h of W.stateHandlers) h(true); for (const h of W.stateHandlers) h(false); for (const h of W.stateHandlers) h(true);
      leg(await poll(() => calls === 4 && W.lm._resyncStale === true, 12000), '§4 verify r3 ④: four attempts failed — the page knows its base is STALE', J([calls, W.lm._resyncStale]));
      leg(told().length === 1, '§4 verify r3 ④: the user is told ONCE (a toast) that the layout could not be re-read', J(told()));
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
      const n0 = W.sent.length;
      W.dm.moveWindowToDesktop('fin-1', 'desk-hr'); // the user drops fin-1 on HR — HR's held record does not know hr-4
      await tick(900);
      leg(!W.sent.slice(n0).some((m) => m.type === 'layout-sync'), '§4 verify r3 ④: a stale base is never saved — the save is HELD (it would have dropped hr-4, unknown to this page: the D2 class, below the belt after a restart)', J(W.sent.slice(n0).map((m) => [m.desktopId, ids(m.state)])));
      const c1 = calls;
      leg(await poll(() => calls > c1, 3000), '§4 …and the held save asked the read again');
      good = true; // the server is back
      leg(await poll(() => W.lm._resyncStale === false, 12000), '§4 …the next successful read ends the stale state');
      leg(await poll(() => W.sent.slice(n0).some((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr' && ids(m.state).includes('hr-4') && ids(m.state).includes('fin-1')), 3000), '§4 …and the held save goes out on the FRESH base (HR with hr-4 AND the moved fin-1)', J(W.sent.slice(n0).map((m) => [m.desktopId, ids(m.state)])));
      leg(told().length === 1, '§4 …told once, not on every held save');
    } finally { globalThis.fetch = realFetch; }
  }
  // ua) verify r4 ① — THE UNSAVED ACT: a drop, then a peer's record of the SOURCE desktop lands 100 ms later (no gate up; the drop's save 400 ms away)
  if (want('ua')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    const r = W.dm.moveWindowToDesktop('fin-2', 'desk-hr');
    leg(r.ok && r.moved, '§4 the drop moved fin-2 to HR');
    await tick(100);
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); // a peer's Fin record, captured before the drop, lands after it
    await tick(30);
    const w = W.wins.get('fin-2');
    leg(!!w && w._desktopId === 'desk-hr' && w._hiddenByDesktop === true, '§4 verify r4 ①: a record received AFTER the drop but captured before it does not put fin-2 back on Fin — THE UNSAVED ACT: no save has carried the move, so no peer could know it (it used to re-adopt the window and the apply\'s dirty clear swallowed the move\'s save)', w?._desktopId);
    await tick(3000);
    const hrS = W.syncs('desk-hr'), finS = W.syncs('desk-fin');
    leg(hrS.length >= 1 && ids(hrS[hrS.length - 1].state).includes('fin-2') && finS.length >= 1 && !ids(finS[finS.length - 1].state).includes('fin-2'), '§4 …and the move reaches the server (HR with fin-2, Fin without)', J([hrS.map((m) => ids(m.state)), finS.map((m) => ids(m.state))]));
  }
  // ub) verify r4 ① — the same for GEOMETRY: a drag released, a peer's record 100 ms later; then a drag under the cooldown vs a record deferred under it (the r3 ③ deferred save must carry the USER's box)
  if (want('ub')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const fin = (seq) => ({ type: 'layout-sync', seq, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2 + seq / 1000, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } });
    const w = W.wins.get('fin-2');
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); w.gridBounds = GB(0.7, 0.7); w._boundsAt = Date.now(); W.lm.scheduleAutoSave(); // window.js onUp: the stamp, the notify
    await tick(100);
    for (const h of W.handlers) h(fin(1));
    await tick(30);
    leg(w.gridBounds.left === 0.7 && w.gridBounds.top === 0.7, '§4 verify r4 ①: a record received after the release but captured before it does not snap fin-2 back (the drag\'s save had not left)', J(w.gridBounds));
    await tick(3000);
    const s1 = W.syncs('desk-fin'); const e1 = s1.length && (s1[s1.length - 1].state.windows || []).find((x) => x.winId === 'fin-2');
    leg(!!e1 && e1.gridBounds.left === 0.7, '§4 …and the drag reaches the server', J(e1?.gridBounds));
    // …under the cooldown: a record applied, the drag 200 ms in (save deferred), a second record 300 ms in (deferred under the cooldown)
    for (const h of W.handlers) h(fin(2));
    await tick(200);
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); w.gridBounds = GB(0.3, 0.6); w._boundsAt = Date.now(); W.lm.scheduleAutoSave();
    await tick(100);
    for (const h of W.handlers) h(fin(3));
    await tick(1500);
    leg(w.gridBounds.left === 0.3 && w.gridBounds.top === 0.6, '§4 verify r4 ①: the record deferred under the cooldown — received after the drag, captured before it — does not snap fin-2 back either', J(w.gridBounds));
    await tick(3000);
    const s2 = W.syncs('desk-fin'); const e2 = s2.length && (s2[s2.length - 1].state.windows || []).find((x) => x.winId === 'fin-2');
    leg(!!e2 && e2.gridBounds.left === 0.3, '§4 …and the deferred save (r3 ③) carries the USER\'s box — not the peer\'s written back as the user\'s', J(e2?.gridBounds));
  }
  // uc) verify r4 ① — a chatty peer (a Fin record every 400 ms for 3 s): the drop made meanwhile survives, HR goes out once the peer quiets
  if (want('uc')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    let seq = 0;
    const peer = setInterval(() => { for (const h of W.handlers) h({ type: 'layout-sync', seq: ++seq, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2 + seq / 1000, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }); }, 400);
    await tick(1000);
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    W.dm.moveWindowToDesktop('fin-2', 'desk-hr');
    const seen = new Set();
    for (let i = 0; i < 10; i++) { await tick(200); const w = W.wins.get('fin-2'); seen.add(w ? w._desktopId : 'gone'); }
    clearInterval(peer);
    leg(seen.size === 1 && seen.has('desk-hr'), '§4 verify r4 ①: under a peer saving every 400 ms the drop is never re-adopted onto Fin (it used to bounce Fin ⇄ HR on every record)', J([...seen]));
    await tick(3200);
    const hrS = W.syncs('desk-hr');
    leg(hrS.length >= 1 && ids(hrS[hrS.length - 1].state).includes('fin-2'), '§4 …and HR with fin-2 goes out once the peer quiets (the deferred save is bounded by the peer\'s silence, not starved for good)', J(hrS.map((m) => ids(m.state))));
  }
  // ue) verify r4 ② — a window ON the desktop on show, listed by its record AND by another desktop's stale held record (a double): the record of the desktop on show wins
  if (want('ue')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': [...INCIDENT()['desk-hr'], R('fin-2', { gridBounds: GB(0.9, 0.9) })] } }); // HR's held record lists fin-2 too (this page's own expired move, a racing peer record)
    for (const h of W.handlers) h({ type: 'layout-sync', seq: 1, desktopId: 'desk-fin', state: { windows: [R('fin-1', { gridBounds: GB(0.2, 0.2) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } });
    await tick(30);
    const w = W.wins.get('fin-2');
    leg(!!w && w._desktopId === 'desk-fin' && !w._hiddenByDesktop, '§4 verify r4 ②: a window the record of the desktop on show LISTS stays on it — adoptRemoteMove told the destination never falls through to the held-record search (`to === from` moved it OUT to the desktop whose stale held record also listed it: the Fin ⇄ HR bounce)', w ? w._desktopId + (w._hiddenByDesktop ? '(h)' : '') : 'gone');
  }
  // st2) verify r4 ④ — the stale hold outlives the 60 s expiry: at the release the page FOLLOWS the server (an expired witness holds nothing) and says how many changes were not kept
  if (want('st2')) {
    const W = world(DM, LM, { records: { 'desk-fin': [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })], 'desk-hr': INCIDENT()['desk-hr'] } });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1', { gridBounds: GB(0.1, 0.1) }), R('fin-2', { gridBounds: GB(0.5, 0.1) })] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } } } }; // the server never heard the acts
    const told = () => { try { return JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').map((h) => h.m).filter((m) => /were not kept/.test(m)); } catch { return []; } };
    const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => server });
    try {
      clearToasts(); // the toast history is the fake page's localStorage, shared by every world of this run
      for (const h of W.stateHandlers) h(true);
      W.lm._resyncStale = true; W.lm._staleTold = true; W.lm._resyncing = true; // the state leg st proves the ladder reaches: the re-read failed, the user was told, a retry in flight (so the held save asks no second ladder here)
      W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
      W.dm.moveWindowToDesktop('fin-2', 'desk-hr'); W.app.wm.closeWindow('fin-1'); W.lm.scheduleAutoSave(); // two acts on the stale page: held
      await tick(900);
      leg(!W.sent.some((m) => m.type === 'layout-sync') && W.lm._closeHeld('fin-1') && W.wins.get('fin-2')?._desktopId === 'desk-hr', '§4 verify r4 ④: the move and the close are held on the stale page (nothing sent)');
      skew = 61000; W.lm._clockLast = Date.now(); W.lm._resyncing = false; // a minute passes WITH THE PAGE RUNNING (the clock watch saw it tick — verify r5 ①: a sleep is re-armed, a run minute expires) — past ACT_HOLD_MS / CLOSE_HOLD_MS; the ladder gave up meanwhile (the state after its last retry)
      for (const h of W.stateHandlers) h(false); for (const h of W.stateHandlers) h(true); // the socket back: the reconnect re-reads, the server answers
      const poll = async (pred, ms) => { const t0 = realNow(); while (realNow() - t0 < ms) { if (pred()) return true; await tick(50); } return pred(); };
      leg(await poll(() => W.lm._resyncStale === false, 5000), '§4 verify r4 ④: the re-read succeeded — the stale episode ended');
      await tick(2600);
      const w2 = W.wins.get('fin-2');
      leg(!!w2 && w2._desktopId === 'desk-fin' && !w2._hiddenByDesktop && W.wins.has('fin-1'), '§4 verify r4 ④: the page FOLLOWS the server — the expired move is not held (fin-2 back on Fin, shown) and the expired close is not held (fin-1 built again); before ①\'s bound the move stayed displayed on HR while nothing sent it (a fork a reload resolved by losing it)', J([w2?._desktopId, W.wins.has('fin-1')]));
      leg(!W.sent.some((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr' && ids(m.state).includes('fin-2')), '§4 …no save carries the expired move (guard 2\'s expiry keeps its meaning)');
      leg(told().length === 1 && /were not kept \(2\)/.test(told()[0]), '§4 verify r4 ④: the user is told ONCE how many changes were not kept (the stale toast had promised "held until it can be")', J(told()));
      // verify r5 ④: a SECOND stale episode with nothing new held — the acts already counted are not counted (and toasted) again
      W.lm._resyncStale = true; W.lm._staleTold = true; W.lm._resyncing = true;
      skew += 61000; W.lm._clockLast = Date.now(); W.lm._resyncing = false; // another run minute
      for (const h of W.stateHandlers) h(false); for (const h of W.stateHandlers) h(true);
      leg(await poll(() => W.lm._resyncStale === false, 5000), '§4 verify r5 ④: a second stale episode ended');
      await tick(600);
      leg(told().length === 1, '§4 verify r5 ④: the acts counted at the first release are RETIRED — a second release with nothing new says nothing (the same expired move was counted and toasted again before)', J(told()));
    } finally { globalThis.fetch = realFetch; Date.now = realNow; }
  }
  // orph) verify r3 (the revert table): a record the server still holds for a desktop its meta no longer names (a pre-r2 ⑦ orphan on disk) rides the re-read — the page holds nothing for it
  if (want('orph')) {
    const W = world(DM, LM, { records: INCIDENT() });
    const server = { desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }], desktops: { 'desk-fin': { autoSave: { windows: [R('fin-1')] } }, 'desk-hr': { autoSave: { windows: INCIDENT()['desk-hr'] } }, 'desk-gone': { autoSave: { windows: [R('gone-1')] } } } };
    const realFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => server });
    try {
      await W.lm._resyncFromServer();
      leg(!W.dm._savedStates.has('desk-gone') && !W.dm._wireIds.has('desk-gone') && !W.wins.has('gone-1'), '§4 verify r3: an orphan record (no meta names its desktop) on the re-read leaves no held record, no wire base and no window — _setRecord and noteWire refuse a desktop the page does not know (r2 ④)', J([[...W.dm._savedStates.keys()], [...W.dm._wireIds.keys()]]));
    } finally { globalThis.fetch = realFetch; }
  }
  return failed;
}
console.log('— §4 THE DOORS on the real DesktopManager + LayoutManager (a fake app)');
const doorFailed = await doorLegs(RealDM, RealLM);

// ── §5 THE RAW-WRITER CENSUS ─────────────────────────────────────────────────────────────────────────────────────
const CENSUS_FILES = ['src/lib/desktop-manager.js', 'src/lib/layout.js', 'src/lib/session-lifecycle.js', 'src/lib/stage-manager.js'];
const RAW = [
  { kind: 'cache-set', re: /\b_savedStates\.set\(/ },
  { kind: 'windows-assign', re: /\.windows\s*=(?!=)/ },
  { kind: 'windows-mutate', re: /\.windows\.(push|splice|unshift|pop|shift|sort|reverse|fill|copyWithin)\(/ },
  { kind: 'held-write', re: /\.\s*_setRecord\(/ },
];
// every held-record write that is NOT a merge / recordFor result on its own line — each named, with why
const ALLOWED = [
  ['src/lib/desktop-manager.js', 'this._savedStates.set(desktopId, record);', 'cache-set', '_setRecord: THE ONE WRITER'],
  ['src/lib/desktop-manager.js', 'this._setRecord(firstId, legacyState);', 'held-write', 'boot: the legacy top-level record the server sent, as it is'],
  ['src/lib/desktop-manager.js', "if (id !== '__stage__' && dState.autoSave) { this._setRecord(id, dState.autoSave);", 'held-write', 'boot: each desktop\'s record the server sent, as it is'],
  ['src/lib/desktop-manager.js', 'this._setRecord(desktopId, state);', 'held-write', 'noteSent: the record recordFor made that just left this page'],
  ['src/lib/desktop-manager.js', 'this._setRecord(this._activeId, currentState);', 'held-write', 'switchTo: `currentState = this.recordFor(this._activeId)` on the line above'],
];
function census(srcs) {
  const out = [];
  for (const [rel, text] of srcs) {
    text.split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      for (const r of RAW) {
        if (!r.re.test(l)) continue;
        const merged = r.kind === 'held-write' && /\bmergeDesktopRecord\(|\brecordFor\(/.test(l);
        const row = ALLOWED.find(([f, snip, kind]) => f === rel && kind === r.kind && l.includes(snip));
        out.push({ at: `${rel}:${i + 1}`, kind: r.kind, ok: merged || !!row, row, line: l.trim().slice(0, 140) });
      }
    });
  }
  return out;
}
const sources = (over = {}) => CENSUS_FILES.map((f) => [f, over[f] != null ? over[f] : read(f)]);
console.log('— §5 THE RAW-WRITER CENSUS (a new raw writer of a desktop record is RED by name)');
{
  const sites = census(sources());
  const bad = sites.filter((s) => !s.ok);
  ok(sites.length >= 10 && !bad.length, `§5 every write of a held desktop record (${sites.length}) is the ONE writer, a merge / recordFor result, or named here with why`, J(bad));
  ok(sites.filter((s) => s.kind === 'cache-set').length === 1, '§5 exactly ONE `_savedStates.set(` in the four files (inside _setRecord)', J(sites.filter((s) => s.kind === 'cache-set')));
  ok(!sites.some((s) => s.kind === 'windows-assign' || s.kind === 'windows-mutate'), '§5 no `.windows =` / `.windows.push(…)` on a record anywhere in them (the pre-fix `cached.windows = wins`, `st.windows = kept`, `currentState.windows.push(pw)`)');
  const used = new Set(sites.map((s) => s.row).filter(Boolean));
  ok(ALLOWED.every((r) => used.has(r)) && ALLOWED.every((r) => r[3].length >= 8), '§5 no dead allowlist row; every row says why', J(ALLOWED.filter((r) => !used.has(r)).map((r) => r[1])));
}

// ── §6 WIRING ────────────────────────────────────────────────────────────────────────────────────────────────────
/** verify r3 ①: window.js's two `_boundsAt` stamps — the drag's AFTER the drag threshold gate, the resize's behind `resized`. */
const geomWitnessPin = (src) => {
  const gate = src.indexOf('      if (!dragging) return;\n      dragging = false;\n');
  const stamp = src.indexOf('      win._boundsAt = Date.now();\n');
  return gate > 0 && stamp > gate && stamp - gate < 900 && /if \(resized\) win\._boundsAt = Date\.now\(\);/.test(src) && /pendingEv = e; resized = true;/.test(src) && (src.match(/_boundsAt = Date\.now\(\)/g) || []).length === 3 && /witnessGeometry\(id\) \{\s*const w = this\.windows\.get\(id\); if \(!w\) return;\s*w\._boundsAt = Date\.now\(\);/.test(src); // the two pointer stamps + the ONE helper the user doors call (verify r4 ③)
};
/** verify r4 ③: THE USER DOORS of a geometry act stamp the witness — the title-bar buttons + double-click, snapToHalf (command mode's arrows),
 *  a named window's restore, move mode's restore + placement, the taskbar's minimize / Restore-Minimize row, command mode's m and its cycle's restore. */
const geomDoorsPin = (W, TB, CM) => [
  /this\.witnessGeometry\(winInfo\.id\); this\.minimize\(winInfo\.id\);/.test(W),
  /this\.witnessGeometry\(winInfo\.id\); this\.toggleMaximize\(winInfo\.id\); \};/.test(W),
  /if \(!e\.target\.closest\('\.window-controls'\)\) \{ this\.witnessGeometry\(winInfo\.id\); this\.toggleMaximize\(winInfo\.id\); \}/.test(W),
  /snapToHalf\(winId, side\) \{\s*const win = this\.windows\.get\(winId\); if \(!win\) return;\s*this\.witnessGeometry\(winId\);/.test(W),
  /if \(host\.isMinimized\) \{ this\.witnessGeometry\(focusId\); this\.restore\(focusId\); \}/.test(W),
  /if \(win\.isMinimized\) \{ this\.witnessGeometry\(id\); this\.restore\(id\); \}/.test(W),
  /this\.witnessGeometry\(win\.id\);[^\n]*\n\s*this\._captureGridBounds\(win\);\s*this\._notify\(\);/.test(W),
  /\{ app\.wm\.witnessGeometry\?\.\(id\); app\.wm\.minimize\(id\); \}/.test(TB),
  /run: \(c\) => \{ c\.app\.wm\.witnessGeometry\?\.\(c\.id\); c\.win\.isMinimized \? c\.app\.wm\.restore\(c\.id\) : c\.app\.wm\.minimize\(c\.id\); \}/.test(TB),
  /\{ wm\.witnessGeometry\?\.\(wm\.activeWindowId\); wm\.toggleMaximize\(wm\.activeWindowId\); \}/.test(CM),
  /\{ wm\.witnessGeometry\?\.\(nextId\); wm\.restore\(nextId\); \}/.test(CM),
];
/** verify r5 ③: the doors r4 ③ missed — a layout preset (applyLayout), command mode's digits (snapActiveToCell), the tab tear-off's drop
 *  (tab-group _setupTabDrag), a desktop app's own □ / ▁ (desktop-app-window onAppState), a named preset (layout.js loadPreset ×2). */
const geomDoorsPin2 = (W, TG, DA, L) => [
  /this\.witnessGeometry\(w\.id\);[^\n]*\n\s*this\._positionToCell\(w, cellIdx, true\);/.test(W),
  /this\.witnessGeometry\(win\.id\);[^\n]*\n\s*this\._positionToCell\(win, cellIdx, true\);/.test(W),
  /this\.witnessGeometry\(winId\);[^\n]*\n\s*let snapped = false;/.test(TG),
  /if \(act\) app\.wm\.witnessGeometry\?\.\(winInfo\.id\);[^\n]*\n\s*if \(act === 'maximize' \|\| act === 'restore'\) app\.wm\.toggleMaximize\(winInfo\.id\);/.test(DA),
  /this\.app\.wm\.witnessGeometry\?\.\(winInfo\.id\);[^\n]*\n\s*\/\/ Restore from minimized if preset says it should be visible/.test(L),
  /this\.app\.wm\.witnessGeometry\?\.\(id\);[^\n]*\n\s*this\.app\.wm\.minimize\(id\);/.test(L),
];
/** verify r5 ③: THE GEOMETRY DOOR CENSUS — grep-derived over every call of a geometry primitive in src/lib (`wm.X(` / `this.X(`): a site
 *  is a call INTO a self-stamping verb (its body stamps — pinned), a site that stamps the witness within the four lines above it, a call
 *  from inside a primitive's own body, or a MACHINE path named in GEOM_MACHINE with its reason. Anything else is a door added without
 *  a witness — RED by file:line. */
const GEOM_PRIMS = ['toggleMaximize', 'minimize', 'restore', 'snapToHalf', 'snapActiveToCell', 'applyLayout', '_snapToGrid', '_snapToGridRange', '_applySnap', '_positionToCell'];
const GEOM_SELF = ['snapToHalf', 'snapActiveToCell', 'applyLayout', 'startMoveMode', 'revealWindow', 'loadPreset'];
const GEOM_MACHINE = [
  ['layout.js', '_applyRemoteState', "the apply of a record — a witness here would hold another client's act for a minute (r3 ①)"],
  ['layout.js', '_createRemoteWindow', 'the apply creating a window the record lists, at its recorded state'],
  ['layout.js', 'restoreState', 'the boot / a replay restoring a record'],
  ['session-lifecycle.js', 'createSession', 'a resumed window placed by its record (a replay)'],
  ['session-lifecycle.js', '_focusExistingSession', 'a replay found the window minimized (`replay` only; the user path is revealWindow, which stamps)'],
  ['stage-manager.js', '_borrowHero', "the Stage's borrow: a record never applies geometry while staged"],
  ['stage-manager.js', '_handBackHero', "the Stage's return"],
  ['stage-manager.js', '_giveHome', "the Stage hands a split borrowed frame's half its HOME (lane stage-blank r3–r5: a re-maximize over the home px, as _handBackHero does) — the Stage's own placement, never a user act (2.369.199 integration)"],
  ['window.js', '_putBackAfterRefusedDrop', 'a refused drop puts the window back where the drag began — the drag stamped its own witness'],
  ['window.js', '_setupDrag', "the title-bar drag's drop (snap / grid cell / range) — stamped at its pointerup above the drop"],
];
function geomDoorCensus(files) {
  const out = [];
  for (const [file, src] of Object.entries(files)) {
    const lines = src.split('\n'); let enclosing = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = /^  (?:async )?([A-Za-z_]\w*)\(.*\) \{$/.exec(l) || /^(?:export )?(?:async )?function ([A-Za-z_]\w*)\(/.exec(l);
      if (m) enclosing = m[1];
      if (/^\s*\/\//.test(l)) continue;
      const re = new RegExp(`\\b(?:wm|this)\\.(${GEOM_PRIMS.join('|')})\\(`, 'g'); let c;
      while ((c = re.exec(l))) {
        const verb = c[1], above = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        const verdict = GEOM_SELF.includes(verb) ? 'self' : /witnessGeometry|_boundsAt = Date\.now\(\)/.test(above) ? 'witnessed' : (GEOM_PRIMS.includes(enclosing) || GEOM_SELF.includes(enclosing)) ? 'inner' : GEOM_MACHINE.some(([f, en]) => f === file && en === enclosing) ? 'machine' : null;
        out.push({ file, line: i + 1, verb, enclosing, verdict });
      }
    }
  }
  return out;
}
const libFiles = () => Object.fromEntries(fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => [f, read('src/lib/' + f)]));
/** every self-stamping verb's body stamps (the census trusts the name). */
const selfStampPin = (W, L) => GEOM_SELF.every((v) => { const src = v === 'loadPreset' ? L : W; const i = src.search(new RegExp(`^  (?:async )?${v}\\(`, 'm')); if (i < 0) return false; const body = src.slice(i, src.indexOf('\n  }\n', i)); return /witnessGeometry\??\.?\(/.test(body); });
console.log('— §6 wiring: every door, the belt, the refusal route, the rollback change');
{
  const W = read('src/lib/window.js'), D = read('src/lib/desktop-manager.js'), CM = read('src/lib/command-mode.js'), SL = read('src/lib/session-lifecycle.js'), L = read('src/lib/layout.js'), WS = read('src/ws-handler.js'), PR = read('src/routes/persistence.js'), SM = read('src/lib/stage-manager.js');
  ok(/dm\.moveWindowToDesktop\(win\.id, targetDeskId\);/.test(W) && /if \(winId\) this\.moveWindowToDesktop\(winId, desk\.id, \{ speak: true \}\);/.test(D) && /action: \(\) => this\.moveWindowToDesktop\(winId, d\.id, \{ speak: true \}\)/.test(D) && /dm\.moveWindowToDesktop\(wm\.activeWindowId, dm\.desktops\[next\]\.id, \{ speak: true \}\)/.test(CM), '§6 the doors — the title-bar drop, a taskbar drop, the menu, command mode d/D — all reach moveWindowToDesktop (the one move)');
  ok(/dm\.moveWindowToDesktop\(winInfo\.id, destDesktop, \{ replaces: winBounds\.winId \|\| null \}\)/.test(SL) && /desktopId: meta\.id, winId: ws\.winId \|\| ws\.id \|\| null \}/.test(L), '§6 resume placement passes the old record entry it REPLACES (scanStoppedInDesktopStates carries its winId)');
  ok(/this\._updateCachedDesktop\(desktopId, \{ from, ids: members\.map\(\(m\) => m\.id\), replaces: replaces \? \[replaces\] : \[\] \}\);/.test(D), '§6 moveWindowToDesktop hands _updateCachedDesktop the source, the moved chain and what it replaces');
  ok(/for \(const d of dm\?\.takeDirty\?\.\(\) \|\| \[\]\) \{\s*const st = dm\.recordFor\(d\);\s*this\.app\.ws\.send\(\{ type: 'layout-sync', state: st, desktopId: d, evidence: dm\.evidence\(\), sentAt \}\);/.test(L), '§6 _doAutoSave sends each changed desktop it does not show from its HELD record (recordFor), with the evidence (and the save\'s sentAt — verify r5 ⑤)');
  ok(/const state = dm\?\.recordFor && desktopId \? dm\.recordFor\(desktopId\) : this\.captureState\(\);/.test(L) && /evidence: dm\?\.evidence\?\.\(\) \|\| \[\], sentAt \}\);/.test(L), '§6 …and the desktop on show through recordFor too (the held record merged with the page), with the evidence');
  ok(/ws\.send\(JSON\.stringify\(\{ type: 'layout-sync-ack', desktopId: desktopId \|\| null, sentAt: data\.sentAt \?\? null, seq: layoutSyncSeqRef\.value \}\)\);/.test(WS) && WS.indexOf("type: 'layout-sync-ack'") > WS.indexOf('writeLayouts(layoutData);\n          // Broadcast to other clients') && /if \(msg\.type === 'layout-sync-ack'\) \{ this\._onLayoutAnswer\(msg\.desktopId, msg\.sentAt, \{ refused: false \}\); return; \}/.test(L) && /if \(msg\.type === 'layout-sync-refused'\) \{ this\._onLayoutAnswer\(msg\.desktopId, msg\.sentAt, \{ refused: true \}\); return; \}/.test(L) && (L.match(/this\.noteLayoutSent\(sentDesks, sentAt\);/g) || []).length === 2 && /this\.app\.layoutManager\?\.noteLayoutSent\?\.\(\[desktopId\], sentAt\);/.test(D) && !/_movesSentAt = Date\.now\(\)/.test(L) && !/_releaseHeldCloses\(d\);/.test(L) && /if \(refused\) s\.refused\.add\(key\);/.test(L) && /if \(!s\.refused\.has\(d\)\) this\._markCarried\(d, s\.sentAt\);/.test(L) && /this\.app\.desktopManager\?\.noteCarried\?\.\(key\);/.test(L) && /const ACK_WAIT_MS = 2000;/.test(L) && /if \(!this\._serverAcks && s\.at != null && now - s\.at > ACK_WAIT_MS\)/.test(L), '§6 verify r5 ⑤: THE ACK — the server answers every layout-sync it wrote with `layout-sync-ack {desktopId, sentAt}` AFTER the write; every record the client sends (the autosave\'s, the switch\'s) is owed an answer; an ack carries the acts of that save (a refusal carries nothing); the held closes, ratios and the dirty desks are released at the ack, never at the send; an older server that answers nothing is given ACK_WAIT_MS on an open socket, then today\'s rule');
  ok(/const currentState = this\.recordFor\(this\._activeId\);/.test(D) && /dm\._setRecord\(this\._prevDesktopId, dm\.recordFor\(this\._prevDesktopId\)\);/.test(SM), '§6 the switch\'s and the Stage\'s capture of the desktop being left go through recordFor');
  ok(/else if \(msg\.type === 'layout-sync-refused'\) this\.onSyncRefused\(msg\);/.test(D), '§6 the client routes `layout-sync-refused` to onSyncRefused');
  const beltAt = WS.indexOf('const v = shrinkVerdict({ prev: stored.windows, next: data.state.windows, evidence: data.evidence, alive: (sid) => activeSessions.has(sid), recent: recentArrivals(desktopId, ws) });');
  const writeAt = WS.indexOf('layoutData.desktops[desktopId].autoSave = { ...data.state, updatedAt: Date.now() };');
  ok(/const \{ shrinkVerdict, windowIds \} = require\('\.\/lib\/desktop-record\.js'\);/.test(WS) && beltAt > 0 && writeAt > beltAt, '§6 ws-handler asks the PURE belt BEFORE it writes the desktop record');
  ok(/if \(!v\.ok\) \{[\s\S]{0,1200}ws\.send\(JSON\.stringify\(\{ type: 'layout-sync-refused', desktopId, reason: v\.reason, unexplained: v\.unexplained, arrived: v\.arrived \|\| \[\], state: stored, sentAt: data\.sentAt \?\? null \}\)\);[\s\S]{0,40}break;/.test(WS), '§6 …a refusal tells the SENDER (with the record the server kept, and which drops were arrivals), writes nothing and broadcasts nothing (break)');
  const noteAt = WS.indexOf('noteArrivals(desktopId, windowIds(layoutData.desktops[desktopId].autoSave || null), windowIds(data.state.windows), ws);');
  ok(noteAt > beltAt && noteAt < writeAt && /layoutArrivals\.delete\(data\.desktopId\);/.test(WS) && /const ARRIVAL_TTL_MS = 10 \* 60 \* 1000;/.test(WS) && /if \(a\.by !== me\) out\.push\(id\);/.test(WS), '§6 verify r1: what a write ADDS is remembered per desktop against every OTHER socket for 10 min (the belt\'s `recent`), noted after the verdict and before the write; a deleted desktop forgets them');
  ok(/if \(this\._restoring \|\| this\._pointerDown\) \{ this\._deferRemote\(msg\); return; \}/.test(L) && /this\._pendingRemote\.set\(msg\.desktopId \|\| '', msg\);/.test(L) && !/if \(msg\.type !== 'layout-sync' \|\| this\._restoring\) return;/.test(L), '§6 verify r1: a layout-sync under a gate is deferred PER DESKTOP (never dropped under `_restoring`, never one slot for all)');
  ok(/if \(this\._connects\+\+ > 0\) setTimeout\(\(\) => this\._resyncFromServer\(\), 250\);/.test(L) && /this\._applyRemoteState\(msg\.state, \{ closeOnlyWired: !!msg\.resync, receivedAt \}\);/.test(L) && /if \(closeOnlyWired && !this\.app\.desktopManager\?\.wireListed\?\.\(activeDesk, id\)\) continue;/.test(L), '§6 verify r1: a reconnect re-reads /api/layouts through the ordinary inbound path, closing only what the wire listed');
  ok(/msg\.receivedAt = Date\.now\(\);/.test(L) && /const receivedAt = msg\.receivedAt \?\? Date\.now\(\);/.test(L) && (L.match(/if \(this\.actHeld\(win\._movedAt, receivedAt, win\)\) \{ heldMoved = true; continue; \}/g) || []).length === 2 && /if \(heldMoved\) setTimeout\(\(\) => this\._resendHeldMove\(\), 1000\);/.test(L) && /dm\.cacheRemoteState\(msg\.desktopId, msg\.state, \{ receivedAt \}\);/.test(L) && /&& !this\.app\.layoutManager\?\.actHeld\?\.\(w\._movedAt, receivedAt, w\)\)/.test(D) && /m\._movedAt = movedAt;/.test(D), '§6 verify r2: THE HELD MOVE — every inbound record is stamped when it lands, a move stamps its windows, the apply\'s update loop / close loop and the cached sweep skip a window moved after the record arrived, and the move is re-sent once');
  ok((W.match(/win\._boundsAt = Date\.now\(\);/g) || []).length === 2 && /const heldGeom = this\.actHeld\(win\._boundsAt, receivedAt, win\);/.test(L) && /if \(rw\.gridBounds && !heldGeom\) \{/.test(L) && /const t = Math\.max\(w\._movedAt \|\| 0, w\._boundsAt \|\| 0\);/.test(L), '§6 verify r2 ⑩: THE HELD GEOMETRY — window.js stamps the drag\'s and the resize\'s pointerup, the apply keeps the user\'s box / maximize / minimize over a record received before it, and the re-send carries it');
  ok(/return t >= receivedAt \|\| t > \(win \? this\._carriedAt\(win\._desktopId\) : \(this\._movesSentAt \|\| 0\)\);/.test(L) && /if \(!\(t > 0\) \|\| Date\.now\(\) - t > ACT_HOLD_MS\) return false;/.test(L) && /const ACT_HOLD_MS = 60000;/.test(L), '§6 verify r4 ①: THE UNSAVED ACT — a witness holds over a record while no save the server READ has carried the act (the window\'s desktop `_carriedAt`, verify r5 ⑤), or when the record landed before it; bounded by ACT_HOLD_MS (guard 2\'s expiry)');
  ok(/if \(to\) \{[\s\S]{0,700}if \(to === from \|\| to === '__stage__'\) return null;\s*dest = to;\s*\} else \{/.test(D), '§6 verify r4 ②: adoptRemoteMove told the destination answers it or nothing — the held-record search is the close loop\'s and the sweep\'s alone');
  { const doors = geomDoorsPin(W, read('src/lib/taskbar.js'), CM); ok(doors.every(Boolean), '§6 verify r4 ③: every USER door of a geometry act stamps the witness (the □ / ▁ buttons, the double-click, snapToHalf, a named window\'s restore, move mode, the taskbar row + menu, command mode m + cycle) — and no programmatic caller does (the apply, the boot, a replay, a preset, the Stage)', J(doors)); }
  { const lp = L.search(/^  async loadPreset\(name\) \{/m), lpEnd = L.indexOf('\n  }\n', lp); const inPreset = (L.slice(lp, lpEnd).match(/witnessGeometry/g) || []).length;
    ok(lp > 0 && inPreset === 2 && (L.match(/witnessGeometry/g) || []).length === 2 && !/witnessGeometry/.test(SM) && !/witnessGeometry/.test(SL), '§6 verify r4 ③ / r5 ③: …the apply / the boot restore (layout.js) stamp nothing — its ONLY stamps are the named preset\'s (loadPreset, a user\'s click); the Stage and a session replay never stamp (a replay-stamped witness would hold another client\'s act for a minute and re-send the old state over it)', J([lp, inPreset, (L.match(/witnessGeometry/g) || []).length])); }
  { const TG = read('src/lib/tab-group.js'), DA = read('src/lib/desktop-app-window.js'); const d2 = geomDoorsPin2(W, TG, DA, L); ok(d2.every(Boolean), '§6 verify r5 ③: the doors r4 ③ missed stamp the witness — a layout preset (applyLayout, every window it places), command mode\'s digits (snapActiveToCell), the tab tear-off\'s drop, a desktop app\'s own □ / ▁, a named preset (loadPreset: each placed window + each one it minimizes)', J(d2)); }
  ok(selfStampPin(W, L), '§6 verify r5 ③: every verb the census trusts by name stamps in its own body (snapToHalf, snapActiveToCell, applyLayout, startMoveMode, revealWindow, loadPreset)');
  { const TG = read('src/lib/tab-group.js'); const bodyOf = (v) => { const i = TG.search(new RegExp(`^  ${v}\\(`, 'm')); return i < 0 ? '' : TG.slice(i, TG.indexOf('\n  },\n', i)); };
    const stamping = ['createTabChain', 'addToTabChain', 'bindSplit', 'unbindSplit', 'swapSplit', 'moveTabInChain', '_restoreChainLayout'], silent = ['applyChainRecord', 'restoreTabChain', '_detachFromChain', '_ungroupLast', 'removeFromTabChain'];
    ok(stamping.every((v) => /this\.witnessChain\(chain/.test(bodyOf(v))) && silent.every((v) => !/witnessChain/.test(bodyOf(v))) && /onTornOff\?\.\(win, frame\); \} catch[^\n]*\n\s*this\.witnessChain\(chain, \[winId\]\);/.test(TG) && /witnessChain\(chain, extra = \[\]\) \{\s*const t = Date\.now\(\);\s*for \(const id of \[\.\.\.\(\(chain && chain\.tabs\) \|\| \[\]\), \.\.\.extra\]\) \{ const w = this\.windows\.get\(id\); if \(w\) w\._chainAt = t; \}/.test(TG), '§6 verify r5 ②: THE CHAIN WITNESS — every structural verb of a group stamps it (createTabChain, addToTabChain, bindSplit, unbindSplit, swapSplit, moveTabInChain, the Undo\'s _restoreChainLayout, the tear-off\'s detach site with the window that left); the apply\'s and the restore\'s paths (applyChainRecord, restoreTabChain, _detachFromChain, _ungroupLast, removeFromTabChain) never do', J([stamping.filter((v) => !/this\.witnessChain\(chain/.test(bodyOf(v))), silent.filter((v) => /witnessChain/.test(bodyOf(v)))]));
    ok(/if \(this\.actHeld\(w\._chainAt, receivedAt, w\)\) \{ heldKept = true; continue; \}/.test(L) && /return m && this\.actHeld\(m\._chainAt, receivedAt, m\); \}\)\) \{ heldKept = true; continue; \}/.test(L) && /w\._chainAt > this\._carriedAt\(w\._desktopId\) && now - w\._chainAt <= ACT_HOLD_MS\) at = Math\.max\(at, w\._chainAt\);/.test(L) && /Math\.max\(w\._movedAt \|\| 0, w\._boundsAt \|\| 0, w\._chainAt \|\| 0\)/.test(L) && /if \(fresh\(w\._chainAt\) && w\._chainAt > carried\) \{ w\._chainAt \+= gap; n\+\+; \}/.test(L), '§6 verify r5 ②: …the apply keeps a held group as it is (the break loop) and never rebuilds a record\'s group around a held member (the create loop); the held chain is re-sent, counted at a stale release and re-armed after a sleep like every witness'); }
  { const rows = geomDoorCensus(libFiles()); const bad = rows.filter((r) => !r.verdict); ok(rows.length >= 35 && bad.length === 0, `§6 verify r5 ③: THE GEOMETRY DOOR CENSUS — every call of a geometry primitive in src/lib (${rows.length} sites) is a self-stamping verb, a witnessed door, a primitive's own body or a named machine path; a new door without a witness is RED by name`, J(bad.map((r) => `${r.file}:${r.line} ${r.verb} in ${r.enclosing}`)));
    ok(GEOM_MACHINE.every(([f, en]) => rows.some((r) => r.file === f && r.enclosing === en && r.verdict === 'machine')), '§6 …and no dead machine row (every allowlisted path still has a site)', J(GEOM_MACHINE.filter(([f, en]) => !rows.some((r) => r.file === f && r.enclosing === en)))); }
  ok(geomWitnessPin(W), '§6 verify r3 ①: the geometry witness is stamped only by a press that DRAGGED (after `if (!dragging) return;`) or a handle press that MOVED (`if (resized)`) — a click-to-focus on a title bar holds no geometry');
  ok(/this\.app\.desktopManager\?\.adoptRemoteMove\?\.\(win, win\._desktopId, \{ to: this\.app\.desktopManager\.activeDesktopId, rec: rw \}\);/.test(L) && /if \(this\.app\.desktopManager\?\.adoptRemoteMove\?\.\(win, activeDesk\)\) continue;/.test(L) && /\.filter\(\(w\) => !this\.adoptRemoteMove\(w, desktopId\)\)/.test(D), '§6 verify r1: a remote move is adopted at all three sites — the apply\'s update loop (in), its close loop (out), the cached record\'s gone sweep');
  ok(/const \{ desktopChanges \} = require\('\.\.\/lib\/desktop-record\.js'\);/.test(PR) && /snapshotLayout\(_lastGood, nextShape, data\);/.test(PR) && /totalWindows: total, change \}\);/.test(PR), '§6 a rollback point records the change that FOLLOWED it (routes/persistence.js; its own legs: test-layout-history)');
  const orphanAt = WS.indexOf("if (desktopId && Array.isArray(layoutData.desktopMeta) && layoutData.desktopMeta.length && !layoutData.desktopMeta.some((d) => d && d.id === desktopId)) {");
  ok(orphanAt > 0 && orphanAt < beltAt && /reason: 'no-such-desktop', desktops: layoutData\.desktopMeta, sentAt: data\.sentAt \?\? null \}\)\);[\s\S]{0,40}break;/.test(WS.slice(orphanAt, orphanAt + 1200)) && /if \(msg\?\.reason === 'no-such-desktop'\) \{ if \(Array\.isArray\(msg\.desktops\)\) this\._onRemoteDesktopUpdated\(\{ desktops: msg\.desktops \}\); return; \}/.test(D), '§6 verify r2 ⑦: a per-desktop write for a desktop the meta does not name is refused BEFORE the belt (`no-such-desktop`, the meta rides the refusal, nothing written) and the client drops the desktop as a desktop-updated would');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['{n} windows on “{desktop}” were kept — this page had not opened them yet', 'Then: {changes}', 'The layout could not be re-read after reconnecting — window changes on this page are held until it can be', 'The layout was re-read — window changes made on this page more than a minute ago were not kept ({n})'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')), '§6 the new words have zh AND ja entries', J(keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':'))));
}

// ── §7 NEGATIVE CONTROLS ─────────────────────────────────────────────────────────────────────────────────────────
console.log('— §7 negative controls (patched copies, scripts/mutant-copy.mjs)');
{
  const M = mutantCopies('dmove', REPO);
  const PSRC = read(MODEL);
  // (a) a merge that REPLACES the record with the page's windows — the incident's rule
  {
    const find = '  for (const w of listOf(base.windows)) {';
    ok(PSRC.includes(find), 'control merge-replaces: the patched line exists in desktop-record.js');
    const f = pureLegs(M.load(MODEL, PSRC.replace(find, '  for (const w of []) {'), 'merge-replaces'), { quiet: true });
    ok(f.some((n) => /userW's drop/.test(n)) && f.some((n) => /not built/.test(n)), `control merge-replaces: a merge that REPLACES the record turns the §1 legs RED (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
  }
  // (e) a belt blind to evidence
  {
    const find = '    if (ev.has(id)) continue;';
    ok(PSRC.includes(find), 'control belt-blind: the patched line exists in desktop-record.js');
    const f = pureLegs(M.load(MODEL, PSRC.replace(find, ''), 'belt-blind'), { quiet: true });
    ok(f.some((n) => /bulk close/.test(n)) && !f.some((n) => /userW's write/.test(n)), `control belt-blind: a belt that reads no evidence refuses the user's own bulk close (RED) — the incident's refusal still holds (${f.length})`);
  }
  // (f) verify r1: a belt blind to ARRIVALS (the lane's ①)
  {
    const find = '  const arrived = unexplained.filter((id) => rec.has(id));';
    ok(PSRC.includes(find), 'control belt-blind-arrivals: the patched line exists in desktop-record.js');
    const f = pureLegs(M.load(MODEL, PSRC.replace(find, '  const arrived = [];'), 'belt-blind-arrivals'), { quiet: true });
    ok(f.some((n) => /ANOTHER client added lately/.test(n)) && !f.some((n) => /bulk close/.test(n)), `control belt-blind-arrivals: a belt that forgets arrivals admits the 1-window drop of a window another client just added (RED) — the bulk close still passes (${f.length})`);
  }
  const DSRC = read('src/lib/desktop-manager.js');
  const LSRC0 = read('src/lib/layout.js');
  // (g) verify r1: ONE slot for every desktop (the lane's ① / 2.369.198 guard 3)
  {
    const find = "    this._pendingRemote.set(msg.desktopId || '', msg);";
    ok(LSRC0.includes(find), 'control one-slot: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, "    this._pendingRemote.clear(); this._pendingRemote.set('', msg);"), 'one-slot', { esm: true }))).LayoutManager, { quiet: true, legs: ['a', 'i'] });
    ok(f.some((n) => /pointerup applies BOTH/.test(n)) && !f.some((n) => /THE DROP onto an UNVISITED/.test(n)), `control one-slot: one slot for every desktop loses the target's record of a move (RED) (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (h) verify r1: a remote move applied as a CLOSE (the lane's ①)
  {
    const find = '  adoptRemoteMove(win, from, { to = null, rec = null } = {}) {\n';
    ok(DSRC.includes(find), 'control move-as-close: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, find + '    return null;\n'), 'move-as-close', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['a', 'i', 'j'] });
    ok(f.some((n) => /REMOTE MOVE OUT/.test(n)) && f.some((n) => /REMOTE MOVE IN/.test(n)) && !f.some((n) => /THE DROP onto an UNVISITED/.test(n)), `control move-as-close: a page that closes a window another client moved turns the remote-move legs RED (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (i) verify r1: a reconnect that re-reads nothing (the lane's ①)
  {
    const find = '    app.ws.onStateChange((connected) => { if (!connected) { this._lastSentJson = null; this._unacked = this._unacked.filter((s) => s.at == null); } if (connected) { this._clockTick(); this._lastRemoteSeq = 0; for (const s of this._unacked) if (s.at == null) s.at = Date.now(); if (this._connects++ > 0) setTimeout(() => this._resyncFromServer(), 250); } });';
    ok(LSRC0.includes(find), 'control no-resync: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    app.ws.onStateChange((connected) => { if (connected) this._lastRemoteSeq = 0; });'), 'no-resync', { esm: true }))).LayoutManager, { quiet: true, legs: ['k'] });
    ok(f.some((n) => /RECONNECT re-reads/.test(n)) && f.some((n) => /hr-4 arrived during the outage/.test(n)), `control no-resync: a reconnect that re-reads nothing leaves the stale base (RED) (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (j) verify r1 D1: a delete that leaves the target's record to the next autosave
  {
    const find = '    this._broadcastDesktopState(targetId, this.recordFor(targetId)); // the target holds them BEFORE the server forgets the desktop\n';
    ok(DSRC.includes(find), 'control delete-no-send: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, ''), 'delete-no-send', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['l'] });
    ok(f.some((n) => /deleting the desktop ON SHOW/.test(n)), `control delete-no-send: the target's record is not sent — RED (${f.length})`);
  }
  // (k) verify r1 D6: a rearmSave that does nothing
  {
    const find = '  rearmSave() {\n';
    ok(LSRC0.includes(find), 'control no-rearm: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, find + '    return;\n'), 'no-rearm', { esm: true }))).LayoutManager, { quiet: true, legs: ['m'] });
    ok(f.some((n) => /re-arms the save/.test(n)) && f.some((n) => /goes out on its own/.test(n)), `control no-rearm: the refused record of the desktop on show never goes out — RED (${f.length})`);
  }
  // (l) verify r1 D6: the switch's broadcast without the evidence
  {
    const find = "    this.app.ws.send({ type: 'layout-sync', state, desktopId, evidence: this.evidence(), sentAt });";
    ok(DSRC.includes(find), 'control switch-no-evidence: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, "    this.app.ws.send({ type: 'layout-sync', state, desktopId, evidence: [], sentAt });"), 'switch-no-evidence', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['n'] });
    ok(f.some((n) => /switch's broadcast of the desktop being left/.test(n)), `control switch-no-evidence: the closes leave unexplained — RED (${f.length})`);
  }
  // (m) verify r1 ⑥: the same-conversation rule patched out ⇒ the entry lingers as a build attempt
  {
    const find = "      if (ws.openSpec.action === 'attachSession' && ws.openSpec.serverId && liveServerIds.has(ws.openSpec.serverId)) { noSpec.push(winId); continue; }\n";
    ok(DSRC.includes(find), 'control dup-lingers: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, ''), 'dup-lingers', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['f'] });
    ok(f.some((n) => /already open here under another window id/.test(n)) && !f.some((n) => /PARENT of a fork/.test(n)), `control dup-lingers: the entry is replayed and lingers — RED; the parent leg stays green (${f.length})`);
  }
  // (o) verify r2: the settle rule keyed on the CONVERSATION id (r1's key) settles a fork's parent
  {
    const find = "      if (ws.openSpec.action === 'attachSession' && ws.openSpec.serverId && liveServerIds.has(ws.openSpec.serverId)) { noSpec.push(winId); continue; }\n";
    const conv = "      if (ws.openSpec.action === 'attachSession' && ws.openSpec.backendSessionId && [...this.app.wm.windows.values()].some((w) => w._openSpec?.action === 'attachSession' && w._openSpec.backendSessionId === ws.openSpec.backendSessionId)) { noSpec.push(winId); continue; }\n";
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, conv), 'settle-by-conversation', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['f'] });
    ok(f.some((n) => /PARENT of a fork/.test(n)) && !f.some((n) => /already open here under another window id/.test(n)), `control settle-by-conversation: r1's key drops the fork's parent — RED; the true duplicate still settles (${f.length})`);
  }
  // (n) verify r2: a move with no witness — the stale record re-adopts the window the user just dragged off
  {
    const find = '    for (const m of members) { m._desktopId = desktopId; m._movedAt = movedAt; }';
    ok(DSRC.includes(find), 'control no-held-move: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, '    for (const m of members) m._desktopId = desktopId;'), 'no-held-move', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['o'] });
    ok(f.some((n) => /THE HELD MOVE/.test(n)) && f.some((n) => /goes out once more/.test(n)), `control no-held-move: the user's drop is put back by the record deferred under the drag and never sent — RED (${f.length}: ${f.map((n) => n.slice(0, 70)).join(' | ')})`);
  }
  // (p) verify r2: the chain loop without its desktop guard breaks hidden desktops' groups
  {
    const find = "            if (activeDesk && w._desktopId && w._desktopId !== activeDesk) continue;\n";
    ok(LSRC0.includes(find), 'control chain-any-desktop: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, ''), 'chain-any-desktop', { esm: true }))).LayoutManager, { quiet: true, legs: ['p'] });
    ok(f.some((n) => /leaves the tab group on hidden HR intact/.test(n)), `control chain-any-desktop: a record of Fin breaks HR's hidden group — RED (${f.length})`);
  }
  // (q) verify r2 ④: the old fallback — a deleted desktop's windows to desktop #1 on every other page
  {
    const find = '            const dest = homeOf(win.id) || fallbackId;';
    ok(DSRC.includes(find), 'control delete-to-first: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, '            const dest = fallbackId;'), 'delete-to-first', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['q'] });
    ok(f.some((n) => /not on desktop #1/.test(n)) && f.some((n) => /never writes it under D1 too/.test(n)), `control delete-to-first: the windows land on #1 and the next save doubles them — RED (${f.length})`);
  }
  // (r) verify r2 ⑤: a re-read that leaves an older deferred record to drain after it
  {
    const find = '      else { this._pendingRemote.delete(key); this._handleRemoteSync(msg); }\n';
    ok(LSRC0.includes(find), 'control resync-keeps-stale: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '      else this._handleRemoteSync(msg);\n'), 'resync-keeps-stale', { esm: true }))).LayoutManager, { quiet: true, legs: ['r'] });
    ok(f.some((n) => /never lands AFTER the re-read/.test(n)), `control resync-keeps-stale: the stale record drains over the fresh one — RED (${f.length})`);
  }
  // (s) verify r2 ⑥: a re-read that gives up on the first failure
  {
    const find = '      if (attempt < RESYNC_RETRIES) { setTimeout(() => this._resyncFromServer(attempt + 1), RESYNC_RETRY_MS * (attempt + 1)); return; }\n';
    ok(LSRC0.includes(find), 'control resync-no-retry: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, ''), 'resync-no-retry', { esm: true }))).LayoutManager, { quiet: true, legs: ['s'] });
    ok(f.some((n) => /a failed re-read is retried/.test(n)), `control resync-no-retry: the page stays on its stale base — RED (${f.length})`);
  }
  // (t) verify r2 R7: a drain in insertion order (no seq sort)
  {
    const find = '      const [key, msg] = [...this._pendingRemote.entries()].sort((a, b) => (a[1].seq || 0) - (b[1].seq || 0))[0];';
    ok(LSRC0.includes(find), 'control drain-no-sort: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '      const [key, msg] = [...this._pendingRemote.entries()][0];'), 'drain-no-sort', { esm: true }))).LayoutManager, { quiet: true, legs: ['t'] });
    ok(f.some((n) => /BEFORE the source/.test(n)), `control drain-no-sort: the source drains first and closes the moved window — RED (${f.length})`);
  }
  // (u) verify r2 R7: the cached sweep without its adopt
  {
    const find = '.filter((w) => !this.adoptRemoteMove(w, desktopId))';
    ok(DSRC.split(find).length === 2, 'control cache-sweep-closes: the patched text exists once in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(find, ''), 'cache-sweep-closes', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['u'] });
    ok(f.some((n) => /cached sweep moves the hidden window/.test(n)), `control cache-sweep-closes: the hidden window is closed — RED (${f.length})`);
  }
  // (v) verify r2 R7: the re-read closing whatever the record lacks (no `closeOnlyWired`)
  {
    const find = '            if (closeOnlyWired && !this.app.desktopManager?.wireListed?.(activeDesk, id)) continue;\n';
    ok(LSRC0.includes(find), 'control close-any-wired: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, ''), 'close-any-wired', { esm: true }))).LayoutManager, { quiet: true, legs: ['k'] });
    ok(f.some((n) => /OWN unsent window kept/.test(n)), `control close-any-wired: the page's own unsent window is closed by the re-read — RED (${f.length})`);
  }
  // (w) verify r2 R7: the re-read in the server's order (the desktop on show not last)
  {
    const find = '    const order = Object.entries(desktops).sort(([a], [b]) => (a === active) - (b === active));';
    ok(LSRC0.includes(find), 'control resync-any-order: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    const order = Object.entries(desktops);'), 'resync-any-order', { esm: true }))).LayoutManager, { quiet: true, legs: ['k'] });
    ok(f.some((n) => /moved off the desktop on show during the outage is MOVED/.test(n)), `control resync-any-order: a window moved off the desktop on show during the outage is closed — RED (${f.length})`);
  }
  // (v) verify r2 ⑩: an apply that never holds the user's own geometry
  {
    const find = '          const heldGeom = this.actHeld(win._boundsAt, receivedAt, win);\n';
    ok(LSRC0.includes(find), 'control no-held-geometry: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '          const heldGeom = false;\n'), 'no-held-geometry', { esm: true }))).LayoutManager, { quiet: true, legs: ['v'] });
    ok(f.some((n) => /THE HELD GEOMETRY/.test(n)) && f.some((n) => /drag goes out once more/.test(n)) && !f.some((n) => /other windows still apply/.test(n)), `control no-held-geometry: the drag is snapped back and never sent — RED (${f.length})`);
  }
  // (x) verify r3 ①: the witness stamped by every title-bar release (a click-to-focus included) / a handle press that never moved
  {
    const WSRC = read('src/lib/window.js');
    ok(geomWitnessPin(WSRC), 'control click-witness: the real window.js passes the pin');
    const gate = '      if (!dragging) return;\n      dragging = false;\n', stamp = '      win._boundsAt = Date.now();\n';
    const g = WSRC.indexOf(gate), k = WSRC.indexOf(stamp, g + gate.length); // r2's placement: the stamp before the gate, the one after it gone
    const before = WSRC.slice(0, g) + stamp + WSRC.slice(g, k) + WSRC.slice(k + stamp.length);
    ok(!geomWitnessPin(before), 'control click-witness: the stamp moved back BEFORE the drag gate (every press stamps) is RED by the pin');
    ok(!geomWitnessPin(WSRC.replace('if (resized) win._boundsAt = Date.now();', 'win._boundsAt = Date.now();')), 'control click-witness: a resize stamp without its `resized` guard is RED by the pin');
  }
  // (y) verify r3 ②: the re-read's horizon at its ANSWER (r2's stamp) — a move made while it was in flight is reversed
  {
    const find = '    const receivedAt = Math.min(startedAt, this._movesSentAt ?? 0);';
    ok(LSRC0.includes(find), 'control resync-horizon: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    const receivedAt = Date.now();'), 'resync-horizon', { esm: true }))).LayoutManager, { quiet: true, legs: ['w', 'x'] });
    ok(f.some((n) => /horizon is the ask/.test(n)), `control resync-horizon: a horizon at the answer reverses the in-flight move whose save left before the answer — RED (${f.length}; the queued one is held by the unsaved-act rule since verify r4 ①)`);
  }
  // (z) verify r3 ②: a save queued while disconnected stamped as sent
  {
    const find = '    this._unacked.push({ sentAt, desks: [...desks], pending: desks.length, refused: new Set(), at: this.app.ws?.connected !== false ? Date.now() : null });\n    this._armAckWatch();';
    ok(LSRC0.includes(find), 'control queued-as-sent: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    for (const d of desks) this._markCarried(d, sentAt);'), 'queued-as-sent', { esm: true }))).LayoutManager, { quiet: true, legs: ['w', 'x', 'ak', 'ak2'] });
    ok(f.some((n) => /never READ is not reversed/.test(n)) && !f.some((n) => /horizon is the ask/.test(n)), `control queued-as-sent (today's rule: a save carried at its SEND): a save on a dead socket is reversed by the re-read — RED; the in-flight leg still holds (${f.length})`);
  }
  // (aa) verify r3 ③: noteClosed refusing every close under `_restoring` (the user's in the cooldown included)
  {
    const find = '    if (!id || this._applying || this._booting) return;';
    ok(LSRC0.includes(find), 'control close-under-cooldown: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    if (!id || this._restoring) return;'), 'close-under-cooldown', { esm: true }))).LayoutManager, { quiet: true, legs: ['z'] });
    ok(f.some((n) => /a close made in the cooldown is HELD/.test(n)), `control close-under-cooldown: a close in the cooldown is not held (RED) (${f.length})`);
  }
  // (ab) verify r3 ③: a save under a gate DROPPED (no deferral)
  {
    const find = '    if (!this._userDirty || this._applying || this._deferT) return;\n    const at = this._lastUserInputAt || Date.now();';
    ok(LSRC0.includes(find), 'control save-dropped-under-gate: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    return;\n    const at = this._lastUserInputAt || Date.now();'), 'save-dropped-under-gate', { esm: true }))).LayoutManager, { quiet: true, legs: ['y'] });
    ok(f.some((n) => /the move is saved on its own/.test(n)), `control save-dropped-under-gate: a drop in the cooldown waits for the next act (RED) (${f.length})`);
  }
  // (ac) verify r3 ④: a save from the stale base (no hold) — the copies also shorten the retry ladder (150 ms): a control's wall is the mechanism's, not the product's constants
  {
    const find = '    if (this._resyncStale) { if (!this._resyncing) this._resyncFromServer(); return; }';
    ok(LSRC0.includes(find), 'control stale-base-saved: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '').replace('const RESYNC_RETRY_MS = 1500;', 'const RESYNC_RETRY_MS = 150;'), 'stale-base-saved', { esm: true }))).LayoutManager, { quiet: true, legs: ['st'] });
    ok(f.some((n) => /a stale base is never saved/.test(n)), `control stale-base-saved: the page writes its stale base after a failed re-read (RED) (${f.length})`);
  }
  // (ad) verify r3 ④: the failed re-read told to the console only
  {
    const find = "      if (!this._staleTold) { this._staleTold = true; showToast(t(";
    ok(LSRC0.includes(find), 'control stale-untold: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, "      if (false) { this._staleTold = true; showToast(t(").replace('const RESYNC_RETRY_MS = 1500;', 'const RESYNC_RETRY_MS = 150;'), 'stale-untold', { esm: true }))).LayoutManager, { quiet: true, legs: ['st'] });
    ok(f.some((n) => /the user is told ONCE/.test(n)) && !f.some((n) => /a stale base is never saved/.test(n)), `control stale-untold: a console line only (RED) — the hold still holds (${f.length})`);
  }
  // (ag) verify r4 ①: THE UNSAVED ACT reverted — actHeld reduced to the receipt clause (r2's rule): a record received after an unsaved act undoes it
  {
    const find = '    return t >= receivedAt || t > (win ? this._carriedAt(win._desktopId) : (this._movesSentAt || 0));';
    ok(LSRC0.includes(find), 'control unsaved-act-reverted: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    return t >= receivedAt;'), 'unsaved-act-reverted', { esm: true }))).LayoutManager, { quiet: true, legs: ['ua', 'ub', 'uc'] });
    ok(f.some((n) => /does not put fin-2 back on Fin/.test(n)) && f.some((n) => /does not snap fin-2 back \(the drag/.test(n)) && f.some((n) => /never re-adopted onto Fin/.test(n)), `control unsaved-act-reverted: the receipt clause alone lets a record 100 ms after a drop / a drag / under a chatty peer undo it — RED (${f.length}: ${f.map((n) => n.slice(0, 60)).join(' | ')})`);
  }
  // (ah) verify r4 ②: adoptRemoteMove told a destination equal to the source falls through to the held-record search (the r1 form)
  {
    const find = "      if (to === from || to === '__stage__') return null;\n      dest = to;\n    } else {\n";
    ok(DSRC.includes(find), 'control adopt-falls-through: the patched lines exist in desktop-manager.js');
    const mut = DSRC.replace(find, "      dest = to !== from && to !== '__stage__' ? to : null;\n    }\n    if (!dest) {\n");
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', mut, 'adopt-falls-through', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['ue'] });
    ok(f.some((n) => /record of the desktop on show LISTS stays on it/.test(n)), `control adopt-falls-through: the search moves the listed window out — RED (${f.length})`);
  }
  // (cj) verify r5 ①: a clock watch that re-arms nothing — the sleep expires every hold and guard 2 drops the save: RED by leg cj
  {
    const find = '    const fresh = (t, hold = ACT_HOLD_MS) => t > 0 && before - t <= hold;\n';
    ok(LSRC0.includes(find), 'control clock-unwatched: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    return;\n'), 'clock-unwatched', { esm: true }))).LayoutManager, { quiet: true, legs: ['cj', 'st2'] });
    ok(f.some((n) => /survives the wake/.test(n)) && !f.some((n) => /FOLLOWS the server/.test(n)), `control clock-unwatched: with no re-arm the drag before the sleep is lost at the wake — RED; the run minute (st2) still expires either way (${f.length})`);
  }
  // (a5) verify r5 ⑥: an owed desk that re-arms nothing — the move waits for the next act: RED by a5
  {
    const find = "    if (owed && [...owed].some((d) => !this._unacked.some((s) => s.desks.includes(d)))) heldMoved = true;\n";
    ok(LSRC0.includes(find), 'control owed-desk-unarmed: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, ''), 'owed-desk-unarmed', { esm: true }))).LayoutManager, { quiet: true, legs: ['a5'] });
    ok(f.some((n) => /the owed desk re-arms the re-send/.test(n)), `control owed-desk-unarmed: the move stays on the page and never reaches the server — RED (${f.length})`);
  }
  // (st2b) verify r5 ④: a count that retires nothing — the same expired act is toasted at every stale release: RED by st2's second episode
  {
    const find = '      n++; w._movedAt = 0; w._boundsAt = 0; w._chainAt = 0; // counted once: said, then gone\n';
    ok(LSRC0.includes(find), 'control expired-not-retired: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '      n++;\n'), 'expired-not-retired', { esm: true }))).LayoutManager, { quiet: true, legs: ['st2'] });
    ok(f.some((n) => /a second release with nothing new says nothing/.test(n)) && !f.some((n) => /told ONCE how many changes were not kept/.test(n)), `control expired-not-retired: the expired move is toasted again at the second release — RED; the first release still counts right (${f.length})`);
  }
  // (ch) verify r5 ②: the hold lines gone — the merge dissolves, the split falls back, the tear-off is re-grouped: RED by ch; a verb's stamp gone: RED by the pin
  {
    const f1 = '            if (this.actHeld(w._chainAt, receivedAt, w)) { heldKept = true; continue; }\n';
    const f2 = "          if ((tc.tabs || []).some((id) => { const m = this.app.wm.windows.get(String(id)); return m && this.actHeld(m._chainAt, receivedAt, m); })) { heldKept = true; continue; }\n";
    ok(LSRC0.includes(f1) && LSRC0.includes(f2), 'control chain-unheld: the patched lines exist in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(f1, '').replace(f2, ''), 'chain-unheld', { esm: true }))).LayoutManager, { quiet: true, legs: ['ch'] });
    ok(f.some((n) => /a MERGE made in the cooldown/.test(n)) && f.some((n) => /a SIDE-BY-SIDE made in the cooldown/.test(n)) && f.some((n) => /a TEAR-OFF made in the cooldown/.test(n)), `control chain-unheld: without the hold the merge dissolves, the split falls back to tabs and the tear-off is re-grouped — RED (${f.length})`);
    const TGSRC = read('src/lib/tab-group.js');
    const unst = TGSRC.replace("    enterSplit(chain, { anchorId: anchorWin.id, guestId: guestWin.id, side });\n    this.witnessChain(chain); // this page's act (verify r5 ②)", "    enterSplit(chain, { anchorId: anchorWin.id, guestId: guestWin.id, side });");
    const bodyOf = (src, v) => { const i = src.search(new RegExp(`^  ${v}\\(`, 'm')); return i < 0 ? '' : src.slice(i, src.indexOf('\n  },\n', i)); };
    ok(unst !== TGSRC && /this\.witnessChain\(chain/.test(bodyOf(TGSRC, 'bindSplit')) && !/this\.witnessChain\(chain/.test(bodyOf(unst, 'bindSplit')), 'control verb-unstamped: bindSplit without its stamp is RED by the chain witness pin');
  }
  // (ak2) verify r5 ⑤: a no-op guard that silences a re-send of a text the server never READ — RED by leg ak2
  {
    const find = "    if (json === this._lastSentJson && !this._unacked.some((s) => s.desks.includes(desktopId || ''))) {\n";
    const find2 = '{ this._lastSentJson = null; this._unacked = this._unacked.filter((s) => s.at == null); }';
    ok(LSRC0.includes(find) && LSRC0.includes(find2), 'control noop-unread: the patched lines exist in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, '    if (json === this._lastSentJson) {\n').replace(find2, '{ this._unacked = this._unacked.filter((s) => s.at == null); }'), 'noop-unread', { esm: true }))).LayoutManager, { quiet: true, legs: ['ak2'] });
    ok(f.some((n) => /RE-SENT after the reconnect although its text equals/.test(n)), `control noop-unread: the held drag on the desktop on show is kept on the page but never reaches the server — RED (${f.length})`);
  }
  // (ak) verify r5 ⑤: a refusal that CARRIES (the refused desktop released with the save) — RED by leg ar
  {
    const find = '    if (refused) s.refused.add(key);\n';
    ok(LSRC0.includes(find), 'control refusal-carries: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, ''), 'refusal-carries', { esm: true }))).LayoutManager, { quiet: true, legs: ['ar'] });
    ok(f.some((n) => /stays held — a stale record cannot put fin-2 back/.test(n)), `control refusal-carries: a refused record that counts as carried lets a stale record undo the act — RED (${f.length})`);
  }
  // (r5③) a door planted without a witness is RED by the census; each new stamp removed is RED by the doors pin
  {
    const files = libFiles();
    const planted = { ...files, 'window.js': files['window.js'] + '\n  _plantedDoor(id) {\n    this.toggleMaximize(id);\n  }\n' };
    const bad = geomDoorCensus(planted).filter((r) => !r.verdict);
    ok(bad.length === 1 && /window\.js:\d+ toggleMaximize in _plantedDoor/.test(`${bad[0].file}:${bad[0].line} ${bad[0].verb} in ${bad[0].enclosing}`), 'control planted-door: a new call of a geometry primitive with no witness, no self-stamping verb and no machine row is RED by name', J(bad));
    const WSRC = files['window.js'], TGSRC = files['tab-group.js'], DASRC = files['desktop-app-window.js'], LSRC = files['layout.js'];
    const cases = [
      ['window.js applyLayout', geomDoorsPin2(WSRC.replace("      this.witnessGeometry(w.id); // a preset is the user's act", "      // a preset is the user's act"), TGSRC, DASRC, LSRC)],
      ['window.js snapActiveToCell', geomDoorsPin2(WSRC.replace("    this.witnessGeometry(win.id); // command mode's digits", "    // command mode's digits"), TGSRC, DASRC, LSRC)],
      ['tab-group.js tear-off', geomDoorsPin2(WSRC, TGSRC.replace("      this.witnessGeometry(winId); // the tear-off's drop", "      // the tear-off's drop"), DASRC, LSRC)],
      ['desktop-app-window.js onAppState', geomDoorsPin2(WSRC, TGSRC, DASRC.replace("    if (act) app.wm.witnessGeometry?.(winInfo.id);", "    //"), LSRC)],
      ['layout.js loadPreset', geomDoorsPin2(WSRC, TGSRC, DASRC, LSRC.replace("      this.app.wm.witnessGeometry?.(winInfo.id); // a named preset", "      // a named preset"))],
    ];
    for (const [name, d] of cases) ok(!d.every(Boolean), `control door-unwitnessed (r5 ③): ${name} without its stamp is RED by the doors pin`, J(d));
    ok(!selfStampPin(WSRC.replace("      this.witnessGeometry(w.id); // a preset is the user's act", "      // a preset is the user's act"), LSRC), 'control self-stamp: applyLayout without its stamp is RED by the self-stamping pin (the census trusts the name)');
  }
  // (ai) verify r4 ③: a door that stamps nothing — the □ button, snapToHalf, the taskbar row, command mode's m — each RED by the doors pin; the helper gone RED by the witness pin
  {
    const WSRC = read('src/lib/window.js'), TBSRC = read('src/lib/taskbar.js'), CMSRC = read('src/lib/command-mode.js');
    const cases = [
      ['window.js □', geomDoorsPin(WSRC.replace('this.witnessGeometry(winInfo.id); this.toggleMaximize(winInfo.id); };', 'this.toggleMaximize(winInfo.id); };'), TBSRC, CMSRC)],
      ['window.js snapToHalf', geomDoorsPin(WSRC.replace('    this.witnessGeometry(winId); // command mode', '    // command mode'), TBSRC, CMSRC)],
      ['taskbar.js row', geomDoorsPin(WSRC, TBSRC.replace('{ app.wm.witnessGeometry?.(id); app.wm.minimize(id); }', 'app.wm.minimize(id);'), CMSRC)],
      ['command-mode.js m', geomDoorsPin(WSRC, TBSRC, CMSRC.replace('{ wm.witnessGeometry?.(wm.activeWindowId); wm.toggleMaximize(wm.activeWindowId); }', 'wm.toggleMaximize(wm.activeWindowId);'))],
    ];
    for (const [name, d] of cases) ok(!d.every(Boolean), `control door-unwitnessed: ${name} without its stamp is RED by the doors pin`, J(d));
    ok(!geomWitnessPin(WSRC.replace('    w._boundsAt = Date.now();\n    const host', '    const host')), 'control door-unwitnessed: the helper that stamps nothing is RED by the witness pin');
  }
  // (aj) verify r4 ④: the stale release silent — the expired acts dropped without a word
  {
    const find = "    if (expired) showToast(t('The layout was re-read";
    ok(LSRC0.includes(find), 'control stale-release-untold: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC0.replace(find, "    if (false) showToast(t('The layout was re-read"), 'stale-release-untold', { esm: true }))).LayoutManager, { quiet: true, legs: ['st2'] });
    ok(f.some((n) => /told ONCE how many changes were not kept/.test(n)) && !f.some((n) => /FOLLOWS the server/.test(n)), `control stale-release-untold: the acts are dropped without a word — RED; the page still follows the server (${f.length})`);
  }
  // (ae)/(af) verify r3 revert table: r2 ④'s unknown-desktop guards in _setRecord and noteWire
  {
    const f1 = '    if (!this._desktops.some((d) => d.id === desktopId)) return;\n    this._savedStates.set(desktopId, record);';
    ok(DSRC.includes(f1), 'control orphan-held: the patched line exists in desktop-manager.js');
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(f1, '    this._savedStates.set(desktopId, record);'), 'orphan-held', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['orph'] });
    ok(f.some((n) => /an orphan record/.test(n)), `control orphan-held: _setRecord without its guard holds the orphan (RED) (${f.length})`);
    const f2 = "    if (!this._desktops.some((d) => d.id === desktopId)) return; // a desktop this page does not know (verify r2 ④)\n";
    ok(DSRC.includes(f2), 'control orphan-wire: the patched line exists in desktop-manager.js');
    const g = await doorLegs((await import(M.write('src/lib/desktop-manager.js', DSRC.replace(f2, ''), 'orphan-wire', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['orph'] });
    ok(g.some((n) => /an orphan record/.test(n)), `control orphan-wire: noteWire without its guard keeps a wire base for the orphan (RED) (${g.length})`);
  }
  // (b) the pre-fix _updateCachedDesktop (2.369.198, byte for byte in its body)
  {
    const start = DSRC.indexOf('  _updateCachedDesktop(desktopId, { from = null, ids = [], replaces = [] } = {}) {\n');
    const end = DSRC.indexOf('\n  }\n', start);
    ok(start > 0 && end > start, 'control pre-fix-cache: _updateCachedDesktop found in desktop-manager.js');
    const PRE = `  _updateCachedDesktop(desktopId) {
    if (desktopId === this._activeId) return;
    const cached = this._savedStates.get(desktopId) || { windows: [] };
    const wins = [];
    for (const [id, win] of this.app.wm.windows) {
      if (win._desktopId !== desktopId) continue;
      wins.push({
        winId: id, gridBounds: win.gridBounds,
        isMinimized: false, openSpec: win._openSpec,
      });
    }
    cached.windows = wins;
    this._savedStates.set(desktopId, cached);`;
    const mut = DSRC.slice(0, start) + PRE + DSRC.slice(end);
    const f = await doorLegs((await import(M.write('src/lib/desktop-manager.js', mut, 'pre-fix-cache', { esm: true }))).DesktopManager, RealLM, { quiet: true, legs: ['a', 'b', 'c', 'd', 'e', 'e2', 'f', 'g', 'h'] });
    ok(f.some((n) => /THE DROP onto an UNVISITED/.test(n)) && f.some((n) => /preview draws 4 after the drop/.test(n)) && f.some((n) => /THE SWITCH to HR builds/.test(n)) && !f.some((n) => /CONTROL visited first/.test(n)), `control pre-fix-cache: the 2.369.198 cache rebuild turns the drop / preview / switch legs RED — and the visited-first control stays green, as it did in the incident (${f.length}: ${f.slice(0, 3).join(' | ').slice(0, 200)})`);
    const bad = census(sources({ 'src/lib/desktop-manager.js': mut })).filter((s) => !s.ok);
    ok(bad.length === 2 && bad.some((s) => /cached\.windows = wins/.test(s.line)) && bad.some((s) => /_savedStates\.set\(desktopId, cached\)/.test(s.line)), '§5 control: …and the CENSUS names its two raw writes by line', J(bad));
  }
  // (c) an autosave that never sends a changed desktop it does not show
  {
    const LSRC = read('src/lib/layout.js');
    const find = '    for (const d of dm?.takeDirty?.() || []) {';
    ok(LSRC.includes(find), 'control no-dirty-send: the patched line exists in layout.js');
    const f = await doorLegs(RealDM, (await import(M.write('src/lib/layout.js', LSRC.replace(find, '    for (const d of []) {'), 'no-dirty-send', { esm: true }))).LayoutManager, { quiet: true, legs: ['a', 'g'] });
    ok(f.some((n) => /THE AUTOSAVE after the drop SENDS HR/.test(n)) && f.some((n) => /corrected record goes out/.test(n)), `control no-dirty-send: the autosave leg turns RED — the server never hears of HR (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
  }
  // (d) a NEW raw writer of a held record (a purge written the old way)
  {
    const find = "      this._setRecord(desk, mergeDesktopRecord({ record: st, remove: [winId] }));";
    ok(DSRC.split(find).length === 2, 'control raw-writer: the patched line exists once in desktop-manager.js');
    const mut = DSRC.replace(find, '      st.windows = st.windows.filter((w) => (w.winId || w.id) !== winId);');
    const bad = census(sources({ 'src/lib/desktop-manager.js': mut })).filter((s) => !s.ok);
    ok(bad.length === 1 && bad[0].kind === 'windows-assign' && /st\.windows = st\.windows\.filter/.test(bad[0].line), 'control raw-writer: a new raw write of a held record is RED under §5, and only it', J(bad));
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 26 })) ok(r.pass, r.name, r.detail);
}

const anyFailed = fail || pureFailed.length || doorFailed.length;
console.log(`\n${anyFailed ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(anyFailed ? 1 : 0);
