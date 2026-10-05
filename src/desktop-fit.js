'use strict';
/**
 * THE APP'S WINDOW — the FIT policy + plan (P8-2 x4), the app's SCALE and its knobs (HiDPI, lane D), and the
 * outer-close / exit-close verdicts (round 3 A2). PURE: reads the ladder (src/desktop-backends.js) and the browser
 * families (src/desktop-browser-app.js), nothing else. Moved verbatim out of src/desktop-apps.js (rv-desktop-apps
 * F-S1, lane dc-seams-desktop 2026-10-05) so the client window modules (desktop-app-window, desktop-app-scale)
 * bundle this family alone; src/desktop-apps.js re-exports every name.
 */
const { DISPLAY_BACKENDS, backendById, capsOf } = require('./desktop-backends.js');
const { BROWSER_KINDS, within } = require('./desktop-browser-app.js');

// ── P8-2 x4: the picture IS the app — the FIT policy and the FIT plan ───────
/**
 * Can the DISPLAY of a record follow the VibeSpace window, and who fits the
 * app window to it? From the table's `fit` column (keyed by `via`):
 *   { mode:'follows', by:'keeper' }  — Xvnc: the framebuffer follows the client's SetDesktopSize and the KEEPER fits
 *                                      the app's top-level to it (xdotool) on every size change
 *   { mode:'fixed',   by:'keeper' }  — Xvfb+x11vnc: the framebuffer never changes; the keeper fits the app to it once
 *                                      and the browser scales; the window chip NAMES the limit
 *   { mode:'client',  by:'client' }  — xpra: the client re-fits its window on every pane resize (x2); nothing here
 *   { mode:'shared',  by:null }      — the shared desktop: its own WM, never touched
 *   null                             — an unknown rung/via (older record): no fit, no claim
 * `keeperFits(policy)` is the keeper's one gate.
 */
function fitPolicyOf(rec, table = DISPLAY_BACKENDS) {
  const b = rec && rec.backend ? backendById(rec.backend, table) : null;
  if (!b || !b.fit || typeof rec.via !== 'string' || !Object.prototype.hasOwnProperty.call(b.fit, rec.via)) return null;
  const mode = b.fit[rec.via];
  if (mode === 'follows' || mode === 'fixed') return { mode, by: 'keeper' };
  if (mode === 'client') return { mode, by: 'client' };
  if (mode === 'shared') return { mode, by: null };
  return null;
}
const keeperFits = (policy) => !!(policy && policy.by === 'keeper');

/** The rows of an enumeration that are top-level windows: a direct child of
 *  root (`depth` 1 — an enumeration without depths is taken as-is, the
 *  pre-x4 shape), mapped (or unknown), larger than 1x1. */
function topLevelWindows(rows) {
  return (rows || []).filter((w) => w && (w.depth == null || w.depth === 1) && w.mapped !== false && w.w > 1 && w.h > 1);
}
/**
 * The APPLICATION's own windows — the CLIENT, never a window manager's frame
 * (2026-09-22, MEASURED on the fleet image's xfwm4 4.18 over a scratch X):
 * a reparenting WM puts every managed client one level down inside an
 * UNNAMED depth-1 frame (`0x2019db (has no name): () 494x350+393+225` around
 * `0x80000c … ("xterm" "XTerm") 484x316+5+29`), and keeps CLASSED helpers of
 * its own at depth 1 (`0x200122 "Xfwm4": ("xfwm4" "Xfwm4") 5x5+-1000+-1000`,
 * mapped) — the depth-1 rule picked THAT 5x5 helper as the main and would
 * have resized it over the whole framebuffer. So: a depth-1 row with no
 * class/instance/name whose subtree holds a CLASSED window is a FRAME and its
 * shallowest classed descendant is the client; once any frame is seen the
 * display is managed and depth-1 classed rows (the WM's helpers,
 * override-redirect menus) are never the app's. Without frames (bare X) the
 * top-levels are the app's windows, as before. Entries are the client's own
 * fields (absolute x/y, its w/h, `mapped` = viewable) plus `frame`
 * ({id,x,y,w,h} of the WM's frame, or null).
 */
function appWindows(rows) {
  const list = (rows || []).filter(Boolean);
  const named = (w) => !!(w.cls || w.instance || w.name);
  const classed = (w) => !!(w.cls || w.instance);
  const shown = (w) => w.mapped !== false && w.w > 1 && w.h > 1;
  if (!list.some((w) => w.depth != null)) return list.filter(shown).map((w) => ({ ...w, frame: null }));
  const groups = [];
  for (const w of list) { if (w.depth == null || w.depth <= 1) groups.push({ top: w, sub: [] }); else if (groups.length) groups[groups.length - 1].sub.push(w); }
  const framed = [];
  for (const g of groups) {
    if (named(g.top)) continue;
    let client = null;
    for (const c of g.sub) if (classed(c) && (!client || c.depth < client.depth)) client = c;
    if (client) framed.push({ top: g.top, client });
  }
  if (framed.length) {
    return framed.filter(({ top, client }) => top.mapped !== false && shown(client))
      .map(({ top, client }) => ({ ...client, frame: { id: top.id, x: top.x, y: top.y, w: top.w, h: top.h } }));
  }
  return groups.map((g) => g.top).filter(shown).map((w) => ({ ...w, frame: null }));
}
/**
 * THE FIT PLAN (PURE): given the windows on a display and its framebuffer,
 * what must move so the picture is the app and nothing else.
 *   · the MAIN window = the app window (`appWindows` — the CLIENT under a
 *     WM) the previous plan fitted (`applied.wid`) while it still exists,
 *     else the largest one that carries a class/instance/name (a class-less
 *     1x1 helper or a bare popup is never it)
 *   · on bare X the main is moved to 0,0 and resized to the framebuffer; in a
 *     WM FRAME the frame must cover the framebuffer: `resize` is
 *     `{id: <client>, w, h, framed:true}` with the client size = the
 *     framebuffer minus the frame's decorations (the act maximises the CLIENT
 *     through the WM when it can — measured on xfwm4: frame = the
 *     framebuffer, the WM keeps it so through the app's own resizes and a
 *     root resize — else moves/resizes the client so the frame lands at 0,0);
 *     `resize` is null when the frame (or the bare window) already is the
 *     framebuffer — the tick's belt must not touch a settled window
 *   · every OTHER app window (a dialog, a second window of the app) keeps its
 *     size and is NUDGED inside the framebuffer when its frame (or itself)
 *     overflows (x/y clamped; one larger than the framebuffer goes to 0,0 —
 *     it cannot fit, and it is never resized: a dialog's size is the app's
 *     business); a move names the CLIENT and the frame's target corner
 *     (xdotool windowmove on a managed client places its frame there, measured)
 * Returns { main, resize, moves, settled, why }: `settled` = nothing to do.
 */
function appFitPlan(windows, fb, { applied = null } = {}) {
  const fw = Number(fb && fb.w) || 0, fh = Number(fb && fb.h) || 0;
  if (!(fw > 0 && fh > 0)) return { main: null, resize: null, moves: [], settled: false, why: 'no framebuffer size' };
  const tops = appWindows(windows);
  if (!tops.length) return { main: null, resize: null, moves: [], settled: false, why: 'no top-level window yet' };
  let main = applied && applied.wid ? tops.find((w) => w.id === applied.wid) || null : null;
  if (!main) main = largestNamed(tops);
  const box = (w) => w.frame || w; // what must lie inside the framebuffer: the WM's frame, else the window itself
  const mb = box(main);
  let resize = null;
  if (!(mb.x === 0 && mb.y === 0 && mb.w === fw && mb.h === fh)) {
    resize = main.frame
      ? { id: main.id, w: Math.max(1, fw - (main.frame.w - main.w)), h: Math.max(1, fh - (main.frame.h - main.h)), framed: true }
      : { id: main.id, w: fw, h: fh };
  }
  const moves = [];
  for (const w of tops) {
    if (w.id === main.id) continue;
    const b = box(w);
    const x = b.w > fw ? 0 : Math.max(0, Math.min(b.x, fw - b.w));
    const y = b.h > fh ? 0 : Math.max(0, Math.min(b.y, fh - b.h));
    if (x !== b.x || y !== b.y) moves.push({ id: w.id, x, y });
  }
  return { main: { id: main.id, x: main.x, y: main.y, w: main.w, h: main.h, name: main.name || null, cls: main.cls || null, frame: main.frame ? { ...main.frame } : null }, resize, moves, settled: !resize && !moves.length, why: null };
}

/** The largest NAMED (classed / instanced / titled) window of a list, else the
 *  largest of all; ties by the lower id — the ONE "which window is the app"
 *  rule (appFitPlan's main, appMainWindow's). */
function largestNamed(tops) {
  const named = tops.filter((w) => w.cls || w.instance || w.name);
  return (named.length ? named : tops).slice().sort((a, b) => (b.w * b.h - a.w * a.h) || (a.id - b.id))[0] || null;
}
/** The APPLICATION's main window among enumerated rows (x5 LOW-2: the xpra
 *  rung's record names the app by it for a BLOCKED pane, which has no
 *  protocol session to read the title from) — appWindows' top-levels, then
 *  appFitPlan's rule; null when there is none. `seamless`: the rows are
 *  ALREADY the app's own (desktop-display.seamlessWindows dropped xpra's
 *  Corral wrappers, so the app sits at depth 2 with no depth-1 parent left —
 *  appWindows' frame grouping would drop it). */
function appMainWindow(windows, { seamless = false } = {}) {
  const tops = seamless ? (windows || []).filter((w) => w && w.w > 1 && w.h > 1) : appWindows(windows);
  return tops.length ? largestNamed(tops) : null;
}

/** The app window's OWN title as the VibeSpace window shows it on a rung the
 *  keeper fits (P8-2 x4 — xpra's rides its protocol): the fitted main
 *  window's name as X states it, control characters dropped, whitespace
 *  trimmed, at most APP_TITLE_MAX code points; null when X gives none (an
 *  unreadable encoding, no name) — the window then keeps the label. The
 *  result is still APP-CONTROLLED text: it reaches the page through
 *  textContent only. */
const APP_TITLE_MAX = 200;
function windowTitleOf(name) {
  if (typeof name !== 'string') return null;
  const s = Array.from(name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()).slice(0, APP_TITLE_MAX).join('').trim();
  return s || null;
}

// ── HiDPI: the app's SCALE and the knobs that carry it (2.369.158) ─────────
// The owner (2026-09-23, GNOME Calculator on a devicePixelRatio-2 screen):
// "the DPI is way too low — nowhere to adjust?". The app is rendered at a
// SCALE chosen at launch (settings `desktop.appScale`: auto = 2 on a launching
// client whose devicePixelRatio is 1.5 or more, else 1 — r2, see below) and
// the xpra client maps pane CSS px → device px, so a 2× screen gets 2× pixels.
// WHICH KNOBS, MEASURED on this box (xpra 6.5.3, gnome-calculator 50 = GTK 4.22,
// a GTK 3.24 probe window, xterm; docs/design-desktop-apps.zh.md §7.6):
//   • GDK_SCALE=2 doubles GTK3 AND GTK4 exactly (calculator min 360x616 →
//     720x1232; the GTK3 probe 195x53 → 390x106) — the integer part.
//   • Xft.dpi (xpra's `--dpi`, written into the resource manager AND the
//     XSETTINGS Xft/DPI) scales FONTS only, in GTK3, GTK4 and an Xft xterm —
//     and it MULTIPLIES with GDK_SCALE (GDK_SCALE=2 + Xft.dpi 192 = 4× text:
//     calculator 800x1232, the GTK3 probe 796x168). So the display's font dpi
//     is 96 × scale / GDK_SCALE: 96 at 1× and 2×, 144 at 1.5× (the fraction).
//   • GDK_DPI_SCALE is IGNORED by GTK4 (the calculator unchanged) and would
//     double-count the fraction in GTK3 on top of Xft.dpi — not set.
//   • xterm's default font is the bitmap `fixed` — no dpi reaches it (6x13
//     cells under Xft.dpi 96 and 192 alike); an Xft face does (8 → 16 px cells
//     at faceSize 10, 96 → 192 dpi). At a scale > 1 the display's resource
//     database gives XTerm/UXTerm an Xft face (`faceName: Monospace`,
//     `faceSize: 8 × GDK_SCALE`, the fraction again through Xft.dpi).
//   • Qt: QT_ENABLE_HIGHDPI_SCALING=1 + QT_SCALE_FACTOR=<the integer part>
//     (Qt derives the fraction from Xft.dpi itself) — NOT measured here (no Qt
//     application on this box), set per Qt's documented rule.
//   • 1.5× IS TEXT ONLY FOR GTK (r2, the verifier, measured): GDK_SCALE has no
//     fraction on X11, so 1.5× = GDK_SCALE 1 + fonts at 144 dpi — the
//     calculator's minimum 370x616 device px against 360x616 at 1× and 720x1232
//     at 2×: the widgets stay 1×, only the text grows. On a DPR-1.5 screen
//     that is a 247x411 CSS pane — keys at 0.67× of their 1×-screen size. So
//     `auto` never picks it: a DPR ≥ 1.5 screen gets 2 (widgets 1.33× on a
//     1.5 screen, 1.14× on 1.75), below that 1 (0.8× on a 1.25 screen) — the
//     nearer of the two integer scales in ratio. 1.5× stays a CHOICE, labelled
//     for what it does (bigger text in GTK apps, an Xft xterm scales whole).
//     LANE D (a) (2026-09-25): no longer text only — a chosen 1.5× is drawn at
//     GDK_SCALE 2 and shown at 0.75 (scaleKnobs' ceil rule); auto's thresholds kept.
//   • The CLIENT's dpi (hello / display-configure) must equal the display's
//     font dpi: xpra rewrites Xft.dpi to a client's dpi whenever it CHANGES
//     (measured: 96 → 144 through one display-configure), so a client that
//     sent 96 × devicePixelRatio would quadruple a GDK_SCALE=2 app's text.
// ROUND 3 A3 (docs/design-desktop-apps-seamless §3.4, the owner 2026-09-23: "内部app的dpi … 最好是能从
// vibespace自身的dpi自动推导"): `auto` derives from VibeSpace's OWN effective scale on the launching client,
// eff = devicePixelRatio × the UI scale (utils applyUiPrefs' body zoom — the pane is counter-zoomed to net zoom
// 1, so without this factor a 125 % UI drew a 1.0× app next to 1.25× chrome, measured M4). The integer part is
// the RATIO-NEAREST integer (the geometric midpoints √2 and 2√2 — r2's rule, carried to 3); the fraction goes
// ONLY UPWARD into the font dpi (text is never drawn below 96 dpi):
//   eff 1.00 ⇒ 1×/96 · 1.25 ⇒ 1×/120 · 1.5 ⇒ 2×/96 · 2.0 ⇒ 2×/96 · 2.5 ⇒ 2×/120 · 3.0 ⇒ 3×/96
// so `appScaleFor('auto', …)` answers the scale (1..√2 as is, √2..2 ⇒ 2, 2..2√2 as is, above ⇒ 3). LANE D (a)
// (2026-09-25, see scaleKnobs): that table is how A3 SPELLED a fraction (the floor rule, text only in GTK) —
// superseded: `scaleKnobs` now draws a fraction at the CEILING and the view shows it at s ÷ ⌈s⌉ (1.25 ⇒ 2 × 0.625,
// 2.5 ⇒ 3 × 0.8333), so every number above is a real scale of widgets AND text; the dpi rule stays for the browser
// rows. The ORIGIN rides the record (`scaleOrigin` auto | setting | chosen | app — lane D) so the chip can say whether
// the number was derived or picked.
/** The scales `desktop.appScale` offers (the setting's enum is these + 'auto'). */
const APP_SCALES = Object.freeze([1, 1.5, 2]);
/** The scales a PERSON picks by name (lane D, 2026-09-25 — a window's Scale ▸ row, an app's default scale in the launch
 *  dialog): every value `scaleKnobs` spells EXACTLY — under the default ceil rule (lane D (a)) 1 (GDK_SCALE 1, shown 1:1),
 *  1.5 (GDK_SCALE 2, shown at 0.75), 2 (2, 1:1), 2.5 (3, shown at 0.8333), 3 (3, 1:1): widgets AND text at the number;
 *  under the dpi rule (the browser rows) 1 (1, 96 dpi), 1.5 (1 + 144 dpi), 2 (2, 96), 2.5 (2 + 120 dpi — Chrome scales
 *  whole, measured 2.5× its 1× minimum), 3 (3, 96). The Settings enum stays APP_SCALES (an instance default, not a
 *  per-app choice). */
const EXPLICIT_SCALES = Object.freeze([1, 1.5, 2, 2.5, 3]);
/** The per-window Scale ▸ menu's rows (round 3 A3): re-derive from this screen, or one of the explicit scales. */
const SCALE_CHOICES = Object.freeze(['auto', ...EXPLICIT_SCALES]);
/** Where a record's scale came from (the chip names it): derived on the launching screen · an explicit Settings value ·
 *  this window's Scale ▸ relaunch · the app's own default scale chosen in the launch dialog (lane D). */
const SCALE_ORIGINS = Object.freeze(['auto', 'setting', 'chosen', 'app']);
/** One scale choice as a request spells it → 'auto' | one of EXPLICIT_SCALES (a number) | null (not a choice). A number
 *  or its string ('1.5'), never an empty value — the relaunch's `scale` and the launch's `scaleChoice` read it the same. */
function parseScaleChoice(raw) {
  if (raw === 'auto') return 'auto';
  if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean' || (typeof raw !== 'number' && typeof raw !== 'string')) return null;
  const n = Number(raw);
  return EXPLICIT_SCALES.includes(n) ? n : null;
}
/** The highest effective scale a launch derives (GDK_SCALE 3). */
const SCALE_MAX = 3;
/** The UI scale range the product itself offers (utils UI_SCALE_MIN/MAX, as fractions). */
const UI_SCALE_RANGE = Object.freeze([0.6, 2]);
const round2 = (n) => Math.round(n * 100) / 100;
/** A launch request's devicePixelRatio: a finite number in 1..3, else the default 1. */
function normalizeDpr(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 1;
}
/** A launch request's UI scale (the body zoom, a fraction): a finite number in 0.6..2, else the default 1. */
function normalizeUiScale(v) {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= UI_SCALE_RANGE[0] && n <= UI_SCALE_RANGE[1] ? n : 1;
}
/** VibeSpace's effective scale on a client: devicePixelRatio × UI scale, clamped to 1..SCALE_MAX. */
function effectiveScale(dpr = 1, uiScale = 1) {
  return round2(Math.min(SCALE_MAX, Math.max(1, normalizeDpr(dpr) * normalizeUiScale(uiScale))));
}
/** The app's scale from the setting (auto | 1 | 1.5 | 2, as a string or a number) and the launching client's
 *  DPR + UI scale. auto = the TEXT scale the ratio rule gives eff (see the table above); never the text-only
 *  1.5 on a screen of 1.5 or more (that is 2). */
function appScaleFor(setting, dpr = 1, uiScale = 1) {
  const s = setting === undefined || setting === null || setting === '' ? 'auto' : String(setting);
  if (s !== 'auto') {
    const n = Number(s);
    return EXPLICIT_SCALES.includes(n) ? n : 1;
  }
  const eff = effectiveScale(dpr, uiScale);
  if (eff < Math.SQRT2) return eff;
  if (eff < 2) return 2;
  if (eff < 2 * Math.SQRT2) return eff;
  return SCALE_MAX;
}
/** The scale a launch runs at AND where it came from → { scale, origin: 'auto'|'setting'|'chosen'|'app', from: {dpr, uiScale}|null }.
 *  Precedence: `choice` (a relaunch's Scale ▸ row; its 'auto' re-derives from the RELAUNCHING client) > `appDefault` (lane
 *  D: the app's own default scale the person chose in the launch dialog — an explicit scale; 'auto' / absent = none, the
 *  instance default decides) > `setting` (an explicit `desktop.appScale`) > auto (derived from dpr × uiScale). */
function scalePick({ setting, appDefault, choice, dpr = 1, uiScale = 1 } = {}) {
  const from = { dpr: normalizeDpr(dpr), uiScale: normalizeUiScale(uiScale) };
  if (choice !== undefined && choice !== null) {
    if (String(choice) === 'auto') return { scale: appScaleFor('auto', dpr, uiScale), origin: 'auto', from };
    return { scale: appScaleFor(choice, dpr, uiScale), origin: 'chosen', from: null };
  }
  const app = parseScaleChoice(appDefault);
  if (typeof app === 'number') return { scale: app, origin: 'app', from: null };
  const s = setting === undefined || setting === null || setting === '' ? 'auto' : String(setting);
  if (s === 'auto') return { scale: appScaleFor('auto', dpr, uiScale), origin: 'auto', from };
  return { scale: appScaleFor(s, dpr, uiScale), origin: 'setting', from: null };
}
/** A record's scale: any finite value 1..SCALE_MAX (2 decimals), else 1. */
function normalizeScale(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= SCALE_MAX ? round2(n) : 1;
}
/** Every knob a scale sets (see the tables above): `{scale, gdkScale, dpi, pictureScale, rule, env, xresources}`.
 *  LANE D (a) — A FRACTION IS A REAL SCALE (2026-09-25, the owner's white edges after 2× → 1.5×, measured): the
 *  default `rule: 'ceil'` renders the app at the integer CEILING (GDK_SCALE = ⌈s⌉, the font dpi a plain 96) and the
 *  view shows that picture at `pictureScale` = s / GDK_SCALE (1.5 ⇒ 2 × 0.75, 2.5 ⇒ 3 × 0.833, 1.25 ⇒ 2 × 0.625) —
 *  widgets AND text at s, resampled by the browser (an integer scale stays 1:1, pictureScale 1). The floor rule (the
 *  fraction in the font dpi only) halved every GTK widget at 1.5 while the text grew — GNOME Calculator's content
 *  column (libadwaita clamps it to ~676 logical px) went from 676 to 338 CSS px in a window that kept its size.
 *  `rule: 'dpi'` keeps the floor rule for an app that scales WHOLE from the font dpi — the browser rows: Chrome 153's
 *  minimum is [750,131] at GDK_SCALE 1 + 144 dpi, exactly 1.5 × [500,87] (MEASURED, reader 2) — so it stays crisp at
 *  1:1 (pictureScale 1). The record stores what it was launched with (`gdkScale`, `pictureScale`): the client reads
 *  the RECORD (`renderOf`), never re-derives it — a record from before lane D (or from an older paired machine) has
 *  no `gdkScale` and was the floor rule, shown at 1. */
const SCALE_RULES = Object.freeze(['ceil', 'dpi']);
const round4 = (n) => Math.round(n * 10000) / 10000;
function scaleKnobs(scale, { rule = 'ceil' } = {}) {
  const s = normalizeScale(scale);
  const r = rule === 'dpi' ? 'dpi' : 'ceil';
  const gdkScale = r === 'dpi' ? Math.max(1, Math.min(SCALE_MAX, Math.floor(s))) : Math.max(1, Math.min(SCALE_MAX, Math.ceil(s - 1e-9)));
  const dpi = r === 'dpi' ? Math.round(96 * s / gdkScale) : 96;
  const pictureScale = r === 'dpi' ? 1 : round4(s / gdkScale);
  const env = { GDK_SCALE: String(gdkScale), QT_ENABLE_HIGHDPI_SCALING: '1', QT_SCALE_FACTOR: String(gdkScale) };
  const xresources = s > 1 ? ['XTerm', 'UXTerm'].map((c) => `${c}*faceName: Monospace\n${c}*faceSize: ${8 * gdkScale}\n`).join('') : '';
  return { scale: s, gdkScale, dpi, pictureScale, rule: r, env, xresources };
}
/** The scale rule of an app: 'dpi' for a browser row (it scales whole from the font dpi — measured on Chrome), else 'ceil'. */
function scaleRuleOf(rowOrRec) {
  return rowOrRec && rowOrRec.browser && Object.prototype.hasOwnProperty.call(BROWSER_KINDS, rowOrRec.browser) ? 'dpi' : 'ceil';
}
/** How a RECORD renders (lane D (a)): `{gdk, picture, widget, perLogical}` — the GDK_SCALE it was launched with, the fraction the
 *  view shows the picture at, and the widgets' TRUE scale: GDK_SCALE × the picture scale for a GTK-style app; the whole
 *  scale for a browser row (the dpi rule — Chrome scales everything from the font dpi, measured). A record without
 *  `gdkScale` predates lane D (or came from an older paired machine): the floor rule, shown 1:1 — a GTK app's widgets
 *  are then ⌊scale⌋ (the fraction reached its text only). */
function renderOf(rec) {
  const s = normalizeScale(rec && rec.scale);
  const g = Number(rec && rec.gdkScale);
  const gdk = Number.isInteger(g) && g >= 1 && g <= SCALE_MAX ? g : Math.max(1, Math.min(SCALE_MAX, Math.floor(s)));
  const p = Number(rec && rec.pictureScale);
  // the stored picture scale is s ÷ gdk rounded to 4 places (0.8333): read back UNROUNDED when it is that quotient, so the
  // view's ratio and a relaunch round trip are exact (a 2× → 2.5× → 2× trip drifted 0.04 px on the rounded value)
  const picture = Number.isInteger(g) && g >= 1 && g <= SCALE_MAX && Number.isFinite(p) && p > 0.3 && p <= 1 ? (Math.abs(p - s / gdk) < 5e-4 ? s / gdk : p) : 1;
  const dpiRule = scaleRuleOf(rec) === 'dpi';
  // perLogical = the X px the app draws per logical px (its GDK_SCALE; its whole scale under the dpi rule) — the relaunch arithmetic's
  // divisor, kept apart from `widget` so a rounded picture scale (0.8333) never skews it
  return { gdk, picture, widget: dpiRule ? s : round2(gdk * picture), perLogical: dpiRule ? s : gdk };
}
/**
 * LANE D (a) — THE WINDOW FOLLOWS A SCALE ▸ RELAUNCH (the owner: "你窗口尺寸计算不对"): the successor is started at
 * another scale, so the SAME app content needs a pane of `to.widget / from.widget` times the size — the window keeps
 * the app's LOGICAL size (its layout at 1×), never the pane's CSS size (a 2× → 1.5× relaunch in a kept 898-wide pane
 * showed the calculator's clamped column with 280 CSS px of its own background either side). `pane` = the pane now
 * (CSS px), `mainPx` = the app's main X window now (X px — larger than the pane when the app's minimum made the view
 * scale it to fit; null when unknown), `dpr` = this screen's devicePixelRatio, `from` / `to` = the two RECORDS.
 * Logical = max(the pane's X px, the main's) ÷ the X px the old app drew per logical px (renderOf's `perLogical`: its
 * GDK_SCALE for a GTK-style app, its whole scale for a browser); the new pane = logical × to.widget ÷ dpr. → {w, h} CSS px
 * (0.01 px — rounded any coarser, a 2× → 1.5× → 2× round trip drifts by a pixel), or null when an input is missing.
 */
function relaunchPaneCss({ pane, mainPx = null, dpr = 1, from, to } = {}) {
  if (!pane || !(pane.w > 0) || !(pane.h > 0) || !from || !to) return null;
  const d = Number.isFinite(Number(dpr)) && Number(dpr) > 0 ? Number(dpr) : 1;
  const a = renderOf(from), b = renderOf(to);
  const xw = Math.max(pane.w * d / a.picture, mainPx && mainPx.w > 0 ? mainPx.w : 0);
  const xh = Math.max(pane.h * d / a.picture, mainPx && mainPx.h > 0 ? mainPx.h : 0);
  const q = (v) => Math.round(v * 100) / 100;
  return { w: q(xw / a.perLogical * b.widget / d), h: q(xh / a.perLogical * b.widget / d) };
}
/** POST /api/desktop/apps/:id/relaunch `{ scale: 'auto'|1|1.5|2|2.5|3, dpr?, uiScale?, force? }` → { ok, choice, dpr, uiScale, force } | { ok:false, code, error }.
 *  `force: true` (B-04da ④) = the person confirmed "relaunch anyway, lose the unsaved edits" after an `app-asked`. */
function validateRelaunchRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const choice = parseScaleChoice(b.scale);
  if (choice === null) return { ok: false, code: 'bad-request', error: `scale must be one of ${SCALE_CHOICES.join(', ')}` };
  if (b.dpr !== undefined && b.dpr !== null && !(Number.isFinite(Number(b.dpr)) && Number(b.dpr) >= 1 && Number(b.dpr) <= 3)) return { ok: false, code: 'bad-request', error: 'dpr must be a number from 1 to 3' };
  if (b.uiScale !== undefined && b.uiScale !== null && !(Number.isFinite(Number(b.uiScale)) && Number(b.uiScale) >= UI_SCALE_RANGE[0] && Number(b.uiScale) <= UI_SCALE_RANGE[1])) return { ok: false, code: 'bad-request', error: `uiScale must be a number from ${UI_SCALE_RANGE[0]} to ${UI_SCALE_RANGE[1]}` };
  if (b.force !== undefined && typeof b.force !== 'boolean') return { ok: false, code: 'bad-request', error: 'force must be true or false' };
  return { ok: true, choice, dpr: normalizeDpr(b.dpr), uiScale: normalizeUiScale(b.uiScale), force: b.force === true };
}
/** B-5ee0 ② — a Scale ▸ relaunch while an AGENT holds the window's lease is refused SERVER-side: the menu disables it
 *  in the window (scaleMenuModel's 'lease'), and a stale client, a second tab or a script meets the same rule here.
 *  `lease` = the window engine's leaseOf(id) (null = nobody). → null | { code: 'lease', error } */
function relaunchLeaseVerdict(rec, lease) {
  if (!lease) return null;
  const who = lease.sessionName || lease.sessionId || 'an agent';
  return { code: 'lease', error: `${who} is driving ${(rec && rec.label) || 'this window'} — a relaunch would end the app under it; take the window back (or let the agent hand it back) first` };
}
/**
 * B-04da ④ — DOES ENDING THIS SESSION ASK THE APP FIRST? (PURE) A LibreOffice session that is running may hold unsaved
 * edits nobody can see from here: a Stop, a Scale ▸ relaunch or the idle timeout asks it to quit through its OWN
 * File ▸ Exit (src/office-open.js officeQuitArgv — its "Save changes?" prompt in its window) and signals it only when
 * the person confirmed the loss (`force`). Never for a session still launching (no document is open yet), one with no
 * profile to hand the request over (nothing to ask), or any other app (a SIGTERM is its own close path).
 *   → { ask, why: 'office'|'not-office'|'not-running'|'no-profile'|'forced' }
 */
function askCloseVerdict(rec, { force = false } = {}) {
  if (!rec || !rec.office) return { ask: false, why: 'not-office' };
  if (rec.state !== 'ready') return { ask: false, why: 'not-running' };
  if (!rec.profileDir) return { ask: false, why: 'no-profile' };
  if (force === true) return { ask: false, why: 'forced' };
  return { ask: true, why: 'office' };
}
/** May this record be relaunched at another scale? null = yes, else { code, error } by name. The scale is fixed at
 *  launch (GDK_SCALE is read once), so the relaunch is a NEW app session: only a running xpra app, never a browser
 *  (a browser's profile is CARRIED to the successor by the keeper's stop-first relaunch — 2.369.176). */
function relaunchVerdict(rec, backends = DISPLAY_BACKENDS) {
  if (!rec) return { code: 'not-found', error: 'no such desktop app' };
  if (rec.state !== 'ready') return { code: 'not-ready', error: `${rec.label || rec.id} is ${rec.state} — only a running app can be relaunched at another scale` };
  if (!capsOf(rec, backends).scales) return { code: 'not-xpra', error: `${rec.label || rec.id} runs on ${rec.backend || 'no'} rung — only an xpra app has a scale (a whole display is drawn at the browser's pixels)` };
  // a browser row relaunches too (2.369.176, the owner: "你不让我在这里调我怎么调") — the keeper stops it FIRST and moves its
  // profile onto the successor (a browser locks its profile dir, so the successor cannot start beside it), then starts it
  return null;
}
/** The launch body that starts the same app again: a catalog row by its id, a typed command as typed. */
function relaunchBodyOf(rec) {
  if (rec.source === 'registry' && rec.appId) return { appId: rec.appId, ...(rec.office && rec.file ? { file: rec.file } : {}) }; // §7.9: a document's app reopens its document
  return { exec: rec.exec, args: Array.isArray(rec.args) ? rec.args.slice() : [], cwd: rec.cwd || null, label: rec.label };
}

/** The Scale ▸ menu of ONE window (round 3 A3), words left to the client: the rows (auto = what THIS client's
 *  dpr × uiScale would derive now, then every EXPLICIT_SCALES value), which one the record runs at, and — when the
 *  window cannot relaunch — the reason CODE (relaunchVerdict's, or 'lease' = an agent holds the app, 'seat' = another
 *  client is the active viewer). Lane D: `appDefault` = the app's own default scale (a number, or null / 'auto' = none)
 *  marks its row `appDefault: true` — the client names it; the record launched AT that default is simply current. */
function scaleMenuModel(rec, { dpr = 1, uiScale = 1, leased = false, seat = 'active', appDefault = null, backends = DISPLAY_BACKENDS } = {}) {
  const v = relaunchVerdict(rec, backends);
  const why = v ? v.code : leased ? 'lease' : seat !== 'active' ? 'seat' : null;
  const cur = rec ? normalizeScale(rec.scale) : 1;
  const def = parseScaleChoice(appDefault);
  const rows = SCALE_CHOICES.map((choice) => {
    const scale = choice === 'auto' ? appScaleFor('auto', dpr, uiScale) : choice;
    const current = !!rec && (choice === 'auto' ? rec.scaleOrigin === 'auto' : rec.scaleOrigin !== 'auto' && cur === choice);
    return { choice, scale, current, appDefault: typeof def === 'number' && choice === def, disabled: !!why || (current && (choice !== 'auto' || scale === cur)) };
  });
  return { rows, why };
}

// ── round 3 A2: the app's exit closes our window; the outer ✕ is the app's own close ──
// docs/design-desktop-apps-seamless.md §3.2 (the owner, 2026-09-23: "我关闭内部窗口之后
// 外部窗口还要额外关闭一次"). MEASURED (M3c, xpra 6.5.3 + GNOME Calculator): the app's
// own ✕ ⇒ `lost-window` 23 ms ⇒ the record `exited` (code 0) 61 ms — and the
// VibeSpace window stayed as a dead picture. The rule, decided ONCE per window at the
// record's arrival in a terminal state (never re-decided when a lease drops later):
//   · `failed` stays — its red sentence is the one place the error is said;
//   · an agent lease holding the app keeps the window (the marker says who drove it);
//   · a STOP (`stoppedBy` set: the user's Stop, the idle timeout, a relaunch) closes —
//     VibeSpace tore the display down on purpose (D2d);
//   · an app EXIT closes only when the keeper's census at the exit found NO window
//     left on the display (`windowsAtExit` 0, or not counted — a shared display, a
//     census that could not run): a forking launcher that exited while its child
//     still shows a window is not "the app exited" — that window keeps its sentence.
// `windowsAtExit` is the KEEPER's fact (one enumeration BEFORE the teardown), so every
// client decides the same — a blocked pane has no protocol windows to count.
/** The outer ✕ asks the app first; a second ✕ within this window = Stop. */
const OUTER_CLOSE_AGAIN_MS = 5000;
/** Windows a person could still see after the app process exited: mapped, at least
 *  16×16 (a WM's 5×5 helper, a 1×1 leader are not windows), on screen (xfwm4 parks
 *  its helper at -1000,-1000). Rows are the keeper's app-window rows. */
function windowsLeftCount(rows) {
  return (rows || []).filter((w) => w && w.mapped !== false && w.w >= 16 && w.h >= 16 && w.x + w.w > 0 && w.y + w.h > 0).length;
}
/** Does a window whose record reached a terminal state close itself?
 *  → { close, why: 'no-record'|'relaunched'|'live'|'failed'|'lease'|'stopped'|'windows-left'|'exited' } ('relaunched' also names `replacedBy`) */
function exitCloseVerdict(rec, { leased = false } = {}) {
  if (!rec) return { close: false, why: 'no-record' };
  if (rec.replacedBy) return { close: false, why: 'relaunched', replacedBy: rec.replacedBy }; // A3: the window follows its successor
  if (rec.state === 'failed') return { close: false, why: 'failed' };
  if (rec.state !== 'exited') return { close: false, why: 'live' };
  if (leased) return { close: false, why: 'lease' };
  if (rec.stoppedBy) return { close: true, why: 'stopped' };
  if (Number(rec.windowsAtExit) > 0) return { close: false, why: 'windows-left' };
  return { close: true, why: 'exited' };
}
/** The OUTER ✕ of a desktop-app window → { act: 'close'|'ask-app'|'stop', why }.
 *  'ask-app' = xpra `close-window` to the app's MAIN window (WM_DELETE_WINDOW: the app
 *  may ask "save?" — nothing closes then); 'stop' = the second ✕ within `againMs` of
 *  an ask (the existing Stop); 'close' = today's behaviour, the pane only (a record not
 *  running, a rung with no per-window protocol, an agent lease, a pane that is not the
 *  active viewer, no main window to ask). 'ask-front' (design 016 S1c) = close-window to the FRONT
 *  window when it is not the main (`frontWid` — WeChat's Moments over its main): that window
 *  closes, the app and the pane stay; the app is asked only when its main is in front. */
function outerCloseVerdict({ state, perWindow = false, seat, connected, mainWid, frontWid = 0, leased = false, askedAt = 0, now = 0, againMs = OUTER_CLOSE_AGAIN_MS } = {}) {
  if (state !== 'ready') return { act: 'close', why: 'not-running' };
  if (askedAt > 0 && now >= askedAt && now - askedAt <= againMs) return { act: 'stop', why: 'again' };
  if (!perWindow) return { act: 'close', why: 'no-window-protocol' };
  if (leased) return { act: 'close', why: 'lease' };
  if (seat !== 'active') return { act: 'close', why: 'not-active' };
  if (!connected || !(mainWid > 0)) return { act: 'close', why: 'no-main-window' };
  if (frontWid > 0 && frontWid !== mainWid) return { act: 'ask-front', why: 'front-window' };
  return { act: 'ask-app', why: 'close-window' };
}

module.exports = {
  fitPolicyOf, keeperFits, topLevelWindows, appWindows, appFitPlan, appMainWindow, APP_TITLE_MAX, windowTitleOf, APP_SCALES, EXPLICIT_SCALES, SCALE_CHOICES, SCALE_ORIGINS, parseScaleChoice, SCALE_MAX, UI_SCALE_RANGE, normalizeDpr, normalizeUiScale, effectiveScale, appScaleFor, scalePick, normalizeScale, SCALE_RULES, round4, scaleKnobs, scaleRuleOf, renderOf, relaunchPaneCss, validateRelaunchRequest, relaunchLeaseVerdict, askCloseVerdict, relaunchVerdict, relaunchBodyOf, scaleMenuModel, OUTER_CLOSE_AGAIN_MS, windowsLeftCount, exitCloseVerdict, outerCloseVerdict,
};
