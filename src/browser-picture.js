'use strict';
/**
 * THE PICTURE SWITCH — PURE (imports only browser-windows' window-id reader, at the call; CJS so the keeper, the live view's relay and the client bundle carry ONE rule).
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
 * deskSeat — lane desktop-x-seat-browser (ONE PERSON, ONE SEAT): the seat of a socket on a browser display that carries no
 *   ticket (the desktop window's own view of the display) — the person browsing that browser himself holds it; r2: an INPUT
 *   seat (`input`: his keys and pointer on HIS window only — never a display size, a window geometry or a close), ONE socket
 *   of his at a time (the newest pane — `elected`); deskSeatWhy names a watch; xScopeOf = that seat's root, his window (r3: its
 *   transients and the popups his acts open are the bridge's, read from xpra's announcements in order).
 * deskDoorOf / DESK_DOOR_WORDS — THE RAW FALLBACK's one line in the live view: Chrome's own window holds the page, open the
 *   browser's display in Desktop to act on it.
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
  'background-tab': "the tab's own picture, a new one every half second — its window shows another tab in front",
  'background-settle': "the tab's own picture — its window's picture again in a moment",
  'background-stuck': "the tab's last own picture — it does not answer, and its window shows another tab in front",
  'unresponsive-own': "the tab's last own picture — it does not answer",
  'unresponsive-none': "no picture of this tab — it does not answer",
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
/** THE PICTURE THE VIEW SAYS IT SHOWS, IN ONE WINDOW (the owner's report 2026-11-19, the second of its kind): the X picture is a
 *  WINDOW, so it can only show that window's FRONT tab. While the hub says the tab on show is a hidden background tab of its
 *  window (`tab-background`, state hidden: its own picture polled every half second) and this view does not drive a takeover,
 *  the view draws THAT tab's own picture (the page's) and says so — never the front tab under the shown tab's name and address.
 *  A takeover keeps the window: that is where the person brings the tab forward. A tab that never answers (`unresponsive`)
 *  keeps the window too: nothing is polled for it. */
/** 主开发's law (1), 21:1xZ: no flap between the two pictures — the journal showed hidden, «paints again», hidden within 2 s. A
 *  hidden verdict switches at once; its clear returns the window only once it has held BG_SETTLE_MS (the tab's live page picture
 *  meanwhile — it paints again); a takeover returns the window at once. Its read (M2): the hub says «hidden» again only after
 *  BACKGROUND_SILENCE_MS (2 s) without a frame, judged on a 1 s tick, then a CDP ask — the settle outlasts that: 2 s + 2 × 1 s. */
const BG_SETTLE_MS = 4000;
/** The live-picture follow-up, its read 4 (S2): a clear the hub says came from a SWITCH (`cause`: the agent's tab is another tab now)
 *  never settles — the settle holds ONE tab's picture against its own flap, never one tab's last picture under another's name. PURE. */
const settlesOnClear = (m) => !(m && m.cause === 'switch');
function pictureForView(v, { bg = null, driving = false, shownWhy = null, clearedAt = 0, now = Date.now(), settleMs = BG_SETTLE_MS } = {}) {
  if (!isX(v) || driving) return v;
  if (bg && bg.state === 'hidden' && bg.targetId) return { source: PICTURE_SCREENCAST, why: 'background-tab', words: SOURCE_WORDS['background-tab'], displaySession: null };
  // 主开发's ruling S4 (21:52Z): a hidden tab that then stops answering keeps ITS last own picture — never its window's front tab
  // its read (M1): the HUB says it (`polled`: this tab's own picture was polled before it stopped answering) — never the view's own
  // memory, which a hand back, a reconnect or a new pane loses
  if (bg && bg.state === 'unresponsive' && bg.targetId && bg.polled === true) return { source: PICTURE_SCREENCAST, why: 'background-stuck', words: SOURCE_WORDS['background-stuck'], displaySession: null };
  // 主开发's r178: a view that does NOT drive never shows the window's picture for a tab that does not respond — the hub cannot know
  // which tab is in front of a hung one (a press in the browser's own strip is seen by nothing), so the window may be ANOTHER tab's page
  // under this tab's name, and a watcher may be another person. It shows this tab's own last picture if the hub has one, else none
  if (bg && bg.state === 'unresponsive' && bg.targetId) return bg.own === true ? { source: PICTURE_SCREENCAST, why: 'unresponsive-own', words: SOURCE_WORDS['unresponsive-own'], displaySession: null } : { source: PICTURE_SCREENCAST, why: 'unresponsive-none', words: SOURCE_WORDS['unresponsive-none'], displaySession: null };
  if ((shownWhy === 'background-tab' || shownWhy === 'background-settle' || shownWhy === 'background-stuck' || shownWhy === 'unresponsive-own' || shownWhy === 'unresponsive-none') && clearedAt > 0 && now - clearedAt < settleMs) return { source: PICTURE_SCREENCAST, why: 'background-settle', words: SOURCE_WORDS['background-settle'], displaySession: null };   // a stuck tab's clear settles too (its read's M3)
  return v;
}

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

// ── lane desktop-x-seat-browser (2026-10-30, the owner: «桌面打开虽然能看到 passkey 弹窗但无法点击»): ONE PERSON, ONE SEAT ──
/** The live view's X-picture socket names itself with its relay's ticket (`xt-` + 36 hex); every other viewer id is a pane's own. */
const X_TICKET_RE = /^xt-[0-9a-f]{36}$/;
/** The seat of a socket on a browser display that carries NO ticket — the desktop window's own view of the display (桌面 → the
 *  browser's display session): 'input' when a PERSON opened it (no agent token — the bridge judges `person`) while the browser
 *  has its HUMAN holder (browse yourself: he is one more holder) AND it is his ELECTED socket (`elected`: the newest of his panes
 *  on that display, or the one he chose with «Use it here» — one person, one seat), else 'watch'. An INPUT seat is never the
 *  whole xpra client (acceptance r1, MAJOR A — measured: an 'active' desktop socket replayed its display size and window
 *  geometry and fitted, slotted and belted the agents' Chrome windows): his keys, pointer and paste reach HIS window, its
 *  transients and the popups his own acts open (xScopeOf + the bridge) — nothing else, never a display size, a window geometry or a close; only
 *  the live view's ruling pane sizes a Chrome window. A ticket-shaped id never falls here: the relay's verdict is its only one. */
function deskSeat({ viewerId = null, person = false, human = false, elected = true } = {}) {
  if (!viewerId || X_TICKET_RE.test(String(viewerId))) return 'watch';
  return person && human && elected ? 'input' : 'watch';
}
/** WHY a desktop socket of a browser display watches — the code its relay TELLS that socket (never silent, FAIL 3):
 *  'other-window' (his browsing holds the seat in his OTHER pane — «Use it here» moves it), 'not-browsing' (a person's pane
 *  while nobody browses the browser himself: its agents use it — «Browse yourself» is the way), 'watch-mode' (an agent's
 *  token, a ticket-shaped id, no id); null = the seat is held. */
function deskSeatWhy({ viewerId = null, person = false, human = false, elected = true } = {}) {
  if (!viewerId || X_TICKET_RE.test(String(viewerId)) || !person) return 'watch-mode';
  if (!human) return 'not-browsing';
  return elected ? null : 'other-window';
}
/** r4 (acceptance r3 MAJOR 2 — his window is read AGAIN when it may have been replaced): the seat's root is the window xWindowOf
 *  TOLD by his CDP bounds (`bounds` — measured: CDP bounds ARE the X geometry), never the profile's only window (`only-window`: his
 *  window closed and an agent's left in that browser would be handed to him); → wid | null (his reach is empty until it is told). */
function xSeatRootOf(xw) {
  return xw && xw.why === 'bounds' && xw.wid != null && Number.isInteger(Number(xw.wid)) ? Number(xw.wid) : null;
}
/** THE INPUT SEAT'S ROOT over the display's rows: HIS window (`wid` — the keeper's xWindowFor: his CDP bounds told on the display)
 *  and its rect. r3 (acceptance r2 MAJOR 1 + 2): nothing else is judged from these rows — a geometry rule cannot tell whose a
 *  window is (MEASURED: Chrome's <select> popup and context menu carry no WM_TRANSIENT_FOR, no class, no name — the very rows
 *  seamlessWindows drops; an agent's file chooser cascaded over his window holds its centre inside his rect). His transients and
 *  the popups his own acts open are the BRIDGE's, from xpra's own announcements in order (stream-relay-xpra.js
 *  XPRA_POPUP_OPEN_MS). `known` = every row id read. → { wid, wids: [wid], rects: [{wid,x,y,w,h}], known } (empty when untold). */
function xScopeOf(wid, rows = []) {
  const all = Array.isArray(rows) ? rows : [];
  const known = all.map((r) => Number(r && r.id)).filter(Number.isFinite);
  const me = wid == null ? null : all.find((r) => r && Number(r.id) === Number(wid)) || null;
  if (!me) return { wid: null, wids: [], rects: [], known };
  return { wid: Number(me.id), wids: [Number(me.id)], rects: [{ wid: Number(me.id), x: num(me.x), y: num(me.y), w: num(me.w), h: num(me.h) }], known };
}
/** MAJOR B (acceptance r1): the Watch door's ONE act IS its label — browse-yourself's own road and its first refusal: his own
 *  tab in this browser ('browse' — «Browse yourself»; 'open' — «Open your browsing window» while he already browses it from
 *  another pane), never a takeover of an agent's tab, and never on a conversation's TEMPORARY browser (its profile is not a
 *  named one — browseYourselfVerdict's not_attachable: no button, the words say why). → {act, code} */
function deskDoorAct({ profile = null, human = false } = {}) {
  if (!profile || profile.ephemeral === true) return { act: null, code: 'not_attachable' };
  return { act: human ? 'open' : 'browse', code: null };
}
/** THE RAW FALLBACK's ONE LINE (the live view): Chrome's own window holds the page and this view cannot show it (the page's
 *  picture — his browse window — or an X picture not mounted yet) — the browser's display, opened in Desktop, takes his input
 *  there (deskSeat). English: the client's literal t() keys. A passkey request's own sentence is browser-passkey.js's; this
 *  line is only the way to it, never a second sentence. */
const DESK_DOOR_WORDS = Object.freeze({ line: "Open this browser's display in Desktop to act on Chrome's own window", button: 'Open in Desktop' });
/** → the display session the door opens, or null: the browser is on the X road (it HAS a display), this view does not draw it,
 *  it is HIS browse-yourself window (`human` — r2: the Desktop's input seat reaches his own window only, so a conversation's
 *  view never sends him where nothing of it can be answered), and the browser's fact says Chrome's OWN window holds the page —
 *  a passkey request on a headed browser (Chrome's WebAuthn dialog: drawn by Chrome, not the page — MEASURED: CDP's clicks
 *  never reach it), Chrome's own sign-in sheet. */
/** the .367 seam (desktop-x-seat-browser × passkey-browse-yourself, the integrator's ruling 10-31): THE fact the door judges —
 *  the passkey fact the live view's banner shows (its relay's record in his browse-yourself window, which has no session row;
 *  else the row's) while it is a real wait, else the row's own `stuck` (Chrome's sign-in sheet). Either half alone misses a door:
 *  the row's `stuck` never carries his window's passkey; the passkey fact never carries a native prompt. */
function deskDoorStuck({ passkey = null, stuck = null } = {}) {
  return passkey && passkey.state === 'passkey' && passkey.passkey && passkey.passkey.state !== 'unknown' ? passkey : stuck || null;
}
/** HOTFIX 2026-11-17 (the owner's inc-mwl4yeom and «我那个 agent 现在操作两个标签页我却只能看到一个»): THE PICTURE SHOWS THE TAB THE
 *  VIEW SAYS IT SHOWS. Every tab VibeSpace opens for a holder opens in a NEW window of its own (src/browser-windows.js), so «the
 *  holder's window» is not one window: the X picture draws the window of the tab on show —
 *  · xShownTarget — the tab a viewer WATCHES (its chip), else the agent's active tab;
 *  · xWindowLookups — the order the keeper reads a holder's window in: THAT tab's window first, then the lease's own window, then
 *    its other tabs' (the release read the lease's own window first: a tab in another window was never drawn);
 *  · xTicketMoved — a viewer's ticket is re-issued when the window of the tab it shows is known and is not the ticket's (an
 *    untold window keeps the picture it has). */
function xShownTarget({ watch = null, activeTarget = null } = {}) { return (watch && watch.targetId) || activeTarget || null; }
function xWindowLookups({ targetId = null, own = null, holderTabs = [] } = {}) {
  const out = [];
  if (targetId) out.push({ targetId: String(targetId) });
  if (own != null) out.push({ windowId: own });
  for (const t of holderTabs || []) if (t && String(t) !== String(targetId || '')) out.push({ targetId: String(t) });
  return out;
}
/** HOTFIX cure r4 (主开发 00:05Z, the hosted census red): a window id — the X one or the CDP one — is read through THE ONE reader,
 *  browser-windows' windowIdOf (PURE). Asked at the call, so this module still loads alone (§2's control copies run from a scratch dir). */
const WIN = () => require('./browser-windows.js');
function xTicketMoved({ ticketWid = null, wid = null } = {}) { return wid != null && Number(wid) !== Number(ticketWid); }
/** HOTFIX cure r2 (主开发 22:13Z, after step seven went red on real xpra): «MOVED» IS JUDGED BY THE TAB'S OWN CDP WINDOW. The keeper
 *  FINDS a tab's X row by its CDP window's bounds; on a real display a new window's row can be missing for seconds (xpra maps it
 *  later) while the old window — at the very same place and size — still matches: the bounds match finds a row, it never proves
 *  that nothing moved. One look's verdict, for a viewer's `ticket` ({wid, cdpWin, targetId} | null) and the keeper's `answer`
 *  ({wid: the X row found, windowId: the tab's CDP window}), `tid` = the tab on show, `known` = the X windows this relay minted ⇒
 *  their CDP window (a Map):
 *  · 'same' — the tab's CDP window IS the ticket's (or, its CDP window untold, the very tab of the ticket): nothing re-issued, silently;
 *  · 'wait' — the tab's X window is not told yet: no row, or the row found is ANOTHER CDP window's (stale rows), or — the CDP window
 *    untold — another tab answered with the ticket's own window (never proof);
 *  · 'mint' — told: a ticket for that window. */
function xFollowVerdict({ ticket = null, answer = null, tid = null, known = null } = {}) {
  const { windowIdOf } = WIN(); // HOTFIX cure r4: both ids through THE ONE reader — '' or no number = no window, never 0 or NaN
  const wid = answer ? windowIdOf(answer.wid) : null;
  const cdp = answer ? windowIdOf(answer.windowId) : null;
  const eq = (a, b) => { const x = windowIdOf(a); return x != null && x === windowIdOf(b); };
  const sameTab = !!ticket && String(ticket.targetId || '') === String(tid || '');
  if (ticket && cdp != null && eq(ticket.cdpWin, cdp)) return 'same';
  if (ticket && cdp == null && sameTab && (wid == null || eq(ticket.wid, wid))) return 'same';
  if (wid == null) return 'wait';
  const owner = known && typeof known.get === 'function' ? windowIdOf(known.get(wid)) : null;
  if (cdp != null && owner != null && owner !== cdp) return 'wait';
  if (cdp == null && ticket && eq(ticket.wid, wid) && !sameTab) return 'wait';
  if (ticket && eq(ticket.wid, wid)) return 'same';
  return 'mint';
}

function deskDoorOf({ source = null, xShown = false, stuck = null, human = false } = {}) {
  if (!human || !source || source.source !== PICTURE_X || !source.displaySession || xShown || !stuck) return null;
  const native = (stuck.state === 'passkey' && stuck.headed === true) || (stuck.state === 'prompt' && !!stuck.prompt && stuck.prompt.native === true);
  return native ? String(source.displaySession) : null;
}

module.exports = {
  PICTURE_X, PICTURE_SCREENCAST, NO_XPRA_WHY_HEAD, SOURCE_WORDS, DIALOG_MIN_W, DIALOG_MIN_H, X_TICKET_RE, DESK_DOOR_WORDS,
  pictureSourceOf, pictureForView, BG_SETTLE_MS, settlesOnClear, isX, isBrowserRow, xWindowOf, nativeDialogsOf, nativeDialogOwner, dialogsOver, nativeDialogFact, nativeDialogText, deskSeat, deskSeatWhy, xSeatRootOf, xScopeOf, deskDoorAct, deskDoorOf, deskDoorStuck,
  xShownTarget, xWindowLookups, xTicketMoved, xFollowVerdict, // hotfix 2026-11-17: the picture shows the tab the view says it shows (+ cure r2: moved by the CDP window)
};
