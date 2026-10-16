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
 *     per rung, each declaring its CAPABILITY CELLS (`CAP_KEYS` — every reader
 *     outside this file asks `capsOf`, never a rung id), `needs` (alternative
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
const O = require('./office-open'); // PURE — the LibreOffice rows, the open-with verdict, the office installs (§7.9)
const S = require('./install-slot'); // PURE — the machine's ONE package slot (moved out of this model: lane dc-apps-rows, F-I1)
// the slot's names this model re-exports for its old callers (shorthand: Node's CJS named-export detection reads them)
const { planLines, PKG_RE, APT_LOCK_WAIT_S, packageInstallPlan, installArgv, INSTALL_FILES, INSTALL_UNRECORDED_EXIT, INSTALL_LOCK_PREFIX, INSTALL_RUNNER, INSTALL_LAUNCHER, installLauncherArgv } = S;
// rv-desktop-apps F-S1 (lane dc-seams-desktop, 2026-10-05): the ladder, the app's window (fit / scale / close), the browser
// families and a machine's whole desktop live in their OWN files — this model re-exports each name, unchanged
const { DISPLAY_BACKENDS, BACKEND_IDS, LADDER_IDS, backendById, CAP_KEYS, capsOf, recipeFor, needsVerdict, resolveBackend, fallbackLogLine, parseBackendPrefs, streamKindOf } = require('./desktop-backends.js');
const { BROWSER_KINDS, BROWSER_BINS, isForbiddenBrowserArg, browserRowFor, URL_MAX, validateBrowserUrl, within, REAL_BROWSER_ROOTS, profileDirVerdict, browserArgv, CHROMIUM_FRAME_MARKER, chromiumFramePrefs, BROWSER_A11Y_FLAG, BROWSER_A11Y_ENV, CHROMIUM_A11Y_ENV, firefoxUserJs, browserFamilyOf, defaultProfileDirOf, singletonLockFact } = require('./desktop-browser-app.js');
const { fitPolicyOf, keeperFits, topLevelWindows, appWindows, appFitPlan, appMainWindow, APP_TITLE_MAX, windowTitleOf, APP_SCALES, EXPLICIT_SCALES, SCALE_CHOICES, SCALE_ORIGINS, parseScaleChoice, SCALE_MAX, UI_SCALE_RANGE, normalizeDpr, normalizeUiScale, effectiveScale, appScaleFor, scalePick, normalizeScale, SCALE_RULES, round4, scaleKnobs, scaleRuleOf, renderOf, relaunchPaneCss, validateRelaunchRequest, relaunchLeaseVerdict, askCloseVerdict, relaunchVerdict, relaunchBodyOf, scaleMenuModel, OUTER_CLOSE_AGAIN_MS, windowsLeftCount, exitCloseVerdict, outerCloseVerdict, RUNNING_STATES, sameAppRecord, launchVerdict } = require('./desktop-fit.js');
const { DESKTOP_PLATFORMS, MACHINE_DESKTOP_PORT, MACHINE_DESKTOP_PREFIX, machineDesktopId, machineDesktopHost, desktopPickRow, RUN_LINE_MAX, psQuote, psEncoded, desktopRunPlan, DESKTOP_RUN_PRESETS, RUN_REMEMBER_MAX, desktopRunPresets, rememberRun, TIGHTVNC, TIGHTVNC_NO_ADMIN_EXIT, tightvncInstallPlan, TIGHTVNC_INSTALL } = require('./machine-desktop-model.js');

/** The fixed stream id of the pre-existing in-container desktop (src/vnc.js)
 *  on the ONE ws bridge — `/api/vnc` is an alias for `/api/desktop/<this>/stream`. */
const DESKTOP_SINGLETON_ID = 'desktop-singleton';

const APP_STATES = Object.freeze(['launching', 'ready', 'exited', 'failed']);
const LIVE_STATES = Object.freeze(['launching', 'ready']);
/** Default idle timeout (DA3): 0 = never (owner ruling 2026-09-25 "30分钟那个暂停也默认关掉" —
 *  an app a person opened is not stopped for sitting still; the setting stays for
 *  anyone who wants a stop after N min without INPUT). */
const DEFAULT_IDLE_TIMEOUT_MIN = 0;

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
    if (!Array.isArray(row.backendPrefs) || row.backendPrefs.some((b) => !LADDER_IDS.includes(b))) return { ok: false, error: `backendPrefs may only name ${LADDER_IDS.join('/')}` }; // lane remoteapp-r1a: never the RemoteApp row
  }
  if (row.needsWayland !== undefined && typeof row.needsWayland !== 'boolean') return { ok: false, error: 'needsWayland must be a boolean' };
  // B-bfe6: a BROWSER row names its family, the bare exec names it may resolve to (first on PATH wins), and may never
  // carry a profile or an automation flag of its own — the profile is the keeper's, and a human's browser is not driven
  const execsOk = (x) => Array.isArray(x) && x.length && x.every((e) => typeof e === 'string' && /^[A-Za-z0-9._+-]{1,64}$/.test(e));
  if (row.browser !== undefined && row.browser !== null) {
    if (!Object.prototype.hasOwnProperty.call(BROWSER_KINDS, row.browser)) return { ok: false, error: `browser must be one of ${Object.keys(BROWSER_KINDS).join('/')}` };
    if (row.execs !== undefined && !execsOk(row.execs)) return { ok: false, error: 'execs must be a non-empty array of bare binary names' };
    const flag = (row.args || []).find(isForbiddenBrowserArg);
    if (flag) return { ok: false, error: `a browser row may not carry ${JSON.stringify(flag)} — its profile is the keeper's and a desktop-app browser is never an automated one`, code: 'automation-flag' };
  } else if (row.office !== undefined && row.office !== null) {
    // §7.9: a LibreOffice row names its module ('any' = the Start Center) and the bare names it may resolve to; its
    // profile is the keeper's (-env:UserInstallation is spelled by officeArgv, never by a row)
    if (!O.isOfficeModule(row.office)) return { ok: false, error: `office must be one of ${[...O.MODULE_KEYS, O.OFFICE_ANY].join('/')}` };
    if (row.execs !== undefined && !execsOk(row.execs)) return { ok: false, error: 'execs must be a non-empty array of bare binary names' };
    if ((row.args || []).some((a) => /^-env:UserInstallation=/.test(a))) return { ok: false, error: 'an office row may not carry its own -env:UserInstallation — the session\'s profile is the keeper\'s' };
  } else if (row.execs !== undefined) return { ok: false, error: 'execs is for a browser or office row only' };
  if (row.portal !== undefined && typeof row.portal !== 'boolean') return { ok: false, error: 'portal must be true or false' }; // lane app-display-portal
  return { ok: true, error: null };
}

/**
 * The launch dialog's two shapes (§2 routes): `{appId}` or `{exec, args, cwd}`.
 * Returns { ok, error, launch } where launch is
 *   { source:'registry', row, dpr }  |  { source:'adhoc', row:{ id:null, label, exec, args, cwd }, dpr }
 * `dpr` = the launching client's devicePixelRatio (1..3, absent ⇒ 1; out of range ⇒ refused) and
 * `uiScale` = its UI scale (0.6..2, absent ⇒ 1; out of range ⇒ refused) — the inputs `appScaleFor`
 * turns into the app's scale under `desktop.appScale: auto` (round 3 A3: dpr × uiScale). Lane D: `scaleChoice`
 * (either shape) = the app's own default scale from the launch dialog — one of EXPLICIT_SCALES, or 'auto' = none;
 * carried as `launch.scaleChoice` (a number | null), anything else refused `bad-request` (scaleChoiceVerdict).
 * `registry` is the array of rows the keeper serves. Nothing here checks PATH
 * or the file system — the keeper does (exec resolved on PATH, cwd must exist).
 */
function validateLaunchRequest(body, registry = []) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  // lane D: `scaleChoice` = the app's own default scale the person chose in the launch dialog (origin 'app'); 'auto' =
  // none (the instance default decides) — anything else is REFUSED by name, never silently dropped
  const sv = scaleChoiceVerdict(body);
  if (!sv.ok) return { ok: false, error: sv.error, code: sv.code };
  const scaleChoice = sv.scaleChoice;
  if (body.dpr !== undefined && body.dpr !== null && !(Number.isFinite(Number(body.dpr)) && Number(body.dpr) >= 1 && Number(body.dpr) <= 3)) return { ok: false, error: 'dpr must be a number from 1 to 3' };
  if (body.uiScale !== undefined && body.uiScale !== null && !(Number.isFinite(Number(body.uiScale)) && Number(body.uiScale) >= UI_SCALE_RANGE[0] && Number(body.uiScale) <= UI_SCALE_RANGE[1])) return { ok: false, error: `uiScale must be a number from ${UI_SCALE_RANGE[0]} to ${UI_SCALE_RANGE[1]}` };
  // B-bfe6: `url` + `keepProfile` belong to a BROWSER row — anywhere else they are refused by name, never ignored
  const hasUrl = body.url !== undefined && body.url !== null && body.url !== '';
  if (body.keepProfile !== undefined && typeof body.keepProfile !== 'boolean') return { ok: false, error: 'keepProfile must be a boolean', code: 'bad-request' };
  // §7.9: `file` = a document to open, for a LibreOffice row of the catalog only — anywhere else refused by name (never
  // ignored); the PURE file rule (absolute on this machine, an office extension) here, the machine rule at the route
  const hasFile = body.file !== undefined && body.file !== null;
  let file = null;
  if (hasFile) { const fv = O.fileVerdict(body.file); if (!fv.ok) return { ok: false, error: fv.error, code: fv.code }; file = fv.file; }
  if (body.appId !== undefined) {
    if (!ID_RE.test(String(body.appId))) return { ok: false, error: 'appId is not a valid id' };
    const row = registry.find((r) => r.id === body.appId);
    if (!row) return { ok: false, error: `unknown appId ${JSON.stringify(body.appId)}` };
    if (!row.browser && (hasUrl || body.keepProfile !== undefined)) return { ok: false, error: `${hasUrl ? 'url' : 'keepProfile'} is only for a browser app — ${row.label} is not one`, code: 'not-a-browser' };
    if (hasFile && !O.isOfficeModule(row.office)) return { ok: false, error: `${row.label} does not open documents — LibreOffice does`, code: 'not-office-app' };
    // lane app-register-model: `variant` = one of a registered app's launch variants (default variants[0]) — run through
    // the same door as any row; a row without variants refuses one by name, never ignores it
    if (body.variant !== undefined && body.variant !== null && body.variant !== '') {
      const vs = Array.isArray(row.launch) ? row.launch : null;
      const pick = vs && vs.find((x) => x && x.id === String(body.variant));
      if (!pick) return { ok: false, error: vs ? `${row.label} has no launch variant ${JSON.stringify(String(body.variant).slice(0, 40))}` : `${row.label} has no launch variants`, code: 'bad-request' };
      const vr = { ...row, exec: pick.exec, args: [...(pick.args || [])], env: pick.env ? { ...pick.env } : row.env, cwd: pick.cwd || null, variant: pick.id };
      if (!validateAppRow(vr).ok) return { ok: false, error: `${row.label}: variant ${pick.id} is not a runnable row`, code: 'bad-request' };
      return { ok: true, error: null, launch: { source: 'registry', row: vr, dpr: normalizeDpr(body.dpr), uiScale: normalizeUiScale(body.uiScale), scaleChoice } };
    }
    let url = null;
    if (hasUrl) { const u = validateBrowserUrl(body.url); if (!u.ok) return { ok: false, error: u.error, code: u.code }; url = u.url; }
    return { ok: true, error: null, launch: { source: 'registry', row, dpr: normalizeDpr(body.dpr), uiScale: normalizeUiScale(body.uiScale), scaleChoice, ...(row.browser ? { url, keepProfile: body.keepProfile === true } : {}), ...(file ? { file } : {}) } };
  }
  if (hasUrl || body.keepProfile !== undefined) return { ok: false, error: `${hasUrl ? 'url' : 'keepProfile'} is only for a browser app from the catalog — a command you type is run as typed`, code: 'not-a-browser' };
  if (hasFile) return { ok: false, error: 'a document opens in a LibreOffice app from the catalog — a command you type is run as typed', code: 'not-office-app' };
  const row = { id: null, label: cleanStr(body.label, 80) ? body.label : null, exec: body.exec, args: body.args === undefined ? [] : body.args, cwd: body.cwd === undefined || body.cwd === '' ? null : body.cwd };
  if (!row.label) row.label = typeof row.exec === 'string' ? row.exec.split('/').pop().slice(0, 80) : null;
  const v = validateAppRow({ ...row, id: 'adhoc' });
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, error: null, launch: { source: 'adhoc', row, dpr: normalizeDpr(body.dpr), uiScale: normalizeUiScale(body.uiScale), scaleChoice } };
}
/** Lane D: the launch body's `scaleChoice` (the app's default scale from the launch dialog) → { ok, scaleChoice: a number
 *  of EXPLICIT_SCALES | null (absent / 'auto' — the instance default decides) } | { ok:false, code:'bad-request', error }.
 *  The ONE check: validateLaunchRequest (on the machine the app runs on) and the hub's launch route (before a paired
 *  machine is asked — an older device would drop an unknown field silently) both call it. */
function scaleChoiceVerdict(body) {
  const raw = body && typeof body === 'object' ? body.scaleChoice : undefined;
  if (raw === undefined || raw === null) return { ok: true, scaleChoice: null };
  const c = parseScaleChoice(raw);
  if (c === null) return { ok: false, code: 'bad-request', error: `scaleChoice must be one of ${SCALE_CHOICES.join(', ')}` };
  return { ok: true, scaleChoice: c === 'auto' ? null : c };
}

// ── which launches are WEB BROWSERS (takeover r2, T6 / I6) ─────────────────
/**
 * A desktop-app browser is the HUMAN'S window (its own profile, its logins; no
 * mediation, no action trace, no egress policy) — the window-targets engine
 * MARKS it (lane E, 2026-09-25: a browser the user SHARES is a target like any
 * app, flagged "the user's browser"; `open` of a browser row stays refused
 * `browser_is_human`). r1 recognised only a registry
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
  // §7.9 (the owner's ruling 2026-09-27 ②) — LibreOffice Writer / Calc / Impress + the Start Center: `execs` =
  // libreoffice → soffice, `office` = the module; a document opens through the PURE open-with verdict (office-open.js)
  ...O.OFFICE_ROWS,
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
/** lane one-browser-b1 (design q-026 r1 §2.1 B1): A DISPLAY-ONLY SESSION for an agent browser — the xpra-seamless recipe, NO
 *  app (the browser keeper spawns Google Chrome on it itself), NO idle stop; `forBrowser` names the browser profile whose
 *  record it lives and ends with. Never counted against the app ceiling (the browser keeper's own ceiling counted it). */
const DISPLAY_FOR_BROWSER = 'display-for-browser';
const isDisplayForBrowser = (rec) => !!rec && rec.kind === DISPLAY_FOR_BROWSER;
/** Its label in the Desktop apps list (the browser profile's name, bounded). */
const displayForBrowserLabel = (label) => `Browser display · ${String(label || 'agent browser').replace(/\s+/g, ' ').trim().slice(0, 80) || 'agent browser'}`;
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
function capVerdict(live0, limits = LIMITS) {
  const live = (live0 || []).filter((r) => !isDisplayForBrowser(r)); // lane one-browser-b1: a browser's display-only session is never an app here — the browser keeper's own ceiling counted that browser
  const cap = Number(limits.CONCURRENT_CAP) || LIMITS.CONCURRENT_CAP;
  if (live.length < cap) return null;
  const names = live.map((r) => `${r.label || r.exec || r.id} (${r.id})`);
  return { code: 'cap', cap, holders: live.map((r) => r.id), error: `desktop app ceiling reached (${live.length}/${cap} running: ${names.join(', ')}) — stop one first` };
}

// ── lane app-launch-singleton (fleet inc-mv7hxc2n-2cvr, .268): one program, one instance — unless it runs twice ──────
/**
 * Is catalog row `row` a web browser, and does its launch get a profile of its OWN? → { isBrowser, browser, ownProfile, why }
 *   why 'catalog'        — the registry's browser row (B-bfe6: browserRowFor / browserArgv)
 *   why 'exec'           — an installed / witnessed / registered row whose executable is a browser of a known family
 *                          (google-chrome-stable, brave-browser, firefox-esr …): it gets that family's argv and its own
 *                          profile dir like the catalog row — DEFECT #0 of the incident: the installed Chrome ran AS TYPED
 *                          on the user's default profile
 *   why 'app-id'         — a sandboxed browser (a flatpak export `com.google.Chrome`): its profile is the sandbox's own
 *   why 'launcher'       — run through `flatpak run` / `snap run` / `env`: its profile switch would reach the launcher
 *   why 'unknown-family' — a browser (by name or its .desktop category) whose profile switch is not known here
 * Only 'catalog' / 'exec' have `ownProfile`: the others run on their default profile, ONE instance at a time.
 */
function appBrowserVerdict(row) {
  if (!row || typeof row !== 'object') return { isBrowser: false, browser: null, ownProfile: false, why: null };
  if (row.browser && BROWSER_KINDS[row.browser] && row.browserBy !== 'exec') return { isBrowser: true, browser: row.browser, ownProfile: true, why: 'catalog' };
  const fam = browserFamilyOf(row.exec);
  if (fam) return { isBrowser: true, browser: fam, ownProfile: true, why: 'exec' };
  const bv = browserLaunchVerdict({ exec: row.exec, args: row.args });
  if (bv.browser) return { isBrowser: true, browser: null, ownProfile: false, why: bv.by === 'launcher' ? 'launcher' : BROWSER_APP_ID_RE.test(baseOf(row.exec)) ? 'app-id' : 'unknown-family' };
  if (row.category === 'browser') return { isBrowser: true, browser: null, ownProfile: false, why: 'unknown-family' };
  return { isBrowser: false, browser: null, ownProfile: false, why: null };
}
/** Terminals that are one process per window (never a server another launch is handed to — gnome-terminal is). */
const TERMINAL_TWICE_RE = /^(?:xterm|uxterm|urxvt|rxvt(?:-unicode)?|alacritty|kitty|st)$/;
/**
 * Can a SECOND instance of `row` run beside a running one (the card's "Open another")? → { twice, why }
 *   own-profile  — a browser with its own profile dir, a LibreOffice session (its own -env:UserInstallation)
 *   own-process  — a terminal that is one process per window (TERMINAL_TWICE_RE)
 *   shared-profile — a browser on its default profile: the second launch is handed to the first and exits
 *   single-instance — anything else may hand a second launch to the first over the session bus (GApplication,
 *                  KUniqueApplication) and exit at once: not offered (the running one is opened instead)
 */
function runsTwiceVerdict(row) {
  if (!row || typeof row !== 'object') return { twice: false, why: 'single-instance' };
  if (row.office) return { twice: true, why: 'own-profile' };
  const bv = appBrowserVerdict(row);
  if (bv.isBrowser) return bv.ownProfile ? { twice: true, why: 'own-profile' } : { twice: false, why: 'shared-profile' };
  const b = typeof row.exec === 'string' ? row.exec.split('/').pop() : '';
  if (TERMINAL_TWICE_RE.test(b)) return { twice: true, why: 'own-process' };
  return { twice: false, why: 'single-instance' };
}
/** `0.8 s` / `under 0.1 s` — the quick exit's timing words (never "0.0 s"). */
const secondsText = (ms) => (ms < 100 ? 'under 0.1 s' : `${(ms / 1000).toFixed(1)} s`);
/** An app process that ends sooner than this after it started was no window at all: the launch FAILED loudly (§ the
 *  incident: Chrome's singleton handed the launch over and exited code 0 within a second). */
const QUICK_EXIT_MS = 3000;
/**
 * The app process of `rec` ended at `at` (code / signal) → { quick, asked, afterMs, sinceReadyMs, tail }:
 * `afterMs` from the app's own spawn (`rec.appAt`; the record's start when older), `sinceReadyMs` from `ready` (null
 * before it), `tail` = the journal line's timing words (`0.8 s after ready` / `before ready, 0.4 s after it started`).
 * `asked` (int267 seam, the guard-programmatic-not-the-press law): the record was stamped `closeAskedAt` since this
 * spawn — the person's own close (the window's outer ✕ stamps it BEFORE close-window is sent) — so the exit ANSWERS
 * that ask: never a failed launch, however soon it came (`quick` false: the window closes, no notice).
 */
function quickExitVerdict(rec, at, { quickMs = QUICK_EXIT_MS } = {}) {
  const t = Number(at);
  const from = Number(rec && (rec.appAt || rec.startedAt));
  if (!rec || !Number.isFinite(t) || !Number.isFinite(from)) return { quick: false, asked: false, afterMs: null, sinceReadyMs: null, tail: '' };
  const afterMs = Math.max(0, t - from);
  const askedAt = Number(rec.closeAskedAt);
  const asked = Number.isFinite(askedAt) && askedAt >= from && askedAt <= t;
  const ready = Number(rec.readyAt);
  const sinceReadyMs = Number.isFinite(ready) && ready > 0 ? Math.max(0, t - ready) : null;
  const s = secondsText;
  return { quick: afterMs < quickMs && !asked, asked, afterMs, sinceReadyMs, tail: sinceReadyMs !== null ? `${s(sinceReadyMs)} after ready` : `before ready, ${s(afterMs)} after it started` };
}
/** Who started a record, in the server's words (a notice): `agent session X` / `an agent` / `you` / '' (not recorded). */
function launchedByText(rec) {
  const b = rec && rec.launchedBy;
  if (!b) return '';
  if (b.kind === 'person') return 'you';
  return b.name ? `agent session ${b.name}` : 'an agent';
}
/** The hub's ONE notice for a quick exit (`rec.quickExit`); `running` = the record of the instance that still runs, if any. */
function quickExitNoticeText(rec, running = null) {
  const q = (rec && rec.quickExit) || {};
  const who = (rec && (rec.appTitle || rec.label || rec.appId || rec.id)) || 'The app';
  const how = q.signal ? `ended by ${q.signal}` : `code ${q.code}`;
  const when = Number.isFinite(q.afterMs) ? `, ${secondsText(q.afterMs)} after it started` : '';
  const head = `${who} exited right after it started (${how}${when})`;
  if (!running) return `${head} — usually the same program is already running elsewhere (on another display, or outside VibeSpace); nothing was left open.`;
  const by = launchedByText(running);
  return `${head} — the same program is already running on ${running.display || 'another display'}${by ? ` (started by ${by})` : ''}: open it from Apps.`;
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
/** lane e2a (design-agent-browser-v2 §E2, D6; r3 verify r1 #7): a record an AGENT launched through its own door — its profile
 *  is that agent's throwaway, removed on EVERY ending (idle, its conversation's end, its own stop…) unless --keep-profile. */
const AGENT_BROWSER_ORIGIN = 'agent-browser';
function profileRetireVerdict(rec) {
  if (!rec || !rec.profileDir) return { remove: false, why: 'no profile' };
  if (rec.keepProfile) return { remove: false, why: 'the user chose "keep profile"' };
  if (isLiveState(rec.state)) return { remove: false, why: 'the session is live' };
  if (rec.origin === AGENT_BROWSER_ORIGIN) return { remove: true, why: `the agent's own throwaway profile (${rec.stoppedBy || rec.state})` };
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
  if (!alive.app && !isDisplayForBrowser(rec)) return { state: 'exited', lastError: rec.lastError || 'application exited while VibeSpace was down' }; // lane one-browser-b1: a display-only session has no app
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
function newRecord({ id, label, exec, args, cwd, env, source, backend, via, fallbackWhy, idleTimeoutMs, now, scale = 1, dpi = 96, gdkScale = null, pictureScale = null, scaleOrigin = null, scaleFrom = null, hostId = 'local' }) {
  return {
    id, label, exec, args: Array.isArray(args) ? args.slice() : [], cwd: cwd || null, env: env && Object.keys(env).length ? { ...env } : undefined,
    source, backend, via: via || null, fallbackWhy: fallbackWhy || null,
    display: null, port: null, pids: { x: null, app: null, server: null, wm: null }, starts: { x: null, app: null, server: null, wm: null },
    startedAt: now, state: 'launching', exitCode: null, lastError: null,
    idleTimeoutMs: Number(idleTimeoutMs) || 0, lastInputAt: now,
    scale: normalizeScale(scale), dpi: Number.isInteger(dpi) && dpi >= 48 && dpi <= 288 ? dpi : 96, // HiDPI (2.369.158): the app's scale + the display's font dpi, fixed at launch
    // lane D (a): what the app was RENDERED at — GDK_SCALE and the fraction the view shows the picture at (renderOf reads them)
    gdkScale: Number.isInteger(gdkScale) && gdkScale >= 1 && gdkScale <= SCALE_MAX ? gdkScale : null,
    pictureScale: Number.isInteger(gdkScale) && gdkScale >= 1 && gdkScale <= SCALE_MAX && Number.isFinite(Number(pictureScale)) && Number(pictureScale) > 0.3 && Number(pictureScale) <= 1 ? round4(Number(pictureScale)) : null,
    scaleOrigin: SCALE_ORIGINS.includes(scaleOrigin) ? scaleOrigin : null, scaleFrom: scaleFrom && typeof scaleFrom === 'object' ? { dpr: normalizeDpr(scaleFrom.dpr), uiScale: normalizeUiScale(scaleFrom.uiScale) } : null, // round 3 A3: where the scale came from (the chip says it)
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
/** THE XPRA.ORG REPOSITORY as root shell lines for one codename (PURE — lane dc-apps-rows, F-I2): the key, the deb822
 *  source, the pin. The machine plan runs them; deploy/docker/Dockerfile writes the same source + pin lines for
 *  bookworm (scripts/test-desktop-apps.mjs pins the image's text to these lines — ONE row, two consumers). */
function xpraRepoSteps(cn) {
  return [
    'install -d -m 0755 /usr/share/keyrings',
    `(command -v curl >/dev/null && curl -fsSL ${XPRA_KEY_URL} -o /usr/share/keyrings/xpra.asc) || wget -qO /usr/share/keyrings/xpra.asc ${XPRA_KEY_URL}`,
    `printf '%s\\n' 'Types: deb' 'URIs: ${XPRA_REPO_URL}' 'Suites: ${cn}' 'Components: main' 'Signed-By: /usr/share/keyrings/xpra.asc' > /etc/apt/sources.list.d/xpra.sources`,
    `printf '%s\\n' 'Package: xpra*' 'Pin: version ${XPRA_PIN_MAJOR}.*' 'Pin-Priority: 1001' > /etc/apt/preferences.d/xpra-vibespace`,
  ];
}
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
  if (source === 'xpra.org') steps.push(...xpraRepoSteps(String(f.codename)));
  steps.push('apt-get update');
  steps.push(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${packages.join(' ')}`);
  steps.push('xpra --version');
  const { script, commands } = planLines(steps, { plain: ['xpra --version'] });
  const canRun = !!(f.root || f.sudo);
  return { ok: true, source, packages, script, commands, canRun, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself, then check again', already, aptXpra: f.aptXpra || null, installed: f.xpra || null, root: !!f.root };
}
/** THE XPRA INSTALLABLE (src/installs.js registers it — one row there): the display rung's own install, planned from
 *  the machine's facts op; the DEFAULT install (a request that names none is this one — the call exactly as before
 *  §7.9); after it the route re-reads the machine's ladder (`done: 'display'`). */
const XPRA_INSTALL = Object.freeze({ id: 'xpra', default: true, from: 'facts', plan: xpraInstallPlan, done: 'display' });

/**
 * A MACHINE PICKER ROW (PURE): may the launch dialog offer this machine, and if not, why — by code (the client says
 * it in its words). Input = what the hub knows WITHOUT asking the machine: `{hostId, transport, link:
 * online|offline|unknown, connected, capabilities?, platform?}`. A row is shown greyed with its reason, never hidden:
 *   ready             this machine, or a connected agent that runs desktop-serve on Linux
 *   connect           an ssh machine not connected yet — choosing it connects (and installs the agent over ssh,
 *                     the path Add machine already takes); a failure is said then, by name
 *   offline           a dial device that is not dialed in
 *   host_needs_daemon a connected agent that predates desktop-serve (the capability gate)
 *   no_x11            the agent runs on a non-Linux system with no whole-desktop rung
 *   desktop_ready / no_vnc / offline   a macOS / Windows agent (design 014 D1): its WHOLE DESKTOP, not apps — desktopPickRow
 */
function machinePickRow(h) {
  const r = h && typeof h === 'object' ? h : {};
  if (!r.hostId || r.hostId === 'local') return { selectable: true, code: 'ready' };
  if (r.platform && r.platform !== 'linux') return DESKTOP_PLATFORMS.includes(r.platform) ? desktopPickRow(r) : { selectable: false, code: 'no_x11' };
  if (r.connected) {
    const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
    return caps.includes('desktop-serve') ? { selectable: true, code: 'ready' } : { selectable: false, code: 'host_needs_daemon' };
  }
  if (r.transport === 'dial' && r.link !== 'online') return { selectable: false, code: 'offline' };
  return { selectable: true, code: r.link === 'offline' ? 'offline' : 'connect' };
}

// ── lane app-display-portal (2026-10-12): a SANDBOXED app's own desktop portal, on its own display ──
// MEASURED (production, read-only): JASP (flatpak, Qt) on xpra :4 asked org.freedesktop.portal.FileChooser through
// flatpak's bus proxy to the user's SESSION bus, where xdg-desktop-portal(-gnome/-gtk) run with DISPLAY=:2 — the
// chooser drew on the owner's main desktop, never in the JASP pane (and never in the agent's screenshot of :4). So a
// sandboxed app (a flatpak or a snap — `sandboxOf`), a desktop-app BROWSER (r2, owner 2026-10-12: Chrome on xpra :6 sent
// the Turnitin upload's chooser to :2 — Chromium PREFERS the portal FileChooser whenever one answers on its bus; known by
// the row's `browser` fact, never by its exec name), a row that says `portal: true`, or every app under
// `desktop.appPortal = all` gets ONE private session bus whose ONLY activatable services are the portal frontend, its
// gtk backend, the document portal and the permission store, all started by that bus with the APP's display; the app
// is launched on that bus (flatpak's proxy then reaches OUR portal). Non-sandboxed apps keep the user's bus (keyring,
// notifications). The a11y bus stays the user's (AT_SPI_BUS_ADDRESS handed to the app and to the portal), so the
// tree snapshot still names the app and its chooser — where the user HAS one; where the user has none (a pod) the
// bus activates its own (lane app-display-a11y-bus, a11yBusPlan below). Missing binaries ⇒ the app launches as before and the record
// says `portal: 'unavailable: <why>'` — never a refusal to launch.
const APP_PORTAL_MODES = Object.freeze(['auto', 'all', 'off']); // auto = sandboxed apps + browser rows
const APP_PORTAL_DEFAULT = 'auto';
const appPortalMode = (v) => (APP_PORTAL_MODES.includes(v) ? v : APP_PORTAL_DEFAULT);
/** [bus name, binary] — the private bus's activatable services; the first two are required, the rest join when present */
const PORTAL_SERVICES = Object.freeze([
  ['org.freedesktop.portal.Desktop', 'xdg-desktop-portal'],
  ['org.freedesktop.impl.portal.desktop.gtk', 'xdg-desktop-portal-gtk'],
  ['org.freedesktop.portal.Documents', 'xdg-document-portal'], // a flatpak's chosen file is handed over through it
  ['org.freedesktop.impl.portal.PermissionStore', 'xdg-permission-store'],
  ['org.a11y.Bus', 'at-spi-bus-launcher'], // lane app-display-a11y-bus: the app's OWN a11y bus — asked only where the user has none (a11yBusPlan)
]);
const PORTAL_REQUIRED = Object.freeze(['dbus-daemon', 'xdg-desktop-portal', 'xdg-desktop-portal-gtk']);
const PORTAL_BINS = Object.freeze(['dbus-daemon', ...PORTAL_SERVICES.map(([, b]) => b)]);
const SOCKET_PATH_MAX = 107; // sun_path is 108 bytes with its NUL
const firstWord = (args) => (Array.isArray(args) ? args.find((a) => typeof a === 'string' && !a.startsWith('-')) : undefined);
/** 'flatpak' | 'snap' | null — what the launched program is (`flatpak run …`, `snap run …`, /snap/bin/<name>). */
function sandboxOf(row) {
  const exec = String((row && row.exec) || '');
  const base = exec.split('/').pop();
  if (base === 'flatpak' && firstWord(row.args) === 'run') return 'flatpak';
  if ((base === 'snap' && firstWord(row.args) === 'run') || exec.startsWith('/snap/bin/')) return 'snap';
  return null;
}
// ── lane app-display-a11y-bus (2026-10-12, B-4a59 piece 3): THE APP'S OWN ACCESSIBILITY BUS where the user has none (a
// fleet pod, a hub without a desktop session). MEASURED on a scratch Xvfb + this plan's bus with no user bus: the GTK
// fixture warned "Error retrieving accessibility bus address: …ServiceUnknown (org.a11y.Bus)" and the agent's tree
// reader died "Couldn't connect to accessibility bus" (SIGABRT ⇒ helper_error) or, handed the app's DISPLAY, read 0
// nodes. Now the private bus ACTIVATES org.a11y.Bus (at-spi-bus-launcher: its own a11y dbus-daemon under the plan's
// run/ dir; at-spi2-registryd follows from the system's accessibility-services dir — all in the bus's session, reaped
// with it); the bring-up asks GetAddress once (8 ms) and hands the address to the app (AT_SPI_BUS_ADDRESS) and to the
// record (`a11yBus`) — the agent's tree reads of THIS app target that bus, never a global (window-targets treeEnvOf).
// Where the user HAS an a11y bus nothing changes: the app and the portal are handed the user's, the private service
// stays dormant (libatspi reads AT_SPI_BUS_ADDRESS first). The launcher sets no AT_SPI_BUS root property on the display
// (measured), so the address is the only way in.
const A11Y_BUS_NAME = 'org.a11y.Bus';
const A11Y_BINS = Object.freeze(['at-spi-bus-launcher', 'at-spi2-registryd']);
const A11Y_PACKAGE = 'at-spi2-core';
/** PURE: whose a11y bus an app on its own private bus gets. `user` = the user's a11y address (null = none: a pod),
 *  `bins` = portalBins over A11Y_BINS. → { a11y: 'user' | 'own' | 'unavailable: <why>', ask } — `ask` = ask the private
 *  bus for org.a11y.Bus.GetAddress (that activates the launcher). Never throws: a machine without the binaries says so. */
function a11yBusPlan({ user = null, bins = {} } = {}) {
  if (user) return { a11y: 'user', ask: false };
  const miss = A11Y_BINS.filter((b) => !(bins && bins[b]));
  if (miss.length) return { a11y: `unavailable: ${miss.join(', ')} not found on this machine (package ${A11Y_PACKAGE})`, ask: false };
  return { a11y: 'own', ask: true };
}
/** PURE: the ask's answer (`got` = GetAddress's address, null = none) → the record's facts { a11y, bus } + `appEnv`, laid
 *  over the app's env. 'user' / 'unavailable' hand nothing (the plan's appEnv already carries the user's address). */
function a11yBusOf({ plan, got = null } = {}) {
  if (!plan || !plan.ask) return { a11y: (plan && plan.a11y) || 'user', bus: null, appEnv: {} };
  if (typeof got !== 'string' || !/^unix:/.test(got)) return { a11y: `unavailable: the private bus gave no ${A11Y_BUS_NAME} address (at-spi-bus-launcher did not answer)`, bus: null, appEnv: {} };
  return { a11y: 'own', bus: got, appEnv: { AT_SPI_BUS_ADDRESS: got } };
}
/** WHY a launch gets a private portal — 'flatpak' | 'snap' | 'browser' | 'row' | 'all' — or null (decided once, at launch).
 *  A browser row (`row.browser`, the rung's own fact) keeps `--password-store=basic` (browserArgv): no keyring is lost. */
function portalWanted(row, { mode, ownsDisplay = true } = {}) {
  const m = appPortalMode(mode);
  if (m === 'off' || !ownsDisplay) return null;
  return sandboxOf(row) || (row && row.browser ? 'browser' : null) || (row && row.portal === true ? 'row' : m === 'all' ? 'all' : null);
}
const xmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// ── lane app-display-secrets (2026-10-12, B-4a59 piece 4 — owner path 1): THE APP'S KEYRING. MEASURED on a scratch
// private bus with no user bus: libsecret failed every call in ≤ 3 ms ("The name org.freedesktop.secrets was not provided
// by any .service files" — nothing hangs, nothing is kept) and Chrome 154 asked NameHasOwner(org.freedesktop.secrets) and
// the portal, then gave up on both (os_crypt.portal.prev_init_success false). Now the bus ACTIVATES src/secret-service.py
// (python3 + GDBus): one default collection, never locked, never a prompt; libsecret asks dh-ietf1024-sha256-aes128-cbc-
// pkcs7 first and takes `plain` on NotSupported (measured) — the bus is a 0700 socket of the same user. Its items are ONE
// sealed file in the plan's 0700 root, sealed by src/app-secrets-seal.js (secret-box's cipher) under a per-display key
// the hub derives from data/.app-secrets-key (desktop-display appSecretsFacts) — handed over in the BUS env only
// (lane display-secret-fd, B-6c6d: NO LONGER the bus env — a 0600 FILE in the display's private runtime dir, read and
// UNLINKED by the service at its start; the bus's env is the environ of dbus-daemon AND of every service it activates,
// so a key laid there sat in `/proc/<pid>/environ` of five long-lived processes for the display's lifetime. MEASURED
// 2026-10-13 (dbus 1.16.2): an activated service inherits the daemon's ENVIRONMENT but NOT its file descriptors (fd 3
// of the daemon was gone in the child: dbus closes every fd above stderr before exec) — so a pipe, the handoff a
// spawn would use, cannot reach a BUS-ACTIVATED service; the one-shot file is the handoff that can). No env var is
// needed by the app: libsecret finds the service by its name on DBUS_SESSION_BUS_ADDRESS. The passkey store (q-027)
// is a separate store — never merged.
const APP_SECRETS_MODES = Object.freeze(['on', 'off']);
const APP_SECRETS_DEFAULT = 'on'; // the owner's path-1 ruling (2026-10-12)
const appSecretsMode = (v) => (APP_SECRETS_MODES.includes(v) ? v : APP_SECRETS_DEFAULT);
const SECRETS_NAME = 'org.freedesktop.secrets';
const SECRETS_STORE_FILE = 'secrets.json';
const SECRETS_KEY_FILE = 'run/secrets.key'; // the per-display key, handed over ONCE: 0600, under the plan's private XDG_RUNTIME_DIR
/** PURE: the Secret Service's facts → what it adds to a started portalPlan (`plan`): the two FILES it needs (pushed
 *  into plan.files — its service file and the one-shot key file, both written 0600 in the plan's 0700 dirs before the
 *  bus starts) + `secrets` ('on' | 'off' | 'unavailable: <why>') + the store and key paths. NOTHING is laid over
 *  plan.env: the bus's env is read by every service the bus activates (lane display-secret-fd, B-6c6d).
 *  `facts` = null / { off } (the setting), { why } (a missing piece — said, never a refusal to launch), or
 *  { python, service, node, sealer, keyHex }. */
function secretServicePlan({ plan, facts } = {}) {
  const none = (secrets) => ({ secrets, files: [], store: null, keyFile: null });
  if (!plan || !plan.ok || !Array.isArray(plan.dirs) || !plan.dirs[0]) return none('unavailable: no private bus');
  if (!facts || facts.off) return none('off');
  if (facts.why) return none(`unavailable: ${facts.why}`);
  if (!/^[0-9a-f]{64}$/.test(String(facts.keyHex || ''))) return none('unavailable: no per-display key');
  const root = plan.dirs[0], store = `${root}/${SECRETS_STORE_FILE}`, keyFile = `${root}/${SECRETS_KEY_FILE}`;
  const argv = [facts.python, facts.service, store, facts.node, facts.sealer, keyFile];
  if (argv.some((a) => !a || /\s/.test(a))) return none('unavailable: a path has a space (a service Exec= line splits on it)');
  return { secrets: 'on', store, keyFile,
    files: [{ file: `${root}/services/${SECRETS_NAME}.service`, text: `[D-BUS Service]\nName=${SECRETS_NAME}\nExec=${argv.join(' ')}\n` },
      { file: keyFile, text: facts.keyHex }] };
}
/** PURE: the sealed store's text → how many logins it keeps (its plaintext `n`; null = none / not a store). */
function secretsCountOf(raw) {
  let o = null;
  try { o = JSON.parse(String(raw)); } catch { return null; }
  return o && Number.isInteger(o.n) && o.n >= 0 ? o.n : null;
}
/**
 * The companion's whole plan, PURE: `dir` = the app's own dir, `bins` = { name: path|null } over PORTAL_BINS,
 * `a11y` = the user's a11y bus address (null = unknown: nothing is set), `why` = portalWanted's answer, `notify` = the
 * notifications sink's facts (lane app-display-notify-sink: notifySinkOf's answer — null = the setting is off).
 * → { ok:false, why } | { ok:true, address, busArgv, dirs, files:[{file,text}], env (the bus's — every activated
 * service inherits it), appEnv (laid over the app's env), notify ('on' | 'off' | 'unavailable: <why>'), journal }.
 */
function portalPlan({ dir, display, authFile, bins = {}, a11y = null, why = null, notify = null } = {}) {
  const miss = PORTAL_REQUIRED.filter((n) => !bins[n]);
  if (miss.length) return { ok: false, why: `${miss.join(', ')} not found on this machine` };
  if (!dir || !display) return { ok: false, why: 'no app dir or display yet' };
  const root = `${dir}/portal`, sock = `${root}/bus`;
  if (sock.length > SOCKET_PATH_MAX) return { ok: false, why: `the bus socket path is ${sock.length} bytes (over ${SOCKET_PATH_MAX})` };
  const address = `unix:path=${sock}`;
  const conf = ['<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">',
    '<busconfig>', '  <type>session</type>', '  <keep_umask/>', `  <listen>unix:path=${xmlText(sock)}</listen>`, '  <auth>EXTERNAL</auth>',
    `  <servicedir>${xmlText(root)}/services</servicedir>`,
    '  <policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy>', '</busconfig>', ''].join('\n');
  const services = PORTAL_SERVICES.filter(([, b]) => bins[b]).map(([name, b]) => ({ file: `${root}/services/${name}.service`, text: `[D-BUS Service]\nName=${name}\nExec=${bins[b]}\n` }));
  const files = [{ file: `${root}/bus.conf`, text: conf }, ...services, { file: `${root}/config/xdg-desktop-portal/portals.conf`, text: '[preferred]\ndefault=gtk\n' }];
  // lane app-display-notify-sink: org.freedesktop.Notifications is ACTIVATED by this bus like the portal (the sink's own
  // file + the interpreter, never a shell) — it journals to a file in this 0700 dir; the machine keeper reads it
  const sink = notifySinkPlan({ root, notify });
  if (sink.file) files.push(sink.file);
  const a = a11y ? { AT_SPI_BUS_ADDRESS: a11y } : {};
  const env = {
    DISPLAY: display, ...(authFile ? { XAUTHORITY: authFile } : {}), DBUS_SESSION_BUS_ADDRESS: address, XDG_CURRENT_DESKTOP: 'GNOME',
    XDG_CONFIG_HOME: `${root}/config`, XDG_DATA_HOME: `${root}/data`, XDG_RUNTIME_DIR: `${root}/run`, // the document portal mounts under run/, its database and the permission store's under data/ — never the user's
    GIO_USE_VFS: 'local', GVFS_DISABLE_FUSE: '1', GTK_USE_PORTAL: '0', ...a, ...sink.env,
  };
  const appEnv = { DBUS_SESSION_BUS_ADDRESS: address, ...a, ...(why === 'all' ? { GTK_USE_PORTAL: '1' } : {}) };
  return { ok: true, address, busArgv: [bins['dbus-daemon'], '--nofork', `--config-file=${root}/bus.conf`], dirs: [root, `${root}/services`, `${root}/config/xdg-desktop-portal`, `${root}/data`, `${root}/run`], files, env, appEnv, notify: sink.notify, journal: sink.journal };
}

// ── lane app-display-notify-sink (2026-10-12, B-4a59 piece 2 — owner path 1: "an app's display is a complete private
// session"): the private bus above had NOBODY owning org.freedesktop.Notifications. MEASURED on a scratch bus with the
// .256 services dir: libnotify / GApplication got ServiceUnknown (the notification silently dropped, a GLib warning),
// the portal's Notification.AddNotification answered () and its gtk backend dropped it, and Ubuntu's notify-send CLI
// (AppArmor profile `notify-send`: the user bus paths only) failed "Could not connect: Permission denied" in 8 ms. Now
// the bus activates a SINK (src/notify-sink.py, Python 3 + GDBus — node has no D-Bus) that journals each notification;
// the hub shows it inside the app's window and, when it is critical or the window is not in front of the person, as ONE
// For-you item. SESSION_BUS_NAMES is the census: every well-known name a GUI app may ask its session bus for is
// PROVIDED by this plan or ABSENT-AND-SAID (what the app sees, which piece adds it) — scripts/test-app-display-session-census.
const APP_NOTIFICATIONS_MODES = Object.freeze(['on', 'off']);
const APP_NOTIFICATIONS_DEFAULT = 'on'; // the owner's path-1 ruling (2026-10-12)
const appNotificationsMode = (v) => (APP_NOTIFICATIONS_MODES.includes(v) ? v : APP_NOTIFICATIONS_DEFAULT);
const NOTIFY_SINK_NAME = 'org.freedesktop.Notifications';
const NOTIFY_JOURNAL_MAX = 50;   // the per-display ring the window's ⋯ ▸ Notifications reads
const NOTIFY_TOAST_MS = 6000;
const NOTIFY_SUMMARY_MAX = 200, NOTIFY_BODY_MAX = 1000, NOTIFY_APP_MAX = 80;
const NOTIFY_URGENCIES = Object.freeze(['low', 'normal', 'critical']);
/** The sink's facts → `notify` for portalPlan: null/'off' = the setting is off; { python, sink } = both on this machine;
 *  { why } = what is missing (said, never a refusal to launch). */
function notifySinkOf({ mode, python = null, sink = null, gi = true } = {}) {
  if (appNotificationsMode(mode) === 'off') return { off: true };
  if (!python) return { why: 'python3 not found on this machine' };
  if (!gi) return { why: 'python3 has no GObject introspection (python3-gi) on this machine' };
  if (!sink) return { why: 'the notifications sink is not installed on this machine' };
  return { python, sink };
}
/** PURE: the sink's service file + the bus env it reads (inherited by every activated service). */
function notifySinkPlan({ root, notify }) {
  if (!notify || notify.off) return { notify: 'off', file: null, env: {}, journal: null };
  if (notify.why || !notify.python || !notify.sink) return { notify: `unavailable: ${notify.why || 'no sink'}`, file: null, env: {}, journal: null };
  if (/\s/.test(notify.python + notify.sink)) return { notify: 'unavailable: the sink path has a space (a service Exec= line splits on it)', file: null, env: {}, journal: null };
  const journal = `${root}/notify.jsonl`;
  return { notify: 'on', journal, env: { VS_NOTIFY_JOURNAL: journal },
    file: { file: `${root}/services/${NOTIFY_SINK_NAME}.service`, text: `[D-BUS Service]\nName=${NOTIFY_SINK_NAME}\nExec=${notify.python} ${notify.sink}\n` } };
}
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, n);
/** PURE: one journal line (the sink's JSON) → { nid, app, summary, body, urgency, at } | { nid, closed, at } | null. */
function notifyRecord(raw, { now = Date.now() } = {}) {
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== 'object' || !Number.isInteger(o.nid) || o.nid <= 0) return null;
  const at = Number.isFinite(o.at) ? o.at : now;
  if (o.closed === true) return { nid: o.nid, closed: true, at };
  const summary = clip(o.summary, NOTIFY_SUMMARY_MAX).trim();
  if (!summary && !String(o.body || '').trim()) return null;
  return { nid: o.nid, app: clip(o.app, NOTIFY_APP_MAX).trim(), summary, body: clip(o.body, NOTIFY_BODY_MAX).trim(), urgency: NOTIFY_URGENCIES.includes(o.urgency) ? o.urgency : 'normal', at };
}
/** PURE: what one notification does — always a toast inside the app's window; ONE For-you item when it is critical or
 *  the window is not in front of the person (no pane shows it). */
function notifyVerdict({ note, visible }) {
  if (!note || note.closed) return { toast: false, forYou: false };
  return { toast: true, forYou: note.urgency === 'critical' || !visible };
}
/** THE CENSUS (B-4a59): every well-known SESSION-bus name a GUI app may ask for — `provided` by the plan above (the
 *  piece that provides it), or `absent` with what the app sees and the piece that will add it (`never` = by design). */
const SESSION_BUS_NAMES = Object.freeze([
  { name: 'org.freedesktop.portal.Desktop', provided: 'portal (2.369.256)' },
  { name: 'org.freedesktop.impl.portal.desktop.gtk', provided: 'portal (2.369.256)' },
  { name: 'org.freedesktop.portal.Documents', provided: 'portal (2.369.256, when xdg-document-portal is installed)' },
  { name: 'org.freedesktop.impl.portal.PermissionStore', provided: 'portal (2.369.256, when xdg-permission-store is installed)' },
  { name: NOTIFY_SINK_NAME, provided: 'notifications sink (B-4a59 piece 2; desktop.appNotifications)' },
  { name: 'org.a11y.Bus', provided: 'a11y bus (B-4a59 piece 3: at-spi-bus-launcher, asked only where the user has none — when at-spi2-core is installed)' },
  { name: 'org.freedesktop.secrets', provided: 'secret service (B-4a59 piece 4: src/secret-service.py — desktop.appSecrets, when python3-gi is installed)' },
  { name: 'org.freedesktop.ScreenSaver', absent: { sees: 'Inhibit fails with ServiceUnknown — harmless: the app\'s own display never blanks', piece: 'never (nothing to inhibit)' } },
  { name: 'org.freedesktop.PowerManagement.Inhibit', absent: { sees: 'Inhibit fails with ServiceUnknown — harmless: the machine\'s power policy is the user\'s session\'s', piece: 'never (nothing to inhibit)' } },
  { name: 'org.kde.StatusNotifierWatcher', absent: { sees: 'no tray: a tray icon is not shown (Qt says no system tray); a message it would show reaches the sink only over org.freedesktop.Notifications', piece: 'not planned (a tray row)' } },
  { name: 'org.gtk.vfs.Daemon', absent: { sees: 'no gvfs: the bus pins GIO_USE_VFS=local — local files only (no smb:// or sftp:// in its dialogs); a gvfs FUSE mount would outlive the bus', piece: 'never (by design)' } },
  { name: 'ca.desrt.dconf', absent: { sees: 'no dconf writer: GSettings reads the user\'s settings but a preference the app changes is not saved', piece: 'not planned' } },
  { name: 'org.freedesktop.PolicyKit1.AuthenticationAgent', absent: { sees: 'no polkit agent: an action that needs a password is refused — nobody would ask on this display', piece: 'never (by design)' } },
]);
/** PURE: the census verdict. `universe` = the names judged (printed by the suite), `activatable` = what a started
 *  private bus answered to ListActivatableNames. → rows [{ name, verdict: 'provided' | 'absent-said' | 'RED', why }]. */
function sessionBusCensus({ universe = [], activatable = [], table = SESSION_BUS_NAMES } = {}) {
  const act = new Set(activatable);
  return [...new Set(universe)].map((name) => {
    const row = table.find((r) => r.name === name);
    if (!row) return { name, verdict: 'RED', why: 'neither provided by the plan nor said absent' };
    if (row.provided) return act.has(name) ? { name, verdict: 'provided', why: row.provided } : { name, verdict: 'RED', why: `the plan says ${row.provided} but the bus does not activate it` };
    if (!row.absent || !row.absent.sees || !row.absent.piece) return { name, verdict: 'RED', why: 'absent without saying what the app sees and which piece adds it' };
    return { name, verdict: 'absent-said', why: `${row.absent.sees} — ${row.absent.piece}` };
  });
}

module.exports = {
  LIMITS, DESKTOP_SINGLETON_ID, APP_STATES, LIVE_STATES, DEFAULT_IDLE_TIMEOUT_MIN, KEEPER_ENV,
  DISPLAY_FOR_BROWSER, isDisplayForBrowser, displayForBrowserLabel, // lane one-browser-b1: the browser's display-only session
  APP_SECRETS_MODES, APP_SECRETS_DEFAULT, appSecretsMode, SECRETS_NAME, SECRETS_STORE_FILE, SECRETS_KEY_FILE, secretServicePlan, secretsCountOf, // lane app-display-secrets (+ display-secret-fd: the key file)
  DISPLAY_BACKENDS, BACKEND_IDS, LADDER_IDS, backendById, CAP_KEYS, capsOf, recipeFor, needsVerdict, resolveBackend, fallbackLogLine, parseBackendPrefs, streamKindOf,
  fitPolicyOf, keeperFits, topLevelWindows, appWindows, appFitPlan, appMainWindow, windowTitleOf, APP_TITLE_MAX,
  validateAppRow, validateLaunchRequest, DEFAULT_REGISTRY, APP_SCALES, normalizeDpr, appScaleFor, scaleKnobs, SCALE_RULES, scaleRuleOf, renderOf, relaunchPaneCss, // lane D (a)
  BROWSER_EXEC_RE, BROWSER_APP_ID_RE, isBrowserName, launchedProgram, browserLaunchVerdict,
  SCALE_CHOICES, SCALE_MAX, UI_SCALE_RANGE, normalizeUiScale, normalizeScale, effectiveScale, scalePick, validateRelaunchRequest, relaunchVerdict, relaunchBodyOf, scaleMenuModel, askCloseVerdict, relaunchLeaseVerdict,
  EXPLICIT_SCALES, SCALE_ORIGINS, parseScaleChoice, scaleChoiceVerdict, // lane D: the per-app default scale + the widened explicit set
  OUTER_CLOSE_AGAIN_MS, windowsLeftCount, exitCloseVerdict, outerCloseVerdict,
  RUNNING_STATES, sameAppRecord, launchVerdict, appBrowserVerdict, TERMINAL_TWICE_RE, runsTwiceVerdict, QUICK_EXIT_MS, quickExitVerdict, launchedByText, quickExitNoticeText, browserFamilyOf, defaultProfileDirOf, singletonLockFact, // lane app-launch-singleton
  BROWSER_KINDS, BROWSER_BINS, REAL_BROWSER_ROOTS, isForbiddenBrowserArg, browserRowFor, validateBrowserUrl, profileDirVerdict, browserArgv, firefoxUserJs, URL_MAX, BROWSER_A11Y_FLAG, BROWSER_A11Y_ENV, CHROMIUM_A11Y_ENV,
  CHROMIUM_FRAME_MARKER, chromiumFramePrefs, // lane D (a) item C
  TRANSITIONS, transition, isLiveState, isTerminalState,
  idleState, capVerdict, profileRetireVerdict, PERSON_ENDINGS, adoptVerdict, streamTargetOf, newRecord,
  HOST_OFFLINE_STATE, XPRA_APT_MIN_MAJOR, XPRA_PIN_MAJOR, XPRA_REPO_URL, XPRA_KEY_URL, XPRA_APT_PACKAGES, XPRA_ORG_EXTRA, xpraRepoSteps, xpraInstallPlan, installArgv, machinePickRow, // lane C2
  XPRA_INSTALL, TIGHTVNC_INSTALL, // lane dc-apps-rows: the two installables src/installs.js registers (TIGHTVNC_INSTALL lives in src/machine-desktop-model.js beside its plan)
  // the package slot's names, re-exported from src/install-slot.js (their home since lane dc-apps-rows) for the suites
  planLines, PKG_RE, APT_LOCK_WAIT_S, packageInstallPlan,
  INSTALL_FILES, INSTALL_UNRECORDED_EXIT, INSTALL_LOCK_PREFIX, INSTALL_RUNNER, INSTALL_LAUNCHER, installLauncherArgv,
  DESKTOP_PLATFORMS, MACHINE_DESKTOP_PORT, MACHINE_DESKTOP_PREFIX, machineDesktopId, machineDesktopHost, desktopPickRow, RUN_LINE_MAX, psQuote, psEncoded, desktopRunPlan, DESKTOP_RUN_PRESETS, RUN_REMEMBER_MAX, desktopRunPresets, rememberRun, TIGHTVNC, TIGHTVNC_NO_ADMIN_EXIT, tightvncInstallPlan, // design 014 D1
  A11Y_BUS_NAME, A11Y_BINS, A11Y_PACKAGE, a11yBusPlan, a11yBusOf, // lane app-display-a11y-bus
  APP_PORTAL_MODES, APP_PORTAL_DEFAULT, appPortalMode, PORTAL_SERVICES, PORTAL_REQUIRED, PORTAL_BINS, sandboxOf, portalWanted, portalPlan, // lane app-display-portal
  APP_NOTIFICATIONS_MODES, APP_NOTIFICATIONS_DEFAULT, appNotificationsMode, NOTIFY_SINK_NAME, NOTIFY_JOURNAL_MAX, NOTIFY_TOAST_MS, NOTIFY_SUMMARY_MAX, NOTIFY_BODY_MAX, NOTIFY_URGENCIES, notifySinkOf, notifySinkPlan, notifyRecord, notifyVerdict, SESSION_BUS_NAMES, sessionBusCensus, // lane app-display-notify-sink
};
