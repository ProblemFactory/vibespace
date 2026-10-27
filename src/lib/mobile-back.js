// THE PHONE'S BACK GESTURE, WIRED (lane mobile-back-guard, 2026-10-18; every decision is PURE in ./back-guard.js).
// App installs it only when app.isMobile — a desktop browser's back is never touched. ONE sentinel history entry stands
// above the page's own; a back press is a popstate onto the page's entry, and then:
//   close — the topmost layer closes exactly as Esc / its own ✕ / the sidebar's ‹ row would (the window area yields
//           to the phone's HOME: the attention page when the attention list has rows, else the sidebar — lane
//           phone-first-screen), then history.go(1) steps back onto the same sentinel
//   arm   — at home: the 「再返回一次退出」 toast, and the page stays on its own entry for BACK_WINDOW_MS, so a second
//           back is the browser's own and leaves (also when VibeSpace is the tab's first page); after the window a
//           timer steps back onto the sentinel (a later back re-arms)
//   leave — the Mobile setting was turned off (or an odd stack): keep going back
// Re-arming is a TRAVERSAL (go(1)), never a fresh pushState — see back-guard.js's head for the measured reason.
// A BACK NEVER COSTS A LOAD (lane phone-back-reload): a boot standing on a sentinel whose page entry below is not this
// document's (a discarded tab shown again, a history load) REBUILDS the pair — replaceState(null) makes this entry the
// page's own, push() stands a sentinel above it; and when VibeSpace's OLDER entries stand below the page's entry (a
// renderer kill's reload, a second load of the app in the tab) the exit re-arms at once and the next back leaves past
// them all in ONE history.go(-n). Every boot, back, re-arm and exit is a row in the tab's diary (./nav-log.js); a load
// that followed a back press inside VibeSpace files an incident by itself.
// THE EXIT GOES ON (acceptance round 2): go() counts JOINT-history steps — an older document's iframe link adds one the
// entries never show — so the exit leaves an intent, and a document its go() lands on reads it in continueExit (the
// first thing src/client.js does) and goes on back without booting the app.
// EVERY GO() IS WATCHED TO ITS END (acceptance round 3, measured on Chrome 154): a traversal beforeunload announced can
// be CANCELLED — the entry it went for answers 204, the load is stopped — and then neither pagehide nor pageshow ever
// comes; a page with nothing to bound it stood on the splash for good. So each go() of the exit is bounded (watchedGo),
// a document the cache shows again asks the intent as a load would, and a browser that cannot say where a load came
// from (no navigation.activation) writes no intent at all.
// A STAYED GO() IS SUSPENDED, NEVER FORGOTTEN (acceptance round 4, measured on Chrome 154 with the cache off and on): the
// page cannot tell a cancelled traversal from a SLOW one (a cold cache, a slow link: it commits after the bound), so a
// stay keeps the intent for the document a late commit lands on, re-arms by a new sentinel (a traversal while one is
// pending ABORTS that one — measured), and the diary tells the late commit; a tap while the go() is pending aborts it by
// the step onto the sentinel above (window.stop() aborts no traversal — measured).
// THE LATE WATCH HOLDS (acceptance round 5, measured on Chrome 154 with the cache off and on): a tap AFTER the stay
// aborts the suspended traversal too — the stay's new sentinel has nothing above it, so the step goes DOWN onto the
// page's own entry (any same-document traversal aborts a pending one), then a new sentinel; a #fragment link's
// navigation is a push that aborts nothing, so it ends no watch; a step that cannot abort — none to take, refused, or
// onto the stale copy of its own entry that the document a late commit landed on lists (it moves nothing) — keeps the
// intent and re-arms, so a commit still to come lands where the landing document's rule decides.
// A TAP ENDS IN A POINTERUP (acceptance round 6, measured on Chrome 154 with the cache off and on): in the late watch a
// press the browser takes — a pan, a gesture: a pointercancel — is no tap, and neither is the browser's own back or
// forward, by a key or by a mouse's back / forward button (ONE predicate, navInput): each reaches the page before the
// browser steps, and read as a tap the step ran ahead of the browser's back.
// ONE TAP IN BOTH PHASES (acceptance round 7): while the exit's go() is still pending, a tap is the same — a pointerdown
// that ends in a pointerup on the page, a key at its keydown, never the browser's own back or forward (tapOf) — round 6
// told it in the late watch alone, so a pan 1 s into a slow exit still cancelled the exit and the same pan 4 s in did not.
// ONE PRESS ACROSS A HOP (acceptance round 8): a press whose pointerdown came before a go() was told «nothing» (700 ms:
// an iframe-only step, the exit goes on with the next hop) and whose pointerup comes after is a tap still — nothing()
// hands the pointers down on to the next go()'s watch; round 7 lost it there, and the exit went on under the finger.
import { t } from './i18n.js';
import { showToast, noteOwnGesture } from './utils.js';
import { SHEET_ROOTS } from './form-yield.js'; // PURE (lane dialog-yield r2): the ONE dialog predicate set — the phone shows every dialog as an overlay
import { BACK_WINDOW_MS, BACK_DISMISS_EVENT, EXIT_HOPS, EXIT_INTENT_MS, isSentinel, bootStep, backTarget, backVerdict, exitPlan, exitHop, backCostLoad, slowExit } from './back-guard.js';
import { navNote, navLogRead, prevDocTail, entriesShape, exitIntentRead, exitIntentWrite, exitIntentClear, DOC_ID } from './nav-log.js';

export const BACK_SETTING = 'mobile.backGuard';
const shown = (el) => !!el && !el.classList.contains('hidden');
const pathOf = (url) => { try { return new URL(url).pathname; } catch { return null; } };
const stateWord = (s) => (isSentinel(s) ? 'vs1' : s == null ? 'null' : 'other');
/** The page's index in `list` (navigation.entries()): currentEntry.index — or, where Chrome says -1, its own entry found by
 *  its key (round 4, measured on Chrome 154: a document a traversal commits onto after a sentinel was pushed while that
 *  traversal was pending reports index -1 — its entries() end with a copy of it where the pushed entry stands). */
const indexIn = (nav, list) => { const c = nav?.currentEntry; return !c ? -1 : c.index >= 0 ? c.index : list.findIndex((e) => e && e.key === c.key); };
/** The Navigation API's view (Chrome 102+): the contiguous same-origin block of this tab's entries and the page's
 *  index in it — null without the API (then the exit is the browser's own, as before). */
function entriesNow() {
  try {
    const nav = globalThis.navigation;
    const list = nav?.entries?.(), cur = Array.isArray(list) ? indexIn(nav, list) : -1;
    if (!Array.isArray(list) || !(cur >= 0)) return null;
    return { list: list.map((e) => ({ same: !!e.sameDocument, path: pathOf(e.url) })), current: cur };
  } catch { return null; }
}
/** How this document was loaded: the navigation type, document.wasDiscarded, the referrer's kind (never its URL). */
function bootFacts() {
  let type = '', ref = 'none';
  try { type = performance.getEntriesByType('navigation')[0]?.type || ''; } catch { }
  try { if (document.referrer) ref = new URL(document.referrer).origin === location.origin ? 'same' : 'other'; } catch { ref = 'other'; }
  return { type, ref, disc: !!document.wasDiscarded, vis: document.visibilityState || '' };
}
/** One capture per tab per half hour for a back that cost a load (the diary's own 'capture' rows say when). */
const CAPTURE_EVERY_MS = 30 * 60e3;
/** The entry the page stands on: the browser's random key, cut to 8 ('' without the Navigation API). */
const entryKey = () => { try { return String(globalThis.navigation?.currentEntry?.key || '').slice(0, 8); } catch { return ''; } };
/** The same key, whole (navigation.traverseTo's). */
const fullKey = () => { try { return String(globalThis.navigation?.currentEntry?.key || ''); } catch { return ''; } };
/** How this document was reached (navigation.activation, Chrome 123+): the key of the entry it came FROM (null = a page
 *  of another site; undefined = no such API) and the way — 'back' (from a higher entry), 'forward', 'other', '' (cannot be
 *  told). */
function arrival() {
  try {
    const a = globalThis.navigation?.activation;
    if (!a) return { fromKey: undefined, came: '' };
    const f = a.from, e = a.entry;
    if (!f) return { fromKey: null, came: 'other' };
    // both indexes -1 (round 4, measured — indexIn's document: Chrome's list lost the entry it came from): the way in
    // cannot be told
    if (!(f.index >= 0) && e && !(e.index >= 0)) return { fromKey: String(f.key || '').slice(0, 8), came: '' };
    return { fromKey: String(f.key || '').slice(0, 8), came: f.index >= 0 && e && e.index >= 0 ? (f.index > e.index ? 'back' : 'forward') : 'other' };
  } catch { return { fromKey: undefined, came: '' }; }
}
/** A go() that started nothing is told by beforeunload, never pagehide (measured on Chrome 154: beforeunload 4 ms after a
 *  go() onto a slow page — also when listened to only just before it —, pagehide 3 s later, when the next page COMMITS;
 *  out of range, neither comes). Listened to only around the exit's go(): a page that holds a beforeunload listener
 *  makes each of its reloads wait for it (measured: the suite's reload leg saw the old page a beat longer). */
const GO_WAIT_MS = 700;
/** A traversal beforeunload announced and the page still here this long after: the page STAYS (round 3, measured on
 *  Chrome 154 — the entry it went for answered 204, the load was stopped: no pagehide, no pageshow, ever). Round 4: it
 *  may only be SLOW — a page that commits later than this still leaves, so the stay keeps the go()'s intent (linger). */
const GONE_WAIT_MS = 3000;
/** A stayed go() is watched this long after it for a late commit (the diary's slow row); a later one is not told. */
const SLOW_WATCH_MS = 30000;
/** A tap's events, in both phases of a watched go() (round 6 for the late watch, round 7 while the go() is pending): a tap
 *  is a pointerdown that ENDS in a pointerup on the page — a pointercancel (a pan, a gesture the browser or the system
 *  took) is none (measured on Chrome 154: a touch the browser pans gives the page its pointerdown, then a pointercancel
 *  70–90 ms in). */
const TAPS = ['pointerdown', 'pointerup', 'pointercancel', 'keydown'];
/** The browser's own back or forward, never use of the page — ONE predicate for every form, so they cannot drift: a key
 *  (Alt+← / →, ⌘ held, a BrowserBack / BrowserForward key — round 5) or a mouse's back / forward button (button 3 / 4 on a
 *  pointer or mouse event — round 6). Each reaches the page BEFORE the browser steps (measured on Chrome 154: the
 *  keydown before the back; the button's pointerdown and mousedown, the back at its release), and read as a tap the late
 *  watch's step down ran ahead of the browser's own back (round 5's key: the two went back past the page — the older
 *  document loaded). Android's own back — the gesture, the bar's button — is reasoned to give the page no input event
 *  at all (the system takes it); that is NOT measured on a device. */
const navInput = (e) => !!e && (e.type === 'keydown' ? !!e.altKey || !!e.metaKey || e.key === 'BrowserBack' || e.key === 'BrowserForward' : e.button === 3 || e.button === 4);
/** ONE tap, for both phases of a watched go() (round 7): a key at its keydown, a pointer at its pointerup after its
 *  pointerdown — `downs` holds the pointers down on the page —; a pointercancel ends the press untold, a pointerup whose
 *  pointerdown came before the watch is none, and the browser's own back or forward (navInput) never is one. */
const tapOf = (downs, e) => {
  if (navInput(e)) return false;
  const id = e.pointerId ?? 0;
  if (e.type === 'pointerdown') { downs.add(id); return false; }
  if (e.type === 'pointercancel') { downs.delete(id); return false; } // a pan, a gesture the browser or the system took
  if (e.type === 'pointerup') return downs.delete(id); // false: a press that began before the watch
  return e.type === 'keydown';
};
/** Can this browser say where a load came from (navigation.activation: Chrome 123+, Safari 26.2+)? Without it a load
 *  the exit's go() lands on cannot be told from a later forward press, so the exit writes no intent (round 3): one go(),
 *  round 1's ONE named load at most when an unseen step stops it short. */
const tellsArrival = () => { try { return !!globalThis.navigation?.activation; } catch { return false; } };

/** The end() of the go() this page STAYED through (round 4), still watched for a late commit — one at a time: a new go()
 *  and a back press (a same-document traversal aborts a pending one — measured) end it; a #fragment link's navigation
 *  does not (round 5: a push aborts nothing — measured). */
let lingering = null;
/** abortGo's step on its way (round 5): its popstate is the page's own, never a back press. */
let ownStep = false;
/** The booted page's re-arm (installMobileBack's rearm) — null in a document the exit's go() loaded until its app boots. */
let rearmHere = null;
/** The last currententrychange's navigationType — it comes right before each popstate (round 5, measured on Chrome 154):
 *  'traverse' for a back or a step, 'push' for a #fragment link's navigation; '' without the Navigation API. */
let entryHow = '';
/** A traversal of this document still pending, ABORTED by a same-document traversal (round 4, measured on Chrome 154 with
 *  the cache off and on: window.stop() aborts no traversal — it commits as if nothing happened; a step onto an entry of
 *  this document aborts it and lands there; history.go() is no sure step — Chrome counted a go(1) from the PENDING entry,
 *  so it landed nowhere). By key (navigation.traverseTo): UP onto the entry above — the sentinel, so the abort IS the
 *  re-arm —, else DOWN onto `home`, the page's own entry (round 5: after the stay's new sentinel nothing stands above —
 *  measured: the step down aborts it as well). Never onto a copy of the page's own entry (round 5: the document a late
 *  commit landed on lists one, index -1, its own key, right above it — measured: a step onto it commits at once, moves
 *  nothing and aborts nothing). A promise of whether the page now stands where it stepped (false: refused, moved nothing,
 *  or the commit came first), or null when no such entry stands here. */
function abortGo(home = '') {
  try {
    const nav = globalThis.navigation, list = nav.entries(), cur = nav.currentEntry, at = indexIn(nav, list);
    if (!(at >= 0)) return null;
    const up = list.slice(at + 1).find((e) => !e || e.key !== cur.key); // the entry above, past a copy of the page's own
    const to = up && up.sameDocument && up.index >= 0 ? up : home ? list.find((e) => e && e.sameDocument && e.key === home && e.key !== cur.key) : null;
    if (!to) return null;
    ownStep = true;
    const step = nav.traverseTo(to.key);
    step.finished?.catch?.(() => { });
    return step.committed.then(() => nav.currentEntry?.key === to.key, () => false).then((landed) => { if (!landed) ownStep = false; return landed; });
  } catch { ownStep = false; return null; }
}

/** ONE go(n) meant to LEAVE this document, watched to its end: `nothing(downs)` when no traversal began within GO_WAIT_MS
 *  (out of range, an iframe-only step) — the pointers still down handed on, so the next go()'s watch starts with them
 *  (`held` — round 8: a press across that boundary is the tap it would have been); `input()` at a person's tap or key
 *  before one began (they are using the page: the intent ends). Once one began (beforeunload) the page STAYS —
 *  `stayed(why)` — when it is still here GONE_WAIT_MS later
 *  ('cancelled': a 204, a stopped load — or only a slow one) or at a person's tap or key ('input'). Each outcome, and the
 *  pagehide that ends the page, removes every listener it added. A stayed go() is SUSPENDED, never forgotten (round 4):
 *  its intent kept for a late commit's landing, and the late commit itself told in the diary (`hop`: the hop's number;
 *  null = the exit's own go()). A tap or key on the stayed page — while the go() is pending ('input') or after the stay
 *  ('input-late', round 5); in both phases ONE tap (tapOf: round 6 in the late watch, round 7 while the go() is pending)
 *  — ABORTS it where a same-document step can (abortGo): landed, the exit is over — the intent dropped, the watch ended;
 *  else (no entry to step onto, the step refused or moving nothing — round 5) NOT aborted: the
 *  intent kept for the landing document's rule (inside its window it goes on, past it it boots and files «a slow
 *  exit»), the watch on, a later tap tried again. Either way the page stands on a sentinel again (rearm, abort 1 | 0). */
function watchedGo(n, { nothing, input = () => { }, stayed, hop = null, held = null }) {
  lingering?.();
  const t0 = Date.now(), mine = exitIntentRead(), home = fullKey(); // the intent this go() leaves behind (null: none was written); the page's own entry
  const ours = () => { const i = exitIntentRead(); return !!mine && !!i && i.t === mine.t && i.hop === mine.hop; };
  const drop = () => { if (ours()) exitIntentClear(); };
  let began = false, gone = false, watching = false, saidKept = false, bound = null, wait = null, cap = null;
  const downs = new Set(held); // the pointers down while the go() is watched (tapOf: a tap is one that comes up; held: a
  // go() before it in this exit began nothing while they were down — round 8)
  const off = () => {
    clearTimeout(wait); clearTimeout(bound);
    window.removeEventListener('beforeunload', onLeave); window.removeEventListener('pagehide', onHide);
    for (const ev of TAPS) window.removeEventListener(ev, onPendingInput, true);
  };
  /** The stayed go(), watched SLOW_WATCH_MS more (linger): a tap or key tries to abort it (tapped), the end of its window
   *  drops the intent; the late commit's pagehide writes the slow row and keys the intent to the entry the page leaves
   *  from (measured: a sentinel stood up while the traversal is pending becomes the landing document's activation from). */
  const end = () => {
    watching = false; clearTimeout(cap);
    window.removeEventListener('pagehide', onLate); stopTaps();
    if (lingering === end) lingering = null;
  };
  const stopTaps = () => { downs.clear(); for (const ev of TAPS) window.removeEventListener(ev, onLateInput, true); };
  const onLate = () => {
    gone = true;
    if (ours()) exitIntentWrite({ t: mine.t, hop: mine.hop, key: entryKey(), to: 'below' });
    navNote(hop === null ? { k: 'leave', slow: Date.now() - t0 } : { k: 'hop', n: hop, slow: Date.now() - t0 });
    end();
  };
  /** A tap in the late watch (tapOf — round 6). */
  const onLateInput = (e) => { if (tapOf(downs, e)) { stopTaps(); tapped('input-late'); } };
  const listenTaps = () => { if (watching) for (const ev of TAPS) window.addEventListener(ev, onLateInput, true); };
  const linger = () => {
    watching = true;
    window.addEventListener('pagehide', onLate);
    cap = setTimeout(end, SLOW_WATCH_MS);
    if (mine) setTimeout(drop, Math.max(0, mine.t + EXIT_INTENT_MS - Date.now()));
    lingering = end;
  };
  /** A tap or key on the stayed page: the abort, then what it says (above) — the re-arm after the step's own popstate
   *  (that comes after its committed — measured); a go() not aborted is said once. */
  const tapped = (why) => {
    const abort = abortGo(home);
    const after = (landed) => {
      if (gone) return; // the commit came first: this page is gone
      if (landed) { drop(); end(); } else listenTaps();
      if (!landed && saidKept) return;
      if (!landed && rearmHere) saidKept = true;
      setTimeout(() => { ownStep = false; rearmHere?.(why, landed ? 1 : 0); }, 0);
    };
    if (abort) abort.then(after); else after(false);
  };
  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); stayed('cancelled'); linger(); listenTaps(); }, GONE_WAIT_MS); };
  const onHide = () => { began = true; gone = true; off(); };
  const onInput = () => {
    off();
    if (!began) { drop(); input(); return; }
    stayed('input'); linger(); tapped('input');
  };
  /** A tap while the go() is pending: the late watch's own (tapOf — round 7; round 6 tapped here at the first pointerdown
   *  or keydown, any button, so a pan 1 s into a slow exit cancelled it). */
  const onPendingInput = (e) => { if (tapOf(downs, e)) onInput(); };
  window.addEventListener('beforeunload', onLeave); window.addEventListener('pagehide', onHide);
  for (const ev of TAPS) window.addEventListener(ev, onPendingInput, true);
  history.go(n);
  wait = setTimeout(() => { if (!began) { off(); nothing(downs); } }, GO_WAIT_MS);
}

/** An intent this document will not act on: dropped, and the diary says why (the cap reached, or not this load's). */
const dropIntent = (intent, step) => { exitIntentClear(); navNote(step === 'stay' ? { k: 'hop', n: intent.hop, stay: 1, why: 'cap' } : { k: 'hop', n: intent.hop, drop: 1 }); };
/** Shown again by the back/forward cache: the intent asked as a load would ask it — a restore IS a traversal, and
 *  navigation.activation names where it came from (measured on Chrome 154) — round 3: the exit's go() can land on an
 *  older document the cache KEPT, which then went on standing there. */
const shownStep = () => {
  const held = exitIntentRead();
  return { intent: held, step: held ? exitHop({ intent: held, navType: 'back_forward', fromKey: arrival().fromKey, now: Date.now() }) : 'none' };
};

/** THE EXIT GOES ON (back-guard.js exitHop) — src/client.js calls it before anything boots. null: boot the app now. A
 *  Promise: this document is an older VibeSpace entry the exit's go() LOADED — it goes on back (goOn) and never boots the
 *  app; the promise settles only when the page stays — then the app boots: the exit's ONE named load. */
export function continueExit() {
  const intent = exitIntentRead();
  if (!intent) return null;
  let type = '';
  try { type = performance.getEntriesByType('navigation')[0]?.type || ''; } catch { }
  const step = exitHop({ intent, navType: type, fromKey: arrival().fromKey, now: Date.now() });
  if (step !== 'hop') { dropIntent(intent, step); return null; }
  return goOn(Number(intent.hop) || 0);
}

/** This document's part of the exit going on: ONE go(-(current+1)) per hop — the intent rewritten and a diary row before
 *  it —, a go() that began nothing (an iframe-only step) once more, up to EXIT_HOPS. Settles with why the page STAYS:
 *  the cap, a person's tap or key (input), no Navigation API (api), a traversal that did not end in time (cancelled —
 *  round 4: its intent SUSPENDED, watchedGo's to keep or drop), shown again by the cache with no intent of its load
 *  (show) — every listener of its own removed by then, but a stayed go()'s late watch (watchedGo). */
function goOn(from) {
  let hop = from, settled = false, done = null;
  const settledP = new Promise((r) => { done = r; });
  const stay = (why, held = false) => { if (settled) return; settled = true; window.removeEventListener('pageshow', onShow); if (!held) exitIntentClear(); navNote({ k: 'hop', n: hop, stay: 1, why }); done(why); };
  const onShow = (e) => {
    if (!e.persisted || settled) return;
    const { intent, step } = shownStep();
    if (step === 'hop') { hop = Number(intent.hop) || 0; once(); } else stay(step === 'stay' ? 'cap' : 'show');
  };
  window.addEventListener('pageshow', onShow);
  const once = (held = null) => { // held: the pointers still down when the go() before it began nothing (round 8)
    if (settled) return;
    const e = entriesNow();
    if (!e) { stay('api'); return; }
    if (hop >= EXIT_HOPS) { stay('cap'); return; }
    hop++;
    exitIntentWrite({ t: Date.now(), hop, key: entryKey(), to: 'below' });
    navNote({ k: 'hop', n: hop, skip: e.current + 1, ents: entriesShape(e.list, e.current, location.pathname) });
    watchedGo(-(e.current + 1), { nothing: once, input: () => stay('input'), stayed: (why) => stay(why, true), hop, held });
  };
  once();
  return settledP;
}

/** The open layers right now (backTarget's snapshot) and how each one closes. */
function layersOf(app) {
  const sb = app.sidebar;
  const shells = [...document.querySelectorAll(SHEET_ROOTS)].filter((o) => o.id !== 'dialog-overlay' && shown(o)); // createModalShell overlays (z 99998, above the static one)
  const sheets = [...document.querySelectorAll('.usage-popup')].filter(shown); // the For-you tray + the usage popup — full-width sheets on a phone
  const backRow = sb?._mobileDrilldown ? sb.listEl?.querySelector('.mobile-folder-back') : null;
  const home = app.phoneHome; // lane phone-first-screen: the attention page (src/lib/user-todos-panel.js) — home while it has rows
  const snap = {
    popover: !!document.querySelector('[data-popover]'),
    dialog: shells.length > 0 || shown(document.getElementById('dialog-overlay')),
    switcher: !!document.querySelector('.mobile-win-switcher'),
    sheet: sheets.length > 0,
    sidebarOpen: !!sb?.isOpen,
    drilldown: !!backRow,
    home: !!home?.shown?.() || app.viewportClass?.() === 'regular', // the regular class (lane duo-build-1): list + conversation on screen = home
    homeRows: !!home?.hasRows?.(),
  };
  const close = {
    popover: () => document.querySelectorAll('[data-popover]').forEach((el) => el.remove()), // Esc's own rule: every float at once
    dialog: () => { // the topmost shell through its ✕ (its onClose / a dialog promise's cancel runs), else the static overlay
      const top = shells[shells.length - 1];
      if (!top) { app.hideDialogs(); return; }
      const x = top.querySelector('.dialog-close');
      if (x) x.click(); else top.remove();
    },
    switcher: () => document.querySelectorAll('.mobile-win-switcher').forEach((el) => el.remove()),
    sheet: () => { for (const el of sheets) if (el.dispatchEvent(new CustomEvent(BACK_DISMISS_EVENT, { cancelable: true }))) el.classList.add('hidden'); },
    window: () => { if (!home?.show?.()) sb.toggle(true); }, // home: the attention page when it has rows, else the conversation list
    sidebar: () => sb.toggle(false), // back to what it covered (the attention page, or the window it was opened over)
    drilldown: () => backRow.click(),
  };
  return { snap, close };
}

export function installMobileBack(app) {
  const enabled = () => app.settings?.get(BACK_SETTING) !== false;
  const deepLink = !!location.search; // a `?` link opened a specific place: its first back closes no window (backVerdict)
  let lastBackAt = 0, backs = 0, gen = 0, restand = null, fwdAt = 0;
  let baseHref = location.href; // the page entry the sentinel stands above (pushState('') keeps the URL)
  const push = () => { baseHref = location.href; history.pushState({ vs: 1 }, ''); };
  const shapeNow = () => { const e = entriesNow(); return e ? entriesShape(e.list, e.current, location.pathname) : ''; };
  /** A page that stayed through its go() stands on a sentinel again (round 4: a new one, never a traversal while one may be
   *  pending — it would ABORT that one, measured) — unless one stands here already (a tap's step landed on it); the
   *  diary's rearm row says why, and for a tap whether its step aborted the go() (abort 1 | 0 — round 5). */
  const rearm = (why, abort) => {
    if (!enabled() || app.isMobile === false) return;
    if (!isSentinel(history.state)) push();
    navNote(abort === undefined ? { k: 'rearm', why } : { k: 'rearm', why, abort });
  };
  rearmHere = rearm;
  try { globalThis.navigation?.addEventListener?.('currententrychange', (e) => { entryHow = String(e?.navigationType || ''); }); } catch { }
  /** Step back onto the sentinel; when no forward entry answers (a same-document navigation dropped it), push one. */
  const forward = () => {
    restand = null;
    if (isSentinel(history.state)) return;
    const g = ++gen;
    fwdAt = Date.now();
    history.go(1);
    setTimeout(() => { if (g === gen && !isSentinel(history.state) && enabled()) { fwdAt = 0; navNote({ k: 'go1', landed: 0, push: 1 }); push(); } }, 500);
  };
  /** The exit past VibeSpace's own older entries (backVerdict's skip / load). */
  const leaveBy = ({ skip, load }) => {
    navNote({ k: 'leave', skip, load: load ? 1 : 0 });
    if (!(skip > 1)) { history.back(); return; }
    if (load) { history.go(-skip); return; }
    // the intent first: should an older document's unseen step stop this go() ON that document, it goes on (continueExit)
    // — only where that landing can be told from a later forward press (round 3)
    if (tellsArrival()) exitIntentWrite({ t: Date.now(), hop: 0, key: entryKey(), to: 'below' });
    const g = ++gen;
    watchedGo(-skip, {
      // nothing stood before the block after all (an entry outside it was a forward one): go(-skip) started nothing —
      // the tab's first entry then, the ONE named load (unwatched since round 1: no watch to hand a press still down to)
      nothing: () => { exitIntentClear(); const e = entriesNow(); if (g === gen && e && e.current > 0) { navNote({ k: 'leave', skip: e.current, load: 1 }); history.go(-e.current); } },
      // the booted page STAYS (round 4): its go() suspended (watchedGo keeps the intent for a late commit) and the page
      // RE-ARMED, so the next back is ours again (the 「再返回一次退出」 toast); a tap's re-arm is watchedGo's (round 5:
      // after its abort's step)
      stayed: (why) => { navNote({ k: 'leave', why }); if (why === 'cancelled') rearm(why); },
    });
  };
  // THE BOOT (lane phone-back-reload): what loaded this document, the rebuild when the entry below is not ours, the row
  const facts = bootFacts(), entsAtBoot = entriesNow(), stateAtBoot = history.state, shapeAtBoot = shapeNow();
  const prev = prevDocTail(navLogRead(), undefined, 4);
  // a back from the previous document's OWN entry (its last pagehide named it), or another way in (backCostLoad's came)
  const arr = arrival(), lastEk = [...prev].reverse().find((r) => r && r.ek)?.ek;
  const came = arr.came === 'back' && lastEk && arr.fromKey !== lastEk ? 'other' : arr.came;
  const belowSame = entsAtBoot && entsAtBoot.current > 0 ? entsAtBoot.list[entsAtBoot.current - 1].same : null;
  const step = bootStep({ phone: true, enabled: enabled(), state: stateAtBoot, navType: facts.type, wasDiscarded: facts.disc, belowSame });
  if (step === 'rebuild') history.replaceState(null, '');
  if (step === 'push' || step === 'rebuild') push();
  navNote({ k: 'boot', type: facts.type, step, st: stateWord(stateAtBoot), len: history.length, ents: shapeAtBoot, disc: facts.disc ? 1 : 0, ref: facts.ref, vis: facts.vis, came: came });
  // a load the exit's go() reached LATE (round 4: the page before stayed through it, then left — its slow row) and that
  // did not go on (no live intent: past its window, or a tap there dropped it — round 5: a document that went on, its own
  // hop rows, never: it only stayed at its own bound): an incident of its own
  const late = slowExit({ navType: facts.type, prev, now: Date.now(), came, mine: navLogRead().filter((r) => r && r.d === DOC_ID) });
  if (late || backCostLoad({ navType: facts.type, prev, now: Date.now(), came })) {
    const why = `${prev.map((r) => r.k + (r.v ? ':' + r.v : '') + (r.slow ? ` slow ${r.slow} ms` : '')).join(' > ')} → ${facts.type} boot (${step}, ${shapeAtBoot || 'no navigation API'})`;
    const recent = navLogRead().some((r) => r.k === 'capture' && Date.now() - r.t < CAPTURE_EVERY_MS);
    navNote(late ? { k: 'cost', capture: recent ? 0 : 1, why: 'slow' } : { k: 'cost', capture: recent ? 0 : 1 });
    if (!recent) app.ready?.then?.(() => app.autoCaptureIncident?.(late ? 'a slow exit' : 'a back press cost a page load', why, { toastKey: 'A back press reloaded the page — captured automatically ({id}), see Diagnostics → Incidents' }))
      .then?.((id) => { if (id) navNote({ k: 'capture', id: String(id).slice(0, 40) }); });
  }
  window.addEventListener('pagehide', (e) => { navNote({ k: 'hide', p: e.persisted ? 1 : 0, ek: entryKey() }); });
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    gen++;
    const { intent, step } = shownStep();
    navNote({ k: 'show', p: 1 });
    if (step === 'hop') goOn(Number(intent.hop) || 0); // the exit's go() landed on this KEPT document: it goes on (round 3)
    else if (intent) dropIntent(intent, step);
  });
  window.addEventListener('popstate', (e) => {
    gen++;
    const how = entryHow; entryHow = '';
    if (ownStep) { ownStep = false; return; } // abortGo's own step (round 5): the go() it aborted, never a back press
    // a same-document TRAVERSAL aborts a traversal still pending (round 4 — measured): the late watch ends; a #fragment
    // link's navigation is a push that aborts none (round 5 — measured): the watch goes on (no Navigation API: the
    // fragment rule below — another URL than the page's)
    if (how ? how === 'traverse' : location.href === baseHref) lingering?.();
    if (isSentinel(e.state)) { if (fwdAt) { navNote({ k: 'go1', ms: Date.now() - fwdAt }); fwdAt = 0; } return; } // our own step forward landing
    // a same-document navigation to another URL (a #fragment link in rendered markdown) is no back press: stand above it
    if (location.href !== baseHref) { clearTimeout(restand); restand = null; push(); return; }
    clearTimeout(restand); restand = null;
    const { snap, close } = layersOf(app);
    const target = backTarget(snap), now = Date.now();
    const ents = entriesNow();
    const exit = ents ? exitPlan({ current: ents.current, block: ents.list.length, length: history.length }) : null; // VibeSpace's older entries below the page's
    const v = backVerdict({ phone: app.isMobile !== false, enabled: enabled(), target, lastBackAt, now, deepLinkFirst: deepLink && backs === 0, exit }); // unfolded to the desktop (lane duo-build-1) the back is the browser's
    backs++;
    navNote({ k: 'pop', st: stateWord(e.state), v: v.action, tg: target || '', ex: exit ? exit.skip : 0 });
    if (v.action === 'close') {
      try { close[target](); } catch (err) { console.warn('back gesture: closing the', target, 'failed', err); }
      forward();
    } else if (v.action === 'arm') {
      lastBackAt = now;
      noteOwnGesture(); // the person's own act — the toast is not an unread notification
      showToast(t(v.toast), { duration: BACK_WINDOW_MS });
      if (v.stay) restand = setTimeout(forward, BACK_WINDOW_MS);
      else forward(); // older VibeSpace entries below: the browser's own back would LOAD one — stand on the sentinel, the next back inside the window leaves past them
    } else if (v.action === 'leave') {
      lastBackAt = 0;
      leaveBy(v);
    }
  });
  // turned on later (the boot saw it off): stand a sentinel now; turned off: the next back leaves (backVerdict)
  app.settings?.on?.(BACK_SETTING, (on) => { if (on !== false && app.isMobile !== false && !isSentinel(history.state)) push(); });
  return { layers: () => layersOf(app).snap, step };
}
