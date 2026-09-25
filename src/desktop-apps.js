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
 *     (§2) and the idle / cap / adoption / profile-retirement VERDICTS the
 *     keeper acts on — decisions here, acts in the keeper (the resource
 *     verdict is src/runaway-guard.js; for an app it only REPORTS).
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
/** Default idle timeout (DA3): 0 = never (owner ruling 2026-09-25 "30分钟那个暂停也默认关掉" —
 *  an app a person opened is not stopped for sitting still; the setting stays for
 *  anyone who wants a stop after N min without INPUT). */
const DEFAULT_IDLE_TIMEOUT_MIN = 0;

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
// ROUND 3 A3 (docs/design-desktop-apps-seamless §3.4, the owner 2026-09-23: "内部app的dpi … 最好是能从
// vibespace自身的dpi自动推导"): `auto` derives from VibeSpace's OWN effective scale on the launching client,
// eff = devicePixelRatio × the UI scale (utils applyUiPrefs' body zoom — the pane is counter-zoomed to net zoom
// 1, so without this factor a 125 % UI drew a 1.0× app next to 1.25× chrome, measured M4). The integer part is
// the RATIO-NEAREST integer (the geometric midpoints √2 and 2√2 — r2's rule, carried to 3); the fraction goes
// ONLY UPWARD into the font dpi (text is never drawn below 96 dpi):
//   eff 1.00 ⇒ 1×/96 · 1.25 ⇒ 1×/120 · 1.5 ⇒ 2×/96 · 2.0 ⇒ 2×/96 · 2.5 ⇒ 2×/120 · 3.0 ⇒ 3×/96
// so `appScaleFor('auto', …)` answers the TEXT scale (1..√2 as is, √2..2 ⇒ 2, 2..2√2 as is, above ⇒ 3) and
// `scaleKnobs` spells ANY value 1..3 by the floor rule (GDK_SCALE = floor, the rest in Xft.dpi) — which is also
// what an explicit 1.5 has always been: text only in GTK. The ORIGIN rides the record (`scaleOrigin`
// auto | setting | chosen) so the chip can say whether the number was derived or picked.
/** The scales `desktop.appScale` offers (the setting's enum is these + 'auto'). */
const APP_SCALES = Object.freeze([1, 1.5, 2]);
/** The per-window Scale ▸ menu's rows (round 3 A3): re-derive from this screen, or one of the explicit scales. */
const SCALE_CHOICES = Object.freeze(['auto', ...APP_SCALES]);
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
    return APP_SCALES.includes(n) ? n : 1;
  }
  const eff = effectiveScale(dpr, uiScale);
  if (eff < Math.SQRT2) return eff;
  if (eff < 2) return 2;
  if (eff < 2 * Math.SQRT2) return eff;
  return SCALE_MAX;
}
/** The scale a launch runs at AND where it came from → { scale, origin: 'auto'|'setting'|'chosen', from: {dpr, uiScale}|null }.
 *  `choice` (a relaunch's Scale ▸ row) wins over `setting`; its 'auto' re-derives from the RELAUNCHING client. */
function scalePick({ setting, choice, dpr = 1, uiScale = 1 } = {}) {
  const from = { dpr: normalizeDpr(dpr), uiScale: normalizeUiScale(uiScale) };
  if (choice !== undefined && choice !== null) {
    if (String(choice) === 'auto') return { scale: appScaleFor('auto', dpr, uiScale), origin: 'auto', from };
    return { scale: appScaleFor(choice, dpr, uiScale), origin: 'chosen', from: null };
  }
  const s = setting === undefined || setting === null || setting === '' ? 'auto' : String(setting);
  if (s === 'auto') return { scale: appScaleFor('auto', dpr, uiScale), origin: 'auto', from };
  return { scale: appScaleFor(s, dpr, uiScale), origin: 'setting', from: null };
}
/** A record's scale: any finite value 1..SCALE_MAX (2 decimals), else 1. */
function normalizeScale(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= SCALE_MAX ? round2(n) : 1;
}
/** Every knob a scale sets (see the tables above): `{scale, gdkScale, dpi, env, xresources}` — GDK_SCALE = the
 *  integer part (floor), the fraction in the display's font dpi (96 × scale / GDK_SCALE). */
function scaleKnobs(scale) {
  const s = normalizeScale(scale);
  const gdkScale = Math.max(1, Math.min(SCALE_MAX, Math.floor(s)));
  const dpi = Math.round(96 * s / gdkScale);
  const env = { GDK_SCALE: String(gdkScale), QT_ENABLE_HIGHDPI_SCALING: '1', QT_SCALE_FACTOR: String(gdkScale) };
  const xresources = s > 1 ? ['XTerm', 'UXTerm'].map((c) => `${c}*faceName: Monospace\n${c}*faceSize: ${8 * gdkScale}\n`).join('') : '';
  return { scale: s, gdkScale, dpi, env, xresources };
}
/** POST /api/desktop/apps/:id/relaunch `{ scale: 'auto'|1|1.5|2, dpr?, uiScale? }` → { ok, choice, dpr, uiScale } | { ok:false, code, error }. */
function validateRelaunchRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const raw = b.scale;
  const choice = raw === 'auto' ? 'auto' : (raw !== undefined && raw !== null && raw !== '' && APP_SCALES.includes(Number(raw)) ? Number(raw) : null);
  if (choice === null) return { ok: false, code: 'bad-request', error: `scale must be one of ${SCALE_CHOICES.join(', ')}` };
  if (b.dpr !== undefined && b.dpr !== null && !(Number.isFinite(Number(b.dpr)) && Number(b.dpr) >= 1 && Number(b.dpr) <= 3)) return { ok: false, code: 'bad-request', error: 'dpr must be a number from 1 to 3' };
  if (b.uiScale !== undefined && b.uiScale !== null && !(Number.isFinite(Number(b.uiScale)) && Number(b.uiScale) >= UI_SCALE_RANGE[0] && Number(b.uiScale) <= UI_SCALE_RANGE[1])) return { ok: false, code: 'bad-request', error: `uiScale must be a number from ${UI_SCALE_RANGE[0]} to ${UI_SCALE_RANGE[1]}` };
  return { ok: true, choice, dpr: normalizeDpr(b.dpr), uiScale: normalizeUiScale(b.uiScale) };
}
/** May this record be relaunched at another scale? null = yes, else { code, error } by name. The scale is fixed at
 *  launch (GDK_SCALE is read once), so the relaunch is a NEW app session: only a running xpra app, never a browser
 *  (a browser's profile is CARRIED to the successor by the keeper's stop-first relaunch — 2.369.176). */
function relaunchVerdict(rec, backends = DISPLAY_BACKENDS) {
  if (!rec) return { code: 'not-found', error: 'no such desktop app' };
  if (rec.state !== 'ready') return { code: 'not-ready', error: `${rec.label || rec.id} is ${rec.state} — only a running app can be relaunched at another scale` };
  const b = rec.backend ? backendById(rec.backend, backends) : null;
  if (!b || b.stream !== 'xpra') return { code: 'not-xpra', error: `${rec.label || rec.id} runs on ${rec.backend || 'no'} rung — only an xpra app has a scale (a whole display is drawn at the browser's pixels)` };
  // a browser row relaunches too (2.369.176, the owner: "你不让我在这里调我怎么调") — the keeper stops it FIRST and moves its
  // profile onto the successor (a browser locks its profile dir, so the successor cannot start beside it), then starts it
  return null;
}
/** The launch body that starts the same app again: a catalog row by its id, a typed command as typed. */
function relaunchBodyOf(rec) {
  if (rec.source === 'registry' && rec.appId) return { appId: rec.appId };
  return { exec: rec.exec, args: Array.isArray(rec.args) ? rec.args.slice() : [], cwd: rec.cwd || null, label: rec.label };
}

/** The Scale ▸ menu of ONE window (round 3 A3), words left to the client: the four rows (auto = what THIS client's
 *  dpr × uiScale would derive now), which one the record runs at, and — when the window cannot relaunch — the reason
 *  CODE (relaunchVerdict's, or 'lease' = an agent holds the app, 'seat' = another client is the active viewer). */
function scaleMenuModel(rec, { dpr = 1, uiScale = 1, leased = false, seat = 'active', backends = DISPLAY_BACKENDS } = {}) {
  const v = relaunchVerdict(rec, backends);
  const why = v ? v.code : leased ? 'lease' : seat !== 'active' ? 'seat' : null;
  const cur = rec ? normalizeScale(rec.scale) : 1;
  const rows = SCALE_CHOICES.map((choice) => {
    const scale = choice === 'auto' ? appScaleFor('auto', dpr, uiScale) : choice;
    const current = !!rec && (choice === 'auto' ? rec.scaleOrigin === 'auto' : rec.scaleOrigin !== 'auto' && cur === choice);
    return { choice, scale, current, disabled: !!why || (current && (choice !== 'auto' || scale === cur)) };
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
 *  active viewer, no main window to ask). */
function outerCloseVerdict({ state, stream, seat, connected, mainWid, leased = false, askedAt = 0, now = 0, againMs = OUTER_CLOSE_AGAIN_MS } = {}) {
  if (state !== 'ready') return { act: 'close', why: 'not-running' };
  if (askedAt > 0 && now >= askedAt && now - askedAt <= againMs) return { act: 'stop', why: 'again' };
  if (stream !== 'xpra') return { act: 'close', why: 'no-window-protocol' };
  if (leased) return { act: 'close', why: 'lease' };
  if (seat !== 'active') return { act: 'close', why: 'not-active' };
  if (!connected || !(mainWid > 0)) return { act: 'close', why: 'no-main-window' };
  return { act: 'ask-app', why: 'close-window' };
}

// ── B-bfe6: a BROWSER as a desktop app ───────────────────────────────────────
// Owner (2026-09-23): "应用里面也可以加入一下浏览器". A desktop-app browser is a
// HUMAN'S browser: a registry exec (§5 — never an agent's), on the xpra
// per-window rung like every other app, with its OWN profile directory that the
// app session owns (created 0700 by the keeper under data/desktop-apps/<id>/,
// removed with the session unless the user chose "keep profile"). It is never an
// agent-browser profile (those live under data/browser-*, driven over CDP by
// the Browser profiles keeper — design-agent-browser-v2 §3) and never the user's
// real ~/.config/chromium or ~/.mozilla: the verdicts below refuse both BY NAME.
// No automation flag ever reaches its argv (no --remote-debugging-*, no
// --enable-automation, no marionette): it is a window a person drives.
const BROWSER_KINDS = Object.freeze({
  chromium: Object.freeze({ execs: Object.freeze(['chromium', 'chromium-browser', 'google-chrome']), labels: Object.freeze({ chromium: 'Chromium', 'chromium-browser': 'Chromium', 'google-chrome': 'Google Chrome' }) }),
  firefox: Object.freeze({ execs: Object.freeze(['firefox', 'firefox-esr']), labels: Object.freeze({ firefox: 'Firefox', 'firefox-esr': 'Firefox ESR' }) }),
});
/** Every bare browser binary name a family may resolve to (desktop-display probes them). */
const BROWSER_BINS = Object.freeze([...new Set(Object.values(BROWSER_KINDS).flatMap((k) => k.execs))]);
/** Flags a desktop-app browser's argv may never carry from a row: a profile of its own
 *  (the keeper's is the only one) or anything that makes it an automated browser. */
const FORBIDDEN_BROWSER_ARG_RE = /^(?:--?(?:user-data-dir|profile|p|P|remote-debugging-port|remote-debugging-pipe|remote-debugging-address|remote-allow-origins|remote-allow-hosts|enable-automation|headless|marionette|remote-debugging|start-debugger-server|load-extension|disable-extensions-except))(?:=.*)?$/;
const isForbiddenBrowserArg = (a) => typeof a === 'string' && FORBIDDEN_BROWSER_ARG_RE.test(a);
/**
 * The row the catalog SERVES for a browser family: `row.execs` (default the
 * family's) in order, the first one `bins` names (path|null, desktop-display's
 * probe) wins and becomes the row's `exec`; the label follows the binary
 * (google-chrome ⇒ "Google Chrome"). Returns `{ ok, row, error, code }` —
 * `browser-absent` names every candidate when none is on PATH (the catalog
 * shows the row DIMMED with that reason, never hidden).
 */
function browserRowFor(row, bins = {}) {
  const kind = row && BROWSER_KINDS[row.browser];
  if (!kind) return { ok: false, row: null, code: 'not-a-browser', error: `${row && row.label ? row.label : 'this row'} is not a browser row` };
  const execs = Array.isArray(row.execs) && row.execs.length ? row.execs : kind.execs;
  const hit = execs.find((e) => bins && bins[e]);
  if (!hit) return { ok: false, row: { ...row, exec: execs[0] }, code: 'browser-absent', error: `none of ${execs.join(', ')} on PATH` };
  return { ok: true, row: { ...row, exec: hit, label: kind.labels[hit] || row.label, path: bins[hit] }, code: null, error: null };
}
/** The launch dialog's optional "Open URL": http(s) only, no whitespace or control character, ≤ 2048 — PURE (the
 *  bundle's dialog and the server run the same function). Returns `{ ok, url, code:'bad-url', error }`; `url` is the
 *  parsed href (it is one argv item AFTER the profile flags, and an http(s) href never begins with '-'). */
const URL_MAX = 2048;
function validateBrowserUrl(value) {
  const bad = (why) => ({ ok: false, url: null, code: 'bad-url', error: `Open URL must be an http:// or https:// address (${why})` });
  if (typeof value !== 'string') return bad('not a string');
  const s = value.trim();
  if (!s) return bad('empty');
  if (s.length > URL_MAX) return bad(`longer than ${URL_MAX} characters`);
  if (/[\u0000- \u007f-\u009f]/.test(s)) return bad('it contains a space or a control character');
  let u;
  try { u = new URL(s); } catch { return bad(`${JSON.stringify(s.slice(0, 80))} is not a URL`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return bad(`${u.protocol} is not allowed`);
  if (!u.hostname) return bad('no host');
  return { ok: true, url: u.href, code: null, error: null };
}
/** A slash-normalised absolute path (`//`, `/./`, `/../` folded) or null — PURE, no `path` import. */
function normAbs(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || /\0/.test(p)) return null;
  const out = [];
  for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
  return '/' + out.join('/');
}
const within = (child, parent) => child === parent || child.startsWith(parent === '/' ? '/' : parent + '/');
/** Where the user's REAL browsers keep their profiles, relative to $HOME (deb, snap, flatpak). A desktop-app profile
 *  is never one of them nor inside one. */
const REAL_BROWSER_ROOTS = Object.freeze(['.config/chromium', '.config/chromium-browser', '.config/google-chrome', '.config/google-chrome-beta', '.config/google-chrome-unstable', '.mozilla', 'snap/chromium', 'snap/firefox', '.var/app/org.chromium.Chromium', '.var/app/com.google.Chrome', '.var/app/org.mozilla.firefox']);
/**
 * Is `dir` a profile directory a desktop-app browser may be pointed at?
 *   · absolute, and INSIDE `ownedRoot` (the keeper's data/desktop-apps — so it is the app session's own, never an
 *     agent-browser profile, which lives under data/browser-*)            else `profile-not-owned`
 *   · not $HOME itself and not inside the user's real browser profiles     else `profile-is-users`
 *   · `confinement: 'snap'` (the binary is a snap — Ubuntu's firefox / chromium-browser): a snap sees a private /tmp
 *     and no hidden top-level folder of $HOME, so the dir must be inside $HOME under a non-hidden first segment
 *                                                                           else `snap-profile-unreachable`
 * Returns `{ ok, dir, code, error }` (`dir` normalised).
 */
function profileDirVerdict(dir, { home = null, ownedRoot = null, confinement = null, exec = 'the browser' } = {}) {
  const d = normAbs(dir), root = normAbs(ownedRoot), h = normAbs(home);
  if (!d) return { ok: false, dir: null, code: 'profile-not-owned', error: `the profile directory must be an absolute path (${JSON.stringify(dir)})` };
  if (!root || !within(d, root) || d === root) return { ok: false, dir: d, code: 'profile-not-owned', error: `the profile directory ${d} is not inside the keeper's own ${root || '(no root)'} — a desktop-app browser only ever gets a profile its app session owns` };
  if (h && h !== '/') {
    if (d === h) return { ok: false, dir: d, code: 'profile-is-users', error: `the profile directory may not be your home folder (${h})` };
    const real = REAL_BROWSER_ROOTS.map((r) => `${h}/${r}`).find((r) => within(d, r));
    if (real) return { ok: false, dir: d, code: 'profile-is-users', error: `the profile directory ${d} is inside your own browser's profiles (${real}) — a desktop-app browser never opens them` };
  }
  if (confinement === 'snap') {
    const first = h && h !== '/' && within(d, h) && d !== h ? d.slice(h.length + 1).split('/')[0] : null;
    if (!first || first.startsWith('.')) return { ok: false, dir: d, code: 'snap-profile-unreachable', error: `${exec} is a snap: it can only open a profile inside your home folder, outside a hidden one — this instance keeps its data at ${root}, which the snap cannot reach` };
  }
  return { ok: true, dir: d, code: null, error: null };
}
/**
 * The ARGV of a desktop-app browser (PURE): the row's own args, then the profile flags, then the optional URL —
 *   chromium family: --user-data-dir=<dir> --no-first-run --no-default-browser-check --password-store=basic
 *                    (the last: the app's display has no keyring of its own, and a window on it must never
 *                    reach for the user's REAL session keyring — the profile's own 0700 dir holds its secrets)
 *   firefox family:  --new-instance -profile <dir>  (+ the profile's user.js, `firefoxUserJs`, is its first-run switch)
 * Refused by name: not a browser row, a forbidden (profile / automation) flag in the row, a bad profile dir, a bad URL.
 * Returns `{ ok, argv, url, code, error }`.
 */
function browserArgv(row, { profileDir, url = null } = {}) {
  const kind = row && BROWSER_KINDS[row.browser];
  if (!kind) return { ok: false, argv: null, url: null, code: 'not-a-browser', error: `${row && row.label ? row.label : 'this row'} is not a browser row` };
  const own = Array.isArray(row.args) ? row.args.slice() : [];
  const flag = own.find(isForbiddenBrowserArg);
  if (flag) return { ok: false, argv: null, url: null, code: 'automation-flag', error: `a browser row may not carry ${JSON.stringify(flag)}` };
  const d = normAbs(profileDir);
  if (!d) return { ok: false, argv: null, url: null, code: 'profile-not-owned', error: 'a desktop-app browser needs its own absolute profile directory' };
  let u = null;
  if (url !== null && url !== undefined && url !== '') { const v = validateBrowserUrl(url); if (!v.ok) return { ok: false, argv: null, url: null, code: v.code, error: v.error }; u = v.url; }
  const profile = row.browser === 'firefox' ? ['--new-instance', '-profile', d] : [`--user-data-dir=${d}`, '--no-first-run', '--no-default-browser-check', '--password-store=basic'];
  return { ok: true, argv: [...own, ...profile, ...(u ? [u] : [])], url: u, code: null, error: null };
}
/** Firefox has no --no-first-run: its profile's user.js IS the switch (written by the keeper before the launch). */
function firefoxUserJs() {
  return [
    ['browser.shell.checkDefaultBrowser', false], ['browser.aboutwelcome.enabled', false], ['browser.startup.homepage_override.mstone', 'ignore'],
    ['startup.homepage_welcome_url', ''], ['startup.homepage_welcome_url.additional', ''], ['datareporting.policy.firstRunURL', ''],
    ['toolkit.telemetry.reportingpolicy.firstRun', false], ['trailhead.firstrun.didSeeAboutWelcome', true], ['browser.tabs.warnOnClose', false],
  ].map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n';
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
  // B-bfe6: a BROWSER row names its family, the bare exec names it may resolve to (first on PATH wins), and may never
  // carry a profile or an automation flag of its own — the profile is the keeper's, and a human's browser is not driven
  if (row.browser !== undefined && row.browser !== null) {
    if (!Object.prototype.hasOwnProperty.call(BROWSER_KINDS, row.browser)) return { ok: false, error: `browser must be one of ${Object.keys(BROWSER_KINDS).join('/')}` };
    if (row.execs !== undefined && !(Array.isArray(row.execs) && row.execs.length && row.execs.every((e) => typeof e === 'string' && /^[A-Za-z0-9._+-]{1,64}$/.test(e)))) return { ok: false, error: 'execs must be a non-empty array of bare binary names' };
    const flag = (row.args || []).find(isForbiddenBrowserArg);
    if (flag) return { ok: false, error: `a browser row may not carry ${JSON.stringify(flag)} — its profile is the keeper's and a desktop-app browser is never an automated one`, code: 'automation-flag' };
  } else if (row.execs !== undefined) return { ok: false, error: 'execs is for a browser row only' };
  return { ok: true, error: null };
}

/**
 * The launch dialog's two shapes (§2 routes): `{appId}` or `{exec, args, cwd}`.
 * Returns { ok, error, launch } where launch is
 *   { source:'registry', row, dpr }  |  { source:'adhoc', row:{ id:null, label, exec, args, cwd }, dpr }
 * `dpr` = the launching client's devicePixelRatio (1..3, absent ⇒ 1; out of range ⇒ refused) and
 * `uiScale` = its UI scale (0.6..2, absent ⇒ 1; out of range ⇒ refused) — the inputs `appScaleFor`
 * turns into the app's scale under `desktop.appScale: auto` (round 3 A3: dpr × uiScale).
 * `registry` is the array of rows the keeper serves. Nothing here checks PATH
 * or the file system — the keeper does (exec resolved on PATH, cwd must exist).
 */
function validateLaunchRequest(body, registry = []) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  if (body.dpr !== undefined && body.dpr !== null && !(Number.isFinite(Number(body.dpr)) && Number(body.dpr) >= 1 && Number(body.dpr) <= 3)) return { ok: false, error: 'dpr must be a number from 1 to 3' };
  if (body.uiScale !== undefined && body.uiScale !== null && !(Number.isFinite(Number(body.uiScale)) && Number(body.uiScale) >= UI_SCALE_RANGE[0] && Number(body.uiScale) <= UI_SCALE_RANGE[1])) return { ok: false, error: `uiScale must be a number from ${UI_SCALE_RANGE[0]} to ${UI_SCALE_RANGE[1]}` };
  // B-bfe6: `url` + `keepProfile` belong to a BROWSER row — anywhere else they are refused by name, never ignored
  const hasUrl = body.url !== undefined && body.url !== null && body.url !== '';
  if (body.keepProfile !== undefined && typeof body.keepProfile !== 'boolean') return { ok: false, error: 'keepProfile must be a boolean', code: 'bad-request' };
  if (body.appId !== undefined) {
    if (!ID_RE.test(String(body.appId))) return { ok: false, error: 'appId is not a valid id' };
    const row = registry.find((r) => r.id === body.appId);
    if (!row) return { ok: false, error: `unknown appId ${JSON.stringify(body.appId)}` };
    if (!row.browser && (hasUrl || body.keepProfile !== undefined)) return { ok: false, error: `${hasUrl ? 'url' : 'keepProfile'} is only for a browser app — ${row.label} is not one`, code: 'not-a-browser' };
    let url = null;
    if (hasUrl) { const u = validateBrowserUrl(body.url); if (!u.ok) return { ok: false, error: u.error, code: u.code }; url = u.url; }
    return { ok: true, error: null, launch: { source: 'registry', row, dpr: normalizeDpr(body.dpr), uiScale: normalizeUiScale(body.uiScale), ...(row.browser ? { url, keepProfile: body.keepProfile === true } : {}) } };
  }
  if (hasUrl || body.keepProfile !== undefined) return { ok: false, error: `${hasUrl ? 'url' : 'keepProfile'} is only for a browser app from the catalog — a command you type is run as typed`, code: 'not-a-browser' };
  const row = { id: null, label: cleanStr(body.label, 80) ? body.label : null, exec: body.exec, args: body.args === undefined ? [] : body.args, cwd: body.cwd === undefined || body.cwd === '' ? null : body.cwd };
  if (!row.label) row.label = typeof row.exec === 'string' ? row.exec.split('/').pop().slice(0, 80) : null;
  const v = validateAppRow({ ...row, id: 'adhoc' });
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, error: null, launch: { source: 'adhoc', row, dpr: normalizeDpr(body.dpr), uiScale: normalizeUiScale(body.uiScale) } };
}

// ── which launches are WEB BROWSERS (takeover r2, T6 / I6) ─────────────────
/**
 * A desktop-app browser is the HUMAN'S window (its own profile, its logins; no
 * mediation, no action trace, no egress policy) — the window-targets engine
 * refuses it to agents `browser_is_human`. r1 recognised only a registry
 * browser ROW or an ad-hoc launch of the SAME executable as one (firefox /
 * chromium), so a human's dialog-launched Chrome, Edge, Brave or flatpak
 * Chromium was attachable and AT-SPI-drivable. A browser is recognised by its
 * NAME here, three ways:
 *   · the executable's basename (`google-chrome-stable`, `/snap/bin/chromium`,
 *     `microsoft-edge`, `brave-browser`, the Debian alternatives
 *     `x-www-browser` / `gnome-www-browser` / `sensible-browser`, and the
 *     binaries those run: `chrome`, `msedge`, `brave`, `vivaldi-bin` …);
 *   · a reverse-DNS app id — a flatpak export (`…/exports/bin/org.chromium.
 *     Chromium`) or the id `flatpak run` / `snap run` / `env` launch;
 *   · the RUNNING process's own executable (`exe`, read by the engine from
 *     /proc) — a wrapper the human typed (`x-www-browser`, their own script)
 *     execs into the browser binary, and that binary's name decides.
 * Precise names, never a prefix: `chromium-thumbnailer`, `infobrowser` (GNU
 * info) and `browserslist` are not browsers (the suite's controls).
 */
const BROWSER_EXEC_RE = /^(?:google-chrome(?:-(?:stable|beta|unstable|canary))?|chrome|chromium(?:-browser|-freeworld)?|ungoogled-chromium|microsoft-edge(?:-(?:stable|beta|dev|canary))?|msedge|brave(?:-browser)?(?:-(?:stable|beta|nightly))?|opera(?:-(?:stable|beta|developer))?|vivaldi(?:-(?:stable|snapshot|bin))?|firefox(?:-(?:esr|bin|beta|nightly|devedition|developer-edition))?(?:\.real)?|librewolf|waterfox|floorp|zen-browser|zen(?:-bin)?|mullvad-browser|tor-browser|start-tor-browser|torbrowser-launcher|epiphany(?:-browser)?|falkon|konqueror|midori|qutebrowser|palemoon|seamonkey|basilisk|icecat|thorium-browser|cromite|yandex-browser(?:-(?:stable|beta))?|surf|luakit|nyxt|dillo|netsurf(?:-(?:gtk3?|fb))?|min|otter-browser|x-www-browser|gnome-www-browser|sensible-browser)$/i;
const BROWSER_APP_ID_RE = /^(?:org\.chromium\.|com\.google\.chrome|com\.microsoft\.edge|com\.brave\.browser|com\.opera\.opera|com\.vivaldi\.vivaldi|org\.mozilla\.firefox|io\.gitlab\.librewolf|net\.waterfox\.|one\.ablaze\.floorp|app\.zen_browser\.|net\.mullvad\.mullvadbrowser|org\.torproject\.|org\.gnome\.epiphany|org\.kde\.falkon|org\.kde\.konqueror|org\.qutebrowser\.|io\.github\.ungoogled_software\.|ru\.yandex\.browser)/i;
const baseOf = (x) => (typeof x === 'string' && x ? x.split('/').filter(Boolean).pop() || '' : '');
/** Is this one executable / app-id name a web browser's? */
function isBrowserName(name) {
  const raw = typeof name === 'string' ? name : '';
  const b = baseOf(raw.startsWith('/') ? raw : raw.replace(/\/\/.*$/, '')); // a flatpak ref's `//branch` is not a path
  return !!b && (BROWSER_EXEC_RE.test(b) || BROWSER_APP_ID_RE.test(b));
}
/** The program a LAUNCHER runs: `flatpak run [--opt…] <app-id>`, `snap run
 *  [--opt…] <name>`, `env [-i] [NAME=value…] <cmd>` — else null. */
function launchedProgram(exec, args) {
  const b = baseOf(exec);
  const a = Array.isArray(args) ? args.map(String) : [];
  const firstWord = (from) => { for (let i = from; i < a.length; i++) { if (a[i] === '--') return a[i + 1] || null; if (!a[i].startsWith('-')) return a[i]; } return null; };
  if (b === 'flatpak' || b === 'snap') { const r = a.indexOf('run'); return r >= 0 ? firstWord(r + 1) : null; }
  if (b === 'env') return envProgram(a);
  return null;
}
/** takeover r3: GNU `env`'s program word — its VALUE-taking options skip their
 *  value (`env -u FOO google-chrome` ran `FOO` as "the program" before), and
 *  `-S` / `--split-string` hands its string back to env's own parse. */
const ENV_VALUE_OPTS = new Set(['-u', '--unset', '-C', '--chdir', '-P', '-a', '--argv0']);
function envProgram(a, depth = 0) {
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '--') { for (let j = i + 1; j < a.length; j++) if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[j])) return a[j]; return null; }
    const split = t === '-S' || t === '--split-string' ? a[i + 1] : (t.startsWith('--split-string=') ? t.slice(15) : (/^-S./.test(t) ? t.slice(2) : null));
    if (split != null) return depth > 3 ? null : envProgram([...String(split).trim().split(/\s+/).filter(Boolean), ...a.slice(i + (t === '-S' || t === '--split-string' ? 2 : 1))], depth + 1);
    if (ENV_VALUE_OPTS.has(t)) { i++; continue; }
    if (t.startsWith('-')) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue;
    return t;
  }
  return null;
}
/**
 * → `{ browser, by: 'exec'|'launcher'|'process'|null, name }` for one launch
 * record's `exec` / `args` and, when the engine could read it, the running
 * app process's own executable `exe`.
 */
function browserLaunchVerdict({ exec = null, args = [], exe = null } = {}) {
  if (isBrowserName(exec)) return { browser: true, by: 'exec', name: baseOf(exec) };
  const prog = launchedProgram(exec, args);
  if (prog && isBrowserName(prog)) return { browser: true, by: 'launcher', name: baseOf(prog) };
  if (exe && isBrowserName(String(exe).replace(/ \(deleted\)$/, ''))) return { browser: true, by: 'process', name: baseOf(exe) };
  return { browser: false, by: null, name: null };
}

/** The small default registry (§2 "a small default registry"): every row is
 *  PRESENCE-CHECKED by the keeper against PATH before it is offered — a row
 *  whose exec is absent is served with `available:false` and the reason, never
 *  hidden and never assumed. Order = what a first user most likely wants. */
const DEFAULT_REGISTRY = Object.freeze([
  Object.freeze({ id: 'xterm', label: 'xterm', exec: 'xterm', args: Object.freeze([]), category: 'terminal' }),
  Object.freeze({ id: 'gnome-calculator', label: 'Calculator (GNOME)', exec: 'gnome-calculator', args: Object.freeze([]), category: 'utility' }),
  Object.freeze({ id: 'gedit', label: 'gedit', exec: 'gedit', args: Object.freeze([]), category: 'editor' }),
  // B-bfe6 — a browser AS AN APP: the human's own window with its OWN profile (browserArgv); `exec` is the family's
  // first name, the keeper serves the row with the first of `execs` found on PATH (browserRowFor)
  Object.freeze({ id: 'chromium', label: 'Chromium', exec: 'chromium', execs: BROWSER_KINDS.chromium.execs, args: Object.freeze([]), category: 'browser', browser: 'chromium' }),
  Object.freeze({ id: 'firefox', label: 'Firefox', exec: 'firefox', execs: BROWSER_KINDS.firefox.execs, args: Object.freeze([]), category: 'browser', browser: 'firefox' }),
  Object.freeze({ id: 'code', label: 'VS Code', exec: 'code', args: Object.freeze(['--new-window', '--wait']), category: 'editor' }),
]);

// ── the app-session state machine (§2) ──────────────────────────────────────
/** state × event → next state, or null when the event is not legal there.
 *  Events: 'server-listening' (the picture server answered its banner),
 *  'app-exit' (the application process ended), 'stop' (a human / idle /
 *  relaunch stop that completed), 'spawn-error' (a process failed to start),
 *  'display-gone' (X died under the app). There is NO 'runaway' event since
 *  2026-09-25 (the owner's ruling): a resource guard never ends an app a
 *  person is using — it reports (src/runaway-guard.js). */
const TRANSITIONS = Object.freeze({
  launching: Object.freeze({ 'server-listening': 'ready', 'app-exit': 'exited', stop: 'exited', 'spawn-error': 'failed', 'display-gone': 'failed' }),
  ready: Object.freeze({ 'app-exit': 'exited', stop: 'exited', 'display-gone': 'failed' }),
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

// NO RESOURCE VERDICT AND NO PARK HERE (2026-09-25): src/runaway-guard.js is the
// ONE resource verdict, and for a desktop app it only REPORTS — this file's
// verbatim copy summed VmRSS over a set and the keeper stopped a fresh Google
// Chrome at "RSS 2.0 GB", removed its profile and parked chromium for an hour
// (docs/kb-bugfix-invariants.md). `runawayParkVerdict` is gone with the park:
// a launch is never refused by a past sample.

/**
 * WHO MAY REMOVE A BROWSER ROW'S PROFILE (2026-09-25, the owner's ruling: a
 * profile directory goes only by a PERSON's ending, never by a keeper's
 * decision). A terminal record's profile is removed when — and only when —
 *   · the user did not choose "keep profile", AND
 *   · the session ended by a person: Stop (`stoppedBy` 'user'), the Scale ▸
 *     relaunch ('relaunch'), or the app's OWN exit (state 'exited' with no
 *     `stoppedBy` — its user closed it), OR no app ever ran in it (`pids.app`
 *     unset: a failed bring-up's empty scaffold).
 * Everything else KEEPS it and says so: an idle-out ('idle'), a display that
 * died under the app ('failed'), any future keeper-decided stop. Returns
 * `{ remove: boolean, why }` — `why` names the rule for the record/log.
 */
const PERSON_ENDINGS = Object.freeze(['user', 'relaunch']);
function profileRetireVerdict(rec) {
  if (!rec || !rec.profileDir) return { remove: false, why: 'no profile' };
  if (rec.keepProfile) return { remove: false, why: 'the user chose "keep profile"' };
  if (isLiveState(rec.state)) return { remove: false, why: 'the session is live' };
  if (!(rec.pids && rec.pids.app)) return { remove: true, why: 'no app ever ran in it' };
  if (rec.stoppedBy) {
    if (PERSON_ENDINGS.includes(rec.stoppedBy)) return { remove: true, why: `stopped (${rec.stoppedBy})` };
    return { remove: false, why: `kept: the session was ended by the keeper (${rec.stoppedBy}), not by a person — remove it by hand` };
  }
  if (rec.state === 'exited') return { remove: true, why: 'the app exited by itself' };
  return { remove: false, why: `kept: the session ${rec.state} (${rec.lastError || 'no reason recorded'}), not a person's ending — remove it by hand` };
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
function newRecord({ id, label, exec, args, cwd, env, source, backend, via, fallbackWhy, idleTimeoutMs, now, scale = 1, dpi = 96, scaleOrigin = null, scaleFrom = null, hostId = 'local' }) {
  return {
    id, label, exec, args: Array.isArray(args) ? args.slice() : [], cwd: cwd || null, env: env && Object.keys(env).length ? { ...env } : undefined,
    source, backend, via: via || null, fallbackWhy: fallbackWhy || null,
    display: null, port: null, pids: { x: null, app: null, server: null, wm: null }, starts: { x: null, app: null, server: null, wm: null },
    startedAt: now, state: 'launching', exitCode: null, lastError: null,
    idleTimeoutMs: Number(idleTimeoutMs) || 0, lastInputAt: now,
    scale: normalizeScale(scale), dpi: Number.isInteger(dpi) && dpi >= 48 && dpi <= 288 ? dpi : 96, // HiDPI (2.369.158): the app's scale + the display's font dpi, fixed at launch
    scaleOrigin: ['auto', 'setting', 'chosen'].includes(scaleOrigin) ? scaleOrigin : null, scaleFrom: scaleFrom && typeof scaleFrom === 'object' ? { dpr: normalizeDpr(scaleFrom.dpr), uiScale: normalizeUiScale(scaleFrom.uiScale) } : null, // round 3 A3: where the scale came from (the chip says it)
    hostId: typeof hostId === 'string' && hostId ? hostId : 'local', // lane C1 (D8): the MACHINE the app runs on — 'local' = the machine that holds this record (the hub's own, or a device's own)
  };
}

// ── lane C2 (docs/design-desktop-apps-seamless §3.5): apps on a PAIRED machine ─
/** The VIEW state of a remote record whose machine does not answer: the hub keeps the last record it saw (the app
 *  may well still run — D8: the device holds it) and shows this until the machine returns and is asked again. Never
 *  stored, never a transition: a window showing it stays open (only exited / failed close one). */
const HOST_OFFLINE_STATE = 'unknown-host-offline';
/** xpra from the machine's own apt sources is taken only at or above this major (bookworm's 3.1 / noble's 3.1 are
 *  below: their html5 protocol was never measured — D6/D7); below it, xpra.org's repository, pinned to this major. */
const XPRA_APT_MIN_MAJOR = 5;
const XPRA_PIN_MAJOR = 6;
const XPRA_REPO_URL = 'https://xpra.org';
const XPRA_KEY_URL = 'https://xpra.org/xpra.asc';
/** What the rung installs beside xpra: the default registry's first row, the fit/enumeration tools, the X cookie
 *  tool and the X server the xpra recipe starts (measured on the paired test box, 2026-09-25: noble's xpra 6.5.3
 *  from xpra.org + these five made the ladder resolve the xpra rung). */
const XPRA_APT_PACKAGES = Object.freeze(['xpra', 'xterm', 'xdotool', 'xauth', 'xvfb']);
/** xpra.org's own split (6.x): the X11 server half and the html5 client are RECOMMENDS of xpra-server. */
const XPRA_ORG_EXTRA = Object.freeze(['xpra-x11', 'xpra-html5']);
const CODENAME_RE = /^[a-z][a-z0-9-]{1,23}$/;
const majorOf = (v) => { const m = /^(?:\d+:)?(\d+)\./.exec(String(v || '')); return m ? Number(m[1]) : null; };
/**
 * THE XPRA INSTALL PLAN for one machine (PURE — the rclone one-click shape, but a PLAN FIRST: the dialog shows every
 * command before anything runs, and the same commands are what a person copies when the machine refuses sudo).
 * `f` = the `facts` op's `install` block (src/desktop-display.js installFacts). →
 *   { ok:false, code, error }  code ∈ no_facts | no_x11 (macOS / Windows — no X11 server; the seamless rung does not
 *                              exist there) | no_apt (Linux without apt-get) | no_repo (apt's xpra is too old and the
 *                              codename is unknown / not a Debian-family system — xpra.org has nothing to point at)
 *   { ok:true, source:'apt'|'xpra.org', packages, script, commands[], canRun, code:null|'no_sudo', already, aptXpra }
 * `script` = what runs (as root: `sudo -n sh -c <script>`, or `sh -c` when already root); `commands` = the same steps
 * as lines a person types (each with sudo). `canRun` false ⇒ `no_sudo`: refused BY NAME at execute time, the commands
 * handed over to copy. The codename is interpolated into a root shell line, so it must match CODENAME_RE (a device
 * reports its own facts — they are validated like any other input).
 */
function xpraInstallPlan(f) {
  if (!f || typeof f !== 'object') return { ok: false, code: 'no_facts', error: 'the machine did not report its install facts (an older agent?)' };
  if (f.platform && f.platform !== 'linux') return { ok: false, code: 'no_x11', error: `${f.platform === 'darwin' ? 'macOS' : f.platform === 'win32' ? 'Windows' : f.platform} has no X11 server — desktop apps need Linux (XQuartz + xpra on a Mac is a manual setup VibeSpace does not drive)` };
  if (!f.apt) return { ok: false, code: 'no_apt', error: `${f.prettyName || f.distro || 'this Linux'} has no apt-get — install xpra ${XPRA_PIN_MAJOR}.x from ${XPRA_REPO_URL} by hand (VibeSpace drives apt only)` };
  const installedMajor = majorOf(f.xpra);
  const already = installedMajor != null && installedMajor >= XPRA_APT_MIN_MAJOR;
  const aptMajor = majorOf(f.aptXpra);
  const family = [f.distro, ...(Array.isArray(f.like) ? f.like : [])].filter(Boolean);
  const debianish = family.includes('debian') || family.includes('ubuntu');
  let source = 'apt';
  if (!already && !(aptMajor != null && aptMajor >= XPRA_APT_MIN_MAJOR)) {
    if (!debianish || !f.codename || !CODENAME_RE.test(String(f.codename))) return { ok: false, code: 'no_repo', error: `apt offers xpra ${f.aptXpra || 'none'} (below ${XPRA_APT_MIN_MAJOR}.x) and ${f.prettyName || f.distro || 'this system'}${f.codename ? ` (${f.codename})` : ''} is not a Debian/Ubuntu release xpra.org publishes for — install xpra ${XPRA_PIN_MAJOR}.x by hand` };
    source = 'xpra.org';
  }
  // xpra.org splits the server's X11 half and the html5 client (the hosted client's worker) into RECOMMENDED packages
  // (apt-cache depends, 6.5.3): named explicitly so a machine configured without recommends still gets the rung
  const packages = already ? XPRA_APT_PACKAGES.filter((p) => p !== 'xpra') : source === 'xpra.org' ? [...XPRA_APT_PACKAGES, ...XPRA_ORG_EXTRA] : XPRA_APT_PACKAGES.slice();
  const steps = []; // each step: the shell line (run as root)
  if (source === 'xpra.org') {
    const cn = String(f.codename);
    steps.push('install -d -m 0755 /usr/share/keyrings');
    steps.push(`(command -v curl >/dev/null && curl -fsSL ${XPRA_KEY_URL} -o /usr/share/keyrings/xpra.asc) || wget -qO /usr/share/keyrings/xpra.asc ${XPRA_KEY_URL}`);
    steps.push(`printf '%s\\n' 'Types: deb' 'URIs: ${XPRA_REPO_URL}' 'Suites: ${cn}' 'Components: main' 'Signed-By: /usr/share/keyrings/xpra.asc' > /etc/apt/sources.list.d/xpra.sources`);
    steps.push(`printf '%s\\n' 'Package: xpra*' 'Pin: version ${XPRA_PIN_MAJOR}.*' 'Pin-Priority: 1001' > /etc/apt/preferences.d/xpra-vibespace`);
  }
  steps.push('apt-get update');
  steps.push(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${packages.join(' ')}`);
  steps.push('xpra --version');
  const script = ['set -e', ...steps.map((l) => `echo '+ ${l.replace(/'/g, '\'"\'"\'')}'; ${l}`)].join('\n');
  const commands = steps.map((l) => (l === 'xpra --version' ? l : l.startsWith('(') || l.startsWith('printf') ? `sudo sh -c ${shq(l)}` : `sudo ${l}`));
  const canRun = !!(f.root || f.sudo);
  return { ok: true, source, packages, script, commands, canRun, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself, then check again', already, aptXpra: f.aptXpra || null, installed: f.xpra || null, root: !!f.root };
}
const shq = (s) => `'${String(s).replace(/'/g, '\'"\'"\'')}'`;
/** The argv that RUNS a plan's script on its machine (the same argv on every transport: in-process spawn on this
 *  machine, the agentd `run-stream` op on a paired one). */
function installArgv(plan) { return plan && plan.root ? ['sh', '-c', plan.script] : ['sudo', '-n', 'sh', '-c', plan.script]; }

/**
 * THE INSTALL RUNS DETACHED (desktop lane C verify r2 F3 + F4, 2026-09-25). The install used to be a CHILD of whoever
 * started it — the hub process on this machine, the agent daemon's run-stream on a paired one — its stdout a pipe into
 * that process. The hub restarts (an Update, a crash, an OOM) and the daemon re-execs on every hub update: the pipe
 * closed, and the install's shell and dpkg died at their next line by SIGPIPE (measured: rc 141 mid-run; a dpkg
 * killed mid-unpack leaves "dpkg was interrupted"), while the in-memory "one install per machine" slot died with the
 * hub — a second click started a second apt beside any survivor ("Could not get lock … exit 100").
 * So the install runs in its OWN session (`setsid`), stdin /dev/null, stdout + stderr APPENDED to a log file on the
 * machine, and the slot IS a pidfile beside it: `<stateDir>/xpra-install.pid` = "<pid> <starttime> <lock>" of the
 * detached runner (a recycled pid is never taken for it), `xpra-install.exit` = "<code> <unix nanoseconds> <lock>" once
 * it ends (nanoseconds since verify r5 L1, below); who may START one is decided by a lock the running install holds (verify r4, below). The hub
 * only FOLLOWS the log (`tail --pid`) — a follower that dies (hub gone, link gone, daemon re-exec) leaves the install
 * running; a new follower re-attaches (the facts op reports `installing: {pid, since, lock}` while the pid+starttime
 * lives).
 * `stateDir` = the machine keeper's data dir (a device's ~/.vibespace, the hub's data/); empty ⇒ $HOME/.vibespace.
 * Only the plan's `script` runs as root; the state dir and the argv are POSITIONAL parameters, never interpolated.
 * The launcher (the follower), $1 = the runner text, $2 = stateDir, $3 = start|follow, "$@" = the install argv:
 *   a live recorded install ⇒ follow it (never a second — whatever the mode); `follow` with none running ⇒ its last
 *   log and recorded exit; `start` ⇒ start the runner detached, wait for its pidfile, follow. Exits with the install's
 *   RECORDED exit code, or INSTALL_UNRECORDED_EXIT when the runner ended without recording one (killed / a reboot).
 * Linux + GNU coreutils (`tail --pid`, fractional `sleep`, `sha1sum`) + util-linux `setsid` and `flock` — the plan only
 * runs on apt systems.
 */
const INSTALL_FILES = Object.freeze({ log: 'xpra-install.log', pid: 'xpra-install.pid', exit: 'xpra-install.exit' });
const INSTALL_UNRECORDED_EXIT = 199;
/** The install LOCK's file name, beside nothing of the state dir's (verify r4): `<runtime dir>/<prefix><first 12 hex of
 *  sha1(realpath of the state dir)>.lock` — LOCAL storage (the state dir may sit on NFS / FUSE, where flock is not
 *  dependable). The runtime dir is named by the UID, never the environment (verify r5 L3): /run/user/<uid> when it is a
 *  writable directory this user owns, else /tmp/vibespace-<uid> (created 0700; refused by name when it is not a
 *  directory this user owns). The launcher names it; the pidfile and the exit file record the name it used
 *  (installState reports it). */
const INSTALL_LOCK_PREFIX = 'vibespace-xpra-install-';
/*
 * verify r4 (2026-09-25) — THE SLOT IS A LOCK THE KERNEL HOLDS FOR THE RUNNING INSTALL.
 * r3 claimed the slot with a `mkdir` lock directory + an owner file + a break rule for a dead or ownerless owner. The
 * break rule was a race: a lock is ownerless for a moment during every claim (mkdir, then the owner file), so a
 * breaker could remove it between another claimer's mkdir and its owner rename — both then started a runner
 * (measured with the r3 launcher: 1–4 in 150 starts over an empty dir, 12–17 in 20 with a 30–50 ms slower rename).
 * Now the launcher opens a lock FILE on local storage (INSTALL_LOCK_PREFIX) as fd 9 and takes `flock -n 9` BEFORE it
 * spawns; the runner is started with fd 9 still open, so the lock is held by the running install itself — the runner
 * shell and apt-get (apt-get closes inherited descriptors for the children it forks — APT::Keep-Fds — so dpkg never
 * holds it; a dpkg outliving both is fenced by dpkg's own lock) — and the kernel drops it the instant the last holder
 * exits or is killed.
 * Nothing is ever broken by hand, nothing is stale, nothing waits on a guessed owner. The launcher closes its own copy
 * once the runner is started; the runner re-asserts the lock (`flock -n 9` on the inherited descriptor) FIRST, before
 * it reads or records anything, and refuses without touching the slot's files when it does not hold it.
 * A start that finds the lock held FOLLOWS: it polls (≤ 20 s) for the holder's pidfile and follows that runner's log;
 * if the lock frees first, the install it waited on ended already — its recorded exit (written before the lock
 * frees) is this start's answer when it is newer than this start, in nanoseconds (r5 L1); otherwise nothing ran since
 * this start was asked,
 * and this start holds the lock now — it runs the install. A lock that stays held with no install recorded for 20 s
 * (a process an earlier install started may still hold it) is refused by name. The lock file is never removed (a
 * removed lock file lets two holders lock two different files); after taking the lock a start re-reads the pidfile
 * and follows a live recorded install (a belt for a lock file that was removed under a running install).
 * M1 (r3): the winner resets pid/starttime, reads only the NEW pidfile, and `tail --pid` follows that runner only while
 * it is not PROVEN gone. L5: `setsid` and `flock` (util-linux) are checked before anything else. L8: a starttime that
 * cannot be read (no /proc) is refused by the runner before it runs (the pidfile's identity needs it).
 * Every refusal is exit 125 with one line naming its cause; nothing here ever signals the install.
 * verify r5 (2026-09-25, four lows):
 *  L1 "the install this start waited on" is decided in NANOSECONDS: the runner's exit file records `date +%s%N` and a
 *     start answers it only when it is strictly newer than the start itself (`-gt`). In whole seconds (r4, `-ge`) a
 *     start in the SAME second as an earlier install's exit — while a child that install left behind still held the
 *     lock — answered that stale exit instead of running (6 of 6). A clock without %N compares as no number: the start
 *     runs (it holds the lock — never a second install beside one).
 *  L2 (wording) the lock is held by the runner shell and apt-get, never dpkg (above).
 *  L3 the lock's directory is named by the uid, never $XDG_RUNTIME_DIR: two spawners with different environments (the
 *     hub under systemd, a daemon started from an ssh login; a runtime dir logind removed) named two locks for one state
 *     dir, and the /tmp name was predictable. `id -u` that is not a number is refused by name.
 *  L4 the wait for the runner's pidfile is bounded by the runner's own life (`$!`: setsid execs in place in a shell
 *     without job control, so it is the runner's pid): a runner that refused (it was not handed the lock) is reported
 *     at once with its own line, not after the full 10 s.
 * Pidfile "<pid> <starttime> <lock>", exit file "<code> <unix nanoseconds> <lock>".
 * Runner: $1 pidfile, $2 log, $3 exit file, $4 the lock file (held as fd 9), "$@" the install argv.
 */
const INSTALL_RUNNER = [
  'P=$1; L=$2; X=$3; K=$4; shift 4',
  'st() { sed \'s/^.*) //\' "/proc/$1/stat" 2>/dev/null | cut -d\' \' -f20; }',
  'w=; fin() { echo "$1 $(date +%s%N) $K" > "$X.tmp" && mv -f "$X.tmp" "$X"; [ -z "$w" ] || rm -f "$P"; exit "$1"; }', // r5 L1: nanoseconds
  'flock -n 9 2>/dev/null || { echo "+ [vibespace] this install does not hold the install lock ($K) - it was not run" >> "$L"; exit 125; }', // FIRST: the inherited lock, re-asserted; not held ⇒ the slot's files are another install's: untouched
  's=$(st $$); [ -n "$s" ] || { sleep 0.05; s=$(st $$); }', // one retry: a refusal is for a /proc that cannot be read, never a blip
  '[ -n "$s" ] || { echo "+ [vibespace] cannot read /proc/$$/stat on this machine - the install slot needs it; nothing was run" >> "$L"; fin 125; }',
  'echo "$$ $s $K" > "$P.tmp" && mv -f "$P.tmp" "$P"; w=1',
  '"$@" >> "$L" 2>&1 < /dev/null',
  'fin $?',
].join('\n');
const INSTALL_LAUNCHER = [
  'exec 2>&1',
  'R=$1; D=${2:-$HOME/.vibespace}; M=$3; shift 3',
  `L=$D/${INSTALL_FILES.log}; P=$D/${INSTALL_FILES.pid}; X=$D/${INSTALL_FILES.exit}`,
  'st() { sed \'s/^.*) //\' "/proc/$1/stat" 2>/dev/null | cut -d\' \' -f20; }',
  'live() { [ -n "$1" ] && [ -n "$2" ] && [ "$(st "$1")" = "$2" ]; }',
  'gone() { [ -z "$1" ] || [ ! -e "/proc/$1" ] || { t=$(st "$1"); [ -n "$t" ] && [ "$t" != "$2" ]; }; }', // PROVEN gone: no /proc entry, or a readable starttime that differs — an empty probe proves nothing
  'rec() { pid=; s=; k=; [ -r "$P" ] && read pid s k < "$P"; live "$pid" "$s"; }', // a live RECORDED install (pid + starttime)
  'run() { echo "+ [vibespace] an install is already running on this machine (pid $pid) - following its log"; }',
  'mine=',
  'if rec; then run',
  'elif [ "$M" = follow ]; then', // follow never takes the lock
  '  echo "+ [vibespace] no install is running on this machine - its last log follows"',
  '  [ -r "$L" ] && cat "$L"',
  `  if [ -r "$X" ]; then read c at k < "$X"; exit "$c"; fi`,
  `  exit ${INSTALL_UNRECORDED_EXIT}`,
  'else',
  '  command -v setsid >/dev/null 2>&1 || { echo "+ [vibespace] setsid (util-linux) is missing on this machine - the install cannot run detached; install util-linux, then check again"; exit 125; }',
  '  command -v flock >/dev/null 2>&1 || { echo "+ [vibespace] flock (util-linux) is missing on this machine - the install slot cannot be locked; install util-linux, then check again"; exit 125; }',
  '  mkdir -p "$D" 2>/dev/null; [ -d "$D" ] && [ -w "$D" ] || { echo "+ [vibespace] $D is not writable on this machine - the install cannot record itself there"; exit 125; }',
  '  u=$(id -u 2>/dev/null); case $u in ""|*[!0-9]*) echo "+ [vibespace] this user id cannot be read (id -u) - the install lock cannot be named; nothing was run"; exit 125 ;; esac',
  '  T=/run/user/$u; [ -d "$T" ] && [ -w "$T" ] && [ -O "$T" ] || { T=/tmp/vibespace-$u; mkdir -m 700 "$T" 2>/dev/null; }', // LOCAL storage (the state dir may be on NFS / FUSE), named by the UID — never the environment (r5 L3)
  '  [ ! -L "$T" ] && [ -d "$T" ] && [ -w "$T" ] && [ -O "$T" ] || { echo "+ [vibespace] $T is not a directory this user owns - the install lock cannot be taken there; nothing was run"; exit 125; }',
  '  rp=$(cd "$D" 2>/dev/null && pwd -P); h=$(printf %s "$rp" | sha1sum 2>/dev/null | cut -c1-12)',
  `  K=$T/${INSTALL_LOCK_PREFIX}$h.lock`,
  '  [ -n "$rp" ] && [ ${#h} -eq 12 ] && { command exec 9>>"$K"; } 2>/dev/null || { echo "+ [vibespace] the install lock cannot be taken on $K (it cannot be opened) - nothing was run"; exit 125; }',
  '  t0=$(date +%s%N); lost=; n=0', // r5 L1: this start's own instant, in nanoseconds
  '  while :; do',
  '    if rec; then exec 9>&-; run; break; fi', // a live recorded install: follow it (also the belt after taking the lock)
  '    if flock -n 9; then', // held by this start now: every earlier holder (the runner, apt-get) is gone
  '      if rec; then exec 9>&-; run; break; fi',
  '      if [ -n "$lost" ] && [ -r "$X" ] && read c at k < "$X" && [ "${at:-0}" -gt "$t0" ] 2>/dev/null; then exec 9>&-; [ -r "$L" ] && cat "$L"; exit "$c"; fi', // the install this start waited on ended AFTER this start began (r5 L1: nanoseconds, strictly newer): its answer
  '      mine=1; break',
  '    else',
  '      e=$?; [ $e -eq 1 ] || { echo "+ [vibespace] the install lock cannot be taken on $K (flock exit $e) - nothing was run"; exit 125; }',
  '    fi',
  '    lost=1; n=$((n+1)); [ $n -le 400 ] || { echo "+ [vibespace] the install lock ($K) is held but no install is recorded as running after 20 s - a process an earlier install started may still hold it; check again"; exit 125; }',
  '    sleep 0.05',
  '  done',
  'fi',
  'if [ -n "$mine" ]; then', // this start holds the lock: start the runner detached, WITH the lock (fd 9)
  '  touch -c "$K" 2>/dev/null', // an old lock file in an aged /tmp is never swept from under a running install
  '  pid=; s=', // M1: never the old pidfile's pid
  '  rm -f "$X" "$P" "$P.tmp"; { command : > "$L"; } 2>/dev/null || { echo "+ [vibespace] $L cannot be written - nothing was run"; exit 125; }',
  '  setsid sh -c "$R" vs-install-run "$P" "$L" "$X" "$K" "$@" < /dev/null > /dev/null 2>>"$L" &',
  '  b=$!; exec 9>&-', // the runner holds the lock now (its inherited fd 9 — the runner shell and apt-get)
  '  n=0; while [ ! -s "$P" ] && [ ! -s "$X" ] && [ $n -lt 200 ] && [ -e "/proc/$b" ]; do sleep 0.05; n=$((n+1)); done', // r5 L4: bounded by the runner's own life
  '  [ -s "$P" ] && read pid s k < "$P" 2>/dev/null',
  '  r=$pid; [ -n "$s" ] && ! gone "$pid" "$s" || pid=', // M1: tail follows only the NEW runner's pid, and only while it is not proven gone
  '  if [ -z "$pid" ]; then', // the runner ended already (or never began): its recorded exit, else why not
  '    if [ -s "$X" ]; then cat "$L"; read c at k < "$X"; exit "$c"; fi',
  '    [ -r "$L" ] && cat "$L"',
  `    if [ -n "$r" ]; then echo "+ [vibespace] the install ended without recording its exit (it was stopped, or the machine restarted) - check again"; exit ${INSTALL_UNRECORDED_EXIT}; fi`,
  '    echo "+ [vibespace] the install did not start (no pid in $P)"; exit 125',
  '  fi',
  'fi',
  'tail -s 0.2 --pid="$pid" -n +1 -f "$L"',
  `if [ -r "$X" ]; then read c at k < "$X"; exit "$c"; fi`,
  'echo "+ [vibespace] the install ended without recording its exit (it was stopped, or the machine restarted) - check again"',
  `exit ${INSTALL_UNRECORDED_EXIT}`,
].join('\n');
/** The argv that STARTS (or re-attaches to) an install on its machine — identical on both transports. */
function installLauncherArgv(argv, { stateDir = '', mode = 'start' } = {}) {
  return ['sh', '-c', INSTALL_LAUNCHER, 'vs-install', INSTALL_RUNNER, String(stateDir || ''), mode === 'follow' ? 'follow' : 'start', ...(Array.isArray(argv) ? argv.map(String) : [])];
}

/**
 * A MACHINE PICKER ROW (PURE): may the launch dialog offer this machine, and if not, why — by code (the client says
 * it in its words). Input = what the hub knows WITHOUT asking the machine: `{hostId, transport, link:
 * online|offline|unknown, connected, capabilities?, platform?}`. A row is shown greyed with its reason, never hidden:
 *   ready             this machine, or a connected agent that runs desktop-serve on Linux
 *   connect           an ssh machine not connected yet — choosing it connects (and installs the agent over ssh,
 *                     the path Add machine already takes); a failure is said then, by name
 *   offline           a dial device that is not dialed in
 *   host_needs_daemon a connected agent that predates desktop-serve (the capability gate)
 *   no_x11            the agent runs on macOS / Windows
 */
function machinePickRow(h) {
  const r = h && typeof h === 'object' ? h : {};
  if (!r.hostId || r.hostId === 'local') return { selectable: true, code: 'ready' };
  if (r.platform && r.platform !== 'linux') return { selectable: false, code: 'no_x11' };
  if (r.connected) {
    const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
    return caps.includes('desktop-serve') ? { selectable: true, code: 'ready' } : { selectable: false, code: 'host_needs_daemon' };
  }
  if (r.transport === 'dial' && r.link !== 'online') return { selectable: false, code: 'offline' };
  return { selectable: true, code: r.link === 'offline' ? 'offline' : 'connect' };
}

module.exports = {
  LIMITS, DESKTOP_SINGLETON_ID, APP_STATES, LIVE_STATES, DEFAULT_IDLE_TIMEOUT_MIN, KEEPER_ENV,
  DISPLAY_BACKENDS, BACKEND_IDS, backendById, recipeFor, needsVerdict, resolveBackend, fallbackLogLine, parseBackendPrefs, streamKindOf,
  fitPolicyOf, keeperFits, topLevelWindows, appWindows, appFitPlan, appMainWindow, windowTitleOf, APP_TITLE_MAX,
  validateAppRow, validateLaunchRequest, DEFAULT_REGISTRY, APP_SCALES, normalizeDpr, appScaleFor, scaleKnobs,
  BROWSER_EXEC_RE, BROWSER_APP_ID_RE, isBrowserName, launchedProgram, browserLaunchVerdict,
  SCALE_CHOICES, SCALE_MAX, UI_SCALE_RANGE, normalizeUiScale, normalizeScale, effectiveScale, scalePick, validateRelaunchRequest, relaunchVerdict, relaunchBodyOf, scaleMenuModel,
  OUTER_CLOSE_AGAIN_MS, windowsLeftCount, exitCloseVerdict, outerCloseVerdict,
  BROWSER_KINDS, BROWSER_BINS, REAL_BROWSER_ROOTS, isForbiddenBrowserArg, browserRowFor, validateBrowserUrl, profileDirVerdict, browserArgv, firefoxUserJs, URL_MAX,
  TRANSITIONS, transition, isLiveState, isTerminalState,
  idleState, capVerdict, profileRetireVerdict, PERSON_ENDINGS, adoptVerdict, streamTargetOf, newRecord,
  HOST_OFFLINE_STATE, XPRA_APT_MIN_MAJOR, XPRA_PIN_MAJOR, XPRA_REPO_URL, XPRA_KEY_URL, XPRA_APT_PACKAGES, XPRA_ORG_EXTRA, xpraInstallPlan, installArgv, machinePickRow, // lane C2
  INSTALL_FILES, INSTALL_UNRECORDED_EXIT, INSTALL_LOCK_PREFIX, INSTALL_RUNNER, INSTALL_LAUNCHER, installLauncherArgv, // lane C verify r2 (F3 + F4), r4 (the kernel-held lock)
};
