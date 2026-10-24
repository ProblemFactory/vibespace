'use strict';
/**
 * THE PICTURE SWITCH — PURE (imports nothing; CJS so the keeper, the live view's relay and the client bundle carry ONE rule).
 * Lane browser-x-in-window (design q-026 r1 §2.1 / §3 row B2, 2026-10-23; the owner: 「目前 chrome 还是没有被放进 browser 窗口里面」).
 * B1 put a headed Google Chrome on a `display-for-browser` xpra session nobody looked at: the live view still drew the CDP
 * SCREENCAST — the page compositor's frames, which never carry Chrome's own UI (M0: no bubble, no passkey panel, not even
 * the tab-modal dim). Now a profile on that road shows the X PICTURE of its window, and a person who takes over drives it.
 *
 * MEASURED (Google Chrome 154.0.8037.57 + xpra 6.5.4, B1's attach argv, a private seamless display; the lane's
 * tools/probe-auth.sh + probe-windows.sh, 2026-10-23):
 *  · the HTTP Basic sign-in sheet ("Sign in / <origin> / Username / Password / Cancel / Sign in") is drawn INSIDE the
 *    browser's one X top-level — xpra lists ONE window, the X title reads "<host:port/path> - Google Chrome" — so the
 *    window list cannot see it; the dialog watch's Fetch hook can: answered `Default`, Chrome draws its own sheet, and X
 *    typing (u, Tab, p, Return) signed in;
 *  · a GTK dialog of Chrome's (the file chooser) IS its own X window: class ("chrome", "Chrome"), titled ("Open File"),
 *    DIALOG, modal, WM_TRANSIENT_FOR the browser window; Chrome's browser windows are ("google-chrome (/the/profile/dir)",
 *    "Google-chrome"); menus are override-redirect, nameless and classless; the GTK client leader is a 10×10
 *    ("chrome", "Chrome"); every managed top-level sits in an `Xpra-CorralWindow-*` (the row's `frame`);
 *  · xpra's wid IS the server's X window id (Chrome 4194307 = 0x400003 in xpra info and in xdotool);
 *  · CDP Browser.getWindowForTarget's bounds ARE the X geometry (left/top/width/height); new windows cascade +10 px;
 *    Browser.setWindowBounds moves and sizes the X window.
 *
 * pictureSourceOf(record) — WHICH PICTURE a profile's live view shows, with why and words: 'x' = the browser's own window
 * through its display session's xpra stream (the attach road on THIS machine), else 'screencast' — the page's frames, exactly
 * as before (no xpra here, a paired machine's browser, a driver launch, a conversation's own temporary browser).
 * xWindowOf — the holder's X window among the display's rows (its CDP bounds, exactly; the only browser window; else none).
 * nativeDialogsOf / nativeDialogOwner — Chrome's own dialog windows on the display and the browser window each is over.
 * nativeDialogText — THE sentence the agent's verb answers `dialog_open` with while one stands (English, never t()).
 */

const PICTURE_X = 'x';
const PICTURE_SCREENCAST = 'screencast';
/** The record's `launchWhy` when the machine has no xpra — the head of browser-attach.js HIDDEN_WINDOW_WHY (test-browser-picture pins the pair). */
const NO_XPRA_WHY_HEAD = 'no xpra on this machine';
/** why → the bar's tooltip words (English: the client's t() keys — every one a literal t() in browser-live-window.js). */
const SOURCE_WORDS = Object.freeze({
  attach: "the browser's own window",
  'no-display': "the page's picture — this machine has no display",
  remote: "the page's picture — the browser runs on another machine",
  driver: "the page's picture — this browser was not started on VibeSpace's display",
  'no-display-session': "the page's picture — the browser's display session is gone",
  'not-running': "the page's picture",
});
const RUNNING = new Set(['ready']);

/** The picture source of a browser record (the keeper's view of it — the digest's `browsers[id]`): {source, why, words, displaySession}. */
function pictureSourceOf(rec, { remote = false } = {}) {
  const r = rec && typeof rec === 'object' ? rec : null;
  const v = (source, why) => ({ source, why, words: SOURCE_WORDS[why], displaySession: source === PICTURE_X ? String(r.displaySession.id) : null });
  if (!r) return v(PICTURE_SCREENCAST, 'not-running');
  if (remote || r.hostId) return v(PICTURE_SCREENCAST, 'remote'); // a paired machine's profile keeps today's road (`host` names the machine that LAUNCHED it — this one too)
  if (r.launch === 'attach') {
    if (!(r.displaySession && typeof r.displaySession.id === 'string' && r.displaySession.id)) return v(PICTURE_SCREENCAST, 'no-display-session');
    return RUNNING.has(String(r.state || '')) ? v(PICTURE_X, 'attach') : v(PICTURE_SCREENCAST, 'not-running');
  }
  if (typeof r.launchWhy === 'string' && r.launchWhy.startsWith(NO_XPRA_WHY_HEAD)) return v(PICTURE_SCREENCAST, 'no-display');
  return v(PICTURE_SCREENCAST, 'driver');
}
const isX = (v) => !!v && v.source === PICTURE_X;

// ── the display's rows (the desktop keeper's `windows(id)`: {id, title, instance, cls, x, y, w, h, frame}) ──
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : NaN);
/** One of THIS profile's browser windows (Chrome's views top-level) — its instance names the user-data-dir. */
function isBrowserRow(row, profileDir = null) {
  if (!row || !(num(row.w) > 1) || !(num(row.h) > 1)) return false;
  const inst = String(row.instance || '');
  return profileDir ? inst.endsWith(`(${profileDir})`) : /\(.+\)$/.test(inst) && String(row.cls || '') !== '';
}
/** The holder's X window: the browser row whose geometry IS its CDP bounds; the only browser window when there is one; else
 *  none (`ambiguous` = two rows with those bounds — the caller moves its window by a pixel and asks again). */
function xWindowOf({ bounds = null, rows = [], profileDir = null } = {}) {
  const wins = (Array.isArray(rows) ? rows : []).filter((r) => isBrowserRow(r, profileDir));
  if (!wins.length) return { wid: null, why: 'no-window' };
  const b = bounds && typeof bounds === 'object' ? bounds : null;
  const m = b ? wins.filter((r) => num(r.x) === num(b.left) && num(r.y) === num(b.top) && num(r.w) === num(b.width) && num(r.h) === num(b.height)) : [];
  if (m.length === 1) return { wid: Number(m[0].id), why: 'bounds' };
  if (m.length > 1) return { wid: null, why: 'ambiguous', candidates: m.map((r) => Number(r.id)) };
  if (wins.length === 1) return { wid: Number(wins[0].id), why: 'only-window' };
  return { wid: null, why: 'no-match' };
}
const DIALOG_MIN_W = 48, DIALOG_MIN_H = 32;
/** Chrome's own dialog windows on the display (a GTK file chooser, a print dialog…): a NAMED, CLASSED top-level that is not a
 *  browser window, managed by xpra (inside a corral — asked to map), larger than the GTK leader; menus (nameless) never. */
function nativeDialogsOf(rows = [], { profileDir = null } = {}) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || isBrowserRow(r, profileDir)) continue;
    const title = typeof r.title === 'string' ? r.title : (typeof r.name === 'string' ? r.name : '');
    if (!title.trim() || /^Xpra(-|$)/.test(title) || !(r.cls || r.instance)) continue;
    if (!(num(r.w) >= DIALOG_MIN_W && num(r.h) >= DIALOG_MIN_H) || r.frame == null) continue;
    out.push({ wid: Number(r.id), title: title.slice(0, 200), x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) });
  }
  return out;
}
/** The browser window a dialog is over: the TOPMOST browser row holding its centre (xwininfo prints a parent's children
 *  topmost first — the rows' order), else null. GTK centres a transient over its parent. */
function nativeDialogOwner(dialog, rows = [], { profileDir = null } = {}) {
  if (!dialog) return null;
  const cx = dialog.x + dialog.w / 2, cy = dialog.y + dialog.h / 2;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isBrowserRow(r, profileDir)) continue;
    if (cx >= num(r.x) && cx < num(r.x) + num(r.w) && cy >= num(r.y) && cy < num(r.y) + num(r.h)) return Number(r.id);
  }
  return null;
}
/** The dialogs over ONE holder's window (`wid`); a lone browser window owns every dialog on the display. */
function dialogsOver(wid, rows = [], { profileDir = null } = {}) {
  if (wid == null) return [];
  const wins = (Array.isArray(rows) ? rows : []).filter((r) => isBrowserRow(r, profileDir));
  return nativeDialogsOf(rows, { profileDir }).filter((d) => (wins.length === 1 && Number(wins[0].id) === Number(wid)) || nativeDialogOwner(d, rows, { profileDir }) === Number(wid));
}

// ── what the agent is told ──
const quoted = (s) => JSON.stringify(String(s == null ? '' : s).slice(0, 200));
/** The native dialog fact a verb answers `dialog_open` with: Chrome's sign-in sheet (the dialog watch's NATIVE prompt block —
 *  its sentence is browser-stuck's nativeSheetText, the one place) first, else the first dialog window over the holder's
 *  window. → {kind, title, origin?, realm?, wid?, text} | null */
function nativeDialogFact({ prompt = null, windows = [] } = {}) {
  if (prompt && prompt.type === 'http-auth' && prompt.native) return { kind: 'http-auth', title: String(prompt.title || 'Sign in'), origin: String(prompt.origin || ''), realm: String(prompt.realm || ''), text: String(prompt.text || '') };
  const d = (Array.isArray(windows) ? windows : [])[0];
  if (!d) return null;
  const n = { kind: 'window', title: String(d.title || ''), wid: d.wid };
  return { ...n, text: nativeDialogText(n) };
}
/** THE SENTENCE for a dialog WINDOW of Chrome's (agent-facing, English): what is open, that only a person can answer it, what still runs. */
function nativeDialogText(n) {
  if (!n) return '';
  return `A window of Chrome's own, ${quoted(n.title)}, is open over your browser window — it is not part of the page: nothing you send reaches it and no snapshot shows it. Ask the user to answer it in the live view (they press Take over and use it there); your next page commands are answered with this until it closes — \`vibespace-browser tab …\`, \`close\`, \`stop\`, \`dialog status\` and \`open <another site>\` still run.`;
}

module.exports = {
  PICTURE_X, PICTURE_SCREENCAST, NO_XPRA_WHY_HEAD, SOURCE_WORDS, DIALOG_MIN_W, DIALOG_MIN_H,
  pictureSourceOf, isX, isBrowserRow, xWindowOf, nativeDialogsOf, nativeDialogOwner, dialogsOver, nativeDialogFact, nativeDialogText,
};
