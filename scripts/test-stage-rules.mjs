#!/usr/bin/env node
// THE STAGE'S MOVE RULE, SPOKEN + THE TORN-OFF WINDOW VISIBLE — the fast gate (inc-muly2izg-cks3, userW 2026-09-28; the secondary half of the lane —
// the primary, the tab torn out of the bar, is test-chain-layout ⑮ + heavy test-stage-dragout-ui).
// The rule is the owner's 2.112.4 directive and it STAYS (windows never move between the Stage and a normal desktop, in
// either direction); what this gates is that it is no longer SILENT (the no-silent-failures law). No DOM, no ports:
//   §1 PURE stageWindowKind — the placeholder (by type AND by flag), a borrowed hero, a window whose home IS the Stage, a
//      bound aux ⇒ its kind; a desktop window ⇒ null (the membership dragToDesktopBlocked always tested)
//   §2 PURE stageMoveVerdict — a Stage window → a desktop ⇒ 'stage-window' (kind carried); → the Stage ⇒ same (no
//      move, no words); a desktop window → the Stage ⇒ 'onto-stage'; → a desktop ⇒ ok
//   §3 the WORDS — every refusal has a line + a next step, distinct per kind, every string through the injected t,
//      the sentence "<line> — <next>"; an ok verdict has none
//   §4 i18n — every t('…') literal of src/lib/stage-rules.js has a zh AND a ja entry
//   §5 StageManager (the real class, a fake app) — windowKind / moveVerdict / dragToDesktopBlocked read the facts off
//      the window and agree with the PURE rule
//   §6 DesktopManager (the real prototype, a fake app) — moveWindowToDesktop returns the TYPED refusal and moves nothing;
//      `speak` says it in a toast (the toast history), silence without it (programmatic callers); a desktop window still
//      moves; "Move to Desktop ▸" for a Stage window = ONE row that says why (no desktop names), for a desktop window the
//      desktops as before, each move spoken
//   §7 WIRING — window.js asks stage.moveVerdict over a hovered preview and marks it, a refused drop puts the window back
//      and says it; the preview drop + command mode pass `speak`; the old silent return is gone
//   §9 THE VANISH (owner correction #2, "他那个拖动出标签栏了，然后窗口就消失了"): tab-group `_matchFrameVisibility` — a
//      window leaving a chain takes its FRAME's visibility (a shown frame ⇒ every hider's mark goes; a hidden one ⇒
//      the same hide); the state 2.369.196 left on his live view (the Stage's hide on the guest's own element, the host
//      shown) is exactly the one asserted away
//   §10 StageManager: `_borrowHero` re-shows the hero's WHOLE group (the root — enter() re-showed the hero + its bound
//      aux only, an unbound guest kept the leave-time hide); `onTornOff` binds a torn-off tab to the frame it left
//      (re-owned from another hero, taken out of that hero's record)
//   §8 NEGATIVE CONTROLS (scripts/mutant-copy.mjs): a kind blind to the aux binding, a refusal with no words for a
//      window, a desktop-manager copy with the pre-fix silent return, a tab-group copy that keeps the inline hide, a
//      stage-manager copy whose borrow shows the hero alone — each turns its own leg red
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const MODEL = 'src/lib/stage-rules.js';
const SRC = read(MODEL);
const J = JSON.stringify;

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };

// a fake DOM just wide enough for the client modules' imports and showToast (its history lands in localStorage)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const mkEl = () => { const el = { style: {}, children: [], className: '', textContent: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); return c; }, remove() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }; Object.defineProperty(el, 'firstChild', { get: () => el.children[0] }); return el; };
globalThis.document = { createElement: mkEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: mkEl(), documentElement: { style: {}, classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} };
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const toasts = () => { try { return JSON.parse(store.get('vibespace.toastHistory') || '[]').map((h) => h.m); } catch { return []; } };
const clearToasts = () => store.delete('vibespace.toastHistory');

/** The PURE legs over one copy of the model — the controls re-run them on a patched copy. */
function pureLegs(R, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const run = (fn) => { try { return fn(); } catch (e) { return e; } };
  const K = (f) => run(() => R.stageWindowKind(f, '__stage__'));
  // §1
  leg(K({ type: 'stage-placeholder' }) === 'placeholder' && K({ type: 'files', isPlaceholder: true, desktopId: 'd1' }) === 'placeholder', '§1 the placeholder, by its type and by its flag (a stray one retagged onto a desktop is still the placeholder)');
  leg(K({ type: 'chat', onStage: true, desktopId: 'd1' }) === 'session' && K({ type: 'terminal', desktopId: '__stage__' }) === 'session', '§1 a hero borrowed from a desktop and a session born on the Stage ⇒ "session"');
  leg(K({ type: 'browser-live', desktopId: '__stage__' }) === 'window' && K({ type: 'files', desktopId: '__stage__' }) === 'window', '§1 a window whose home is the Stage (the incident\'s live view) ⇒ "window"');
  leg(K({ type: 'viewer', desktopId: 'd1', bound: true }) === 'window', '§1 a BOUND aux still tagged with a desktop id ⇒ "window" (the binding alone makes it a Stage window)');
  leg(K({ type: 'chat', desktopId: 'd1' }) === null && K({ type: 'files', desktopId: 'd2' }) === null && K(null) === null && K({}) === null, '§1 a desktop window / no facts ⇒ null (not a Stage window)');
  // §2
  const V = (kind, targetId) => run(() => R.stageMoveVerdict({ kind, targetId, stageId: '__stage__' }));
  leg(J(V('window', 'd2')) === J({ ok: false, code: 'stage-window', kind: 'window' }) && J(V('session', 'd2')) === J({ ok: false, code: 'stage-window', kind: 'session' }) && J(V('placeholder', 'd1')) === J({ ok: false, code: 'stage-window', kind: 'placeholder' }), '§2 a Stage window → a desktop ⇒ refused "stage-window", its kind carried');
  leg(J(V('window', '__stage__')) === J({ ok: true, same: true }) && J(V('session', '__stage__')) === J({ ok: true, same: true }), '§2 a Stage window → the Stage ⇒ already there (ok, same — no move, no words)');
  leg(J(V(null, '__stage__')) === J({ ok: false, code: 'onto-stage', kind: null }), '§2 a desktop window → the Stage ⇒ refused "onto-stage"');
  leg(J(V(null, 'd2')) === J({ ok: true }) && J(V(null, null)) === J({ ok: true }), '§2 a desktop window → a desktop ⇒ ok (the ordinary move, untouched)');
  // §3
  const tUp = (s) => '«' + s + '»';
  const refusals = [V('window', 'd2'), V('session', 'd2'), V('placeholder', 'd2'), V(null, '__stage__')];
  const words = refusals.map((v) => run(() => R.stageRefusalWords(v, { t: (s) => s })));
  leg(words.every((w) => w && typeof w.line === 'string' && w.line.length > 10 && typeof w.next === 'string' && w.next.length > 10), '§3 every refusal has a line AND a next step', J(words));
  leg(new Set(words.map((w) => w && w.line)).size === 4 && new Set(words.map((w) => w && w.next)).size === 4, '§3 the four refusals say four different things (a window, the conversation, the slot, the other direction)', J(words));
  leg(words[0] && words[0].line === 'Windows on the Stage stay on the Stage' && words[1] && words[1].line === 'The conversation stays on the Stage' && words[3] && /onto the Stage/.test(words[3].line), '§3 …in the words the chrome gate reads (a window / the conversation / onto the Stage)', J(words));
  const tw = refusals.map((v) => run(() => R.stageRefusalWords(v, { t: tUp })));
  leg(tw.every((w) => w && /^«.*»$/.test(w.line) && /^«.*»$/.test(w.next)), '§3 every string goes through the injected t (no raw English reaches a zh / ja user)', J(tw));
  leg(!!words[0] && run(() => R.stageRefusalSentence(refusals[0], { t: (s) => s })) === words[0].line + ' — ' + words[0].next, '§3 the sentence a toast / menu row says = "<line> — <next>"');
  leg(run(() => R.stageRefusalWords({ ok: true }, {})) === null && run(() => R.stageRefusalSentence({ ok: true, same: true }, {})) === '' && run(() => R.stageRefusalWords(null)) === null, '§3 an ok verdict has no words');
  return failed;
}

console.log('— §1–§3 the PURE rule + words (src/lib/stage-rules.js)');
const R = require(path.join(REPO, MODEL));
const realFailed = pureLegs(R);

console.log('— §4 i18n: every string the rule says has a zh and a ja entry');
{
  const keys = [...SRC.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
  const zh = new Set(Object.keys((await import('../src/lib/i18n-zh.js')).default)), ja = new Set(Object.keys((await import('../src/lib/i18n-ja.js')).default));
  ok(keys.length === 8, `§4 the rule speaks through 8 t() strings (${keys.length})`, J(keys));
  const missing = keys.filter((k) => !zh.has(k) || !ja.has(k));
  ok(missing.length === 0, '§4 every one has a zh AND a ja translation', J(missing));
}

console.log('— §5 StageManager: the facts off the window, the rule from the module');
const { StageManager, STAGE_ID } = await import('../src/lib/stage-manager.js');
{
  const sm = new StageManager({ settings: null, isMobile: false, wm: { windows: new Map() } });
  sm._boundAux.set('aux1', 'claude:x');
  const w = (o) => ({ id: 'w', type: 'files', ...o });
  const cases = [
    [w({ type: 'stage-placeholder' }), 'placeholder'], [w({ _isStagePlaceholder: true, _desktopId: 'd1' }), 'placeholder'],
    [w({ type: 'chat', _onStage: true, _desktopId: 'd1' }), 'session'], [w({ type: 'browser-live', _desktopId: STAGE_ID }), 'window'],
    [w({ id: 'aux1', type: 'viewer', _desktopId: 'd1' }), 'window'], [w({ type: 'files', _desktopId: 'd1' }), null], [w({ type: 'chat', _desktopId: 'd1' }), null],
  ];
  const got = cases.map(([win]) => sm.windowKind(win));
  ok(J(got) === J(cases.map((c) => c[1])), '§5 windowKind reads type / _isStagePlaceholder / _onStage / _desktopId / the aux binding', J(got));
  ok(cases.every(([win, k]) => sm.dragToDesktopBlocked(win) === !!k) && sm.dragToDesktopBlocked(null) === false, '§5 dragToDesktopBlocked = "is a Stage window" (the 2.112.4 membership, unchanged)');
  ok(J(sm.moveVerdict(cases[3][0], 'd1')) === J({ ok: false, code: 'stage-window', kind: 'window' }) && J(sm.moveVerdict(cases[5][0], STAGE_ID)) === J({ ok: false, code: 'onto-stage', kind: null }) && sm.moveVerdict(cases[5][0], 'd2').ok === true, '§5 moveVerdict = the PURE verdict over those facts');
}

console.log('— §6 DesktopManager: a typed refusal, spoken on a user\'s act, silent for a program');
async function dmLegs(DesktopManager, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const sm = new StageManager({ settings: null, isMobile: false, wm: { windows: new Map() } });
  const wins = new Map([
    ['live', { id: 'live', type: 'browser-live', _desktopId: STAGE_ID, element: { style: {} } }],
    ['hero', { id: 'hero', type: 'chat', _desktopId: 'd1', _onStage: true, element: { style: {} } }],
    ['ex', { id: 'ex', type: 'files', _desktopId: 'd1', element: { style: {} } }],
  ]);
  const calls = [];
  const app = { wm: { windows: wins }, stage: sm, updateTaskbar: () => calls.push('taskbar'), layoutManager: { scheduleAutoSave: () => calls.push('save') }, _checkWelcome: () => {} };
  sm.app.wm = app.wm;
  const dm = Object.create(DesktopManager.prototype);
  Object.assign(dm, { app, _desktops: [{ id: 'd1', name: 'Main' }, { id: 'd2', name: 'Work' }], _activeId: STAGE_ID, _savedStates: new Map(), _wireIds: new Map(), _restoring: false });
  dm._hideWin = (w) => calls.push('hide:' + w.id); dm._renderSwitcher = () => calls.push('render'); dm._updateCachedDesktop = () => {};
  clearToasts();
  const r1 = dm.moveWindowToDesktop('live', 'd2');
  leg(J(r1) === J({ ok: false, code: 'stage-window', kind: 'window' }) && wins.get('live')._desktopId === STAGE_ID && calls.length === 0, '§6 a Stage window → a desktop: the TYPED refusal, nothing moved, nothing saved', J({ r1, calls }));
  leg(toasts().length === 0, '§6 …and a programmatic call (no speak) says nothing', J(toasts()));
  const r2 = dm.moveWindowToDesktop('live', 'd2', { speak: true });
  leg(r2 && r2.ok === false && toasts().length === 1 && toasts()[0] === 'Windows on the Stage stay on the Stage — Open it again on the desktop where you want it.', '§6 a USER\'s move (speak) says the refusal in a toast — b970f16d returned in silence', J({ r2, toasts: toasts() }));
  clearToasts();
  const r3 = dm.moveWindowToDesktop('hero', 'd2', { speak: true });
  leg(r3 && r3.code === 'stage-window' && r3.kind === 'session' && /^The conversation stays on the Stage — /.test(toasts()[0] || ''), '§6 the hero: "The conversation stays on the Stage — …"', J({ r3, toasts: toasts() }));
  clearToasts();
  const r4 = dm.moveWindowToDesktop('ex', STAGE_ID, { speak: true });
  leg(r4 && r4.code === 'onto-stage' && /onto the Stage/.test(toasts()[0] || '') && wins.get('ex')._desktopId === 'd1', '§6 a desktop window → the Stage: "onto-stage", said, not moved', J({ r4, toasts: toasts() }));
  clearToasts();
  leg(J(dm.moveWindowToDesktop('live', STAGE_ID, { speak: true })) === J({ ok: true, moved: false }) && toasts().length === 0, '§6 a Stage window → the Stage: already there — no move, no words');
  dm._activeId = 'd1';
  const r5 = dm.moveWindowToDesktop('ex', 'd2', { speak: true });
  leg(J(r5) === J({ ok: true, moved: true }) && wins.get('ex')._desktopId === 'd2' && calls.includes('hide:ex') && calls.includes('save') && toasts().length === 0, '§6 a desktop window → another desktop still moves (hidden, saved), no words', J({ r5, calls }));
  leg(J(dm.moveWindowToDesktop('nope', 'd2')) === J({ ok: false, code: 'no-window' }), '§6 an unknown window ⇒ {ok:false, code:"no-window"}');
  // the menu
  const mLive = dm.getDesktopMenuItems('live');
  leg(mLive.length === 1 && mLive[0].label === 'Windows on the Stage stay on the Stage — Open it again on the desktop where you want it.' && !mLive[0].disabled && typeof mLive[0].action !== 'function' && !mLive.some((r) => /^(Main|Work)$/.test(r.label)), '§6 "Move to Desktop ▸" of a Stage window = ONE row that says why — no desktop names that do nothing, never greyed', J(mLive));
  const mHero = dm.getDesktopMenuItems('hero');
  leg(mHero.length === 1 && /^The conversation stays on the Stage/.test(mHero[0].label), '§6 …the hero\'s row names the conversation', J(mHero));
  wins.get('ex')._desktopId = 'd1';
  const mEx = dm.getDesktopMenuItems('ex');
  leg(J(mEx.map((r) => r.label)) === J(['Work']) && typeof mEx[0].action === 'function', '§6 a desktop window\'s menu lists the other desktops, as before', J(mEx));
  clearToasts(); calls.length = 0;
  mEx[0].action();
  leg(wins.get('ex')._desktopId === 'd2' && toasts().length === 0, '§6 …and its row moves it');
  return failed;
}
const DM = (await import('../src/lib/desktop-manager.js')).DesktopManager;
const dmFailed = await dmLegs(DM);

console.log('— §9–§10 THE VANISH (owner correction #2: "他那个拖动出标签栏了，然后窗口就消失了"): a torn-off window is VISIBLE');
/** §9: tab-group's _matchFrameVisibility — a window leaving a chain takes its FRAME's visibility. */
async function frameLegs(installTabGroupMixin, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const mkWin = (id, o = {}) => { const attrs = new Map(); return { id, type: 'browser-live', ...o, element: { style: { visibility: '', pointerEvents: '', contentVisibility: '' }, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), attrs } }; };
  const calls = [];
  const wm = { _app: { sessions: new Map([['live', { setSuspended: (v) => calls.push('suspend:' + v) }]]), stage: { _hideStage: (w) => { calls.push('stage-hide:' + w.id); w._hiddenByStage = true; w.element.style.visibility = 'hidden'; } }, desktopManager: { _hideWin: (w) => { calls.push('desk-hide:' + w.id); w._hiddenByDesktop = true; } } } };
  installTabGroupMixin(wm);
  // the exact state 2.369.196 left on his live view: the Stage's leave-time hide on the guest's own element, the host shown
  const stale = mkWin('live', { _hiddenByStage: true }); stale.element.style.visibility = 'hidden'; stale.element.style.pointerEvents = 'none'; stale.element.attrs.set('aria-hidden', 'true');
  wm._matchFrameVisibility(stale, mkWin('hero', { type: 'chat' }));
  leg(stale._hiddenByStage === false && stale._hiddenByDesktop === false && stale.element.style.visibility === '' && stale.element.style.pointerEvents === '' && !stale.element.attrs.has('aria-hidden') && calls.includes('suspend:false'), '§9 a guest carrying the Stage\'s hide, leaving a SHOWN frame ⇒ every mark goes (both flags, visibility, pointer-events, aria-hidden, the suspended view) — 2.369.196 kept them: an invisible window', J({ stale: { s: stale._hiddenByStage, v: stale.element.style.visibility, pe: stale.element.style.pointerEvents }, calls }));
  const chatStale = mkWin('c2', { type: 'chat', _hiddenByDesktop: true }); chatStale.element.style.contentVisibility = 'hidden'; chatStale.element.style.visibility = 'hidden';
  wm._matchFrameVisibility(chatStale, mkWin('host2'));
  leg(chatStale._hiddenByDesktop === false && chatStale.element.style.contentVisibility === '' && chatStale.element.style.visibility === '', '§9 …a desktop hider\'s marks too (a chat\'s content-visibility included)');
  calls.length = 0;
  const g1 = mkWin('g1'); wm._matchFrameVisibility(g1, mkWin('hs', { _hiddenByStage: true }));
  const g2 = mkWin('g2'); wm._matchFrameVisibility(g2, mkWin('hd', { _hiddenByDesktop: true }));
  leg(J(calls) === J(['stage-hide:g1', 'desk-hide:g2']) && g1._hiddenByStage && g2._hiddenByDesktop, '§9 a HIDDEN frame ⇒ the leaving window is hidden the same way (a programmatic detach on a hidden Stage / desktop never pops a window onto the screen)', J(calls));
  const same = mkWin('x', { _hiddenByStage: true }); same.element.style.visibility = 'hidden';
  wm._matchFrameVisibility(same, same); wm._matchFrameVisibility(same, null);
  leg(same._hiddenByStage === true && same.element.style.visibility === 'hidden', '§9 the host leaving its own chain / no frame ⇒ nothing changes (the host IS the frame)');
  return failed;
}
const TG = await import('../src/lib/tab-group.js');
const frameFailed = await frameLegs(TG.installTabGroupMixin);

/** §10: StageManager — the hero's frame is its whole group; a torn-off tab belongs to the frame it left. */
async function stageFrameLegs(StageMgr, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const mk = (id, o = {}) => ({ id, type: 'browser-live', element: { style: {} }, ...o });
  const chain = { tabs: ['hero', 'live'], active: 0, layout: 'tabs' };
  const hero = mk('hero', { type: 'chat', _tabChain: chain, _desktopId: STAGE_ID, gridBounds: { left: 0.1, top: 0.1, width: 0.5, height: 0.5 } });
  const live = mk('live', { _tabChain: chain, _desktopId: STAGE_ID, _hiddenByStage: true }); live.element.style.visibility = 'hidden'; live.element.style.pointerEvents = 'none';
  const other = mk('other', { _desktopId: STAGE_ID, _hiddenByStage: true }); other.element.style.visibility = 'hidden';
  const wins = new Map([['hero', hero], ['live', live], ['other', other]]);
  const store = new Map();
  const sm = new StageMgr({ settings: { get: (k) => (k === 'desktop.dynamicEnabled' ? true : undefined), on() {} }, isMobile: false, sessions: new Map(), wm: { windows: wins, _captureGridBounds() {}, _applyGridBounds() {}, toggleMaximize() {} } });
  sm._sync = () => ({ get: (st, k) => store.get(k), set: (st, k, v) => store.set(k, v) });
  sm._borrowHero(hero);
  leg(live._hiddenByStage === false && live.element.style.visibility === '' && live.element.style.pointerEvents === '', '§10 _borrowHero shows the hero\'s WHOLE group — the guest the last leave() hid (unbound: enter() re-shows the hero + its bound aux only) — the root of his invisible window', J({ s: live._hiddenByStage, v: live.element.style.visibility }));
  leg(other._hiddenByStage === true && other.element.style.visibility === 'hidden', '§10 …and nothing outside the group (a parked window stays parked — the 2.209.0 pile-at-slot rule)');
  sm._active = true; sm._heroWinId = 'hero'; sm._heroKey = 'claude:M';
  const t1 = sm.onTornOff(live, hero);
  leg(t1 === true && sm._boundAux.get('live') === 'claude:M', '§10 a tab torn out of the HERO\'s group on the Stage becomes the hero\'s aux (the next leave / enter shows it again)', J([...sm._boundAux]));
  // bound to ANOTHER hero (auto-opened into a parked chat's group while that hero was showing) ⇒ re-owned, and taken out of that hero's record
  live._openSpec = { action: 'openBrowserLive', sessionId: 'sess-1' };
  store.set('ws:claude:O', JSON.stringify([{ openSpec: { action: 'openFile', path: '/a' } }, { openSpec: { action: 'openBrowserLive', sessionId: 'sess-1' } }]));
  sm._boundAux.set('live', 'claude:O');
  const t2 = sm.onTornOff(live, hero);
  const oRec = JSON.parse(store.get('ws:claude:O'));
  leg(t2 === true && sm._boundAux.get('live') === 'claude:M' && oRec.length === 1 && oRec[0].openSpec.action === 'openFile', '§10 …a window bound to ANOTHER hero is re-owned and leaves that hero\'s record (its other entries kept — else its next restore replays a second copy)', J({ owner: sm._boundAux.get('live'), oRec }));
  const aux = mk('aux2'); sm._boundAux.set('aux2', 'claude:M');
  const t3 = sm.onTornOff(mk('viewer'), aux);
  leg(t3 === true && sm._boundAux.get('viewer') === 'claude:M', '§10 a tab torn out of an AUX group takes that group\'s owner');
  leg(sm.onTornOff(mk('chat2', { type: 'chat' }), hero) === false && sm.onTornOff(mk('free'), mk('stranger')) === false, '§10 a session is never an aux; a frame outside the stage\'s workspace binds nothing');
  sm._active = false;
  leg(sm.onTornOff(mk('late'), hero) === false, '§10 the Stage off screen ⇒ nothing (a desktop tear-off is the desktop\'s)');
  return failed;
}
const stageFrameFailed = await stageFrameLegs(StageManager);

console.log('— §7 wiring: every door asks the one rule and says its refusal');
{
  const W = read('src/lib/window.js'), D = read('src/lib/desktop-manager.js'), CM = read('src/lib/command-mode.js'), TB = read('src/lib/taskbar.js');
  ok(/const v = this\._app\?\.stage\?\.moveVerdict \? this\._app\.stage\.moveVerdict\(win, toStage \? STAGE_ID : \(hoverPreview\.dataset\.desktopId \|\| null\)\)/.test(W), '§7 window.js: a hovered preview is judged by stage.moveVerdict (its own desktop id, or the Stage)');
  ok(/markRefusal\(refused, deskRefusal, e\);/.test(W) && /preview\.classList\.add\('stage-refuse'\)/.test(W) && /refuseLabel\.className = 'stage-refuse-label'/.test(W), '§7 …the refused preview is marked and the words ride beside the pointer');
  ok(/if \(refusal\) \{[\s\S]{0,700}this\._putBackAfterRefusedDrop\(win, dragFrom[\s\S]{0,200}this\._app\?\.desktopManager\?\.sayStageRefusal\?\.\(refusal\);\s*return;/.test(W), '§7 …a refused drop puts the window back where the drag began and SAYS why');
  ok(!/dragToDesktopBlocked\?\.\(win\)\)\) hoverPreview = null;/.test(W), '§7 …the old silent null-out of the hovered preview is gone');
  ok(!/dragToDesktopBlocked\?\.\(win\) \|\| desktopId === '__stage__'\) return;/.test(D) && /if \(!v\.ok\) \{ if \(speak\) this\.sayStageRefusal\(v\); return v; \}/.test(D), '§7 desktop-manager: the silent `return;` is a typed, spoken refusal');
  ok(/if \(winId\) this\.moveWindowToDesktop\(winId, desk\.id, \{ speak: true \}\);/.test(D) && /action: \(\) => this\.moveWindowToDesktop\(winId, d\.id, \{ speak: true \}\)/.test(D), '§7 …a taskbar item dropped on a preview and a menu row are user acts (speak)');
  ok(/dm\.moveWindowToDesktop\(wm\.activeWindowId, dm\.desktops\[next\]\.id, \{ speak: true \}\)/.test(CM), '§7 command mode\'s move-to-desktop keys speak');
  ok(/id: 'window\/move-to-desktop'[^\n]*getDesktopMenuItems\(c\.id\)/.test(TB), '§7 the window menu\'s "Move to Desktop ▸" reads getDesktopMenuItems (so the reason row reaches every window menu)');
  const TGS = read('src/lib/tab-group.js'), SMS = read('src/lib/stage-manager.js');
  ok(/if \(hostWin && hostWin !== win\) this\._matchFrameVisibility\(win, hostWin\);/.test(TGS), '§7 tab-group _detachFromChain: a leaving guest takes its frame\'s visibility (every detach — the drag, a regroup, a re-chain)');
  ok(/const frame = this\.windows\.get\(chain\.tabs\[0\] === winId \? chain\.tabs\[1\] : chain\.tabs\[0\]\) \|\| null;\s*this\._detachFromChain\(chain, winId\);[\s\S]{0,400}this\._app\?\.stage\?\.onTornOff\?\.\(win, frame\)/.test(TGS), '§7 …the tab drag names the frame BEFORE the detach and hands the torn-off window to the stage');
  ok(/for \(const id of \(win\._tabChain && Array\.isArray\(win\._tabChain\.tabs\) \? win\._tabChain\.tabs : \[\]\)\) \{[\s\S]{0,160}if \(m && m\._hiddenByStage\) this\._showWin\(m\);/.test(SMS), '§7 stage-manager _borrowHero re-shows the hero\'s whole group');
  ok(/\.desktop-preview\.stage-refuse \{/.test(read('public/style.css')) && /\.stage-refuse-label \{/.test(read('public/style.css')), '§7 style.css draws the mark and the label (theme vars)');
}

console.log('— §8 negative controls (patched copies, scripts/mutant-copy.mjs)');
{
  const M = mutantCopies('stagedrag', REPO);
  const PURE = [
    { tag: 'kind-blind-to-the-binding', find: "  const onStage = !!f.onStage || (f.desktopId != null && f.desktopId === stageId) || !!f.bound;", repl: "  const onStage = !!f.onStage || (f.desktopId != null && f.desktopId === stageId);", expect: /BOUND aux/ },
    { tag: 'no-words-for-a-window', find: "  return { line: t('Windows on the Stage stay on the Stage'), next: t('Open it again on the desktop where you want it.') };", repl: '  return null;', expect: /line AND a next step/ },
  ];
  for (const m of PURE) {
    const found = SRC.includes(m.find);
    ok(found, `control ${m.tag}: the patched line exists in the model`);
    if (!found) continue;
    const f = pureLegs(M.load(MODEL, SRC.replace(m.find, m.repl), m.tag), { quiet: true });
    ok(f.some((n) => m.expect.test(n)), `control ${m.tag}: the patched copy turns its leg RED (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
  }
  // the pre-fix desktop-manager: the silent return (a patched ESM copy, every import re-bound to the real modules)
  const DSRC = read('src/lib/desktop-manager.js');
  const find = '    if (!v.ok) { if (speak) this.sayStageRefusal(v); return v; }';
  ok(DSRC.includes(find), 'control silent-return: the patched line exists in desktop-manager.js');
  if (DSRC.includes(find)) {
    const f = M.write('src/lib/desktop-manager.js', DSRC.replace(find, '    if (!v.ok) return;'), 'silent-return');
    const failed = await dmLegs((await import(f)).DesktopManager, { quiet: true });
    ok(failed.some((n) => /says the refusal in a toast/.test(n)) && failed.some((n) => /TYPED refusal/.test(n)), `control silent-return: the pre-fix silent return turns the typed + spoken legs RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 160)})`);
  }
  // the vanish: a frame-visibility that forgets the inline hide, and a borrow that shows the hero alone (2.369.196)
  const TGSRC = read('src/lib/tab-group.js');
  const tgFind = "    el.style.visibility = ''; el.style.pointerEvents = '';\n";
  ok(TGSRC.includes(tgFind), 'control keeps-inline-hide: the patched line exists in tab-group.js');
  if (TGSRC.includes(tgFind)) {
    const f = M.write('src/lib/tab-group.js', TGSRC.replace(tgFind, '\n'), 'keeps-inline-hide');
    const failed = await frameLegs((await import(f)).installTabGroupMixin, { quiet: true });
    ok(failed.some((n) => /every mark goes/.test(n)), `control keeps-inline-hide: the torn-off window keeps visibility:hidden ⇒ the §9 leg turns RED (${failed.length}: ${failed.slice(0, 1).join(' | ').slice(0, 140)})`);
  }
  const SMSRC = read('src/lib/stage-manager.js');
  const smFind = '      if (m && m._hiddenByStage) this._showWin(m);\n';
  ok(SMSRC.includes(smFind), 'control hero-alone: the patched line exists in stage-manager.js');
  if (SMSRC.includes(smFind)) {
    // the copy re-evaluates the module: its window-type registration would be a duplicate — the copy drops it (the class is what is judged)
    const f = M.write('src/lib/stage-manager.js', SMSRC.replace(smFind, '\n').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n'), 'hero-alone');
    const failed = await stageFrameLegs((await import(f)).StageManager, { quiet: true });
    ok(failed.some((n) => /WHOLE group/.test(n)), `control hero-alone: the borrow that shows the hero alone (2.369.196) turns the §10 leg RED (${failed.length}: ${failed.slice(0, 1).join(' | ').slice(0, 140)})`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 5 })) ok(r.pass, r.name, r.detail);
}

const anyFailed = fail || realFailed.length || dmFailed.length || frameFailed.length || stageFrameFailed.length;
console.log(`\n${anyFailed ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(anyFailed ? 1 : 0);
