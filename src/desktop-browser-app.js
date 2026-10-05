'use strict';
/**
 * A BROWSER AS A DESKTOP APP — the browser families (`BROWSER_KINDS`), their argv / profile / URL verdicts
 * (`validateBrowserUrl` — the launch dialog asks it). PURE: imports nothing. Moved verbatim out of
 * src/desktop-apps.js (rv-desktop-apps F-S1, lane dc-seams-desktop 2026-10-05); src/desktop-apps.js re-exports
 * every name.
 */

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
 * LANE E (D4, 2026-09-25): the ACCESSIBILITY switch, always — a browser the user shares with an agent is read through
 * its AT-SPI tree, and the tree is closed unless asked for at launch: chromium `--force-renderer-accessibility`
 * (measured on Chrome 153 under the keeper: WITH it a snapshot reaches the page in the default 600-node budget — 235
 * nodes, the button's `press` action, click @ref pressing it with no viewer; WITHOUT it 4 nodes, the application and
 * three unreadable frames, no page in 30 s), firefox the `GNOME_ACCESSIBILITY=1` env (`env` in the answer — the
 * keeper merges it into the app's environment; unmeasured here: the box's firefox is a snap). Turning a11y on at
 * runtime instead would flip org.a11y.Status for the user's WHOLE session (the Windows-freeze class) — never.
 * CHROME 154 (MEASURED 2026-09-29, 154.0.8037.57, the .197 integration's heavy tier): the flag alone no longer puts
 * the browser on the AT-SPI bus in a minimal environment (the keeper's) — its application object appears only with one
 * of ACCESSIBILITY_ENABLED / GNOME_ACCESSIBILITY / QT_ACCESSIBILITY = 1 in ITS env (each measured to be enough; none
 * of them ⇒ no application object, the page unreachable, even with the flag) — so chromium carries
 * `ACCESSIBILITY_ENABLED=1` beside the flag: the app's own environment, never the session's.
 * Refused by name: not a browser row, a forbidden (profile / automation) flag in the row, a bad profile dir, a bad URL.
 * Returns `{ ok, argv, url, env, code, error }`.
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
  const profile = row.browser === 'firefox' ? ['--new-instance', '-profile', d] : [`--user-data-dir=${d}`, '--no-first-run', '--no-default-browser-check', '--password-store=basic', BROWSER_A11Y_FLAG];
  return { ok: true, argv: [...own, ...profile, ...(u ? [u] : [])], url: u, env: row.browser === 'firefox' ? { ...BROWSER_A11Y_ENV } : { ...CHROMIUM_A11Y_ENV }, code: null, error: null };
}
/**
 * LANE D (a) item C — CHROME DRAWS ITS OWN FRAME (MEASURED 2026-09-25, Google Chrome 153.0.8010.47 under xpra 6.5.3,
 * docs/design-desktop-apps-seamless §3.3): Chrome does not recognise xpra's window manager ("Xpra"), so its "Use system
 * title bar and borders" (the profile pref `browser.custom_chrome_frame` = false) is its default — `_MOTIF_WM_HINTS
 * 0x2,0,1,0,0` ⇒ xpra `decorations: 1`: Chrome draws its tab strip and toolbar with NO ─ □ ✕ and asks the window
 * manager for a frame, so the window is SSD and VibeSpace's title bar (carrying Chrome's own title and icon — the bar
 * the owner read as Chrome's) and the status strip both stay. With the pref TRUE Chrome draws its own frame
 * (`decorations: 0`, `_GTK_FRAME_EXTENTS 5,5,5,5`, minimum +10 px) — seamless like GNOME Calculator, its own ─ □ ✕
 * acting on OUR window; flipping the pref in Chrome's own Settings flips the same X window live. Chrome 153 has NO
 * command-line flag for it (a strings search of the binary finds only the pref name) — the profile is the switch.
 * `chromiumFramePrefs(prefs)` → `{ ok, changed, prefs, why }`: the Preferences object with
 * `browser.custom_chrome_frame: true` ONLY when the key is absent (an existing true / false — the user's own choice
 * inside Chrome — is kept as is); `null` (no file yet) ⇒ a new minimal object; anything that is not a plain object ⇒
 * `ok: false` (never overwrite a file we cannot read). The keeper seeds a profile ONCE (`CHROMIUM_FRAME_MARKER` beside
 * it): Chrome may drop a pref equal to its default, and a user who turned the system title bar back on must not be
 * overridden at the next launch.
 */
const CHROMIUM_FRAME_MARKER = '.vibespace-frame-seeded';
function chromiumFramePrefs(prefs) {
  if (prefs === null || prefs === undefined) return { ok: true, changed: true, prefs: { browser: { custom_chrome_frame: true } }, why: 'new' };
  if (typeof prefs !== 'object' || Array.isArray(prefs)) return { ok: false, changed: false, prefs: null, why: 'not-an-object' };
  const b = prefs.browser;
  if (b !== undefined && (b === null || typeof b !== 'object' || Array.isArray(b))) return { ok: false, changed: false, prefs: null, why: 'browser-not-an-object' };
  if (b && Object.prototype.hasOwnProperty.call(b, 'custom_chrome_frame')) return { ok: true, changed: false, prefs, why: 'set' };
  return { ok: true, changed: true, prefs: { ...prefs, browser: { ...(b || {}), custom_chrome_frame: true } }, why: 'absent' };
}

/** Lane E (D4): the accessibility switch of a desktop-app browser — chromium's flag, firefox's env (see browserArgv). */
const BROWSER_A11Y_FLAG = '--force-renderer-accessibility';
const BROWSER_A11Y_ENV = Object.freeze({ GNOME_ACCESSIBILITY: '1' });
/** Chrome ≥ 154 registers on the AT-SPI bus only with an accessibility env beside the flag (measured, see browserArgv). */
const CHROMIUM_A11Y_ENV = Object.freeze({ ACCESSIBILITY_ENABLED: '1' });
/** Firefox has no --no-first-run: its profile's user.js IS the switch (written by the keeper before the launch). */
function firefoxUserJs() {
  return [
    ['browser.shell.checkDefaultBrowser', false], ['browser.aboutwelcome.enabled', false], ['browser.startup.homepage_override.mstone', 'ignore'],
    ['startup.homepage_welcome_url', ''], ['startup.homepage_welcome_url.additional', ''], ['datareporting.policy.firstRunURL', ''],
    ['toolkit.telemetry.reportingpolicy.firstRun', false], ['trailhead.firstrun.didSeeAboutWelcome', true], ['browser.tabs.warnOnClose', false],
  ].map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n';
}

module.exports = {
  BROWSER_KINDS, BROWSER_BINS, isForbiddenBrowserArg, browserRowFor, URL_MAX, validateBrowserUrl, within, REAL_BROWSER_ROOTS, profileDirVerdict, browserArgv, CHROMIUM_FRAME_MARKER, chromiumFramePrefs, BROWSER_A11Y_FLAG, BROWSER_A11Y_ENV, CHROMIUM_A11Y_ENV, firefoxUserJs,
};
