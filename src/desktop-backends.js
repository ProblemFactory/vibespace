'use strict';
/**
 * DESKTOP BACKENDS — the picture-backend LADDER (docs/design-desktop-apps.zh.md §3): the `DISPLAY_BACKENDS`
 * capability table, `capsOf` (the ONE reader of a row's cells), `resolveBackend` and its fallback words,
 * `streamKindOf`. PURE: imports nothing, touches no file system. Moved verbatim out of src/desktop-apps.js
 * (rv-desktop-apps F-S1, lane dc-seams-desktop 2026-10-05) so a client module that needs the ladder bundles
 * only the ladder; src/desktop-apps.js re-exports every name, so the server's `M.<name>` reads are unchanged.
 */

// ── §3 the backend ladder ───────────────────────────────────────────────────
// `needs` = ANY of these groups fully present. `via` is the group that
// matched, joined with '+', and `recipes[via]` NAMES the bring-up recipe
// desktop-display.js runs for it (`RECIPES[name]`) — the keeper looks the name
// up and never spells a rung (r2: it used to be a string switch on `via`, so
// a fourth rung added here resolved, was chosen, and died at bring-up with
// "unknown bring-up"). The record stores `via` as a fact beside `backend`.
const DISPLAY_BACKENDS = Object.freeze([
  Object.freeze({
    id: 'xpra', label: 'xpra', stream: 'xpra',
    scales: true, crispText: true, perWindow: true, seamless: true, satellites: true, geometry: true, ownsDisplay: true, hostedClient: true,
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
    id: 'vnc-display', label: 'vnc-display', stream: 'rfb',
    scales: false, crispText: false, perWindow: false, seamless: false, satellites: false, geometry: false, ownsDisplay: true, hostedClient: false,
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
    id: 'desktop-singleton', label: 'desktop-singleton', stream: 'rfb',
    scales: false, crispText: false, perWindow: false, seamless: false, satellites: false, geometry: false, ownsDisplay: false, hostedClient: false,
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
/** THE CAPABILITY CELLS a rung declares — booleans on its row (lane dc-desktop-caps, 2026-10-04). Every reader outside
 *  this file asks `capsOf(rec)` (the server) or the record's served `caps` (the client) — never a rung id or a stream kind:
 *    scales       — an app renders at a HiDPI scale: GDK_SCALE knobs at launch, the Scale ▸ chip / menu / relaunch, the launch dialog's default scale
 *    crispText    — the rung's server writes the display's font dpi from the viewer's screen (the keeper waits for that write before the app starts; the backend chip says text stays crisp)
 *    perWindow    — each app window is its own picture: the window census drops the server's wrappers, a window is mapped only while a viewer watches (a pixel verb needs it mapped, the ✕ asks the app's window), its title is read from X
 *    seamless     — the per-app "Show window frame" choice (the app's own header bar the VibeSpace frame folds around)
 *    satellites   — the app's other top-levels open as VibeSpace windows of their own, bound to the main view
 *    geometry     — a window's picture is a part of a larger display: a window point is clamped to the display's root size
 *    ownsDisplay  — the session owns its display (WM, Xauthority, every part torn down); false = a SHARED desktop (only the app is the session's)
 *    hostedClient — the rung's server ships the HTML5 client the window's view loads (routes/desktop-apps hosts it)
 *  A record of a rung the table does not know claims nothing — and keeps its display its own (the keeper's pre-table default). */
const CAP_KEYS = Object.freeze(['scales', 'crispText', 'perWindow', 'seamless', 'satellites', 'geometry', 'ownsDisplay', 'hostedClient']);
const NO_CAPS = Object.freeze({ ...Object.fromEntries(CAP_KEYS.map((k) => [k, false])), ownsDisplay: true });
/** A record's capability cells: the ones its VIEW already carries (served once — the client, a paired machine's view),
 *  else its rung's row in `table`; NO_CAPS for a rung the table does not know. */
function capsOf(rec, table = DISPLAY_BACKENDS) {
  if (rec && rec.caps && typeof rec.caps === 'object') return rec.caps;
  const b = rec && rec.backend ? backendById(rec.backend, table) : null;
  return b ? Object.freeze(Object.fromEntries(CAP_KEYS.map((k) => [k, b[k] === true]))) : NO_CAPS;
}
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

module.exports = {
  DISPLAY_BACKENDS, BACKEND_IDS, backendById, CAP_KEYS, capsOf, recipeFor, needsVerdict, resolveBackend, fallbackLogLine, parseBackendPrefs, streamKindOf,
};
