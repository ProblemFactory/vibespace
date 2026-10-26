'use strict';
/**
 * THE ATTACH ROAD — lane one-browser-b1 (design q-026 r1 §2.1 / §2.4 / §3 row B1, 2026-10-16). PURE: imports nothing.
 *
 * On a machine with xpra the keeper runs a profile's Google Chrome ITSELF, on a display session of its own (the desktop
 * keeper's `display-for-browser` kind: the xpra-seamless recipe, no app, no idle stop), and agent-browser ATTACHES to it:
 * of the keeper's 8 driver methods `launch` and `cdpUrl` become the keeper's (spawn Chrome, read its DevToolsActivePort),
 * `exec` is `agent-browser --cdp <the record's ws url> …`, the stream stays the driver's. Measured on agent-browser 0.38.2 + Google
 * Chrome 154.0.8037.57 (lane one-browser-b1, tools/probe1.sh + probe2.sh, a private Xvfb):
 *   · `--cdp <port>` on EVERY call never launches a browser, whatever profile / config env rides beside it; `connect
 *     <port>` stores nothing — the NEXT verb under a profile env started a second Chrome on that directory, under a
 *     config env one on a temp profile (the M0 trap, re-measured: it is `connect`'s, not the env's);
 *   · a CDP session's `close` and `close --all` never end the attached Chrome; `close --all` ends every session of its
 *     NAMESPACE under its socket root (a session of another namespace in the same root survived);
 *   · a call whose launch view differs REUSES the session's daemon (same pid, `restartedBackground: false`) — but its
 *     CONNECTION is re-launched (tools/probe4.sh, the stream server's own events): a call naming the CDP endpoint by
 *     another VALUE (`--cdp <port>` beside the agent's `AGENT_BROWSER_CDP=<ws url>`) drops and re-opens it every time
 *     (`tabs: 0`, `connected: false`), and one with another CONFIG ends the session's stream for good; the flag and the env
 *     twin with the SAME url and config are identical. So every keeper call names the record's ws url (the very value the
 *     agent's pairs carry) and the lease config (the file the agent's commands name);
 *   · `navigator.webdriver` is true from the debugging port alone (M0) — this argv hides it (AutomationControlled).
 * The DRIVER road (agent-browser launches Chrome itself) stays the rung below: no xpra, a headless ask, a provider with
 * its own launch (cloak), a paired machine, a conversation's own temporary browser — its argv always carries
 * --disable-sync, so it cannot sign in to Google, and the record says so.
 */

/** The flags every attach launch carries (design §2.1, verbatim) — the census reds a launch missing one. */
const ATTACH_REQUIRED = Object.freeze(['--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', '--disable-blink-features=AutomationControlled', '--disable-background-networking']);
/** NEVER on an attach launch: `--disable-sync` removes Chrome's sign-in entry and its SyncService (M0 ④) — B4 needs both. */
const ATTACH_FORBIDDEN = Object.freeze(['--disable-sync']);
/** Today's profile store choice (agent-browser's own: the basic store + a fixed key, lane browser-profile-clone measured
 *  it) — B4 decides the rest (libsecret for a signed-in profile). */
const PROFILE_STORE = Object.freeze(['--password-store=basic', '--use-mock-keychain']);
/** The executables the attach road looks for on the machine's PATH, in order — Google Chrome first (design §0: Chrome is
 *  the default, Chromium the legacy one). */
const CHROME_NAMES = Object.freeze(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']);
/** Chrome writes the port it bound (line 1) and the browser target's path (line 2) here, in its user-data-dir. */
const PORT_FILE = 'DevToolsActivePort';
/** How long a launch waits for a NEW port file before the named refusal `cdp_port_missing` (measured: ~160–320 ms). */
const PORT_WAIT_MS = 5000;
const PORT_STEP_MS = 50;
/** The driver version the attach facts above were MEASURED on (VibeSpace's pin) — an older or unknown driver keeps the
 *  driver road: `--cdp` never launching, `close` never ending the attached Chrome, the connection rules are 0.38.2's. */
const ATTACH_MIN_DRIVER = '0.38.2';
/** Is `v` ('0.38.2', 'agent-browser 0.38.2') at least `min`? Unknown ⇒ false. */
function driverAtLeast(v, min = ATTACH_MIN_DRIVER) {
  const parse = (x) => { const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(x == null ? '' : x)); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
  const a = parse(v), b = parse(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
/** The socket path tail past a socket root for our name shapes (`<root>/namespaces/vs-bp-<8 hex>/run/vs-bk-<8 hex>.sock`). */
const SOCKET_TAIL_BYTES = '/namespaces/vs-bp-00000000/run/vs-bk-00000000.sock'.length;
const SOCKET_PATH_MAX = 103;
/** The launch keys a CDP call must never carry (any of them is a LAUNCH request of the driver's): dropped from every
 *  keeper call on an attach record — the endpoint rides `--cdp` instead, the socket root is the config's own. */
const ATTACH_DROP_ENV = Object.freeze(['AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_CDP', 'AGENT_BROWSER_AUTO_CONNECT', 'AGENT_BROWSER_HEADED', 'AGENT_BROWSER_EXECUTABLE_PATH', 'AGENT_BROWSER_ARGS', 'AGENT_BROWSER_PROVIDER', 'AGENT_BROWSER_SOCKET_DIR']);

/** The census over ONE argv: `{ok, missing, forbidden, userDataDir}` — every required flag present, none forbidden, exactly
 *  one --user-data-dir. */
function argvVerdict(argv) {
  const a = Array.isArray(argv) ? argv.map(String) : [];
  const missing = ATTACH_REQUIRED.filter((f) => !a.includes(f));
  const forbidden = a.filter((x) => ATTACH_FORBIDDEN.some((f) => x === f || x.startsWith(f + '=')));
  const userDataDir = a.filter((x) => x.startsWith('--user-data-dir=')).length === 1;
  return { ok: !missing.length && !forbidden.length && userDataDir, missing, forbidden, userDataDir };
}
/** THE ARGV of an attach launch (design §2.1): the required flags, the profile's directory, the profile store, the quiet
 *  log switches and the keeper's launch mark (both handed in: browser-stderr / browser-profiles spell them), then
 *  `about:blank` (Chrome's first tab blank — no New Tab page fetching anything). `extra` (lane engine-plugin) = a browser
 *  ENGINE's own launch arguments, before the mark — the same census judges them (a second --user-data-dir or a forbidden
 *  switch refuses the whole argv). → `{ok, argv}` | `{ok:false, code, error}`. */
function attachArgv({ profileDir, mark = null, quiet = [], url = 'about:blank', extra = [] } = {}) {
  if (typeof profileDir !== 'string' || !profileDir.startsWith('/')) return { ok: false, code: 'bad_profile_dir', error: "the attach launch needs the profile's absolute directory" };
  const argv = ['--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11',
    '--disable-blink-features=AutomationControlled', '--disable-background-networking', ...PROFILE_STORE, ...(Array.isArray(quiet) ? quiet.map(String) : []), ...(Array.isArray(extra) ? extra.map(String) : []), ...(mark ? [String(mark)] : []), String(url || 'about:blank')];
  const v = argvVerdict(argv);
  return v.ok ? { ok: true, argv } : { ok: false, code: 'bad_argv', error: `the attach argv failed its census (missing ${v.missing.join(' ') || '-'}; forbidden ${v.forbidden.join(' ') || '-'})` };
}
/** `DevToolsActivePort`'s text → `{port, wsPath}` | null (a half-written file is null: line 2 not there yet). */
function parsePortFile(text) {
  const [l1 = '', l2 = ''] = String(text == null ? '' : text).split('\n');
  if (!/^\d{1,5}$/.test(l1.trim())) return null;
  const port = Number(l1.trim());
  if (port < 1 || port > 65535) return null;
  const p = l2.trim();
  return /^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(p) ? { port, wsPath: p } : null;
}
/** THE PORT FILE'S THREE STATES for a launch spawned at `spawnedAt` (ms): `new` (written AFTER the spawn and whole ⇒ its
 *  port is this launch's `cdpUrl`), `stale` (there, but not written by this launch — a killed Chrome's names a dead port:
 *  NEVER connected to), `missing` (absent, or a new one still half-written ⇒ keep polling). */
function portFileVerdict({ text = null, mtimeMs = null, spawnedAt = 0 } = {}) {
  if (text == null || mtimeMs == null) return { state: 'missing', port: null, wsPath: null };
  if (!(Number(mtimeMs) > Number(spawnedAt))) return { state: 'stale', port: null, wsPath: null };
  const p = parsePortFile(text);
  return p ? { state: 'new', port: p.port, wsPath: p.wsPath } : { state: 'missing', port: null, wsPath: null };
}
const cdpUrlOf = (port, wsPath) => `ws://127.0.0.1:${Number(port)}${wsPath}`;
/** The refusal when no new port file came: said by name — the keeper never connects to a port this launch did not write. */
function portMissing({ waitedMs = PORT_WAIT_MS, stale = false } = {}) {
  return { code: 'cdp_port_missing', error: `Chrome wrote no new ${PORT_FILE} within ${Math.round(waitedMs / 100) / 10} s${stale ? ' (only the stale one a previous Chrome left, naming a dead port)' : ''} — the keeper never connects to a port this launch did not write; the browser was ended` };
}
/** THE SOCKET DIR OF ONE CONFIG (design §2.1: `close --all` must not cross configs): `<base>/vs-ab-<uid>/<profileId>` —
 *  the short per-uid root (browser-profiles' `socketDirDecision` spelling) + the profile's own directory. Every keeper call
 *  on an attach record and the agent's own pairs name it, so a session of this config lives there and nowhere else.
 *  → `{dir, parent, bytes, fits}` (bytes = the longest socket path our names make under it). */
function attachSocketDir({ base = '/tmp', uid = null, profileId } = {}) {
  const b = /^\/[A-Za-z0-9._/-]*$/.test(String(base || '')) ? String(base).replace(/\/+$/, '') : '/tmp';
  const parent = `${b}/vs-ab-${Number.isInteger(uid) && uid >= 0 ? uid : 'u'}`;
  const id = /^[a-z0-9][a-z0-9-]{0,40}$/i.test(String(profileId || '')) ? String(profileId) : null;
  if (!id) return { dir: null, parent, bytes: 0, fits: false };
  const dir = `${parent}/${id}`;
  const bytes = dir.length + SOCKET_TAIL_BYTES; // ASCII by construction (the base and the id are both checked above): characters = bytes
  return { dir, parent, bytes, fits: bytes <= SOCKET_PATH_MAX };
}
/** ONE keeper call on an attach record: `--cdp <the record's ws url>` first (the SAME value the agent's pairs carry — another
 *  spelling re-launches the session's connection, measured), the launch keys dropped, the config's own socket root. */
function attachCall(args, env, { cdp, socketDir } = {}) {
  const e = { ...(env || {}) };
  for (const k of ATTACH_DROP_ENV) delete e[k];
  if (socketDir) e.AGENT_BROWSER_SOCKET_DIR = String(socketDir);
  return { args: ['--cdp', String(cdp), ...(Array.isArray(args) ? args.map(String) : [])], env: e };
}
/**
 * THE ROAD of one launch → `{launch: 'attach' | 'driver', why}` (the record carries both — the fact the panel and the agent
 * read). Attach needs: a launch on THIS machine of a row that STARTS its own browser without its own launch flags (cloak
 * keeps its build's), a window wanted (an explicit headless ask keeps the driver's headless launch), the display keeper
 * wired, the driver at the version the attach facts were measured on (ATTACH_MIN_DRIVER), xpra + xauth on the machine, and
 * a Chrome executable found. Everything else is the driver road, said.
 */
function launchRoad({ local = true, starts = true, ownLaunch = false, headed = null, wired = false, driverVersion = null, xpra = false, exe = null } = {}) {
  const driver = (why) => ({ launch: 'driver', why });
  if (!local) return driver('on another machine — its own launch');
  if (!starts) return driver('not a browser VibeSpace starts');
  if (ownLaunch) return driver("this backend's own launch (its build carries its flags)");
  if (headed === false) return driver('a headless browser was asked for (Settings) — the driver launches it');
  if (!wired) return driver('no display keeper in this process');
  if (!driverAtLeast(driverVersion)) return driver(`the browser driver ${driverVersion || '(version unknown)'} is older than ${ATTACH_MIN_DRIVER}, the version the attach road was measured on — it launches its own browser`);
  if (!xpra) return driver(HIDDEN_WINDOW_WHY);
  if (!exe) return driver('no Google Chrome on this machine — the driver launches its own browser in a hidden window (cannot sign in to Google)');
  return { launch: 'attach', why: 'Google Chrome on its own display (xpra) — a real window you can take over, and it can sign in to Google' };
}
/** How the hidden-window fallback is said (the rung below; design §2.1): one sentence on the record. */
const HIDDEN_WINDOW_WHY = 'no xpra on this machine — the hidden window: the driver starts its own invisible display, and its launch always passes --disable-sync, so this browser cannot sign in to Google';

module.exports = {
  ATTACH_REQUIRED, ATTACH_FORBIDDEN, ATTACH_MIN_DRIVER, driverAtLeast, PROFILE_STORE, CHROME_NAMES, PORT_FILE, PORT_WAIT_MS, PORT_STEP_MS, SOCKET_TAIL_BYTES, SOCKET_PATH_MAX, ATTACH_DROP_ENV, HIDDEN_WINDOW_WHY,
  argvVerdict, attachArgv, parsePortFile, portFileVerdict, cdpUrlOf, portMissing, attachSocketDir, attachCall, launchRoad,
};
