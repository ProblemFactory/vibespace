// THE DESKTOP-APP LAUNCHER (docs/design-desktop-apps.zh.md §2 row 8; P8-1,
// 2026-09-13; CATALOG-FIRST since 2026-09-14): the ⚙ "Desktop apps…" row and
// the toolbar Apps button are CONTRIBUTIONS (contributions.js — a command + a
// gear menu item, never an edit to a literal), and the launch dialog is a
// createModalShell that a user who has never seen X11 can use:
//   1. an intro line in plain words (what this does, what to click);
//   2. RUNNING sessions (Open / Stop + the slot count), shown above the
//      catalog whenever there is one;
//   3. the APPLICATIONS catalog as the primary surface — a grid of cards
//      (label + one-line exec/reason + an SVG icon from icons.js), one click
//      launches, a launching card shows a spinner and stays disabled until
//      the record answers; an app whose binary is absent is shown DIMMED with
//      its reason, never hidden; an empty catalog says so in plain words and
//      expands the command form by itself;
//   4. "Advanced: run any command" — exec / args / cwd (the shared directory
//      autocomplete) + Launch + Recent, under a disclosure (a BUTTON with
//      aria-expanded) that is COLLAPSED by default and whose open/closed state
//      persists in user state (`desktopAppAdvancedOpen`, a merge-only PATCH
//      like `desktopAppRecents`, the B-b87b belt);
//   5. the backend availability chip in the ladder's own words.
//   3b. BROWSERS (B-bfe6, 2026-09-23) — the registry's browser rows under their
//      own heading with the ONE sentence that separates them from the Agent
//      browser (in the section AND in each card's tooltip), an optional
//      "Open URL" (http/https, checked by the PURE `validateBrowserUrl` before
//      the request and by the server again) and a "keep the profile" choice;
//      both ride the launch as `url` / `keepProfile` for a browser row only.
//   3c. THE APP'S DEFAULT SCALE (lane D, 2026-09-25 — the owner: "最好加入可以在app启动前那个app选择界面调整每个app默认
//      dpi的能力"): on a machine whose rung scales apps (the xpra stream), every catalog card carries a small control
//      beside it (a sibling BUTTON — a control cannot nest inside the card's button) naming the app's default scale
//      ("Auto" / "1.5×"); its menu Auto (Settings → Desktop app scale) / 1× / 1.5× / 2× / 2.5× / 3× stores the choice
//      in user state `desktopAppScale[<app id>]` WITHOUT launching (PURE src/lib/desktop-app-scale.js; the loader is
//      desktop-app-prefs.js, shared with the window). Every launch — a card, a Recent row, a typed command — carries
//      the stored default of its app as `scaleChoice`; the record's origin is then 'app' ("1.5× · App default").
//   6. MACHINES (lane C2, docs/design-desktop-apps-seamless §3.5) — a picker above the catalog: this machine + every
//      paired machine (GET /api/desktop/machines, the PURE machinePickRow verdict), a machine that cannot run apps
//      GREYED with its reason in plain words (never hidden); choosing one re-reads ITS catalog, ladder and cap
//      (GET /api/desktop/apps?host=), the launch carries `host`. A machine without xpra offers
//      "Install xpra on <machine>…": the PLAN first (source, every command), then the run with its log streamed into
//      the dialog; no passwordless sudo ⇒ the commands to copy, said by name.
//   8. OPEN WITH LIBREOFFICE (§7.9, the owner's ruling 2026-09-27 ②) — the LibreOffice rows (Writer / Calc / Impress /
//      the Start Center) are catalog rows like any; a dimmed one carries its own "Install …" beside it (the plan first,
//      the SAME install dialog as xpra's, generalised: `showInstallDialog(m, {what})`). FILE MODE (`showLaunchDialog(app,
//      {file, refusal})` — src/lib/open-with.js opens it when a document could not be opened straight away): the
//      intro names the document, the machine picker is pinned to the machine that HOLDS the file (every other one
//      greyed with the reason in words — the PURE verdict's `machine-mismatch`), the catalog shows the document's own
//      LibreOffice row (a click opens it there), an absent one says so in one plain sentence with "Install
//      LibreOffice on <machine>…" beside it; browsers and "Advanced" are hidden (a document is not a command).
//   7. SHARE WITH AGENTS (desktop lane E, D2 "before launch" — src/lib/window-share.js `mountLaunchShareRow`): under
//      the machine picker, a summary button + popover picker (live agent sessions, Task Groups, the mode Auto /
//      Accessibility tree / Pixels); every window is hidden from agents unless shared; the choice rides the launch as
//      `share` (this machine only — the row hides for a paired one) and is remembered per app (user state
//      `desktopAppReach`, the desktopAppFrame key); untouched, a launch proposes what that app remembers — and SAYS so
//      before the click (lane E verify, 2026-09-25): the row never reads "hidden" while any app remembers a share,
//      each catalog card that will launch shared carries a chip naming it (`decorateCards`), and a launch that applied
//      a remembered share is toasted with where to change it (`announce`).
// ≤768px is one column. Every failure reaches a toast (fetchJson never throws;
// the server always answers `{error}`). The dialog holds NO session state: it
// re-reads /api/desktop/apps when it opens and follows the
// `desktop-apps-updated` broadcast while open.
//
// GEOMETRY (2026-09-14, reproduced at 1000×800@2x — the owner's picture): the
// dialog WIDTH lives on `.dialog.desktop-launch` in style.css, never on the
// body (a body min-width inside .dialog's fixed 440px + overflow:hidden
// clipped the right half), and every programmatic focus here passes
// `{ preventScroll: true }` — an overflow:hidden box is still a scroll
// container, and the UA's focus scroll-into-view on the Command input was
// what scrolled the title off-left. test-desktop-app-window pins the three
// viewports with computed geometry.
//
// APPS FIRST (design 009 §B3–B7, lane apps-interface, 2026-10-03 — the owner: 「APP 界面需要优化一下了」): ONE name, "Apps"
// (the toolbar button, the dialog title, the catalog's heading, a TOP-LEVEL ⚙ row); "Desktop" keeps meaning the whole
// desktop. The dialog reads top-down: a head row (the machine picker + "Install an app…", one tap on a phone), Running,
// Apps, Browsers, Your installed apps, Advanced — and a FOOTER with what used to stand before the apps: the intro, the
// sharing default, the display backend's line (moved to the head only when it says something is wrong) and the
// real-desktop line, said ONCE. A card's name wraps to two lines (never "Li…"); the per-app default scale left the card
// for its ⋯ (and a right-click on the card) — the ⋯ reads "1.5×" only while a default is set. A refusal from a plan is
// ONE sentence in the device's language plus its way out ("Let an agent find another way"). Layer 1's banner (an
// interrupted install → Repair) is a slot at the top, fed by the apps section's state (PURE appsBannerModel).
import { t, resolveLang } from './i18n.js';
import { copyText, createModalShell, escHtml, fetchJson, showConfirmDialog, showContextMenu, showToast, uiScale } from './utils.js';
import { registerCommand, registerMenuItem, runCommand } from './contributions.js';
import { pathField } from './path-field.js'; // lane path-field: THE path field
import { FILE_ICONS, UI_ICONS } from './icons.js';
import { validateBrowserUrl } from '../desktop-browser-app.js';
import { launchVerdict } from '../desktop-fit.js'; // lane app-launch-singleton: a running app is OPENED, never launched again (PURE)
import { runningWhereText, quickExitText } from './desktop-app-words.js';
import { SCALE_PREF_KEY, scaleKeyOf, scaleChoiceOf, setScaleChoice, launchScaleChoice, scaleDefaultMenuModel } from './desktop-app-scale.js';
import { wireAppPrefs, appPrefs, appPrefsReady, onAppPrefs, saveAppPrefs } from './desktop-app-prefs.js';
import { PIN_PREF_KEY, pinChoiceOf, setPinChoice } from './desktop-app-prefs.js'; // lane launch-picture-size: the size each app remembers
import { SIZE_CHOICES, launchPinOf } from '../desktop-pin.js'; // lane launch-picture-size: THE size table (PURE)
import { sizeWords, sizeChoiceLabel, askCustomSize } from './pin-size-ui.js';
import { mountLaunchShareRow, launchKeyOf } from './window-share.js';
import { showMachineDesktopDialog } from './machine-desktop.js'; // design 014 D1: a Windows / macOS machine's whole desktop
import { watchMachines, recheckMachines, machineProbeText } from './desktop-picker.js'; // lane desktop-picker-instant: the rows at once, a late probe patches its row
import { OFFICE_MODULES, installSpecFor, FONTS_ID } from '../office-open.js'; // §7.9: the LibreOffice table (PURE)
import { splitWords, joinWords, commandLine } from '../argv-words.js'; // lane app-register-ui: a variant's / a recipe's ONE line ↔ its words (PURE, shared with the server)
import { installPlace } from '../app-witness.js'; // lane apps-launcher-witness: THE install-place words (PURE, shared with the engine's outcome)
import { SHOW_SYSTEM_KEY } from '../app-witness.js'; // lane apps-dialog-fast: the person's "Show them" (user state)
import { appPlanBlock, appSummaryBlock, appRefusalText, appDialogTitle, appGoLabel, appPlanNote, appDoneText, renderAppsSection, openDebInstall, openAppSearch, openAgentHelp, appsBannerModel } from './app-install-dialog.js'; // Layer 0 apps: THE install dialog shows an app's plan too
import { enterSubmits } from './chat-enter-keys.js';
const AGENT_BROWSER_ORIGIN = 'agent-browser'; // src/server/window-targets-engine.js AGENT_BROWSER_ORIGIN
/** lane e2a r3 (verify r1 #11): a record the agent launched through its own door — the chip / the running row words. */
export function agentBrowserText(rec) { return rec && rec.origin === AGENT_BROWSER_ORIGIN ? t('Agent browser ({name})', { name: (rec.by && rec.by.name) || t('an agent') }) : ''; }
// lane app-launch-singleton: where an app runs / who started it / a quick exit — ONE set of words (src/lib/desktop-app-words.js)
export { runningWhereText, quickExitText } from './desktop-app-words.js';
/** How long the card keeps saying a quick exit (the person reopens Apps to see why the window went). */
const QUICK_EXIT_SAID_MS = 10 * 60 * 1000;
/** What the card says after a launch of row `row` on `host` ended as it started: the row's NEWEST record when it is such a
 *  launch, within QUICK_EXIT_SAID_MS, and no instance of ours took it over (`quickExit.running` — that one is opened by the
 *  card while it runs, and once it is gone the sentence no longer explains anything) — else null. */
export function lastQuickExit(row, apps, host = 'local', now = Date.now()) {
  let newest = null;
  for (const r of Array.isArray(apps) ? apps : []) {
    if (!r || r.appId !== row.id || (r.hostId || 'local') !== host) continue;
    if (!newest || Number(r.startedAt) > Number(newest.startedAt)) newest = r;
  }
  if (!newest || !newest.quickExit || newest.quickExit.running) return null;
  return now - Number(newest.endedAt || newest.startedAt || 0) <= QUICK_EXIT_SAID_MS ? newest : null;
}

export const COMMAND_ID = 'desktopApps.open';
const RECENTS_KEY = 'desktopAppRecents';
export const ADVANCED_KEY = 'desktopAppAdvancedOpen';
const RECENTS_MAX = 8;
const APPS_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/></svg>';
// The card icon by registry CATEGORY (src/desktop-apps.js DEFAULT_REGISTRY
// rows carry one) — all from icons.js, SVG only, never emoji.
const CATEGORY_ICONS = Object.freeze({ terminal: UI_ICONS.terminal, editor: UI_ICONS.pencil, browser: FILE_ICONS.web, utility: UI_ICONS.wrench, office: FILE_ICONS.word });
// §7.9: a LibreOffice row's card by its module — the explorer's own document glyphs
const OFFICE_ICONS = Object.freeze({ writer: FILE_ICONS.word, calc: FILE_ICONS.sheet, impress: FILE_ICONS.slides, any: FILE_ICONS.word });

/** The launching client's devicePixelRatio for POST /api/desktop/apps (`dpr`, the route accepts 1..3):
 *  a zoomed-out page (< 1) launches at 1, anything above 3 at 3. */
export function launchDpr(v = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(3, Math.max(1, Math.round(n * 100) / 100)) : 1;
}

/** Round 3 A3: the launching client's UI scale (utils applyUiPrefs' body zoom — 1 on a phone) for the same POST
 *  (`uiScale`, the route accepts 0.6..2): under `desktop.appScale: auto` the app's scale is dpr × this. */
export function launchUiScale(v = uiScale()) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(2, Math.max(0.6, Math.round(n * 100) / 100)) : 1;
}

/** One explicit scale in words — shared by a window's Scale ▸ rows and the dialog's cards. Just the number: since lane D (a)
 *  a fraction is a REAL scale of widgets and text alike (drawn at the next whole GDK_SCALE and shown smaller — the chip's
 *  tooltip says so on a running window), so no row carries the old "text only in GTK apps" caveat any more. */
export function explicitScaleLabel(choice) {
  return `${choice}×`;
}
/** Lane D: a catalog card's default-scale control — its words ("Auto" / "1.5×"), its tooltip and its menu rows. */
export function cardScaleText(choice) { return choice === 'auto' ? '' : `${choice}×`; } // design 009 §B4: '' = the ⋯ glyph (no permanent "Auto")
export function cardScaleTitle(app, choice) {
  return choice === 'auto'
    ? t('Default scale for {app}: Auto (Settings → Desktop app scale). Click to choose the scale it starts at.', { app })
    : t('Default scale for {app}: {scale}× — it starts at this scale. Click to change.', { app, scale: choice });
}
export function cardScaleRowLabel(row) {
  const mark = row.current ? '✓ ' : '\u2003';
  return mark + (row.choice === 'auto' ? t('Auto (Settings → Desktop app scale)') : explicitScaleLabel(row.choice));
}

/** Design 009 §B6/§B7: a catalog card's name in the device's language — an installed app's own localized name
 *  (`labels: {zh, ja}` from its .desktop file, lane apps-install-core), a built-in row's translated label, else the label
 *  as served. PURE (the language is a parameter). */
export function catalogLabel(row, lang = resolveLang()) {
  if (!row) return '';
  const own = row.labels && typeof row.labels === 'object' && typeof row.labels[lang] === 'string' ? row.labels[lang].trim() : '';
  if (own) return own;
  if (!row.app && row.label === 'Calculator (GNOME)') return t('Calculator (GNOME)'); // the built-in registry's one worded label
  return String(row.label || row.exec || '');
}
/** Design 009 §B7: a built-in row whose program is absent says so in a few translated words ("gedit not on PATH" stays
 *  its tooltip). null ⇒ not a plain registry row. */
export function registryReasonShort(row) {
  if (!row || row.available || row.browser || row.office || row.app || row.reasonCode) return null;
  return t('not installed');
}
/** Design 009 §B5: the plan refusals that end in a hand-off to an agent (the thing is not in this machine's package
 *  sources, or only as a format that does not run here). */
export const HAND_OFF_CODES = Object.freeze(['needs_snap', 'not_found', 'conflict', 'removes']);

/** B-bfe6: the ONE sentence that tells a desktop-app browser apart from the Agent browser — the Browsers section
 *  prints it and every browser card carries it in its tooltip (a function: `t` must run after the language loads). */
export const browserNote = () => t('This is your own browser window (an app); the Agent browser is separate');
/** B-bfe6 r1: the SHORT, translated reason a dimmed browser card shows, by the keeper's verdict CODE (the verdict's
 *  own sentence — with its data-dir path — stays the card's tooltip). null ⇒ the card falls back to the sentence. */
export function browserReasonShort(code) {
  if (code === 'snap-profile-unreachable') return t('Snap: cannot reach the data folder');
  if (code === 'browser-absent') return t('not on PATH');
  if (code === 'profile-is-users' || code === 'profile-not-owned') return t('No private profile folder here');
  return null;
}

/** §7.9: the SHORT, translated reason a dimmed LibreOffice card shows (by the keeper's code — the machine's sentence, naming
 *  the missing package, stays the card's tooltip, and "Install…" rides beside it). null ⇒ the card falls back to the sentence. */
export function officeReasonShort(code) {
  if (code === 'app-absent') return t('not installed');
  return null;
}

/** The launch body of a browser card (PURE — the suite drives it): `{appId}` plus the typed URL when there is one
 *  (refused by name when it is not http/https — `{error}`) and `keepProfile` only when chosen. */
export function browserLaunchBody(row, { url = '', keepProfile = false } = {}) {
  const typed = String(url || '').trim();
  const body = { appId: row.id };
  if (typed) {
    const v = validateBrowserUrl(typed);
    if (!v.ok) return { error: v.error, code: v.code };
    body.url = v.url;
  }
  if (keepProfile) body.keepProfile = true;
  return { body };
}

/** The availability sentence for the dialog head — the ladder's verdict in
 *  the same words the status chip uses; lane C2: `machine` = a paired machine's name (absent = this machine). */
export function availabilityText(av, machine = null) {
  if (!av) return t('Checking display backends…');
  if (machine) {
    if (!av.backend) return t('No display backend on {machine} ({why})', { machine, why: av.fallbackWhy || '' });
    return av.fallbackWhy ? t('Windows on {machine} will use {backend} — {why}', { machine, backend: av.backend, why: av.fallbackWhy }) : t('Windows on {machine} will use {backend}', { machine, backend: av.backend });
  }
  if (!av.backend) return t('No display backend on this machine ({why})', { why: av.fallbackWhy || '' });
  return av.fallbackWhy ? t('Windows will use {backend} — {why}', { backend: av.backend, why: av.fallbackWhy }) : t('Windows will use {backend}', { backend: av.backend });
}

/** lane C2: a machine picker row's name ("This machine" for the hub itself — a DISPLAY string, never a spawn input). */
/** lane apps-launcher-witness: this hub's own name, as the last local list said it (the place words name it). */
let localHostName = '';
export function noteLocalHostName(n) { if (typeof n === 'string' && n) localHostName = n.slice(0, 64); }
/** Where an install landed: "this VibeSpace machine (linux-box-hub)" | the paired machine's label (PURE installPlace). */
export function installPlaceOf(m) { return installPlace({ hostId: (m && m.hostId) || 'local', label: (m && m.label) || '', localName: localHostName }, t); }
/** A witnessed row's source chip (src/app-witness.js WITNESS_SOURCES). */
export function witnessSourceText(source) {
  return source === 'flatpak-user' ? t('Flatpak · yours') : source === 'flatpak-system' ? t('Flatpak · system') : source === 'desktop-system' ? t('Desktop entry · system') : source === 'agent' ? t('Registered by an agent') : t('Desktop entry · yours');
}
/** A witnessed card's second line: its command as written (shown, never trusted as an engine row) — or that it is gone. */
export function witnessSubText(row) {
  if (row.changed) return t('This entry was changed outside VibeSpace and is not runnable: {why}', { why: row.changed }); // rel254 verify F4: shown, never run
  const cmd = [row.exec, ...(row.args || [])].join(' ');
  return row.available ? cmd : t('Its program is gone: {cmd}', { cmd });
}
/** lane app-register-ui: a card's own "…" rows beside its default-scale rows, by KIND — `head` above them (a registered
 *  card's launch variants, ≥ 2 only: one variant is the card's press), `tail` below (Add to VibeSpace… on a witnessed
 *  card; Remove… — or Forget when it has no recipe — and Show command on a registered one). The dialog words + wires. */
export function cardMenuModel(row) {
  const r = row || {};
  const own = !r.witnessed && (r.registered || r.removable); // a witnessed row is never registered (the contract); a removable engine row has its recipe too
  const launch = own && Array.isArray(r.launch) ? r.launch.slice(0, 8) : [];
  const head = launch.length >= 2 ? launch.map((v, i) => ({ kind: 'variant', id: String(v.id), label: String(v.label || v.id), ...(i === 0 ? { isDefault: true } : {}) })) : [];
  const tail = r.witnessed ? [{ kind: 'adopt' }] : own ? [{ kind: r.removable ? 'remove' : 'forget' }, { kind: 'command' }] : [];
  return { head, tail };
}
export function cardMenuRowLabel(m) {
  if (m.kind === 'variant') return m.isDefault ? m.label : t('Open · {variant}', { variant: m.label }); // the default reads as itself ("Open", never "Open · Open")
  return m.kind === 'adopt' ? t('Add to VibeSpace…') : m.kind === 'remove' ? t('Remove…') : m.kind === 'forget' ? t('Forget') : t('Show command');
}
/** The command a recipe / a variant runs, as ONE line read back to the same words (never hidden, never re-quoted twice). */
export function recipeLine(rec) { return rec && rec.exec ? joinWords([rec.exec, ...(Array.isArray(rec.args) ? rec.args : [])]) : ''; }
/** rel254 verify F3: what a row / a variant RUNS, as a person reads it — `env K=V …` before, `(in <cwd>)` after, every
 *  invisible character shown (src/argv-words.js commandLine). A variant without its own env inherits the row's (the default's). */
export function runLine(row, variant = null) {
  const r = row || {};
  const v = variant || r;
  return v && v.exec ? commandLine({ exec: v.exec, args: v.args || [], ...(v.env ? { env: v.env } : variant && r.env ? { env: r.env } : {}), ...(v.cwd ? { cwd: v.cwd } : {}) }) : '';
}
/** After Remove… answered ok: the program is gone — or only the entry is (the witness lists the program again). */
export function removedToastText(stillListed) { return stillListed ? t('Forgotten — the program is still on the machine') : t('Removed'); }
/** An adopt refusal lands under the field it concerns (the answer's own `field` when it names one, else by its code). */
export const ADOPT_FIELDS = Object.freeze(['label', 'launch', 'remove', 'reinstall']);
export function adoptErrorField(r) {
  if (r && ADOPT_FIELDS.includes(r.field)) return r.field;
  const c = r && r.code;
  return c === 'bad_label' || c === 'shadow' || c === 'bad_icon' ? 'label' : c === 'needs_root' ? 'remove' : 'launch';
}
/** A variant's / a recipe's typed line → `{ok, argv}` or the refusal said in words (where the line broke). */
export function argvLineVerdict(line) {
  const v = splitWords(line);
  if (!v.ok) return { ok: false, code: 'bad_args', at: v.at, error: t('This line cannot be read as a command near character {n} — quote | ; & > < $ and backticks, and close every quote', { n: v.at + 1 }) };
  return v;
}
/** The filter box: a card matches when every word is in its name, its command or its flatpak id. PURE. */
export function launchFilterMatch(row, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [row.label, (row.labels && (row.labels.zh || '')) || '', (row.labels && (row.labels.ja || '')) || '', row.exec, ...(row.args || []), row.flatpak || ''].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}
export function machineName(m) { return !m || !m.hostId || m.hostId === 'local' ? t('This machine') : String(m.label || m.hostId); }
/** §7.9: a machine's name INSIDE a sentence ("… is not installed on this machine" — never a capitalised "This machine"). */
export function machineInSentence(m) { return !m || !m.hostId || m.hostId === 'local' ? t('this machine') : String(m.label || m.hostId); }
/** lane C2: why a machine row is greyed (or what choosing it does), by the PURE verdict's code. '' = nothing to say. */
export function machineWhyText(code) {
  if (code === 'offline') return t('offline');
  if (code === 'host_needs_daemon') return t('needs the agent upgraded');
  if (code === 'no_x11') return t('no X11 (macOS / Windows)');
  if (code === 'desktop_ready') return t('its desktop'); // design 014 D1
  if (code === 'no_vnc') return t('its desktop — set up once');
  if (code === 'connect') return t('connects when chosen');
  if (code === 'checking') return t('Checking…'); // lane desktop-picker-instant: never probed yet — this row only
  return '';
}
/** lane C2: the dialog head's words when a machine's list failed, by the server's code. */
export function machineErrorText(code, machine, why = '') {
  if (code === 'host_needs_daemon') return t('The VibeSpace agent on {machine} is too old to run desktop apps — reconnect the machine to upgrade it', { machine });
  if (code === 'host_unavailable') return t('{machine} is not answering: {why}', { machine, why });
  if (code === 'unsupported-host') return t('{machine} is not a machine on this instance', { machine });
  return why || t('Could not reach {machine}', { machine });
}
/** Layer 0 apps: an installed app's greyed card says why in a few words (the server's code) — restoring… while a rebuilt
 *  machine puts it back, the replay's failure, or not installed (yet). null ⇒ the card falls back to the sentence. */
export function appReasonShort(code) {
  if (code === 'restoring') return t('restoring…');
  if (code === 'restore-failed') return t('could not be put back');
  if (code === 'app-missing') return t('not installed here (yet)');
  return null;
}
/** lane C2: offer "Install xpra on <machine>…" when the chosen machine's facts show no xpra (PURE: the suite drives it). */
export function installOfferFor(av, m) {
  if (!av || (m && m.code === 'no_x11')) return false;
  return !(av.xpra && av.xpra.version);
}
/** lane C2: the install dialog's words for a plan the machine cannot run, by code. §7.9: `what` = the install (xpra by
 *  default — its words unchanged; a LibreOffice install says its own words where they differ). */
export function installRefusalText(code, what = 'xpra') {
  if (what === 'tightvnc') { // design 014 D1: the Windows one-time setup
    if (code === 'no_admin') return t('Windows on that machine granted no administrator rights — nobody clicked Yes there. Click Install again with someone at that machine, or paste the commands above into an administrator PowerShell there.');
    if (code === 'install_failed') return t('The install failed — the administrator window on that machine said why.');
    if (code === 'still-absent') return t('The install finished, but nothing answers as a VNC server on port 5900 yet — check again.');
    if (code === 'not_windows') return t('TightVNC is for Windows machines — a Mac turns on Screen Sharing instead.');
  }
  if (what !== 'xpra') {
    if (code === 'no_apt') return t('This Linux has no apt-get — install LibreOffice with its own package manager.');
    if (code === 'still-absent') return t('The install finished, but LibreOffice is still not found on this machine — check again.');
  }
  if (code === 'no_x11') return t('This machine runs macOS or Windows — it has no X11 server, so desktop apps cannot run there.');
  if (code === 'no_apt') return t('This Linux has no apt-get — install xpra 6.x by hand from xpra.org.');
  if (code === 'no_repo') return t('Its package sources offer only an old xpra and xpra.org publishes nothing for this release — install xpra 6.x by hand.');
  if (code === 'no_sudo') return t('This machine has no passwordless sudo — run these commands yourself in a terminal there, then check again.');
  if (code === 'no_facts') return t('The agent on this machine did not report what it runs — reconnect it to upgrade the agent.');
  if (code === 'busy') return t('An install is already running on this machine — wait for it to finish, then check again.');
  if (code === 'install_timeout') return t('The install did not finish in time and is still running on this machine — VibeSpace never stops apt halfway. Check again once it ends.');
  if (code === 'install_link_lost') return t('The link to this machine dropped during the install. The install keeps running there — once the machine is back and has finished it, check again.');
  if (code === 'install_unrecorded') return t('The install ended without saying how (it was stopped, or the machine restarted) — check again.');
  if (code === 'plan_changed') return t('What would run on this machine changed after it was shown — nothing ran. The commands above are the new ones; press Install again to run them.');
  return '';
}

/** The SVG for a catalog card, by the row's category (falls back to the
 *  window glyph); §7.9: a LibreOffice row by its module. PURE — the suite pins that every answer is an SVG. */
export function cardIconFor(category, office = null) {
  if (office && OFFICE_ICONS[office]) return OFFICE_ICONS[office];
  return CATEGORY_ICONS[String(category || '')] || APPS_ICON;
}

/** §7.9: THE WORDS for every open-with refusal CODE (src/office-open.js openWithVerdict + the machine's launch) — the
 *  explorer's menu row, the door's toast and the launch dialog's file mode all say these. `app` / `machine` / `file`
 *  are display strings (a product label, a host's name, a basename) that only reach textContent. '' = no words of
 *  our own (the caller falls back to the server's sentence). */
export function openWithRefusalText(code, { app = 'LibreOffice', machine = '', file = '' } = {}) {
  const m = machine || t('this machine');
  if (code === 'app-absent') return t('{app} is not installed on {machine}', { app, machine: m });
  if (code === 'machine-mismatch') return t('{file} is on {machine} — LibreOffice opens it there, on the machine that holds the file', { file, machine: m });
  if (code === 'host-unreachable' || code === 'host_unavailable') return t('{machine} is not answering — try again once it is back', { machine: m });
  if (code === 'host_needs_daemon') return t('The VibeSpace agent on {machine} is too old to open files in LibreOffice — reconnect the machine to upgrade it', { machine: m });
  if (code === 'not-office-file') return t('{file} is not a document LibreOffice opens', { file });
  if (code === 'not-office-app') return t('That app does not open documents — LibreOffice does');
  if (code === 'relative-path') return t('This file has no absolute path on its machine — open it from the file explorer');
  if (code === 'file-missing') return t('{file} is no longer there on {machine}', { file, machine: m });
  if (code === 'still-absent') return t('The install finished, but {app} is still not available on {machine} — check again', { app, machine: m });
  return '';
}
/** §7.9: the install offer's words — the owner's own phrase, one per machine. */
export const officeInstallLabel = (machine) => t('Install LibreOffice on {machine}…', { machine: machine || t('this machine') });
/**
 * B-04da ④ — STOP WITHOUT LOSING AN EDIT: POST …/stop; a LibreOffice session is asked to quit through its own File ▸ Exit
 * first, and while its "Save changes?" prompt is up the keeper answers `app-asked` — then the person is asked here, in
 * words, whether to stop it anyway (and lose the unsaved edits) or answer the prompt in the app's window. The ONE stop of
 * every surface (the window's Stop, the ✕ pressed again, the launcher's running list). → the record, or null (kept
 * running / failed — said).
 */
export async function stopDesktopApp(id, { name = '' } = {}) {
  const post = (force) => fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: force ? JSON.stringify({ force: true }) : '{}' });
  let r = await post(false);
  if (r && r.code === 'app-asked') {
    const okd = await confirmDiscard({ name, act: 'stop' });
    if (!okd) { showToast(t('{app} keeps running — answer its question in its window', { app: name || t('The app') }), { duration: 4000 }); return null; }
    r = await post(true);
  }
  if (!r || r.error) { showToast(r?.error || t('Could not stop the app'), { type: 'error' }); return null; }
  return r;
}
/** B-04da ④: the words after an `app-asked` — LibreOffice is asking in its window; going on loses the unsaved edits. */
export function confirmDiscard({ name = '', act = 'stop' } = {}) {
  const app = name || t('The app');
  return showConfirmDialog({
    title: t('{app} has unsaved changes', { app }),
    message: t('{app} is asking in its own window whether to save them. Answer it there to keep your edits — or go on now and lose them.', { app }),
    confirmText: act === 'relaunch' ? t('Relaunch and lose the edits') : t('Stop and lose the edits'),
    danger: true,
  });
}
/** B-04da ②: the offer of the Calibri / Cambria look-alikes alone, on a machine that has LibreOffice without them. */
export const officeFontsLabel = (machine) => t('Install the Calibri / Cambria look-alike fonts on {machine}…', { machine: machine || t('this machine') });

/** Is the "Advanced" disclosure open at dialog open? PURE: the persisted
 *  preference wins, and an EMPTY catalog forces it open (there is nothing
 *  else to click) without persisting anything. */
export function advancedOpenFor(userState, registryEmpty) {
  if (registryEmpty) return true;
  return userState?.[ADVANCED_KEY] === true;
}

/** Merge a launch into the recents list (newest first, de-duplicated on the
 *  command line, capped). PURE — the suite drives it. */
export function pushRecent(list, entry, max = RECENTS_MAX) {
  const key = (e) => JSON.stringify([e.exec, e.args || [], e.cwd || null]);
  const k = key(entry);
  const out = [{ exec: entry.exec, args: entry.args || [], cwd: entry.cwd || null, label: entry.label || entry.exec, at: entry.at || Date.now() }];
  for (const e of Array.isArray(list) ? list : []) { if (key(e) !== k && out.length < max) out.push(e); }
  return out;
}

/** Split a typed args line on whitespace, honouring simple quotes. PURE. */
export function splitArgs(line) {
  const out = []; let cur = ''; let q = null; let had = false;
  for (const ch of String(line || '')) {
    if (q) { if (ch === q) { q = null; } else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; had = true; continue; }
    if (/\s/.test(ch)) { if (cur || had) { out.push(cur); cur = ''; had = false; } continue; }
    cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

let launcherApp = null; // design 009 §B5: the install dialog's hand-off opens a helper conversation, which needs the app
// ── lane app-register-ui (owner 2026-10-11: an agent-installed JASP sat under "Installed outside VibeSpace"): ONE
// press makes an outside app VibeSpace's own — its label, its launch variants and how to remove / reinstall it, each
// typed as ONE line and shown back as its words (src/argv-words.js, the server's own reader); nothing a row runs is
// hidden. The ADOPT dialog is prefilled by the server (GET …/adopt-prefill), an error lands under its field. ──
const POST_JSON = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
/** The words a line reads as, one chip each (textContent: a word is the person's / an agent's text) — or why it can't be read. */
function renderChips(box, line) {
  box.textContent = '';
  const v = argvLineVerdict(line);
  box.classList.toggle('is-bad', !v.ok);
  if (!v.ok) { box.textContent = v.error; return v; }
  for (const w of v.argv) { const c = document.createElement('span'); c.className = 'desktop-adopt-chip'; c.textContent = w; box.appendChild(c); }
  return v;
}
/** The prefill's witness line ("found as Flatpak · yours: org.jaspstats.JASP"). */
export function adoptWitnessText(w, row = {}) {
  if (typeof w === 'string' && w) return w;
  const o = w && typeof w === 'object' ? w : {};
  const what = o.appId || o.id || o.file || recipeLine(o.exec ? o : row) || '';
  return t('found as {source}: {what}', { source: witnessSourceText(o.source || row.source), what });
}
export async function showAdoptDialog(row, { host = 'local', onDone = null } = {}) {
  const app = catalogLabel(row);
  const { body, close } = createModalShell({ id: 'desktop-adopt-dialog', title: t('Add {app} to VibeSpace', { app }), dialogClass: 'desktop-adopt', escapeToClose: true });
  body.innerHTML = `
    <p class="desktop-adopt-witness"></p>
    <div class="desktop-adopt-field" data-field="label"><label><span>${escHtml(t('Label'))}</span><input type="text" class="desktop-adopt-label" autocomplete="off" spellcheck="false" maxlength="80"></label><div class="desktop-adopt-err"></div></div>
    <div class="desktop-adopt-field" data-field="launch"><span class="desktop-adopt-head">${escHtml(t('Launch variants'))}</span><span class="desktop-adopt-hint">${escHtml(t('The first one is what a press on the card opens'))}</span><div class="desktop-adopt-variants"></div><button type="button" class="file-tool-btn desktop-adopt-add-variant">${escHtml(t('Add a variant'))}</button><div class="desktop-adopt-err"></div></div>
    <div class="desktop-adopt-field" data-field="remove"><label><span>${escHtml(t('Remove recipe'))}</span><input type="text" class="desktop-adopt-remove desktop-adopt-cmd" autocomplete="off" spellcheck="false" placeholder="${escHtml(t('leave empty: Forget only'))}"></label><div class="desktop-adopt-chips"></div><div class="desktop-adopt-err"></div></div>
    <div class="desktop-adopt-field" data-field="reinstall"><label><span>${escHtml(t('Reinstall recipe (optional)'))}</span><input type="text" class="desktop-adopt-reinstall desktop-adopt-cmd" autocomplete="off" spellcheck="false"></label><div class="desktop-adopt-chips"></div><div class="desktop-adopt-err"></div></div>
    <div class="desktop-adopt-actions"><button type="button" class="btn-cancel desktop-adopt-cancel">${escHtml(t('Cancel'))}</button><button type="button" class="btn-create desktop-adopt-go" disabled>${escHtml(t('Add'))}</button></div>`;
  const $ = (sel) => body.querySelector(sel);
  const field = (f) => body.querySelector(`.desktop-adopt-field[data-field="${f}"]`);
  const sayErr = (f, text) => { const e = field(f)?.querySelector(':scope > .desktop-adopt-err'); if (e) e.textContent = text || ''; };
  const clearErrs = () => { for (const f of ADOPT_FIELDS) sayErr(f, ''); };
  const labelIn = $('.desktop-adopt-label'), varEl = $('.desktop-adopt-variants'), goBtn = $('.desktop-adopt-go');
  let n = 0;
  const addVariant = (v = {}) => {
    const r = document.createElement('div'); r.className = 'desktop-adopt-variant'; r.dataset.vid = v.id ? String(v.id) : `v${Date.now().toString(36)}${n}`; n++;
    r.innerHTML = `<input type="text" class="desktop-adopt-vlabel" autocomplete="off" spellcheck="false" maxlength="60" aria-label="${escHtml(t('Variant name'))}" placeholder="${escHtml(t('Name'))}"><input type="text" class="desktop-adopt-vcmd desktop-adopt-cmd" autocomplete="off" spellcheck="false" aria-label="${escHtml(t('Command'))}" placeholder="${escHtml(t('Command'))}"><button type="button" class="file-tool-btn desktop-adopt-vdel" title="${escHtml(t('Remove this variant'))}" aria-label="${escHtml(t('Remove this variant'))}">${UI_ICONS.close}</button><div class="desktop-adopt-chips"></div>`;
    r.querySelector('.desktop-adopt-vlabel').value = String(v.label || (varEl.children.length ? '' : t('Open')));
    const cmd = r.querySelector('.desktop-adopt-vcmd'); cmd.value = v.exec ? recipeLine(v) : '';
    cmd.oninput = () => renderChips(r.querySelector('.desktop-adopt-chips'), cmd.value);
    r.querySelector('.desktop-adopt-vdel').onclick = () => { if (varEl.children.length > 1) { r.remove(); syncDel(); } };
    varEl.appendChild(r); cmd.oninput(); syncDel();
    return r;
  };
  const syncDel = () => { const many = varEl.children.length > 1; for (const b of varEl.querySelectorAll('.desktop-adopt-vdel')) b.disabled = !many; $('.desktop-adopt-add-variant').disabled = varEl.children.length >= 8; };
  $('.desktop-adopt-add-variant').onclick = () => addVariant().querySelector('.desktop-adopt-vlabel').focus();
  for (const f of ['remove', 'reinstall']) { const i = $(`.desktop-adopt-${f}`); i.oninput = () => renderChips(field(f).querySelector('.desktop-adopt-chips'), i.value); }
  $('.desktop-adopt-cancel').onclick = () => close();
  const wit = $('.desktop-adopt-witness'); wit.textContent = t('Reading what this machine says about {app}…', { app });
  const q = `seenId=${encodeURIComponent(row.id)}${host && host !== 'local' ? `&host=${encodeURIComponent(host)}` : ''}`;
  const pre = await fetchJson(`/api/desktop/apps/adopt-prefill?${q}`);
  if (!body.isConnected) return null;
  if (!pre || pre.error || pre.ok === false) { wit.textContent = (pre && pre.error) || t('Could not read what this machine says about {app}', { app }); wit.classList.add('is-bad'); }
  else wit.textContent = adoptWitnessText(pre.witness, row);
  labelIn.value = String((pre && pre.label) || app);
  const launch = pre && Array.isArray(pre.launch) && pre.launch.length ? pre.launch : [{ id: 'open', label: t('Open'), exec: row.exec, args: row.args || [] }];
  for (const v of launch.slice(0, 8)) addVariant(v);
  for (const f of ['remove', 'reinstall']) { const i = $(`.desktop-adopt-${f}`); i.value = pre && pre[f] && pre[f].exec ? recipeLine(pre[f]) : ''; i.oninput(); }
  goBtn.disabled = false;
  goBtn.onclick = async () => {
    clearErrs();
    const label = labelIn.value.trim();
    if (!label) { sayErr('label', t('Give it a name')); labelIn.focus(); return; }
    const variants = [];
    for (const r of varEl.children) {
      const v = argvLineVerdict(r.querySelector('.desktop-adopt-vcmd').value);
      if (!v.ok || !v.argv.length) { sayErr('launch', v.ok ? t('Each variant needs a command') : v.error); r.querySelector('.desktop-adopt-vcmd').focus(); return; }
      variants.push({ id: r.dataset.vid, label: r.querySelector('.desktop-adopt-vlabel').value.trim() || v.argv[0], exec: v.argv[0], args: v.argv.slice(1) });
    }
    const recipe = {};
    for (const f of ['remove', 'reinstall']) {
      const line = $(`.desktop-adopt-${f}`).value;
      if (!line.trim()) continue;
      const v = argvLineVerdict(line);
      if (!v.ok) { sayErr(f, v.error); $(`.desktop-adopt-${f}`).focus(); return; }
      recipe[f] = { exec: v.argv[0], args: v.argv.slice(1) };
    }
    goBtn.disabled = true;
    const r = await fetchJson('/api/desktop/apps/adopt', POST_JSON({ seenId: row.id, label, launch: variants, ...recipe, ...(host && host !== 'local' ? { host } : {}) }));
    goBtn.disabled = false;
    if (!r || r.ok === false || r.error) { // the no-silent-failure law: said under the field it concerns, never a toast alone
      const f = adoptErrorField(r || {});
      sayErr(f, (r && r.error) || t('Could not add {app}', { app: label }));
      field(f)?.querySelector('input')?.focus();
      return;
    }
    close();
    showToast(t('{app} is now in your Apps', { app: label })); // the name the person just confirmed
    onDone?.(r.row || null);
  };
  setTimeout(() => { try { labelIn.focus({ preventScroll: true }); } catch {} }, 0);
  return { close };
}
/** Remove… (the entry's recipe, run as the user, after ONE confirm that shows it verbatim) — or Forget (the entry leaves
 *  the index, the program stays: the witness lists it again). A failure shows the output's last lines in a dialog. */
export async function removeRegistered(row, { forget = false, onDone = null } = {}) {
  const app = catalogLabel(row);
  const rec = recipeLine(row.remove);
  const ok = await showConfirmDialog({
    title: forget ? t('Forget {app}?', { app }) : t('Remove {app}?', { app }),
    message: forget ? t('{app} leaves Apps; the program stays on this machine and is listed under “Installed outside VibeSpace” again.', { app })
      : rec ? t('This runs as you: {cmd}', { cmd: rec }) : t('This runs the remove recipe {app} was registered with, as you.', { app }),
    confirmText: forget ? t('Forget') : t('Remove'), danger: !forget,
  });
  if (!ok) return null;
  const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(row.id)}/${forget ? 'forget' : 'remove'}`, POST_JSON({}));
  if (!r || r.ok === false || r.error) {
    const { body } = createModalShell({ id: 'desktop-remove-failed', title: t('Could not remove {app}', { app }), dialogClass: 'desktop-adopt', escapeToClose: true });
    const said = r && r.code === 'no_recipe' ? t('{app} has no remove recipe — use Forget', { app }) : r && r.code === 'needs_root' ? t('Its remove recipe needs administrator rights — VibeSpace runs recipes as you only') : t('The remove recipe failed');
    const p = document.createElement('p'); p.className = 'desktop-adopt-witness is-bad'; p.textContent = [said, r && r.error].filter(Boolean).join(' — ');
    body.appendChild(p);
    const out = String((r && r.output) || '').trimEnd().split('\n').slice(-12).join('\n');
    if (out) { const pre = document.createElement('pre'); pre.className = 'desktop-install-pre desktop-remove-output'; pre.textContent = out; body.appendChild(pre); }
    return null;
  }
  const fresh = onDone ? await onDone() : null;
  const still = forget || !!(fresh && (fresh.registry || []).some((w) => w.witnessed && (w.label === row.label || recipeLine(w) === recipeLine(row))));
  showToast(removedToastText(still));
  return r;
}

export function installDesktopAppLauncher(app) {
  app._desktopAppsAvailable = false;
  launcherApp = app;
  registerCommand({ id: COMMAND_ID, title: 'Apps…', icon: APPS_ICON, run: (ctx) => showLaunchDialog((ctx && ctx.app) || app) });
  registerMenuItem({ menu: 'gear', group: '1_admin', order: 18, icon: APPS_ICON, /* design 009 §B6: a TOP-LEVEL row (Manage agents 10 · All Settings 15 · this 18 · Tools ▸ 20) */ when: (c) => !!c.app._desktopAppsAvailable, label: () => t('Apps…'), run: (c) => runCommand(COMMAND_ID, { app: c.app }) });
  const btn = document.getElementById('btn-desktop-apps');
  if (btn) btn.addEventListener('click', () => runCommand(COMMAND_ID, { app }));
  // Layer 0 apps (owner D4): the file explorer's "Install this package…" on a .deb — THE plan, on the machine that holds it
  app.openDebInstall = ({ host = null, path = '' } = {}) => openDebInstall(app, { hostId: host || 'local', label: host || null }, { path });

  // Probed at startup AND on every ws reconnect (the Desktop button's lesson:
  // a page loaded during a restart window must self-heal without an F5).
  const probe = (attempt = 0) => {
    fetchJson('/api/desktop/apps').then(async (d) => {
      if (d == null) throw new Error('probe failed');
      let ok = !!(d.availability && d.availability.backend);
      // lane C2: no display backend HERE but a paired machine that could run apps (or take the install rung) — the
      // entry stays reachable (the dialog greys what cannot run and offers "Install xpra on <machine>…")
      if (!ok) { const m = await fetchJson('/api/desktop/machines'); ok = !!(m && Array.isArray(m.machines) && m.machines.some((x) => x.hostId !== 'local' && x.code !== 'no_x11')); }
      app._desktopAppsAvailable = ok;
      app._desktopAppsKnown = true; // the probe ANSWERED (Settings: an unanswered probe hides nothing — settings-view.js)
      app._applyChromeSettings?.();
    }).catch(() => { if (attempt < 5) setTimeout(() => probe(attempt + 1), [3000, 8000, 20000, 45000, 90000][attempt]); });
  };
  probe();
  app.ws.onStateChange?.((connected) => { if (connected && !app._desktopAppsAvailable) probe(); });
}

// ── lane stream-mic-road: 「安装虚拟麦克风」 + its uninstall door — the plan's facts above its commands (PURE words) ──
/** The refusal words of a virtual-microphone plan / run, by code (`mac` = the plan asked a Mac's password dialog). */
export function micInstallRefusalText(code, mac = false) {
  if (code === 'no_admin') return mac ? t('The Mac got no administrator password — the dialog was cancelled there. Nothing was installed.') : t('Windows granted no administrator rights — nothing was installed. Press again with someone at that machine.');
  if (code === 'no_password') return t('Nobody answered the administrator password dialog on the Mac in 5 minutes — it was withdrawn and nothing was installed.');
  if (code === 'already_installed') return t('This machine already has a virtual microphone.');
  if (code === 'not_installed') return t('This machine has no virtual microphone to remove.');
  if (code === 'still-absent') return t('The install finished, but the machine does not show the virtual microphone yet — check again.');
  if (code === 'still-present') return t('The machine still shows the virtual microphone — finish the removal in the window that opened there, then check again.');
  if (code === 'unsupported') return t('The virtual microphone is for a paired Windows or macOS machine.');
  if (code === 'host_needs_daemon') return t('The VibeSpace agent on that machine is too old for the microphone — reconnect it to upgrade.');
  if (code === 'install_failed') return t('The install failed — the window on that machine said why.');
  return '';
}
const MIC_PROMPT_WORDS = { uac: () => t('one Windows prompt: «Windows PowerShell — Microsoft Windows» (click Yes)'), admin_window: () => t('an administrator window for about 30 seconds'), no_driver_dialog: () => t('no driver dialog'), password: () => t('the Mac’s administrator password dialog with VibeSpace’s text (it waits at most 5 minutes)'), coreaudio_restart: () => t('every sound stops for a second or two while Core Audio restarts'), vendor_window: () => t('VB-CABLE’s own window: press «Remove Driver» there') };
const MIC_NOTE_WORDS = { restart_owed: () => t('VB-CABLE asks Windows for a restart to finish — the microphone works now; VibeSpace never restarts the machine'), defaults_kept: () => t('Windows moves the default speaker and microphone to the cable when it installs — VibeSpace puts yours back'), no_mac_restart: () => t('The Mac does not restart') };
const MIC_REMOVES_WORDS = { vbcable_driver: () => t('Goes away: the VB-CABLE driver and its devices «CABLE Input» / «CABLE Output»'), ours_plugin: () => t('Goes away: the «VibeSpace Microphone» device'), blackhole_plugin: () => t('Goes away: the «BlackHole 2ch» device') };
/** The plan's facts (what, from where, its license, what the person will see) as text-only rows (PURE: the suite drives it). */
export function micPlanRows(plan) {
  const p = plan || {}, rows = [];
  if (p.which === 'vbcable') rows.push(t('VB-CABLE by VB-Audio Software — donationware: if you keep using it, donate at {site}', { site: p.site || 'https://vb-cable.com' }));
  else if (p.which === 'blackhole') rows.push(t('BlackHole 2ch by Existential Audio — free software under GPL-3, from {site}', { site: p.site || '' }));
  else if (p.which === 'vibespace-mic') rows.push(t('«VibeSpace Microphone» — VibeSpace’s own, built on this Mac'));
  if (p.url) rows.push(t('Downloaded from {url} at your press; its SHA-256 must be {sha}', { url: p.url, sha: p.sha256 || '' }));
  if (p.which === 'vbcable' && p.what === 'virtual-mic') rows.push(t('Its setup must be signed by {signer}', { signer: p.signer || '' }));
  if (p.fallbackWhy) rows.push(t('This Mac cannot build VibeSpace’s own plug-in ({why}) — BlackHole 2ch instead', { why: p.fallbackWhy }));
  for (const k of p.removes || []) if (MIC_REMOVES_WORDS[k]) rows.push(MIC_REMOVES_WORDS[k]());
  const seen = (p.prompts || []).filter((k) => MIC_PROMPT_WORDS[k]).map((k) => MIC_PROMPT_WORDS[k]());
  if (seen.length) rows.push(t('What you will see on that machine: {list}', { list: seen.join(' · ') }));
  for (const k of p.notes || []) if (MIC_NOTE_WORDS[k]) rows.push(MIC_NOTE_WORDS[k]());
  return rows;
}

// ── lane C2: the INSTALL RUNG — the plan first, then the run with its log (never silent) ──
/** §7.9: lifted out of the dialog and generalised by `what` — 'xpra' (the display rung; every word and route exactly as
 *  before) or a LibreOffice install by its catalog id (the plan from `GET /api/desktop/install-plan?what=`, the run
 *  streamed from `POST /api/desktop/install {host, what}`, which answers done only once the machine serves the row).
 *  Layer 0 apps (docs/design-app-persistence.zh.md §3.1): `what: 'app'` + `request` ({kind: apt | deb | source | remove |
 *  refresh | adopt | source-remove, …}) or `proposalId` (an agent's proposal, opened from For you) — THE SAME component:
 *  the plan from POST /api/apps/plan (its facts above the commands: packages, sizes, a source's key fingerprint, how it
 *  comes back after a rebuild), the run from POST /api/apps/install (the same NDJSON, the same one-slot rule). */
export async function showInstallDialog(m, { what = 'xpra', onDone = null, request = null, proposalId = null } = {}) {
  const xp = what === 'xpra';
  const isApp = what === 'app';
  const tv = what === 'tightvnc'; // design 014 D1: Windows asks for administrator rights on its own screen
  const vm = what === 'virtual-mic' || what === 'virtual-mic-remove', vmRemove = what === 'virtual-mic-remove'; // lane stream-mic-road: the machine's own prompt too
  const spec = xp || isApp || tv || vm ? null : installSpecFor(what);
  const appLabel = spec ? spec.label : 'LibreOffice';
  const name = xp ? machineName(m) : machineInSentence(m); // xpra's words exactly as before; a LibreOffice install names the machine inside its sentences
  const { body: ib, close: iclose } = createModalShell({ id: 'desktop-install-dialog', title: vm ? (vmRemove ? t('Remove the virtual microphone from {machine}', { machine: name }) : t('Install a virtual microphone on {machine}', { machine: name })) : tv ? t('Install TightVNC Server on {machine}', { machine: name }) : isApp ? appDialogTitle(request || { kind: 'apt', packages: [] }, name) : xp ? t('Install xpra on {machine}', { machine: name }) : what === FONTS_ID ? t('Install the Calibri / Cambria look-alike fonts on {machine}', { machine: name }) : t('Install LibreOffice on {machine}', { machine: name }), dialogClass: 'desktop-install', escapeToClose: true });
  ib.classList.add('desktop-install-body');
  if (isApp) ib.classList.add('desktop-install-app');
  const note = document.createElement('div'); note.className = 'desktop-install-note'; note.textContent = t('Reading what {machine} runs…', { machine: name });
  const pre = document.createElement('pre'); pre.className = 'desktop-install-pre'; pre.style.display = 'none';
  const log = document.createElement('pre'); log.className = 'desktop-install-pre desktop-install-log'; log.style.display = 'none';
  const actions = document.createElement('div'); actions.className = 'desktop-install-actions';
  const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'file-tool-btn'; copyBtn.style.cssText = 'width:auto;padding:0 10px'; copyBtn.textContent = t('Copy commands'); copyBtn.style.display = 'none';
  const goBtn = document.createElement('button'); goBtn.type = 'button'; goBtn.className = 'btn-create'; goBtn.textContent = t('Install'); goBtn.style.display = 'none';
  actions.append(copyBtn, goBtn);
  const facts = document.createElement('div'); facts.className = 'desktop-install-facts'; facts.style.display = 'none'; // an app's plan: its facts above the commands
  ib.append(note, facts, pre, actions, log);
  // design 009 B: an app's dialog LEADS with the card's summary (what, from where, how big, what it gives); the plan's
  // facts, the root sentence and the commands fold under Details (a plan the engine sent no card for keeps the old order)
  const summary = document.createElement('div'); summary.className = 'app-card-summary'; summary.style.display = 'none';
  const more = document.createElement('details'); more.className = 'app-install-details';
  if (isApp) { const s = document.createElement('summary'); s.textContent = t('Details'); more.append(s); ib.insertBefore(summary, note); }
  // design 009 §B5: a refusal that is a dead end offers its way out — an agent looks for another way (the request carried)
  const handOff = (code, pkgs) => {
    if (!HAND_OFF_CODES.includes(code) || !launcherApp) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-create desktop-install-handoff'; b.textContent = t('Let an agent find another way');
    b.onclick = () => { iclose(); openAgentHelp(launcherApp, m, { request: (pkgs || []).join(' ') }); };
    actions.replaceChildren(b);
  };
  const q = m.hostId === 'local' ? '' : `?host=${encodeURIComponent(m.hostId)}`;
  const r = isApp
    ? await fetchJson('/api/apps/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposalId ? { proposalId } : { host: m.hostId || 'local', request }) })
    : await fetchJson(`/api/desktop/install-plan${q}${xp ? '' : `${q ? '&' : '?'}what=${encodeURIComponent(what)}`}${vm ? `&lang=${encodeURIComponent(resolveLang())}` : ''}`); // lane stream-mic-road: the Mac dialog's text in this page's language
  if (!r || r.error) { note.textContent = (r && ((isApp && appRefusalText(r.code)) || (vm && micInstallRefusalText(r.code)) || r.error)) || t('Could not read the install plan'); note.classList.add('is-bad'); return; }
  let plan = r.plan || {};
  let shownDigest = r.digest || null; // verify-r6 I1: the press names the plan these commands are
  if (isApp && r.request) { const h = ib.closest('.dialog')?.querySelector('.dialog-title, h3, .modal-title'); if (h) h.textContent = appDialogTitle(r.request, name); }
  if (!plan.ok) {
    note.textContent = isApp ? (appRefusalText(plan.code) || plan.error || '') : vm ? (micInstallRefusalText(plan.code) || plan.error || '') : (installRefusalText(plan.code, what) || plan.error || ''); // design 009 §B5: ONE sentence, ours
    note.classList.add('is-bad');
    if (isApp) handOff(plan.code, (r.request || request || {}).packages);
    return;
  }
  if (isApp) {
    facts.replaceChildren(appPlanBlock(plan, { proposal: r.proposal || null })); facts.style.display = '';
    if (r.card) {
      const p = r.proposal || null;
      summary.replaceChildren(appSummaryBlock(p ? { ...r.card, by: p.by && p.by.name ? { name: p.by.name } : null, why: p.why || '' } : r.card)); summary.style.display = '';
      const rootLine = document.createElement('div'); rootLine.className = 'app-install-root'; rootLine.textContent = appPlanNote(plan, name);
      more.append(rootLine, facts, pre); ib.insertBefore(more, actions);
    }
  }
  if (vm) { const rows = micPlanRows(plan); facts.replaceChildren(...rows.map((x) => { const d = document.createElement('div'); d.textContent = x; return d; })); facts.style.display = rows.length ? '' : 'none'; } // lane stream-mic-road: what, from where, its license, what the person sees
  pre.textContent = plan.commands.join('\n'); pre.style.display = '';
  copyBtn.style.display = '';
  copyBtn.onclick = async () => { const ok = await copyText(plan.commands.join('\n')); showToast(ok === false ? t('Could not copy — select the commands and copy them') : t('Commands copied'), ok === false ? { type: 'error' } : undefined); };
  const src = plan.source === 'xpra.org' ? t('from xpra.org (xpra {major}.x, pinned) — the package sources on {machine} offer only {apt}', { major: '6', machine: name, apt: plan.aptXpra || t('no xpra') }) : t('from the package sources on {machine}', { machine: name });
  // an install already running there (a restarted hub, another tab) is FOLLOWED, never started twice (verify r2 F3/F4)
  const running = !!((isApp ? r.install : r.facts) && (isApp ? r.install : r.facts).installing);
  if (!plan.canRun && !running) { note.textContent = isApp ? appRefusalText('no_sudo') : installRefusalText('no_sudo', what); note.classList.add('is-bad'); return; }
  note.textContent = running ? t('An install is already running on {machine} — follow its log here.', { machine: name }) : vm ? (plan.adminDialog ? t('This asks for the Mac’s administrator password on {machine}’s own screen — someone there types it. Then, as administrator, it runs:', { machine: name }) : t('This asks Windows on {machine} for administrator rights on its own screen — someone there clicks Yes. The administrator window runs:', { machine: name })) : tv ? t('Install asks Windows on {machine} for administrator rights: someone at that machine clicks Yes, then types the VNC password into the window that opens there (VibeSpace never sees it). It runs these commands:', { machine: name }) : isApp ? (r.card ? '' : appPlanNote(plan, name)) : t('These commands run on {machine} as root, {source}:', { machine: name, source: src });
  if (isApp) goBtn.textContent = appGoLabel(plan);
  if (running) goBtn.textContent = t('Follow the install');
  goBtn.style.display = '';
  goBtn.onclick = async () => {
    goBtn.disabled = true; copyBtn.disabled = true;
    log.style.display = ''; log.textContent = '';
    note.textContent = t('Installing on {machine}…', { machine: name }); note.classList.remove('is-bad');
    let res;
    try {
      res = await fetch(isApp ? '/api/apps/install' : xp ? '/api/desktop/install-xpra' : vm ? `/api/desktop/install?lang=${encodeURIComponent(resolveLang())}` : '/api/desktop/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, // lane stream-mic-road: a microphone install names the page's language (the Mac dialog's text)
        body: JSON.stringify(isApp ? (proposalId ? { proposalId, planDigest: shownDigest } : { host: m.hostId || 'local', request: r.request || request, planDigest: shownDigest }) : xp ? { host: m.hostId, planDigest: shownDigest } : { host: m.hostId, what, planDigest: shownDigest }) });
    }
    catch (e) { note.textContent = t('Could not start the install: {why}', { why: e.message }); note.classList.add('is-bad'); goBtn.disabled = false; return; }
    if (!res.ok || !res.body) { let j = null; try { j = await res.json(); } catch { j = null; } note.textContent = (j && ((isApp ? appRefusalText(j.code) : vm ? micInstallRefusalText(j.code, !!plan.adminDialog) : installRefusalText(j.code, what)) || j.error)) || t('Could not start the install'); note.classList.add('is-bad'); goBtn.disabled = false; return; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let end = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n'); buf = parts.pop();
      for (const p of parts) {
        if (!p.trim()) continue;
        let o; try { o = JSON.parse(p); } catch { continue; }
        if (o.reattached && !o.done) { note.textContent = t('Still installing on {machine} — re-attached. Its log so far follows.', { machine: name }); note.classList.remove('is-bad'); }
        if (o.log != null && !(isApp && /^= (run|ok)\b/.test(o.log))) { log.textContent += o.log + '\n'; log.scrollTop = log.scrollHeight; } // design 009 B (review I13): the slot's own `= run …` / `= ok` markers are not the user's words
        if (o.done || o.error) end = o;
      }
    }
    if (end && end.done && isApp) { note.textContent = appDoneText(end, installPlaceOf(m)); note.classList.remove('is-bad'); showToast(appDoneText(end, installPlaceOf(m))); goBtn.style.display = 'none'; onDone?.(end); }
    else if (end && end.done && vm) { const w = vmRemove ? t('The virtual microphone is removed from {machine}', { machine: installPlaceOf(m) }) : t('{app} is installed on {machine}', { app: end.label || plan.label || '', machine: installPlaceOf(m) }) + (end.defaultsKept ? ` · ${t('Kept your default speaker and microphone')}` : ''); note.textContent = w; showToast(w); goBtn.style.display = 'none'; onDone?.(end); } // lane stream-mic-road
    else if (end && end.done && xp) { note.textContent = t('xpra {version} is installed on {machine}', { version: end.installed || '', machine: name }); showToast(t('xpra is installed on {machine}', { machine: name })); onDone?.(); }
    else if (end && end.done) { note.textContent = t('{app} is installed on {machine}', { app: end.label || appLabel, machine: installPlaceOf(m) }); showToast(t('{app} is installed on {machine}', { app: end.label || appLabel, machine: installPlaceOf(m) })); onDone?.(); }
    else if (end && end.code === 'plan_changed' && end.plan && Array.isArray(end.plan.commands)) {
      // verify-r6 I1: the machine's plan moved after the dialog showed it — NOTHING ran; the new commands replace the old
      // ones above the button, and the next press names THEM
      plan = end.plan; shownDigest = end.digest || null;
      pre.textContent = plan.commands.join('\n');
      log.style.display = 'none';
      note.textContent = installRefusalText('plan_changed', what); note.classList.add('is-bad');
      showToast(installRefusalText('plan_changed', what), { type: 'error' });
      goBtn.disabled = false; copyBtn.disabled = false;
    }
    else { note.textContent = (end && ((isApp ? appRefusalText(end.code) : vm ? micInstallRefusalText(end.code, !!plan.adminDialog) : installRefusalText(end.code, what)) || end.error)) || t('The install ended without an answer — the log above says what ran'); note.classList.add('is-bad'); showToast(vm ? t('The virtual microphone did not finish on {machine} — the dialog says why', { machine: name }) : isApp ? t('It did not finish on {machine} — the dialog says why', { machine: name }) : xp ? t('The xpra install on {machine} failed', { machine: name }) : t('The LibreOffice install on {machine} failed', { machine: name }), { type: 'error' }); goBtn.disabled = false; copyBtn.disabled = false; }
  };
  void iclose;
}

const patchUserState = (patch) => fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});

/** `opts.file` (§7.9, FILE MODE) = `{ path, host, module, label, hostLabel? }` — the document src/lib/open-with.js could not open
 *  straight away (`opts.refusal` = `{code, error}` — the server's answer, said in words at the top). */
export async function showLaunchDialog(app, opts = {}) {
  const doc = opts && opts.file && typeof opts.file === 'object' && opts.file.path ? opts.file : null;
  const refusal = doc && opts.refusal && opts.refusal.code ? opts.refusal : null;
  const { overlay, body, close } = createModalShell({ id: 'desktop-launch-dialog', title: doc ? t('Open with LibreOffice') : t('Apps'), dialogClass: 'desktop-launch', escapeToClose: true });
  // design 009 §B3: apps first — the head row (machines + "Install an app…"), Running, Apps, Browsers, Your installed
  // apps, Advanced; the intro, the sharing default, the backend's line and the real-desktop line live in the FOOTER
  body.innerHTML = `
    <div class="desktop-launch-banner is-empty"></div>
    <div class="desktop-launch-head">
      <div class="desktop-launch-machines" role="group" aria-label="${escHtml(t('Machine'))}"><span class="desktop-launch-machines-label">${escHtml(t('Run on'))}</span></div>
      <label class="desktop-launch-size"><span class="desktop-launch-size-label">${escHtml(t('Picture size'))}</span><select class="desktop-launch-size-select"></select></label>
      <button type="button" class="btn-create desktop-launch-install-app">${escHtml(t('Install an app…'))}</button>
    </div>
    <p class="desktop-launch-size-hint" hidden>${escHtml(t('Fixed pixels, scaled to fit the pane; an agent sees exactly this size'))}</p>
    <div class="desktop-launch-avail-head"></div>
    <div class="desktop-launch-install is-empty"></div>
    <section class="desktop-launch-sec desktop-launch-running-sec is-empty">
      <h4>${escHtml(t('Running'))}<span class="desktop-launch-count"></span></h4>
      <div class="desktop-launch-running"></div>
    </section>
    <section class="desktop-launch-sec desktop-launch-catalog-sec">
      <h4>${escHtml(t('Apps'))}</h4>
      <p class="desktop-launch-catalog-note">${escHtml(t('Installed through VibeSpace or registered with it — kept across a rebuild where it can be, with their launch options'))}</p>
      <input type="search" class="desktop-launch-filter" placeholder="${escHtml(t('Filter apps'))}" aria-label="${escHtml(t('Filter apps'))}" autocomplete="off" spellcheck="false">
      <div class="desktop-launch-registry desktop-launch-grid"></div>
    </section>
    <section class="desktop-launch-sec desktop-launch-seen-sec is-empty">
      <h4><span class="desktop-launch-seen-title"></span><span class="desktop-launch-seen-state" hidden>${UI_ICONS.refresh}<span>${escHtml(t('listing…'))}</span></span><button type="button" class="desktop-launch-seen-recheck">${escHtml(t('Check again'))}</button></h4>
      <p class="desktop-launch-seen-more" hidden><span class="desktop-launch-seen-more-text"></span> <button type="button" class="desktop-launch-seen-show"></button></p>
      <p class="desktop-launch-seen-note">${escHtml(t('Found on this machine but not registered: Add to VibeSpace… to keep it, with its launch options and how to remove it'))}</p>
      <div class="desktop-launch-seen desktop-launch-grid"></div>
    </section>
    <section class="desktop-launch-sec desktop-launch-browsers-sec is-empty">
      <h4>${escHtml(t('Browsers'))}</h4>
      <p class="desktop-launch-browser-note">${escHtml(browserNote())}</p>
      <div class="desktop-launch-browser-opts">
        <label class="desktop-launch-field desktop-launch-url-field"><span>${escHtml(t('Open URL (optional)'))}</span><input type="url" class="desktop-launch-url" placeholder="https://" autocomplete="off" spellcheck="false"></label>
        <label class="desktop-launch-check"><input type="checkbox" class="desktop-launch-keep-profile"><span>${escHtml(t('Keep the profile after it closes'))}</span></label>
      </div>
      <div class="desktop-launch-browsers desktop-launch-grid"></div>
    </section>
    <section class="desktop-launch-sec desktop-launch-apps-sec">
      <h4>${escHtml(t('Your installed apps'))}</h4>
      <p class="desktop-launch-apps-note">${escHtml(t('Apps you install here are kept by VibeSpace: they come back by themselves after this machine is rebuilt. An agent can only propose one — you approve it.'))}</p>
      <div class="desktop-launch-apps"></div>
    </section>
    <div class="desktop-launch-adv">
      <button type="button" class="desktop-launch-adv-toggle" aria-expanded="false" aria-controls="desktop-launch-adv-body">${UI_ICONS.chevronDown}<span>${escHtml(t('Advanced: run any command'))}</span></button>
      <div class="desktop-launch-adv-body collapsed" id="desktop-launch-adv-body">
        <div class="desktop-launch-cols">
          <div class="desktop-launch-col">
            <h4>${escHtml(t('Run a command'))}</h4>
            <label class="desktop-launch-field"><span>${escHtml(t('Command'))}</span><input type="text" class="desktop-launch-exec" placeholder="xterm" autocomplete="off" spellcheck="false"></label>
            <label class="desktop-launch-field"><span>${escHtml(t('Arguments'))}</span><input type="text" class="desktop-launch-args" placeholder="-fa Monospace -fs 12" autocomplete="off" spellcheck="false"></label>
            <label class="desktop-launch-field"><span>${escHtml(t('Working directory'))}</span><input type="text" class="desktop-launch-cwd" placeholder="~" autocomplete="off" spellcheck="false"></label>
            <div class="desktop-launch-actions"><button class="btn-create desktop-launch-run">${escHtml(t('Launch'))}</button></div>
          </div>
          <div class="desktop-launch-col">
            <h4>${escHtml(t('Recent'))}</h4>
            <div class="desktop-launch-recents"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="desktop-launch-foot">
      <p class="desktop-launch-intro">${escHtml(t('Opens a graphical program from this machine in a VibeSpace window you drive with your mouse and keyboard — agents cannot see it unless you share it. Click an application below to open it, or use “Advanced” to run any command.'))}</p>
      <div class="desktop-launch-share-row"></div>
      <div class="desktop-launch-avail"></div>
      <section class="desktop-launch-sec desktop-launch-desk-sec">
        <h4>${escHtml(t('Agents on your real desktop'))}<span class="desktop-launch-desk-state"></span></h4>
        <div class="desktop-launch-desk"></div>
      </section>
    </div>`;
  const $ = (sel) => body.querySelector(sel);
  const seenSec = $('.desktop-launch-seen-sec'), seenEl = $('.desktop-launch-seen'), filterIn = $('.desktop-launch-filter'); // lane apps-launcher-witness
  const availEl = $('.desktop-launch-avail'), regEl = $('.desktop-launch-registry'), runEl = $('.desktop-launch-running'), recEl = $('.desktop-launch-recents');
  const browsersSec = $('.desktop-launch-browsers-sec'), browsersEl = $('.desktop-launch-browsers'), urlIn = $('.desktop-launch-url'), keepIn = $('.desktop-launch-keep-profile');
  const runSec = $('.desktop-launch-running-sec'), countEl = $('.desktop-launch-count');
  const machinesEl = $('.desktop-launch-machines'), installEl = $('.desktop-launch-install');
  const availHead = $('.desktop-launch-avail-head'), availFoot = $('.desktop-launch-foot'), bannerEl = $('.desktop-launch-banner'), installAppBtn = $('.desktop-launch-install-app');
  let host = doc && doc.host ? String(doc.host) : 'local'; // lane C2: the machine the catalog + a launch are for (§7.9: a document's own machine)
  let machines = [];        // GET /api/desktop/machines (the PURE picker verdicts)
  let listError = null;     // { code, error } when the chosen machine's list failed
  const machineOf = (id) => machines.find((m) => m.hostId === id) || { hostId: id, label: id };
  const advToggle = $('.desktop-launch-adv-toggle'), advBody = $('.desktop-launch-adv-body');
  const execIn = $('.desktop-launch-exec'), argsIn = $('.desktop-launch-args'), cwdIn = $('.desktop-launch-cwd'), runBtn = $('.desktop-launch-run');
  pathField(cwdIn, { host: () => (host && host !== 'local' ? host : null), kind: 'folder', create: 'never', id: 'desktop-launch-cwd', onCommit: (info) => { if (info && info.path && cwdIn.value !== info.path) cwdIn.value = info.path; } }); // lane path-field: the launch's machine

  // §7.9 FILE MODE: the intro names the document; browsers + "Advanced" are not for a document (a document is not a command)
  if (doc) {
    const intro = $('.desktop-launch-intro');
    if (intro) body.prepend(intro); // a document's own sentence leads (the footer's intro is the catalog's)
    installAppBtn.style.display = 'none'; // installing apps: not this dialog's question
    if (intro) intro.textContent = t('Opens {file} in LibreOffice in a VibeSpace window, on the machine that holds it — you edit it there, and Save writes it back in place.', { file: doc.label || doc.path });
    const note = document.createElement('p'); note.className = 'desktop-launch-file-note';
    const said = refusal && refusal.code !== 'app-absent' ? (openWithRefusalText(refusal.code, { file: doc.label, machine: doc.hostLabel || null }) || refusal.error || '') : '';
    note.textContent = said; note.style.display = said ? '' : 'none';
    intro?.after(note);
    $('.desktop-launch-browsers-sec').style.display = 'none';
    $('.desktop-launch-adv').style.display = 'none';
    $('.desktop-launch-desk-sec').style.display = 'none'; // agents on the real desktop: not this dialog's question
    $('.desktop-launch-apps-sec').style.display = 'none'; // installing apps: not this dialog's question
    filterIn.style.display = 'none'; seenSec.style.display = 'none'; // a document opens in LibreOffice only
  }
  // Layer 0 apps: the "Your installed apps" section, for the chosen machine (re-mounted when the machine changes)
  let appsSec = null;
  // lane apps-ui-runner-red (mirror-260): the section sits BELOW the catalog, and its own GET /api/apps answers first — shown
  // at once, its doors moved down ~270 px when the catalog landed, and a press aimed at Install an app… hit the
  // "Installed outside VibeSpace" group that slid under the pointer (nothing opened, nothing said). The section waits
  // for the catalog's answer (or its refusal) for the machine it shows before it appears — nothing above it grows after
  const appsSecEl = $('.desktop-launch-apps-sec');
  const holdApps = (answered) => {
    if (doc) return;
    appsSecEl.hidden = true;
    const asked = host;
    Promise.resolve(answered).finally(() => { if (asked === host && overlay.isConnected) appsSecEl.hidden = false; });
  };
  const mountApps = () => {
    if (doc) return;
    try { appsSec?.dispose(); } catch { }
    const elx = body.querySelector('.desktop-launch-apps');
    if (elx) appsSec = renderAppsSection(app, elx, { host, machine: machineOf(host), onChange: () => { if (overlay.isConnected) refresh(); }, onState: renderBanner });
  };
  // design 009 §C: Layer 1's ONE banner — an interrupted install, at the top of the dialog (PURE appsBannerModel)
  function renderBanner(st) {
    const b = appsBannerModel(st);
    bannerEl.replaceChildren();
    bannerEl.classList.toggle('is-empty', !b);
    if (!b) return;
    const said = document.createElement('span'); said.className = 'desktop-launch-banner-text'; said.textContent = b.text;
    const go = document.createElement('button'); go.type = 'button'; go.className = 'btn-create desktop-launch-banner-go'; go.textContent = b.label;
    go.onclick = () => showInstallDialog(machineOf(host), { what: 'app', request: b.request, onDone: () => { if (overlay.isConnected) { refresh(); appsSec?.refresh(); } } });
    bannerEl.append(said, go);
  }
  installAppBtn.onclick = () => openAppSearch(app, machineOf(host), { onDone: () => { if (overlay.isConnected) { refresh(); appsSec?.refresh(); } } });
  const docMachineName = () => (doc ? (doc.hostLabel || machineInSentence(machineOf(doc.host || 'local'))) : '');
  let data = null;
  let recents = [];
  let advancedOpen = false;
  const busy = new Set();      // stop in flight, by session id
  const launching = new Set(); // card launch in flight, by registry row id
  let refocusScale = null;     // lane D: the card whose default-scale control had the keyboard before a re-render

  // lane D: a card's DEFAULT SCALE control — one sibling button per card (the app's id names it); its menu stores the
  // choice (never launches); the dialog re-renders from the shared loader, on this client and on every other one
  const cardScaleControl = (row) => {
    const key = scaleKeyOf({ appId: row.id });
    const cur = scaleChoiceOf(appPrefs(SCALE_PREF_KEY), key);
    const c = document.createElement('button'); c.type = 'button';
    c.className = 'desktop-launch-card-scale' + (cur !== 'auto' ? ' has-default' : '');
    c.dataset.scaleFor = row.id;
    if (cur === 'auto') c.innerHTML = UI_ICONS.more; else c.textContent = cardScaleText(cur); // design 009 §B4: ⋯ — or the default it starts at
    c.title = cardScaleTitle(catalogLabel(row), cur);
    c.setAttribute('aria-label', c.title);
    c.setAttribute('aria-haspopup', 'menu');
    c.onclick = (e, at = null) => {
      e.stopPropagation();
      const r = at || c.getBoundingClientRect();
      const rows = scaleDefaultMenuModel(appPrefs(SCALE_PREF_KEY), key).map((m) => ({ label: cardScaleRowLabel(m), disabled: m.disabled, action: () => {
        refocusScale = row.id;
        saveAppPrefs(SCALE_PREF_KEY, (map) => setScaleChoice(map, key, m.choice), t('Could not save the app’s default scale'));
      } }));
      const own = cardMenuItems(row); // lane app-register-ui: the card's variants above, Add / Remove / Show command below
      const pop = showContextMenu(r.left, r.bottom + 2, tidyMenu([...own.head, { label: t('Default scale for {app}', { app: catalogLabel(row) }), disabled: true }, ...rows, ...own.tail]));
      // Esc closes THIS menu only: the dialog's own Esc (createModalShell's overlay listener) would close the whole dialog
      const onEsc = (ev) => {
        if (!pop.isConnected) { document.removeEventListener('keydown', onEsc, true); return; }
        if (ev.key !== 'Escape') return;
        ev.stopPropagation(); ev.preventDefault(); pop.remove(); document.removeEventListener('keydown', onEsc, true); focusQuiet(c);
      };
      document.addEventListener('keydown', onEsc, true);
    };
    return c;
  };

  // lane app-register-ui: a card's own menu rows (cardMenuModel), worded + wired; `tidyMenu` drops doubled separators
  const tidyMenu = (items) => items.filter((x, i, a) => !x.separator || (i > 0 && i < a.length - 1 && !a[i - 1].separator));
  const cardMenuItems = (row) => {
    const m = doc ? { head: [], tail: [] } : cardMenuModel(row);
    const off = !!listError || !data?.availability?.backend || launching.has(row.id);
    // rel254 verify F3: a variant row / Show command carries what it RUNS (env, argv, cwd) as its tooltip; a changed row runs no variant
    const item = (x) => ({ label: cardMenuRowLabel(x), disabled: x.kind === 'variant' && (off || !!row.changed), ...(x.kind === 'variant' ? { title: runLine(row, (row.launch || []).find((v) => String(v.id) === x.id) || null) } : x.kind === 'command' ? { title: runLine(row) } : {}), action: () => cardMenuAct(row, x) });
    return { head: m.head.length ? [...m.head.map(item), { separator: true }] : [], tail: m.tail.length ? [{ separator: true }, ...m.tail.map(item)] : [] };
  };
  const cardMenuAct = async (row, x) => {
    if (x.kind === 'variant') { // the chosen variant, through the same door as the card's press (badges unchanged)
      launching.add(row.id); render();
      const r = await launch({ appId: row.id, variant: x.id }, null);
      if (!r) { launching.delete(row.id); render(); }
    } else if (x.kind === 'adopt') showAdoptDialog(row, { host, onDone: () => { if (overlay.isConnected) refresh(); } });
    else if (x.kind === 'remove' || x.kind === 'forget') removeRegistered(row, { forget: x.kind === 'forget', onDone: async () => { if (!overlay.isConnected) return null; await refresh(); return data; } });
    else { const line = runLine(row); const ok = await copyText(line); showToast(ok === false ? line : t('Command copied: {cmd}', { cmd: line }), ok === false ? { type: 'error' } : undefined); } // F3: with its env / cwd
  };
  const cardMenuControl = (row) => {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'desktop-launch-card-menu';
    c.innerHTML = UI_ICONS.more;
    c.title = t('More for {app}', { app: catalogLabel(row) }); c.setAttribute('aria-label', c.title); c.setAttribute('aria-haspopup', 'menu');
    c.onclick = (e, at = null) => {
      e.stopPropagation();
      const r = at || c.getBoundingClientRect();
      const own = cardMenuItems(row);
      const pop = showContextMenu(r.left, r.bottom + 2, tidyMenu([...own.head, ...own.tail]));
      const onEsc = (ev) => { // Esc closes THIS menu only (the dialog's own Esc would close the whole dialog)
        if (!pop.isConnected) { document.removeEventListener('keydown', onEsc, true); return; }
        if (ev.key !== 'Escape') return;
        ev.stopPropagation(); ev.preventDefault(); pop.remove(); document.removeEventListener('keydown', onEsc, true); focusQuiet(c);
      };
      document.addEventListener('keydown', onEsc, true);
    };
    return c;
  };

  // Insurance for every programmatic focus in this dialog: preventScroll. The
  // 2026-09-14 defect was the UA scrolling `.dialog` (overflow:hidden is still
  // a scroll container) to bring a clipped input into view.
  const focusQuiet = (el) => { try { el?.focus({ preventScroll: true }); } catch { el?.focus(); } };
  const setAdvanced = (open, { persist = false } = {}) => {
    advancedOpen = !!open;
    advBody.classList.toggle('collapsed', !advancedOpen);
    advToggle.setAttribute('aria-expanded', advancedOpen ? 'true' : 'false');
    if (persist) patchUserState({ [ADVANCED_KEY]: advancedOpen });
  };
  advToggle.onclick = () => { setAdvanced(!advancedOpen, { persist: true }); if (advancedOpen) focusQuiet(execIn); };

  // ── lane launch-picture-size: THE PICTURE SIZE a launch from this dialog carries — the head's select over the ONE size table
  // (src/desktop-pin.js SIZE_CHOICES). Untouched, each app launches at the size it REMEMBERS (user state `desktopAppPin`, by the
  // launch key — a browser row per browser) and its card names it; touched, every launch takes the one choice and the app
  // remembers it. A rung that cannot hold a pin refuses by name in the banner — never a greyed select.
  const sizeSel = $('.desktop-launch-size-select'), sizeHint = $('.desktop-launch-size-hint');
  let sizeTouched = false, sizeChoice = 'pane', sizeCustom = null;
  const rememberedPins = () => appPrefs(PIN_PREF_KEY) || {};
  const anyRememberedPin = () => Object.keys(rememberedPins()).length > 0;
  const renderSize = () => {
    const each = !sizeTouched && anyRememberedPin();
    const opts = each ? [{ value: '', label: t('Each app’s last size') }] : [];
    for (const c of SIZE_CHOICES) {
      if (c.custom && sizeCustom) opts.push({ value: `${sizeCustom.w}x${sizeCustom.h}`, label: sizeWords(sizeCustom) });
      opts.push({ value: c.id, label: sizeChoiceLabel(c) });
    }
    sizeSel.replaceChildren(...opts.map((o) => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; return op; }));
    sizeSel.value = each ? '' : sizeChoice;
    sizeHint.hidden = !(each || (sizeTouched && launchPinOf(sizeChoice).pin));
    sizeSel.title = t('Fixed pixels, scaled to fit the pane; an agent sees exactly this size');
  };
  /** Each catalog / browser card that will launch at a REMEMBERED size names it (only while the select is untouched). */
  const paintSizeCards = () => {
    for (const host of [regEl, browsersEl]) for (const card of host.querySelectorAll('.desktop-launch-card[data-app-id]')) {
      card.querySelector('.desktop-launch-card-size')?.remove();
      const p = sizeTouched ? null : pinChoiceOf(rememberedPins(), launchKeyOf({ appId: card.dataset.appId }));
      if (!p) continue;
      const chip = document.createElement('span'); chip.className = 'desktop-launch-card-size'; chip.textContent = sizeWords(p);
      chip.title = t('Starts at {size} — the picture size it last launched with; change it with “Picture size” above', { size: sizeWords(p) });
      card.appendChild(chip);
    }
  };
  const setSize = (choice) => { sizeTouched = true; sizeChoice = choice; renderSize(); paintSizeCards(); };
  sizeSel.onchange = async () => {
    const v = sizeSel.value;
    if (v === '') { sizeTouched = false; sizeChoice = 'pane'; renderSize(); paintSizeCards(); return; }
    if (v !== 'custom') { setSize(v); return; }
    const p = await askCustomSize(sizeCustom);
    if (!overlay.isConnected) return;
    if (p) { sizeCustom = p; setSize(`${p.w}x${p.h}`); } else renderSize(); // cancelled: the select shows what still applies
  };
  renderSize();
  /** The size a launch of the app `key` carries ({w, h} | null = follow the pane). */
  const pinFor = (key) => (sizeTouched ? launchPinOf(sizeChoice).pin : pinChoiceOf(rememberedPins(), key));
  const PIN_REFUSALS = new Set(['pin_unsupported', 'bad-size', 'size_out_of_bounds']);
  /** A launch's size refused by the machine — said in the dialog's banner, with the door that changes it. */
  const sayPinRefusal = (r) => {
    bannerEl.replaceChildren(); bannerEl.classList.remove('is-empty');
    const said = document.createElement('span'); said.className = 'desktop-launch-banner-text';
    said.textContent = r.code === 'pin_unsupported' ? t('A fixed picture size needs the xpra (or Xvfb) display backend — here the picture follows the pane. Choose “Follow the pane”, or install xpra.') : String(r.error || r.code);
    said.title = String(r.error || r.code); // the machine's exact sentence (it names the display backend)
    const go = document.createElement('button'); go.type = 'button'; go.className = 'btn-create desktop-launch-banner-go'; go.textContent = t('Follow the pane');
    go.onclick = () => { setSize('pane'); bannerEl.replaceChildren(); bannerEl.classList.add('is-empty'); };
    bannerEl.append(said, go);
  };

  const launch = async (payload, recent) => {
    runBtn.disabled = true;
    // lane E (D2): the share this app launches with — the row's choice, else what the app remembers (this machine only)
    const shareKey = launchKeyOf(payload);
    const share = shareRow.shareFor(shareKey);
    // HiDPI (2.369.158): THIS client's devicePixelRatio rides the launch; round 3 A3: and its UI scale — under
    // `desktop.appScale: auto` the app's scale is derived from dpr × uiScale (VibeSpace's own effective scale here);
    // lane D: and the app's OWN default scale when the person chose one (a card's control, a window's "Make n× the
    // default") — the user state is read once per page; a click before it answered waits for it (≤ 3 s)
    await Promise.race([appPrefsReady(), new Promise((r) => setTimeout(r, 3000))]);
    const scaleChoice = launchScaleChoice(appPrefs(SCALE_PREF_KEY), payload);
    const pin = pinFor(shareKey); // lane launch-picture-size: the select's choice, else what this app remembers
    const r = await fetchJson('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, dpr: launchDpr(), uiScale: launchUiScale(), ...(scaleChoice != null ? { scaleChoice } : {}), ...(host !== 'local' ? { host } : {}), ...(share ? { share } : {}), ...(pin ? { pin: `${pin.w}x${pin.h}` } : {}) }) });
    runBtn.disabled = false;
    if (r && r.error && PIN_REFUSALS.has(r.code)) { sayPinRefusal(r); return null; }
    if (!r || r.error) { showToast(r?.error || t('Could not launch the application'), { type: 'error' }); return null; }
    if (r.attached) { close(); app.openDesktopApp(r.id); showToast(t('It was already running — its window is open')); return r; } // lane app-launch-singleton: the keeper found it running
    shareRow.remember(shareKey, share);
    shareRow.announce(shareKey, share, r); // lane E verify: a launch that applied the app's REMEMBERED share says so
    if (sizeTouched && shareKey) saveAppPrefs(PIN_PREF_KEY, (map) => setPinChoice(map, shareKey, pin), t('Could not remember the picture size for this app')); // lane launch-picture-size: the next launch of this app starts there
    if (r.reachError) showToast(t('The app started, but sharing it failed: {why}', { why: r.reachError.error || '' }), { type: 'error' });
    if (recent) {
      recents = pushRecent(recents, { ...recent, label: r.label });
      patchUserState({ [RECENTS_KEY]: recents });
    }
    close();
    app.openDesktopApp(r.id);
    return r;
  };

  const shareRow = mountLaunchShareRow(app, $('.desktop-launch-share-row'), { isLocal: () => host === 'local' });
  // lane desktop-picker-instant: each machine's button is KEYED by hostId and re-used — a probe that lands later (the broadcast)
  // patches its row in place, never rebuilt under the pointer or the focus
  const machineBtns = new Map();
  const renderMachines = () => {
    shareRow.render(); // lane E: the share row hides for a paired machine (its windows are no agent target)
    if (machines.length < 2) { for (const b of machineBtns.values()) b.remove(); machineBtns.clear(); machinesEl.style.display = 'none'; return; } // this machine only: no picker at all (the dialog as before)
    machinesEl.style.display = '';
    const ids = new Set(machines.map((m) => m.hostId));
    for (const [id, b] of machineBtns) if (!ids.has(id)) { b.remove(); machineBtns.delete(id); }
    const label = machinesEl.querySelector('.desktop-launch-machines-label');
    let at = label ? label.nextElementSibling : machinesEl.firstElementChild;
    for (const m of machines) {
      let b = machineBtns.get(m.hostId);
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'desktop-launch-machine'; machineBtns.set(m.hostId, b); }
      b.dataset.host = m.hostId;
      b.setAttribute('aria-pressed', m.hostId === host ? 'true' : 'false');
      // §7.9 FILE MODE: the app runs WHERE THE FILE IS — every other machine greyed with the reason in words (the PURE
      // verdict's `machine-mismatch`), the file's own machine the one choice
      const otherThanFile = !!doc && m.hostId !== (doc.host || 'local');
      const why = otherThanFile ? t('the file is on {machine}', { machine: docMachineName() }) : machineWhyText(m.code);
      const nameEl = document.createElement('span'); nameEl.textContent = machineName(m); // a host's name is peer-controlled text
      const kids = [nameEl];
      if (why && (otherThanFile || m.code !== 'ready')) { const w = document.createElement('span'); w.className = 'desktop-launch-machine-why'; w.textContent = why; kids.push(w); }
      b.replaceChildren(...kids);
      b.disabled = otherThanFile || !m.selectable;
      const probe = machineProbeText(m); // 「上次检查 N 秒前 · 探测 M ms」
      b.title = (!b.disabled ? machineName(m) : `${machineName(m)} — ${why}`) + (probe && m.code !== 'checking' ? `\n${probe}` : '');
      b.onclick = () => {
        // design 014 D1: a Windows / macOS row opens ITS DESKTOP's dialog — the app catalog stays on the machine it shows
        if (m.desktop && !b.disabled) { showMachineDesktopDialog(app, m, { install: (mm, o) => showInstallDialog(mm, o), closeOpener: close, recheck: async (id) => { const ms = await recheckMachines(id); if (!ms) return null; if (overlay.isConnected) { machines = ms; renderMachines(); } return ms.find((x) => x.hostId === id) || null; } }); return; }
        if (b.disabled || host === m.hostId) return; host = m.hostId; data = data ? { apps: data.apps } : null; listError = null; renderMachines(); render(); holdApps(refresh()); mountApps(); };
      if (at === b) at = b.nextElementSibling; else machinesEl.insertBefore(b, at); // in order: a row already in place is never moved
    }
  };
  const renderInstall = () => {
    installEl.innerHTML = '';
    const m = machineOf(host);
    const show = !listError && data && data.availability && installOfferFor(data.availability, m);
    installEl.classList.toggle('is-empty', !show);
    if (!show) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'file-tool-btn desktop-launch-install-btn';
    b.textContent = t('Install xpra on {machine}…', { machine: machineName(m) });
    b.title = t('Shows the install plan first — nothing runs until you confirm');
    b.onclick = () => showInstallDialog(m, { onDone: () => { if (overlay.isConnected) refresh(); } });
    installEl.appendChild(b);
  };
  // ── running ── (§7.9 verify: its OWN renderer, rebuilt only when what it shows changed — the 5 s tick's
  // `desktop-apps-updated` used to rebuild the WHOLE dialog, catalog included, so a press that straddled a broadcast
  // lost its click: the card under the pointer was replaced between pointerdown and pointerup — measured, the Launch of
  // an xterm card did nothing in 4 of 7 runs once the catalog grew; a broadcast now touches the Running rows only, and
  // only when an id / label / state / host / pending Stop / the slot count moved)
  let runKey = null;
  // lane app-launch-singleton: the CARDS follow the instances too (an agent's start, an exit, a quick exit) — only when that SET
  // moved (never on the 5 s tick alone), and never under a held press: a press in flight defers the rebuild to its release
  // (the rebuild between pointerdown and pointerup is what ate a click — the rule renderRunning keeps for the catalog)
  let cardKey = null, cardsOwed = false, pressing = false;
  const cardSig = (apps) => JSON.stringify((apps || []).filter((a) => a && (['launching', 'ready', 'unknown-host-offline'].includes(a.state) || a.quickExit)).map((a) => [a.id, a.appId, a.state, a.hostId, a.display, !!a.quickExit]));
  const cardsFollow = () => {
    const k = cardSig(data && data.apps);
    if (doc || k === cardKey) return;
    if (pressing) { cardsOwed = true; return; }
    render();
  };
  overlay.addEventListener('pointerdown', () => { pressing = true; }, true);
  overlay.addEventListener('pointerup', () => { pressing = false; if (cardsOwed) { cardsOwed = false; setTimeout(() => { if (overlay.isConnected) cardsFollow(); }, 0); } }, true);
  const renderRunning = () => {
    const capUsed = data?.cap?.used ?? 0, cap = data?.cap?.cap ?? 0;
    if (!doc && cardKey !== null && cardSig(data && data.apps) !== cardKey) { cardsFollow(); return; } // lane app-launch-singleton: the set moved — the cards (and these rows) follow
    const live = (data?.apps || []).filter((a) => a.state === 'ready' || a.state === 'launching' || a.state === 'unknown-host-offline'); // lane C2: an app whose machine is not answering is still listed
    const key = JSON.stringify([live.map((a) => [a.id, a.label, a.exec, a.state, a.hostId, a.hostLabel, a.display, a.launchedBy, busy.has(a.id)]), cap, capUsed]);
    if (key === runKey) return;
    runKey = key;
    runEl.innerHTML = '';
    for (const a of live) {
      const row = document.createElement('div'); row.className = 'desktop-launch-run-row';
      const ab = agentBrowserText(a); // lane e2a r3 (#11): the agent's own browser is marked in the running list
      row.innerHTML = `<span class="desktop-app-row-label">${escHtml(a.label || a.exec)}${ab ? `<span class="desktop-launch-host-chip">${escHtml(ab)}</span>` : ''}${a.hostLabel && a.hostId !== 'local' ? `<span class="desktop-launch-host-chip">${escHtml(t('on {machine}', { machine: a.hostLabel }))}</span>` : ''}</span><span class="desktop-app-row-state">${escHtml(a.state === 'ready' ? runningWhereText(a) : a.state === 'unknown-host-offline' ? t('machine not answering') : t('starting'))}</span>`;
      const open = document.createElement('button'); open.className = 'file-tool-btn'; open.style.cssText = 'width:auto;padding:0 8px;font-size:10px'; open.textContent = t('Open');
      open.onclick = () => { close(); app.openDesktopApp(a.id); };
      const stop = document.createElement('button'); stop.className = 'file-tool-btn desktop-app-stop'; stop.style.cssText = 'width:auto;padding:0 8px;font-size:10px'; stop.textContent = t('Stop');
      stop.disabled = busy.has(a.id);
      stop.onclick = async () => {
        busy.add(a.id); stop.disabled = true;
        await stopDesktopApp(a.id, { name: a.label || a.exec }); // B-04da ④: LibreOffice is asked first
        busy.delete(a.id);
        refresh();
      };
      row.append(open, stop);
      runEl.appendChild(row);
    }
    runSec.classList.toggle('is-empty', !live.length);
    // the count is the LIVE list's (the broadcast refreshes `data.apps`, never the cap snapshot taken at open — a starting session read "0 of 6")
    countEl.textContent = live.length ? (cap ? t('{used} of {cap} slots in use', { used: Math.max(capUsed, live.length), cap }) : t('{n} running', { n: live.length })) : '';
  };
  // lane apps-dialog-fast: the "Installed outside VibeSpace" group is patched IN PLACE (`render({seenOnly})`, keyed cards)
  // when its listing lands (the open never waited for it) or Check again answers; the distro's own entries wait behind
  // "Show them" (the person's choice, user state)
  let showSystem = false, rechecking = false;
  const render = ({ seenOnly = false } = {}) => {
    if (!seenOnly) cardKey = cardSig(data && data.apps); // lane app-launch-singleton: the instance set these cards show
    const mName = host === 'local' ? null : machineName(machineOf(host));
    availEl.textContent = listError ? machineErrorText(listError.code, mName || machineName(null), listError.error) : availabilityText(data && data.availability, mName);
    const availBad = !!listError || !!(data && data.availability && !data.availability.backend);
    availEl.classList.toggle('desktop-launch-avail-bad', availBad);
    // design 009 §B3: a backend that works is footer small print; one that is missing or fell back is said at the top
    if (availBad || !!(data && data.availability && data.availability.fallbackWhy)) { if (availEl.parentElement !== availHead) availHead.appendChild(availEl); }
    else { const shareEl = availFoot.querySelector('.desktop-launch-share-row'); if (availEl.previousElementSibling !== shareEl) shareEl.after(availEl); }
    renderInstall();
    const dead = !!listError || !data?.availability?.backend;
    const scales = !dead && !!data?.availability?.caps?.scales; // lane D: only a rung that scales apps offers a default scale (the row's cell)
    // ── the catalog: applications, then browsers (B-bfe6) under their own heading ──
    if (!seenOnly) { regEl.innerHTML = ''; browsersEl.innerHTML = ''; }
    const seenOld = new Map(seenOnly ? [...seenEl.children].map((w) => [w.dataset.seenKey, w]) : []), seenWant = [];
    if (host === 'local' && data && data.hostName) noteLocalHostName(data.hostName);
    // §7.9 FILE MODE: the document's own LibreOffice row only (its module opens it — the PURE verdict's rule)
    const rows = (data?.registry || []).filter((row) => !doc || (row.office && row.office === doc.module));
    const distroN = rows.filter((row) => row.witnessed && row.distro).length;
    for (const row of rows) {
      if (seenOnly && !row.witnessed) continue;
      if (row.witnessed && row.distro && !showSystem) continue;
      const seenKey = row.witnessed ? JSON.stringify([row.id, row.label, row.exec, row.args, row.available, row.reason, row.source, row.distro, launching.has(row.id), dead, scales, cardKey]) : null; // lane app-launch-singleton: + the instance set the card names
      if (seenKey && seenOld.has(seenKey)) { const w0 = seenOld.get(seenKey); w0.hidden = !launchFilterMatch(row, filterIn.value); seenWant.push(w0); continue; }
      // §7.9: an absent LibreOffice row in FILE MODE is not a dimmed card — ONE plain sentence + "Install LibreOffice on
      // <machine>…" (the owner's rule: never a greyed control with a hint)
      if (doc && !row.available) {
        const box = document.createElement('div'); box.className = 'desktop-launch-office-absent';
        const said = document.createElement('p'); said.className = 'desktop-launch-office-absent-text';
        said.textContent = openWithRefusalText('app-absent', { app: row.label, machine: machineInSentence(machineOf(host)) });
        const ib = document.createElement('button'); ib.type = 'button'; ib.className = 'file-tool-btn desktop-launch-office-install';
        ib.textContent = officeInstallLabel(machineInSentence(machineOf(host)));
        ib.title = t('Shows the install plan first — nothing runs until you confirm');
        ib.onclick = () => showInstallDialog(machineOf(host), { what: row.id, onDone: () => { if (overlay.isConnected) refresh(); } });
        box.append(said, ib);
        regEl.appendChild(box);
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      const isLaunching = launching.has(row.id);
      const unavailable = !row.available || !!row.parkedUntil;
      // lane app-launch-singleton: an instance that runs (an agent's too) is OPENED by the press and named on the card; a
      // launch that ended as it started is said here until the person launches again
      const lv = doc ? null : launchVerdict({ row, apps: data?.apps || [], host });
      const running = !!lv && lv.act === 'attach', held = !!lv && lv.act === 'held';
      const quick = !doc && !running && !isLaunching ? lastQuickExit(row, data?.apps, host) : null;
      b.className = 'desktop-launch-card' + (unavailable ? ' is-unavailable' : '') + (isLaunching ? ' is-launching' : '') + (running ? ' is-running' : '') + (quick || held ? ' is-said' : '');
      // a dimmed BROWSER row says its verdict SHORT and translated (by the server's code); the sentence is its tooltip
      const sub = isLaunching ? t('Launching…') : running ? runningWhereText(lv.target) : held ? t('Already running outside VibeSpace (pid {pid}) — a second start would close at once', { pid: lv.lock.pid }) : quick ? quickExitText(quick, catalogLabel(row)) : row.witnessed || row.registered ? witnessSubText(row) : row.available ? (row.reason || row.exec) : ((row.browser && browserReasonShort(row.reasonCode)) || (row.office && officeReasonShort(row.reasonCode)) || (row.app && appReasonShort(row.reasonCode)) || registryReasonShort(row) || row.reason || t('not on PATH'));
      // faces B: a startable browser card names its face ("Browser app · chromium"); a dimmed one says only its short reason
      const docSub = doc && !isLaunching && !unavailable ? t('opens {file}', { file: doc.label || doc.path }) : null; // §7.9 FILE MODE: the card names the document it opens
      b.innerHTML = `<span class="desktop-launch-card-icon">${isLaunching ? UI_ICONS.refresh : cardIconFor(row.category, row.office)}</span><span class="desktop-launch-card-label">${escHtml(catalogLabel(row))}</span><span class="desktop-launch-card-sub">${docSub !== null ? escHtml(docSub) : escHtml(row.browser && !isLaunching && !unavailable ? `${t('Browser app')} · ${sub}` : sub)}</span>`;
      if (row.app && row.icon && !isLaunching) { // an installed app's own icon — through ONE cookie-only route, set as img.src (never markup)
        const img = document.createElement('img'); img.className = 'desktop-launch-card-img'; img.alt = ''; img.width = 20; img.height = 20; img.decoding = 'async';
        img.onerror = () => img.remove();
        img.src = `/api/apps/icon?host=${encodeURIComponent(host)}&row=${encodeURIComponent(row.id)}`;
        const ic = b.querySelector('.desktop-launch-card-icon'); if (ic) { ic.textContent = ''; ic.appendChild(img); }
      }
      if ((row.witnessed || row.registered) && !isLaunching) { const chip = document.createElement('span'); chip.className = 'desktop-launch-chip'; chip.textContent = witnessSourceText(row.source); b.querySelector('.desktop-launch-card-sub')?.prepend(chip, ' '); } // the source chip leads the command line (the card's grid keeps two rows)
      b.disabled = (unavailable && !running) || dead || isLaunching || held;
      b.setAttribute('aria-disabled', b.disabled ? 'true' : 'false');
      if (isLaunching) b.setAttribute('aria-busy', 'true');
      b.title = row.available ? (row.path || row.exec) : (row.reason || '');
      if (row.browser) b.title = `${b.title ? b.title + ' — ' : ''}${browserNote()}`;
      if (running || held || quick) b.title = `${sub} — ${b.title}`;
      b.dataset.appId = row.id;
      // `again` = the person asked for ANOTHER instance ("Open another"); the card's own press opens a running one — and asks the
      // keeper to (ifRunning: 'attach'), so an instance this dialog has not heard of yet is opened rather than started twice
      const press = async (again = false) => {
        if (!again && running) { close(); app.openDesktopApp(lv.target.id); return; }
        let body = { appId: row.id };
        if (doc) body = { appId: row.id, file: doc.path, fileHost: doc.host || 'local' }; // §7.9: the document opens in it, where it lives
        if (row.browser) {
          const bb = browserLaunchBody(row, { url: urlIn.value, keepProfile: keepIn.checked });
          if (bb.error) { showToast(t('Open URL must be an http:// or https:// address'), { type: 'error' }); focusQuiet(urlIn); return; }
          body = bb.body;
        }
        if (!doc && !again) body = { ...body, ifRunning: 'attach' };
        launching.add(row.id); render();
        const r = await launch(body, null);
        if (!r) { launching.delete(row.id); render(); }
      };
      b.onclick = async () => { if (!b.disabled) await press(false); };
      // lane D: the card + (on a scaling rung) its default-scale control, side by side — a control cannot live INSIDE
      // the card's button, so the grid item is a wrapper holding both
      const wrap = document.createElement('div'); wrap.className = 'desktop-launch-card-wrap';
      wrap.appendChild(b);
      if (scales && !unavailable) { // design 009 §B4: an app that cannot start has no default scale to choose (its name keeps the room)
        const sc = cardScaleControl(row);
        wrap.appendChild(sc);
        // design 009 §B4: a right-click (a long press on a phone) on the card opens the same menu, at the pointer
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); sc.onclick(e, { left: e.clientX, bottom: e.clientY }); });
      }
      // lane app-register-ui: a card with its own rows (variants, Add to VibeSpace…, Remove… / Forget) and no scale
      // control gets the same "…" — a right-click / a long press opens it at the pointer (a dimmed card too: on the wrap)
      if (!doc && !wrap.querySelector('.desktop-launch-card-scale')) {
        const own = cardMenuItems(row);
        if (own.head.length || own.tail.length) {
          const mc = cardMenuControl(row); wrap.appendChild(mc);
          wrap.addEventListener('contextmenu', (e) => { if (e.target === mc) return; e.preventDefault(); mc.onclick(e, { left: e.clientX, bottom: e.clientY }); });
        }
      }
      if (row.witnessed && !doc) { // desk width: the adopt beside the card (a phone reaches it in the long-press menu)
        const ab = document.createElement('button'); ab.type = 'button'; ab.className = 'desktop-launch-card-adopt';
        ab.textContent = t('Add…'); ab.title = t('Add to VibeSpace…'); ab.setAttribute('aria-label', t('Add {app} to VibeSpace…', { app: catalogLabel(row) }));
        ab.onclick = (e) => { e.stopPropagation(); cardMenuAct(row, { kind: 'adopt' }); };
        wrap.appendChild(ab);
      }
      // §7.9: a LibreOffice row that is not installed carries its install beside it (the plan first, never a silent apt)
      if (row.office && !row.available && !dead) {
        const ib = document.createElement('button'); ib.type = 'button'; ib.className = 'desktop-launch-card-install';
        ib.textContent = t('Install…'); ib.title = officeInstallLabel(machineInSentence(machineOf(host)));
        ib.setAttribute('aria-label', ib.title);
        ib.onclick = (e) => { e.stopPropagation(); showInstallDialog(machineOf(host), { what: row.id, onDone: () => { if (overlay.isConnected) refresh(); } }); };
        wrap.appendChild(ib);
      }
      if (running) { // lane app-launch-singleton (the reporter's addendum): EVERY live instance, an agent's too — where, who, Open, Close
        const runs = document.createElement('div'); runs.className = 'desktop-launch-card-runs';
        const btn = (cls, text, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls; x.textContent = text; x.onclick = (e) => { e.stopPropagation(); fn(x); }; return x; };
        for (const a of lv.running) {
          const line = document.createElement('div'); line.className = 'desktop-launch-card-run'; line.dataset.runId = a.id;
          const words = document.createElement('span'); words.className = 'desktop-launch-card-run-text'; words.textContent = lv.running.length > 1 ? runningWhereText(a) : ''; words.title = runningWhereText(a); // one instance: the card's own line says it
          const stop = btn('desktop-launch-card-run-stop', t('Close'), async (x) => { x.disabled = true; busy.add(a.id); await stopDesktopApp(a.id, { name: a.label || a.exec }); busy.delete(a.id); refresh(); });
          stop.disabled = busy.has(a.id);
          line.append(words, btn('desktop-launch-card-run-open', t('Open'), () => { close(); app.openDesktopApp(a.id); }), stop);
          runs.appendChild(line);
        }
        if (lv.again && !unavailable && !dead) runs.appendChild(btn('desktop-launch-card-run-again', t('Open another'), () => press(true)));
        wrap.classList.add('has-running');
        wrap.appendChild(runs);
      }
      if (running || held || quick) wrap.classList.add('is-wide'); // lane app-launch-singleton: its words get the grid's whole row
      wrap.hidden = !doc && !launchFilterMatch(row, filterIn.value); // the filter box, across Apps and the witnessed group
      if (row.witnessed) { wrap.dataset.seenKey = seenKey; seenWant.push(wrap); } else (row.browser ? browsersEl : regEl).appendChild(wrap);
    }
    seenWant.forEach((w, i) => { if (seenEl.children[i] !== w) seenEl.insertBefore(w, seenEl.children[i] || null); });
    while (seenEl.children.length > seenWant.length) seenEl.lastElementChild.remove();
    // lane apps-launcher-witness: the apps found installed OUTSIDE the door, in their own group (never among the engine's)
    const listing = rechecking || !!data?.witness?.listing;
    seenSec.classList.toggle('is-empty', !seenEl.children.length && !listing && !distroN);
    $('.desktop-launch-seen-title').textContent = t('Installed outside VibeSpace ({n})', { n: seenWant.length - (showSystem ? distroN : 0) });
    $('.desktop-launch-seen-state').hidden = !listing;
    $('.desktop-launch-seen-recheck').disabled = listing;
    $('.desktop-launch-seen-more').hidden = !distroN;
    $('.desktop-launch-seen-more-text').textContent = showSystem ? t('{n} system entries shown', { n: distroN }) : t('{n} system entries not shown', { n: distroN });
    $('.desktop-launch-seen-show').textContent = showSystem ? t('Hide them') : t('Show them');
    if (seenOnly) return { registryEmpty: false };
    if (refocusScale) { const el = body.querySelector(`.desktop-launch-card-scale[data-scale-for="${CSS.escape(refocusScale)}"]`); refocusScale = null; focusQuiet(el); }
    browsersSec.classList.toggle('is-empty', !browsersEl.children.length);
    shareRow.decorateCards([regEl, browsersEl]); // lane E verify: a card that will launch shared names it (the app's remembered share)
    renderSize(); paintSizeCards(); // lane launch-picture-size: the select's "each app's last size" + each card's remembered size
    urlIn.disabled = keepIn.disabled = dead;
    const registryEmpty = !regEl.children.length && !browsersEl.children.length;
    if (!regEl.children.length) regEl.innerHTML = doc
      ? `<div class="desktop-launch-empty">${escHtml(listError ? '' : t('LibreOffice is not offered by {machine} — its VibeSpace agent may be too old; reconnect it to upgrade', { machine: machineInSentence(machineOf(host)) }))}</div>`
      : `<div class="desktop-launch-empty">${escHtml(t('No known applications were found on this machine — use “Advanced” below to run any program.'))}</div>`;
    renderRunning();
    // ── advanced: recents + the form ──
    recEl.innerHTML = '';
    for (const e of recents) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'desktop-launch-app';
      b.innerHTML = `<span class="desktop-launch-app-label">${escHtml(e.label || e.exec)}</span><span class="desktop-launch-app-sub">${escHtml([e.exec, ...(e.args || [])].join(' '))}${e.cwd ? escHtml(' · ' + e.cwd) : ''}</span>`;
      b.disabled = dead;
      b.onclick = () => launch({ exec: e.exec, args: e.args || [], cwd: e.cwd || undefined, label: e.label }, e);
      recEl.appendChild(b);
    }
    if (!recents.length) recEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No recent commands'))}</div>`;
    runBtn.disabled = dead;
    execIn.disabled = argsIn.disabled = cwdIn.disabled = dead;
    return { registryEmpty };
  };
  const seenPatch = (rows, witness) => { if (!data) return; data.registry = (data.registry || []).filter((r) => !r.witnessed).concat(rows || []); data.witness = witness || null; render({ seenOnly: true }); };
  const refresh = async ({ recheck = false } = {}) => {
    const asked = host;
    const q = [asked === 'local' ? '' : `host=${encodeURIComponent(asked)}`, recheck ? 'witness=recheck' : ''].filter(Boolean).join('&');
    const d = await fetchJson(`/api/desktop/apps${q ? `?${q}` : ''}`);
    if (asked !== host) return { registryEmpty: false }; // the person picked another machine meanwhile
    if (recheck && data && d && !d.error) return seenPatch((d.registry || []).filter((r) => r.witnessed), d.witness); // Check again: the group only
    if (d && !d.error) { data = d; listError = null; }
    else if (d && d.error) {
      if (asked === 'local') showToast(d.error, { type: 'error' });
      else { listError = { code: d.code || null, error: d.error }; data = { apps: (data && data.apps) || [], registry: [], availability: null }; } // the head says it, by the machine's name
    }
    return render();
  };
  filterIn.oninput = () => render();
  const recheckBtn = $('.desktop-launch-seen-recheck');
  recheckBtn.onclick = async () => { rechecking = true; render({ seenOnly: true }); try { await refresh({ recheck: true }); } finally { rechecking = false; if (overlay.isConnected) render({ seenOnly: true }); } }; // the spinner in the group head, the rest usable
  $('.desktop-launch-seen-show').onclick = () => { showSystem = !showSystem; patchUserState({ [SHOW_SYSTEM_KEY]: showSystem }); render({ seenOnly: true }); };
  runBtn.onclick = () => {
    const exec = execIn.value.trim();
    if (!exec) { showToast(t('Type a command to run'), { type: 'error' }); focusQuiet(execIn); return; }
    const args = splitArgs(argsIn.value);
    const cwd = cwdIn.value.trim() || undefined;
    launch({ exec, args, cwd }, { exec, args, cwd: cwd || null });
  };
  execIn.addEventListener('keydown', (e) => { if (enterSubmits(e)) runBtn.click(); });
  argsIn.addEventListener('keydown', (e) => { if (enterSubmits(e)) runBtn.click(); });

  const off = app.ws.onGlobal((m) => { if (m.type === 'desktop-apps-updated' && overlay.isConnected) { if (data) { data.apps = m.apps; renderRunning(); } } }); // the Running rows only — never the catalog under the user's pointer
  const offApps = app.ws.onGlobal((m) => { if (m.type === 'apps-updated' && overlay.isConnected && (m.host || 'local') === host) refresh(); }); // Layer 0: an app installed / removed / put back — the catalog's rows follow
  const offSeen = app.ws.onGlobal((m) => { if (m.type === 'desktop-apps-witness' && overlay.isConnected && (m.host || 'local') === host && Array.isArray(m.rows)) seenPatch(m.rows, m.witness); }); // lane apps-dialog-fast: the listing landed — the group only
  // ── P10 (design-agent-browser-v2 §6.6 / D27 (b)): the user's side of the
  // OTHER window class — the switch's state and, per window an agent holds on
  // their real desktop, a Pause / Resume that rides the same takeover verdicts
  // a window-live pane uses (the agent answers window_paused meanwhile). Reads
  // GET /api/window/desktop on open and on every window-leases-updated. ──
  const deskEl = body.querySelector('.desktop-launch-desk'), deskState = body.querySelector('.desktop-launch-desk-state');
  const renderDesk = async () => {
    const d = await fetchJson('/api/window/desktop');
    if (!deskEl || !deskEl.isConnected) return;
    deskEl.innerHTML = '';
    if (!d || d.error) { deskState.textContent = ''; deskEl.innerHTML = `<div class="desktop-launch-empty">${escHtml((d && d.error) || t('Off — turn it on in Settings → Desktop apps'))}</div>`; return; }
    deskState.textContent = d.enabled ? '' : t('Off — turn it on in Settings → Desktop apps'); // design 009 §B3: said ONCE (the heading's line), never again below it
    const leases = d.enabled ? (d.leases || []) : [];
    if (!leases.length) { if (d.enabled) deskEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No agent holds a window on your desktop'))}</div>`; return; }
    for (const l of leases) {
      const row = document.createElement('div'); row.className = 'desktop-launch-run-row desktop-launch-desk-row';
      const paused = l.input === 'user';
      row.innerHTML = `<span class="desktop-app-row-label">${escHtml(l.label || l.handle)} <span class="desktop-app-chip desktop-app-chip-origin">${escHtml(t('your desktop'))}</span></span><span class="desktop-app-row-state">${escHtml(paused ? t('paused — you are in control') : t('held by {name}', { name: l.sessionName || l.sessionId }))}</span>`;
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'file-tool-btn desktop-launch-desk-btn'; btn.style.cssText = 'width:auto;padding:0 8px;font-size:10px'; btn.textContent = paused ? t('Resume agent') : t('Pause agent');
      btn.onclick = async () => {
        btn.disabled = true;
        const r = await fetchJson(`/api/window/desktop/${encodeURIComponent(l.handle)}/${paused ? 'resume' : 'pause'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewerId: 'user' }) });
        if (r && r.error) showToast(r.error, { type: 'error' });
        renderDesk();
      };
      row.appendChild(btn); deskEl.appendChild(row);
    }
  };
  const offDesk = app.ws.onGlobal((m) => { if (m.type === 'window-leases-updated' && overlay.isConnected) renderDesk(); });
  renderDesk();
  // lane D: a default scale chosen here, in a window's Scale ▸ or on another client re-renders the cards
  wireAppPrefs(app);
  const offPrefs = onAppPrefs(() => { if (overlay.isConnected) render(); });
  const obs = new MutationObserver(() => { if (!overlay.isConnected) { try { off?.(); } catch {} try { offApps?.(); } catch {} try { offSeen?.(); } catch {} try { appsSec?.dispose(); } catch {} try { offDesk?.(); } catch {} try { offPrefs?.(); } catch {} try { offMachines?.(); } catch {} obs.disconnect(); } });
  obs.observe(document.body, { childList: true });

  render();
  // user state (recents + the disclosure preference) and the registry, then
  // decide the disclosure ONCE: the persisted preference, or forced open by an
  // empty catalog (nothing else to click — not persisted)
  // lane desktop-picker-instant: the hub's last known rows AT ONCE; a probe that lands later patches its row
  const offMachines = watchMachines(app, (ms) => { if (!overlay.isConnected) return; machines = ms; renderMachines(); }, (r) => { if (r && r.error && overlay.isConnected) showToast(r.error, { type: 'error' }); });
  renderMachines();
  mountApps();
  const opened = Promise.all([fetchJson('/api/user-state'), refresh()]);
  holdApps(opened.then(([st]) => { if (st && st[SHOW_SYSTEM_KEY] === true && !showSystem) { showSystem = true; render({ seenOnly: true }); } })); // the person's "Show them" grows the group above too
  const [state, first] = await opened;
  if (state && Array.isArray(state[RECENTS_KEY])) { recents = state[RECENTS_KEY].slice(0, RECENTS_MAX); render(); }
  setAdvanced(doc ? false : advancedOpenFor(state, !!first?.registryEmpty)); // §7.9: a document never opens "Advanced"
  setTimeout(() => {
    if (!overlay.isConnected) return;
    if (advancedOpen) focusQuiet(execIn);
    else focusQuiet(regEl.querySelector('.desktop-launch-card:not(:disabled)') || regEl.querySelector('.desktop-launch-office-install') || advToggle);
  }, 0);
  return { overlay, close };
}
