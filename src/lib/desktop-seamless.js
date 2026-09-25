// SEAMLESS DESKTOP-APP WINDOWS — PURE (imports nothing; bundled; docs/design-desktop-apps-seamless.zh.md §3.3,
// round 3 lane B, D3 decided as recommended by the owner 2026-09-25). The owner: "如果内部窗口具有完整的窗口控制
// 能力（关闭按钮啥的），外部窗口就不应该显示任何东西，来达到seamless的效果". An app that draws its OWN title
// bar (client-side decorations — GTK's header bar; xpra names it with `decorations: 0` in the window metadata,
// from the app's _MOTIF_WM_HINTS, MEASURED §2.2/§2.3) gets NO VibeSpace chrome on top of it: the title bar and
// the status strip fold into a 0-height hot zone, the app's own header bar moves / resizes OUR window (xpra's
// `initiate-moveresize`, entering the window manager's EXISTING drag and resize paths), and the bars come back
// on a hover of the top edge (250 ms) or while Alt is held. This file DECIDES; desktop-app-window.js applies:
//   • seamlessVerdict — the ONE rule (csd × the global setting × the per-app toggle × the pauses);
//   • revealStep      — the hot zone's arithmetic as PURE state transitions (the suite drives it with no DOM);
//   • moveResizeAction — the X direction of an `initiate-moveresize` → the window manager's operation;
//   • windowStateAction — the app's own maximize / minimize (`window-metadata {maximized|iconic}`) → ours;
//   • frameKeyOf / frameChoiceOf / setFrameChoice / frameMenuModel / userToggleOfFrame — the per-APP "Show window
//     frame" choice (user state `desktopAppFrame[<key>]`, synced to every client).
// Gate: scripts/test-desktop-seamless.mjs (fast) + test-xpra-client §2 + test-desktop-xpra-window §12 (heavy).

/** Why a window is (or is not) seamless — the closed set the verdict answers with. */
export const SEAMLESS_WHY = Object.freeze(['csd', 'user', 'setting-off', 'ssd', 'lease', 'chain', 'phone', 'disconnected']);
/** The per-app toggle ('auto' follows the verdict; 'on' / 'off' force it) and the global setting's values. */
export const FRAME_TOGGLES = Object.freeze(['auto', 'on', 'off']);
export const SEAMLESS_SETTINGS = Object.freeze(['auto', 'off']);

/** A window draws its own frame (CSD) ⇔ xpra says `decorations: 0` (§2.3 M3a: GNOME Calculator 0, xterm has no key). */
export function isCsd(meta) {
  return !!meta && typeof meta === 'object' && meta.decorations === 0;
}
export const normToggle = (v) => (v === 'on' || v === 'off' ? v : 'auto');
export const normSetting = (v) => (v === 'off' ? 'off' : 'auto');

/**
 * THE VERDICT (design §3.3):
 *   seamless ⇔ connected ∧ ¬lease ∧ ¬chain ∧ ¬phone ∧ (userToggle = on ∨ (userToggle = auto ∧ setting = auto ∧ csd))
 * `why` names the deciding fact: WANTED first (user / setting-off / ssd / csd), then — only for a window that would
 * be seamless — the PAUSE that holds it (phone, disconnected, lease, chain), so a menu can say "paused: an agent is
 * driving" instead of "this app has no header bar". A forced 'on' is still paused (the lease and the tab chain are
 * the two things that MUST stay above the app — the design's honest list — and a phone's title bar is its only way back).
 */
export function seamlessVerdict({ csd = false, setting = 'auto', userToggle = 'auto', lease = false, chain = false, phone = false, connected = false } = {}) {
  const u = normToggle(userToggle), s = normSetting(setting);
  let wantWhy = null;
  if (u === 'off') return { seamless: false, why: 'user' };
  if (u === 'on') wantWhy = 'user';
  else if (s === 'off') return { seamless: false, why: 'setting-off' };
  else if (!csd) return { seamless: false, why: 'ssd' };
  else wantWhy = 'csd';
  if (phone) return { seamless: false, why: 'phone' };
  if (!connected) return { seamless: false, why: 'disconnected' };
  if (lease) return { seamless: false, why: 'lease' };
  if (chain) return { seamless: false, why: 'chain' };
  return { seamless: true, why: wantWhy };
}
/** A verdict that WANTED seamless but is held by a pause (the menu's "paused" line). */
export const isPaused = (v) => !!v && !v.seamless && (v.why === 'phone' || v.why === 'disconnected' || v.why === 'lease' || v.why === 'chain');

// ── THE HOT ZONE (§3.3 window form) ──────────────────────────────────────────────────────────────────────────────
/** The top-edge band (layout px) whose hover reveals the bars. */
export const HOT_ZONE_PX = 6;
/** Hover in the hot zone this long reveals both bars (the design's 250 ms — a pointer crossing the edge on its way to
 *  the app never reveals anything). */
export const REVEAL_HOVER_MS = 250;
/** Once the pointer leaves the revealed bars INTO THE APP, or Alt is released, the bars stay out this long (the
 *  "slide out 1.5 s": time to reach them); leaving the WINDOW folds them at once ("leave = fold"). */
export const REVEAL_LINGER_MS = 1500;

export const revealInitial = () => ({ inZone: false, zoneSince: null, alt: false, revealed: false, foldAt: null });
/**
 * One transition of the reveal state. Events: {type:'zone-enter'} (the pointer is in the hot zone or over a revealed
 * bar), {type:'zone-leave'} (it moved into the app, still inside the window), {type:'window-leave'}, {type:'alt',
 * down:bool}, {type:'tick'}, {type:'reset'} (the window stopped being seamless). Returns { state, revealed, wakeAt }
 * — `wakeAt` = the instant a 'tick' must be delivered (null = nothing pending).
 */
export function revealStep(state, ev, now) {
  const s = { ...revealInitial(), ...(state || {}) };
  const type = ev && ev.type;
  if (type === 'reset') return out(revealInitial());
  if (type === 'zone-enter') {
    if (!s.inZone) { s.inZone = true; s.zoneSince = now; }
    s.foldAt = null;
  } else if (type === 'zone-leave') {
    s.inZone = false; s.zoneSince = null;
    if (s.revealed && !s.alt) s.foldAt = now + REVEAL_LINGER_MS;
  } else if (type === 'window-leave') {
    s.inZone = false; s.zoneSince = null;
    if (!s.alt) { s.revealed = false; s.foldAt = null; }
  } else if (type === 'alt') {
    if (ev.down) { s.alt = true; s.revealed = true; s.foldAt = null; }
    else if (s.alt) { s.alt = false; if (s.revealed && !s.inZone) s.foldAt = now + REVEAL_LINGER_MS; }
  }
  // time-driven transitions run on EVERY event (a tick is just an event with nothing else to say)
  if (!s.revealed && s.inZone && s.zoneSince != null && now - s.zoneSince >= REVEAL_HOVER_MS) { s.revealed = true; s.foldAt = null; }
  if (s.revealed && s.foldAt != null && now >= s.foldAt && !s.inZone && !s.alt) { s.revealed = false; s.foldAt = null; }
  return out(s);
  function out(st) {
    let wakeAt = null;
    if (!st.revealed && st.inZone && st.zoneSince != null) wakeAt = st.zoneSince + REVEAL_HOVER_MS;
    else if (st.revealed && st.foldAt != null) wakeAt = st.foldAt;
    return { state: st, revealed: st.revealed, wakeAt };
  }
}

// ── THE APP'S HEADER BAR DRIVES OUR WINDOW (§3.3 interaction mapping) ────────────────────────────────────────────
/** X's _NET_WM_MOVERESIZE directions (xpra/constants.py MoveResize) → the resize handle a VibeSpace window names. */
export const MOVERESIZE_EDGES = Object.freeze({ 0: 'nw', 1: 'n', 2: 'ne', 3: 'e', 4: 'se', 5: 's', 6: 'sw', 7: 'w' });
/**
 * What an `initiate-moveresize` asks of the window manager: {op:'move'} (8, and 10 = the keyboard move — the mouse
 * takes over), {op:'resize', dir} (0–7 = the eight edges; 9 = the keyboard resize, taken over by the mouse from the
 * bottom-right corner), {op:'cancel'} (11 — end it and restore), or null for anything else (never guessed).
 */
export function moveResizeAction(direction) {
  const d = typeof direction === 'number' ? direction : typeof direction === 'string' && /^\d+$/.test(direction) ? Number(direction) : NaN;
  if (!Number.isInteger(d)) return null;
  if (d >= 0 && d <= 7) return { op: 'resize', dir: MOVERESIZE_EDGES[d] };
  if (d === 8 || d === 10) return { op: 'move' };
  if (d === 9) return { op: 'resize', dir: 'se' };
  if (d === 11) return { op: 'cancel' };
  return null;
}

/**
 * The app's OWN maximize / minimize (its header-bar buttons ⇒ _NET_WM_STATE ⇒ xpra `window-metadata`) → our window:
 * 'maximize' | 'restore' | 'minimize' | null. SET semantics, never a toggle (an echo can never flip it back), and only
 * for a CHANGE the server announced (`meta` carries the key) — a window born maximized never maximizes ours.
 */
export function windowStateAction(meta, { maximized = false, minimized = false } = {}) {
  if (!meta || typeof meta !== 'object') return null;
  if ('iconic' in meta && meta.iconic && !minimized) return 'minimize';
  if ('maximized' in meta) {
    if (meta.maximized && !maximized) return 'maximize';
    if (!meta.maximized && maximized) return 'restore';
  }
  return null;
}

// ── THE PER-APP "SHOW WINDOW FRAME" CHOICE (user state desktopAppFrame) ──────────────────────────────────────────
// The menu speaks of the FRAME (the owner's words: "Show window frame ▸ Auto / On / Off"); the verdict's `userToggle`
// speaks of SEAMLESS (§3.3: on ⇒ seamless). They are opposite words for one choice, so ONE function crosses them:
// frame On ⇒ userToggle 'off' (never seamless), frame Off ⇒ userToggle 'on' (always seamless), Auto ⇒ 'auto'.
// The store `desktopAppFrame[<key>]` holds the FRAME word the user picked.
export const userToggleOfFrame = (frame) => (frame === 'on' ? 'off' : frame === 'off' ? 'on' : 'auto');
/** The key a choice is remembered under: the registry app id (`gnome-calculator`), else the executable's basename
 *  (`exec:xterm`) — "按应用 id 记", so every window of the same app shares it. null when nothing names the app. */
export function frameKeyOf(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const clean = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
  if (typeof rec.appId === 'string' && clean(rec.appId)) return clean(rec.appId);
  const exec = typeof rec.exec === 'string' ? rec.exec.split('/').pop() : '';
  return clean(exec) ? `exec:${clean(exec)}` : null;
}
/** The FRAME choice stored for an app ('auto' when none / unreadable). */
export function frameChoiceOf(map, key) {
  return key && map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key) ? normToggle(map[key]) : 'auto';
}
/** The map after one choice: 'auto' REMOVES the key (the map never grows by choices that change nothing). */
export function setFrameChoice(map, key, choice) {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  if (!key) return next;
  const c = normToggle(choice);
  if (c === 'auto') delete next[key]; else next[key] = c;
  return next;
}
/** The "Show window frame ▸" rows: Auto / On / Off (FRAME words), the current one checked and not offered again. */
export function frameMenuModel(current) {
  const cur = normToggle(current);
  return FRAME_TOGGLES.map((choice) => ({ choice, current: choice === cur, disabled: choice === cur }));
}
