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
import { t } from './i18n.js';
import { showToast, noteOwnGesture } from './utils.js';
import { BACK_WINDOW_MS, BACK_DISMISS_EVENT, EXIT_HOPS, isSentinel, bootStep, backTarget, backVerdict, exitPlan, exitHop, backCostLoad } from './back-guard.js';
import { navNote, navLogRead, prevDocTail, entriesShape, exitIntentRead, exitIntentWrite, exitIntentClear } from './nav-log.js';

export const BACK_SETTING = 'mobile.backGuard';
const shown = (el) => !!el && !el.classList.contains('hidden');
const pathOf = (url) => { try { return new URL(url).pathname; } catch { return null; } };
const stateWord = (s) => (isSentinel(s) ? 'vs1' : s == null ? 'null' : 'other');
/** The Navigation API's view (Chrome 102+): the contiguous same-origin block of this tab's entries and the page's
 *  index in it — null without the API (then the exit is the browser's own, as before). */
function entriesNow() {
  try {
    const nav = globalThis.navigation;
    const list = nav?.entries?.(), cur = nav?.currentEntry?.index;
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
/** How this document was reached (navigation.activation, Chrome 123+): the key of the entry it came FROM (null = a page
 *  of another site; undefined = no such API) and the way — 'back' (from a higher entry), 'forward', 'other'. */
function arrival() {
  try {
    const a = globalThis.navigation?.activation;
    if (!a) return { fromKey: undefined, came: '' };
    const f = a.from, e = a.entry;
    if (!f) return { fromKey: null, came: 'other' };
    return { fromKey: String(f.key || '').slice(0, 8), came: f.index >= 0 && e && e.index >= 0 ? (f.index > e.index ? 'back' : 'forward') : 'other' };
  } catch { return { fromKey: undefined, came: '' }; }
}
/** A go() that started nothing is told by beforeunload, never pagehide (measured on Chrome 154: beforeunload 4 ms after a
 *  go() onto a slow page — also when listened to only just before it —, pagehide 3 s later, when the next page COMMITS;
 *  out of range, neither comes). Listened to only around the exit's go(): a page that holds a beforeunload listener
 *  makes each of its reloads wait for it (measured: the suite's reload leg saw the old page a beat longer). */
const GO_WAIT_MS = 700;
/** A traversal beforeunload announced and the page still here this long after: it was CANCELLED (round 3, measured on
 *  Chrome 154 — the entry it went for answered 204, the load was stopped: no pagehide, no pageshow, ever). A page that
 *  commits later than this still leaves; the one it bounded has started to boot by then. */
const GONE_WAIT_MS = 3000;
const INPUTS = ['pointerdown', 'keydown'];
/** Can this browser say where a load came from (navigation.activation: Chrome 123+, Safari 26.2+)? Without it a load
 *  the exit's go() lands on cannot be told from a later forward press, so the exit writes no intent (round 3): one go(),
 *  round 1's ONE named load at most when an unseen step stops it short. */
const tellsArrival = () => { try { return !!globalThis.navigation?.activation; } catch { return false; } };

/** ONE go(n) meant to LEAVE this document, watched to its end: `nothing()` when no traversal began within GO_WAIT_MS (out
 *  of range, an iframe-only step), `cancelled()` when one began (beforeunload) and the page is still here GONE_WAIT_MS
 *  later, `input()` at a person's tap or key while the page is not gone yet (they are using it — every one counts, not
 *  only the first). Each of those, and the pagehide that ends the page, removes every listener it added. */
function watchedGo(n, { nothing, cancelled, input }) {
  let began = false, bound = null, wait = null;
  const off = () => {
    clearTimeout(wait); clearTimeout(bound);
    window.removeEventListener('beforeunload', onLeave); window.removeEventListener('pagehide', onHide);
    for (const ev of INPUTS) window.removeEventListener(ev, onInput, true);
  };
  const onLeave = () => { began = true; clearTimeout(bound); bound = setTimeout(() => { off(); cancelled(); }, GONE_WAIT_MS); };
  const onHide = () => { began = true; off(); };
  const onInput = () => { off(); input(); };
  window.addEventListener('beforeunload', onLeave); window.addEventListener('pagehide', onHide);
  for (const ev of INPUTS) window.addEventListener(ev, onInput, true);
  history.go(n);
  wait = setTimeout(() => { if (!began) { off(); nothing(); } }, GO_WAIT_MS);
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
 *  the cap, a person's tap or key (input), no Navigation API (api), a traversal that never ended (cancelled), shown again
 *  by the cache with no intent of its load (show) — every listener of its own removed by then. */
function goOn(from) {
  let hop = from, settled = false, done = null;
  const settledP = new Promise((r) => { done = r; });
  const stay = (why) => { if (settled) return; settled = true; window.removeEventListener('pageshow', onShow); exitIntentClear(); navNote({ k: 'hop', n: hop, stay: 1, why }); done(why); };
  const onShow = (e) => {
    if (!e.persisted || settled) return;
    const { intent, step } = shownStep();
    if (step === 'hop') { hop = Number(intent.hop) || 0; once(); } else stay(step === 'stay' ? 'cap' : 'show');
  };
  window.addEventListener('pageshow', onShow);
  const once = () => {
    if (settled) return;
    const e = entriesNow();
    if (!e) { stay('api'); return; }
    if (hop >= EXIT_HOPS) { stay('cap'); return; }
    hop++;
    exitIntentWrite({ t: Date.now(), hop, key: entryKey(), to: 'below' });
    navNote({ k: 'hop', n: hop, skip: e.current + 1, ents: entriesShape(e.list, e.current, location.pathname) });
    watchedGo(-(e.current + 1), { nothing: once, cancelled: () => stay('cancelled'), input: () => stay('input') });
  };
  once();
  return settledP;
}

/** The open layers right now (backTarget's snapshot) and how each one closes. */
function layersOf(app) {
  const sb = app.sidebar;
  const shells = [...document.querySelectorAll('.dialog-overlay')].filter((o) => o.id !== 'dialog-overlay' && shown(o)); // createModalShell overlays (z 99998, above the static one)
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
      // the tab's first entry then, the ONE named load
      nothing: () => { exitIntentClear(); const e = entriesNow(); if (g === gen && e && e.current > 0) { navNote({ k: 'leave', skip: e.current, load: 1 }); history.go(-e.current); } },
      cancelled: () => { exitIntentClear(); navNote({ k: 'leave', why: 'cancelled' }); }, // the page stays — it is booted
      input: exitIntentClear, // a person using the page: the intent ends
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
  if (backCostLoad({ navType: facts.type, prev, now: Date.now(), came })) {
    const why = `${prev.map((r) => r.k + (r.v ? ':' + r.v : '')).join(' > ')} → ${facts.type} boot (${step}, ${shapeAtBoot || 'no navigation API'})`;
    const recent = navLogRead().some((r) => r.k === 'capture' && Date.now() - r.t < CAPTURE_EVERY_MS);
    navNote({ k: 'cost', capture: recent ? 0 : 1 });
    if (!recent) app.ready?.then?.(() => app.autoCaptureIncident?.('a back press cost a page load', why, { toastKey: 'A back press reloaded the page — captured automatically ({id}), see Diagnostics → Incidents' }))
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
