'use strict';
/**
 * DESKTOP APPS — the PURE model (docs/design-desktop-apps.zh.md §2 row 1;
 * P8-1, 2026-09-13). Imports nothing but the shared keeper constants
 * (src/keeper-limits.js), touches no file system, starts no process.
 *
 * What lives here and nowhere else:
 *   • the registry ROW shape + `validateAppRow` / `validateLaunchRequest`
 *     (an `exec` comes from the registry or from the human in the launch
 *     dialog — never from an agent, §5)
 *   • `DISPLAY_BACKENDS` — the picture-backend CAPABILITY TABLE (§3): one row
 *     per rung, each declaring `perWindow`, `adaptive`, `needs` (alternative
 *     binary groups), `recipes` (needs-group `via` → the NAME of its bring-up
 *     recipe in desktop-display.js's `RECIPES` table) and `stream` ('rfb' |
 *     'xpra'). A NEW rung is one row here + one recipe in desktop-display.js
 *     + one relay in desktop-stream.js — the rule §2 states in bold, and
 *     since r2 a rule the keeper cannot break: it looks the recipe UP and
 *     names no rung.
 *   • `resolveBackend(hostFacts, prefs)` — the ladder: first rung whose
 *     `needs` are all present wins; every rung it fell past is reported with
 *     its reason, spelled exactly as §3's log line states it
 *     (`backend fallback: xpra→vnc-display (xpra not on PATH)`), so the
 *     record's `fallbackWhy` and the window's status chip say the same words.
 *   • the app-session STATE MACHINE `launching → ready → exited | failed`
 *     (§2) and the idle / runaway / cap / adoption VERDICTS the keeper acts
 *     on — decisions here, acts in the keeper.
 *
 * `hostFacts` is whatever desktop-display.js measured: `{ bins: { name:
 * path|null }, singletonRunning }`. Nothing in this file asks the machine.
 */
const LIMITS = require('./keeper-limits');

/** The fixed stream id of the pre-existing in-container desktop (src/vnc.js)
 *  on the ONE ws bridge — `/api/vnc` is an alias for `/api/desktop/<this>/stream`. */
const DESKTOP_SINGLETON_ID = 'desktop-singleton';

const APP_STATES = Object.freeze(['launching', 'ready', 'exited', 'failed']);
const LIVE_STATES = Object.freeze(['launching', 'ready']);
/** Default idle timeout (DA3): 30 min without INPUT ⇒ stop; 0 = never. */
const DEFAULT_IDLE_TIMEOUT_MIN = 30;

// ── §3 the backend ladder ───────────────────────────────────────────────────
// `needs` = ANY of these groups fully present. `via` is the group that
// matched, joined with '+', and `recipes[via]` NAMES the bring-up recipe
// desktop-display.js runs for it (`RECIPES[name]`) — the keeper looks the name
// up and never spells a rung (r2: it used to be a string switch on `via`, so
// a fourth rung added here resolved, was chosen, and died at bring-up with
// "unknown bring-up"). The record stores `via` as a fact beside `backend`.
const DISPLAY_BACKENDS = Object.freeze([
  Object.freeze({
    id: 'xpra', label: 'xpra', perWindow: true, adaptive: true, stream: 'xpra',
    needs: Object.freeze([Object.freeze(['xpra'])]),
    recipes: Object.freeze({ xpra: 'xpra-seamless' }),
    // P8-2 x4: the app window follows the pane from the CLIENT (xpra-client's configure-window) — the keeper's fit never runs here
    fit: Object.freeze({ xpra: 'client' }),
    // P8-2 (2026-09-21, DA1): WIRED — desktop-display's `xpra-seamless` recipe
    // brings one xpra per app session up, desktop-stream relays its ws (kind
    // 'xpra'), routes/desktop-apps hosts the HTML5 client. Installed ⇒ every
    // NEW session takes this rung; a running vnc-display session is never
    // migrated (adoption keeps the backend a record was born with).
    wired: true,
  }),
  Object.freeze({
    id: 'vnc-display', label: 'vnc-display', perWindow: false, adaptive: false, stream: 'rfb',
    needs: Object.freeze([Object.freeze(['Xvnc']), Object.freeze(['Xvfb', 'x11vnc'])]),
    // one pid serves both X and RFB / an X server, then a picture server on it
    recipes: Object.freeze({ Xvnc: 'x-serves-rfb', 'Xvfb+x11vnc': 'x-then-server' }),
    // P8-2 x4 (2026-09-22, owner: "就算是vnc也不能这样啊"): whether the DISPLAY can follow the window. TigerVNC's Xvnc
    // honours the client's SetDesktopSize (RFB ExtendedDesktopSize; measured on this box: 1280x800 → 900x600 in 43 ms,
    // status 0, xdpyinfo/xrandr agree; `-AcceptSetDesktopSize=0` is the one lever that refuses it) — 'follows'. Xvfb has a
    // fixed framebuffer and x11vnc 0.9.17 offers no SetDesktopSize — 'fixed': the app is still FITTED to it by the keeper
    // and the browser scales; the chip names the limit. Keyed by `via`, like recipes.
    fit: Object.freeze({ Xvnc: 'follows', 'Xvfb+x11vnc': 'fixed' }),
    wired: true,
  }),
  Object.freeze({
    id: 'desktop-singleton', label: 'desktop-singleton', perWindow: false, adaptive: false, stream: 'rfb',
    // the existing src/vnc.js stack: an Xvnc-style binary, or a port that
    // already listens (bring-your-own / adopted) — desktop-display reports
    // the latter as the pseudo-binary `desktop-singleton:running`
    needs: Object.freeze([Object.freeze(['Xtigervnc']), Object.freeze(['Xvnc']), Object.freeze(['desktop-singleton:running'])]),
    recipes: Object.freeze({ Xtigervnc: 'shared', Xvnc: 'shared', 'desktop-singleton:running': 'shared' }),
    // a SHARED desktop with its own WM and the user's other windows — never fitted by the keeper
    fit: Object.freeze({ Xtigervnc: 'shared', Xvnc: 'shared', 'desktop-singleton:running': 'shared' }),
    wired: true,
  }),
]);
const BACKEND_IDS = Object.freeze(DISPLAY_BACKENDS.map((b) => b.id));
const backendById = (id, table = DISPLAY_BACKENDS) => table.find((b) => b.id === id) || null;
/** The bring-up recipe name for a (backend, via) pair, or null when the table
 *  names none — the keeper refuses such a pair BY NAME instead of guessing. */
function recipeFor(backend, via, table = DISPLAY_BACKENDS) {
  const b = backendById(backend, table);
  if (!b || !b.recipes || typeof via !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(b.recipes, via) ? b.recipes[via] : null;
}

/** Which of a rung's alternative groups is satisfied by `bins`, or the
 *  missing-list text for each group when none is. */
function needsVerdict(rung, bins) {
  const missing = [];
  for (const group of rung.needs) {
    const gone = group.filter((b) => !bins[b]);
    if (!gone.length) return { ok: true, via: group.join('+'), missing: [] };
    missing.push(`${group.join('+')} not on PATH`);
  }
  return { ok: false, via: null, missing };
}

/**
 * The ladder. `hostFacts.bins` maps binary name → path|null (desktop-display
 * fills it); `prefs.backendPrefs` (a registry row's) may REORDER or RESTRICT
 * the rungs but can never name one the table does not have; `table` defaults
 * to DISPLAY_BACKENDS (a suite hands a copy with a fourth rung to prove that
 * a rung IS one row). Returns
 *   { backend, via, recipe, stream, fallbackWhy, ladder: [{ backend, ok, via, recipe, why }] }
 * `fallbackWhy` is null when the FIRST rung won; otherwise the reasons of
 * every rung fallen past, joined with '; ' — the exact text the log line and
 * the status chip print. `backend` is null (and `fallbackWhy` says why) when
 * no rung can run.
 */
function resolveBackend(hostFacts = {}, prefs = {}, table = DISPLAY_BACKENDS) {
  const bins = (hostFacts && hostFacts.bins) || {};
  const effBins = { ...bins };
  if (hostFacts && hostFacts.singletonRunning) effBins['desktop-singleton:running'] = true;
  let order = table;
  const ids = table.map((b) => b.id);
  const pref = Array.isArray(prefs && prefs.backendPrefs) ? prefs.backendPrefs.filter((id) => ids.includes(id)) : null;
  if (pref && pref.length) order = pref.map((id) => backendById(id, table));
  // EVERY rung is judged (the route reports each one's availability with its
  // reason — a user choosing an install sees what each would need); the FIRST
  // rung that can run wins, and the reasons of the rungs above it are its
  // fallbackWhy.
  // A rung whose binary is present but whose relay is NOT WIRED is reported as
  // present and passed over — it cannot run. 2.369.131: the day xpra was
  // installed on this box (then an unwired row) the ladder chose it and the keeper
  // refused every desktop-app launch with backend-not-wired (a named 409, but a
  // refusal where vnc-display had been working). DA1 ("installed ⇒ preferred")
  // applies to a WIRED rung; since P8-2 every shipped row is wired and this
  // branch is reachable only through a table copy (the suites' control).
  const ladder = order.map((rung) => { const v = needsVerdict(rung, effBins); const wired = rung.wired !== false; const ok = v.ok && wired; return { backend: rung.id, ok, present: v.ok, via: v.via, recipe: v.ok ? recipeFor(rung.id, v.via, table) : null, why: ok ? null : (v.ok ? `${rung.id} present (${v.via}) but not wired` : v.missing.join('; ')) }; }); // a present rung reports the recipe it WOULD use even when unwired (the launcher names it)
  const winner = ladder.findIndex((r) => r.ok);
  if (winner < 0) return { backend: null, via: null, recipe: null, stream: null, fallbackWhy: ladder.map((r) => r.why).join('; ') || 'no display backend', ladder };
  const fell = ladder.slice(0, winner).map((r) => r.why);
  return { backend: ladder[winner].backend, via: ladder[winner].via, recipe: ladder[winner].recipe, stream: backendById(ladder[winner].backend, table).stream, fallbackWhy: fell.length ? fell.join('; ') : null, ladder };
}

/** The §3 log line for a resolved ladder, or null when nothing fell. */
function fallbackLogLine(resolved) {
  if (!resolved || !resolved.backend || !resolved.fallbackWhy) return null;
  const first = resolved.ladder[0];
  if (!first || first.backend === resolved.backend) return null;
  return `[desktop] backend fallback: ${first.backend}→${resolved.backend} (${resolved.fallbackWhy})`;
}

/**
 * The INSTANCE preference (settings `desktop.backendPrefs`, P8-2): a comma
 * list or array of rung ids that REORDERS the ladder for every launch whose
 * registry row names no `backendPrefs` of its own — "keep the whole-display
 * rung first on this instance" is a legitimate choice (an app that misbehaves
 * under xpra's seamless window management), and the suites pin the rung they
 * drive through it. Unknown ids are dropped, never invented (the same rule as
 * a row's prefs); empty ⇒ the table's own DA1 order. PURE.
 */
function parseBackendPrefs(value, table = DISPLAY_BACKENDS) {
  const ids = table.map((b) => b.id);
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  const out = [];
  for (const v of raw) { const id = String(v || '').trim(); if (id && ids.includes(id) && !out.includes(id)) out.push(id); }
  return out;
}

/** The stream KIND a record's rung speaks ('rfb' | 'xpra'), from the table —
 *  the client picks its view by this, never by a backend id. */
function streamKindOf(rec, table = DISPLAY_BACKENDS) {
  const b = rec && rec.backend ? backendById(rec.backend, table) : null;
  return b ? b.stream : null;
}

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
//   • The CLIENT's dpi (hello / display-configure) must equal the display's
//     font dpi: xpra rewrites Xft.dpi to a client's dpi whenever it CHANGES
//     (measured: 96 → 144 through one display-configure), so a client that
//     sent 96 × devicePixelRatio would quadruple a GDK_SCALE=2 app's text.
/** The scales `desktop.appScale` offers (the setting's enum is these + 'auto'). */
const APP_SCALES = Object.freeze([1, 1.5, 2]);
/** A launch request's devicePixelRatio: a finite number in 1..3, else the default 1. */
function normalizeDpr(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 1;
}
/** The app's scale from the setting (auto | 1 | 1.5 | 2, as a string or a number) and the launching client's DPR.
 *  auto = 2 from a DPR of 1.5 up, else 1 — never the text-only 1.5 (see the table above). */
function appScaleFor(setting, dpr = 1) {
  const s = setting === undefined || setting === null || setting === '' ? 'auto' : String(setting);
  if (s !== 'auto') {
    const n = Number(s);
    return APP_SCALES.includes(n) ? n : 1;
  }
  return normalizeDpr(dpr) >= 1.5 ? 2 : 1;
}
/** Every knob a scale sets (see the table above): `{scale, gdkScale, dpi, env, xresources}`. */
function scaleKnobs(scale) {
  const s = APP_SCALES.includes(Number(scale)) ? Number(scale) : 1;
  const gdkScale = s >= 2 ? 2 : 1;
  const dpi = Math.round(96 * s / gdkScale);
  const env = { GDK_SCALE: String(gdkScale), QT_ENABLE_HIGHDPI_SCALING: '1', QT_SCALE_FACTOR: String(gdkScale) };
  const xresources = s > 1 ? ['XTerm', 'UXTerm'].map((c) => `${c}*faceName: Monospace\n${c}*faceSize: ${8 * gdkScale}\n`).join('') : '';
  return { scale: s, gdkScale, dpi, env, xresources };
}

// ── registry rows + launch requests ─────────────────────────────────────────
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
/** Env the KEEPER owns for every app it starts — a row may not set them. */
const KEEPER_ENV = Object.freeze(['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'VIBESPACE_DESKTOP_APP']);
const cleanStr = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\0\r\n]/.test(s);

function validateAppRow(row) {
  if (!row || typeof row !== 'object') return { ok: false, error: 'row must be an object' };
  if (!ID_RE.test(String(row.id || ''))) return { ok: false, error: `id must match ${ID_RE}` };
  if (!cleanStr(row.label, 80)) return { ok: false, error: 'label must be a non-empty string ≤ 80 chars' };
  if (!cleanStr(row.exec, 512)) return { ok: false, error: 'exec must be a non-empty string' };
  if (row.args !== undefined && !(Array.isArray(row.args) && row.args.every((a) => typeof a === 'string' && !/\0/.test(a)))) return { ok: false, error: 'args must be an array of strings' };
  if (row.cwd !== undefined && row.cwd !== null && !cleanStr(row.cwd, 4096)) return { ok: false, error: 'cwd must be a non-empty string' };
  if (row.env !== undefined && row.env !== null) {
    if (typeof row.env !== 'object' || Array.isArray(row.env)) return { ok: false, error: 'env must be an object' };
    for (const [k, v] of Object.entries(row.env)) {
      if (!ENV_KEY_RE.test(k)) return { ok: false, error: `env key ${JSON.stringify(k)} is not a valid name` };
      if (KEEPER_ENV.includes(k)) return { ok: false, error: `env ${k} is set by the keeper, not by a row` };
      if (typeof v !== 'string' || /\0/.test(v)) return { ok: false, error: `env ${k} must be a string` };
    }
  }
  if (row.category !== undefined && row.category !== null && !cleanStr(row.category, 40)) return { ok: false, error: 'category must be a short string' };
  if (row.backendPrefs !== undefined && row.backendPrefs !== null) {
    if (!Array.isArray(row.backendPrefs) || row.backendPrefs.some((b) => !BACKEND_IDS.includes(b))) return { ok: false, error: `backendPrefs may only name ${BACKEND_IDS.join('/')}` };
  }
  if (row.needsWayland !== undefined && typeof row.needsWayland !== 'boolean') return { ok: false, error: 'needsWayland must be a boolean' };
  return { ok: true, error: null };
}

/**
 * The launch dialog's two shapes (§2 routes): `{appId}` or `{exec, args, cwd}`.
 * Returns { ok, error, launch } where launch is
 *   { source:'registry', row, dpr }  |  { source:'adhoc', row:{ id:null, label, exec, args, cwd }, dpr }
 * `dpr` = the launching client's devicePixelRatio (1..3, absent ⇒ 1; out of range ⇒ refused) —
 * the input `appScaleFor` turns into the app's scale under `desktop.appScale: auto`.
 * `registry` is the array of rows the keeper serves. Nothing here checks PATH
 * or the file system — the keeper does (exec resolved on PATH, cwd must exist).
 */
function validateLaunchRequest(body, registry = []) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  if (body.dpr !== undefined && body.dpr !== null && !(Number.isFinite(Number(body.dpr)) && Number(body.dpr) >= 1 && Number(body.dpr) <= 3)) return { ok: false, error: 'dpr must be a number from 1 to 3' };
  if (body.appId !== undefined) {
    if (!ID_RE.test(String(body.appId))) return { ok: false, error: 'appId is not a valid id' };
    const row = registry.find((r) => r.id === body.appId);
    if (!row) return { ok: false, error: `unknown appId ${JSON.stringify(body.appId)}` };
    return { ok: true, error: null, launch: { source: 'registry', row, dpr: normalizeDpr(body.dpr) } };
  }
  const row = { id: null, label: cleanStr(body.label, 80) ? body.label : null, exec: body.exec, args: body.args === undefined ? [] : body.args, cwd: body.cwd === undefined || body.cwd === '' ? null : body.cwd };
  if (!row.label) row.label = typeof row.exec === 'string' ? row.exec.split('/').pop().slice(0, 80) : null;
  const v = validateAppRow({ ...row, id: 'adhoc' });
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, error: null, launch: { source: 'adhoc', row, dpr: normalizeDpr(body.dpr) } };
}

/** The small default registry (§2 "a small default registry"): every row is
 *  PRESENCE-CHECKED by the keeper against PATH before it is offered — a row
 *  whose exec is absent is served with `available:false` and the reason, never
 *  hidden and never assumed. Order = what a first user most likely wants. */
const DEFAULT_REGISTRY = Object.freeze([
  Object.freeze({ id: 'xterm', label: 'xterm', exec: 'xterm', args: Object.freeze([]), category: 'terminal' }),
  Object.freeze({ id: 'gnome-calculator', label: 'Calculator (GNOME)', exec: 'gnome-calculator', args: Object.freeze([]), category: 'utility' }),
  Object.freeze({ id: 'gedit', label: 'gedit', exec: 'gedit', args: Object.freeze([]), category: 'editor' }),
  Object.freeze({ id: 'firefox', label: 'Firefox', exec: 'firefox', args: Object.freeze(['--new-instance']), category: 'browser' }),
  Object.freeze({ id: 'chromium', label: 'Chromium', exec: 'chromium', args: Object.freeze([]), category: 'browser' }),
  Object.freeze({ id: 'code', label: 'VS Code', exec: 'code', args: Object.freeze(['--new-window', '--wait']), category: 'editor' }),
]);

// ── the app-session state machine (§2) ──────────────────────────────────────
/** state × event → next state, or null when the event is not legal there.
 *  Events: 'server-listening' (the picture server answered its banner),
 *  'app-exit' (the application process ended), 'stop' (a human / idle /
 *  runaway stop that completed), 'spawn-error' (a process failed to start),
 *  'runaway' (the guard tripped), 'display-gone' (X died under the app). */
const TRANSITIONS = Object.freeze({
  launching: Object.freeze({ 'server-listening': 'ready', 'app-exit': 'exited', stop: 'exited', 'spawn-error': 'failed', 'display-gone': 'failed', runaway: 'failed' }),
  ready: Object.freeze({ 'app-exit': 'exited', stop: 'exited', runaway: 'failed', 'display-gone': 'failed' }),
  exited: Object.freeze({}),
  failed: Object.freeze({}),
});
function transition(state, event) {
  const row = TRANSITIONS[state];
  if (!row) return null;
  return row[event] || null;
}
const isLiveState = (s) => LIVE_STATES.includes(s);
const isTerminalState = (s) => s === 'exited' || s === 'failed';

// ── verdicts the keeper acts on ─────────────────────────────────────────────
/** Idle arithmetic for one record: `lastInputAt` is the last INPUT the bridge
 *  reported (falls back to startedAt), `idleTimeoutMs` 0 ⇒ never expires. */
function idleState(rec, now, idleTimeoutMs) {
  const since = Number(rec && (rec.lastInputAt || rec.startedAt)) || now;
  const idleMs = Math.max(0, now - since);
  const limit = Number(idleTimeoutMs) > 0 ? Number(idleTimeoutMs) : 0;
  return { idleMs, limit, remainingMs: limit ? Math.max(0, limit - idleMs) : null, expired: !!limit && idleMs >= limit };
}

/** The concurrency ceiling: `live` = the records in a live state. Returns
 *  null when a launch may proceed, else a refusal naming the holders. */
function capVerdict(live, limits = LIMITS) {
  const cap = Number(limits.CONCURRENT_CAP) || LIMITS.CONCURRENT_CAP;
  if (live.length < cap) return null;
  const names = live.map((r) => `${r.label || r.exec || r.id} (${r.id})`);
  return { code: 'cap', cap, holders: live.map((r) => r.id), error: `desktop app ceiling reached (${live.length}/${cap} running: ${names.join(', ')}) — stop one first` };
}

/**
 * ONE runaway sample (the opencode-serve guard shape, verbatim logic):
 * `sample` = { cpuTicks, rssBytes } read now, `prev` = { at, cpuTicks } from the
 * previous tick (or null), `hotSince` = when sustained-hot began (0 = not hot).
 * Returns { cpuPct, hotSince, why } — `why` non-null ⇒ stop + park.
 */
function runawayVerdict(sample, prev, hotSince, now, { clkTck = 100, limits = LIMITS } = {}) {
  if (!sample) return { cpuPct: null, hotSince: 0, why: null };
  let cpuPct = null;
  if (prev && now > prev.at) cpuPct = (sample.cpuTicks - prev.cpuTicks) * 100000 / clkTck / (now - prev.at);
  let why = null;
  let hot = hotSince || 0;
  if (sample.rssBytes > limits.GUARD_RSS_BYTES) {
    why = `RSS ${(sample.rssBytes / 2 ** 30).toFixed(1)} GB (limit ${(limits.GUARD_RSS_BYTES / 2 ** 30).toFixed(1)} GB)`;
  } else if (cpuPct !== null && cpuPct > limits.GUARD_CPU_PCT) {
    if (!hot) hot = now;
    if (now - hot >= limits.GUARD_CPU_SUSTAIN_MS) why = `${cpuPct.toFixed(0)}% CPU sustained for ${Math.round((now - hot) / 60000)} min (limit ${limits.GUARD_CPU_PCT}%)`;
  } else hot = 0;
  return { cpuPct, hotSince: hot, why };
}

/** Is a registry app still parked after a runaway? `parkedUntil` = the map
 *  the keeper persists ({ appId: until }). */
function runawayParkVerdict(appId, parkedUntil, now) {
  const until = appId && parkedUntil ? Number(parkedUntil[appId]) : 0;
  if (!until || until <= now) return null;
  return { code: 'runaway-parked', until, error: `${appId} was stopped as a runaway; not launching it again for ${Math.ceil((until - now) / 60000)} min` };
}

/**
 * Boot ADOPTION (§4): a record is alive only when its X server AND its
 * picture server AND its app are the processes it recorded — pid AND
 * starttime — and the picture port still answers. `alive` = { x, server, app }
 * booleans the keeper measured; `portOk` = the LISTEN probe of the rung's own
 * kind (the RFB banner, or xpra's HTTP answer — P8-2). The backend a record
 * was BORN with is never re-resolved here (DA1: a vnc-display session
 * survives the day xpra is installed). Returns either
 * { state:'ready', adopted:true } or { state:'exited'|'failed', lastError }.
 */
function adoptVerdict(rec, alive, portOk) {
  if (!rec || !isLiveState(rec.state)) return null;
  if (!alive.x) return { state: 'exited', lastError: rec.lastError || 'X display gone while VibeSpace was down' };
  if (!alive.app) return { state: 'exited', lastError: rec.lastError || 'application exited while VibeSpace was down' };
  if (!alive.server || !portOk) return { state: 'failed', lastError: rec.lastError || 'picture server not answering after restart' };
  return { state: 'ready', adopted: true };
}

/** The ws bridge target for a record: null until the picture server listens. */
function streamTargetOf(rec) {
  if (!rec || rec.state !== 'ready' || !rec.port) return null;
  const b = backendById(rec.backend);
  return { kind: b ? b.stream : 'rfb', port: rec.port, backend: rec.backend };
}

/** New record shape (§4) — facts only. */
function newRecord({ id, label, exec, args, cwd, env, source, backend, via, fallbackWhy, idleTimeoutMs, now, scale = 1, dpi = 96 }) {
  return {
    id, label, exec, args: Array.isArray(args) ? args.slice() : [], cwd: cwd || null, env: env && Object.keys(env).length ? { ...env } : undefined,
    source, backend, via: via || null, fallbackWhy: fallbackWhy || null,
    display: null, port: null, pids: { x: null, app: null, server: null, wm: null }, starts: { x: null, app: null, server: null, wm: null },
    startedAt: now, state: 'launching', exitCode: null, lastError: null,
    idleTimeoutMs: Number(idleTimeoutMs) || 0, lastInputAt: now,
    scale: APP_SCALES.includes(Number(scale)) ? Number(scale) : 1, dpi: Number.isInteger(dpi) && dpi >= 48 && dpi <= 288 ? dpi : 96, // HiDPI (2.369.158): the app's scale + the display's font dpi, fixed at launch
  };
}

module.exports = {
  LIMITS, DESKTOP_SINGLETON_ID, APP_STATES, LIVE_STATES, DEFAULT_IDLE_TIMEOUT_MIN, KEEPER_ENV,
  DISPLAY_BACKENDS, BACKEND_IDS, backendById, recipeFor, needsVerdict, resolveBackend, fallbackLogLine, parseBackendPrefs, streamKindOf,
  fitPolicyOf, keeperFits, topLevelWindows, appWindows, appFitPlan, appMainWindow, windowTitleOf, APP_TITLE_MAX,
  validateAppRow, validateLaunchRequest, DEFAULT_REGISTRY, APP_SCALES, normalizeDpr, appScaleFor, scaleKnobs,
  TRANSITIONS, transition, isLiveState, isTerminalState,
  idleState, capVerdict, runawayVerdict, runawayParkVerdict, adoptVerdict, streamTargetOf, newRecord,
};
