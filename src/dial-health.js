'use strict';
/**
 * A SECOND AGENT WITH AN OLD TOKEN IS NAMED (lane host-stale-dialer, B-6136, 2026-10-12). The owner's Macbook ran its
 * live agent (2.369.257, connected) AND an older one (a leftover launchd job holding a generation-1 token) — the hub
 * refused the old one every 30 s for a day and the journal was the only reader. PURE (bundled; the server judges, the
 * row and the For-you item say it):
 *   secondDialerVerdict  a token-mismatch refusal NEWER than the last accept while the device is connected (or accepted
 *                        within RECENT_MS) and still knocking (the refusal within RECENT_MS) ⇒ `second-dialer-stale-token`;
 *                        the same refusal with the device DISconnected ⇒ `stale-token` (the ordinary "re-pair" case the
 *                        row already says as REFUSED); anything else `none`
 *   dialHealthRow        the /api/hosts row's `dialHealth` — the verdict, the LIVE install (the address the current
 *                        token was minted for — lane mac-repair-retires-stale) + the stop recipe of the device's platform
 *   stopRecipeOf         WORDS the person runs on that machine, never an op the hub runs — they stop the launch item AND the
 *                        agent itself (by its lock pid): the launch item is a supervisor, the agent runs detached beside it
 *   logDue / clearDue    the journal's once-per-10-min line while the verdict holds; the For-you item clears after 10 min
 */
const RECENT_MS = 2 * 60 * 1000;     // a daemon re-dials every 30 s: 4 missed knocks ⇒ the second agent is gone
const DIAL_EVERY_S = 30;             // the refused daemon's retry period (src/agentd/client.js back-off)
const LOG_EVERY_MS = 10 * 60 * 1000; // the journal line while the verdict holds (the first one at once)
const CLEAR_MS = 10 * 60 * 1000;     // the For-you item resolves when the verdict stayed clear this long
const SECOND = 'second-dialer-stale-token';
const KINDS = Object.freeze([SECOND, 'stale-token', 'none']);
const NONE = Object.freeze({ kind: 'none' });
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** → `{kind, from, since, every}` (second dialer) | `{kind:'stale-token', from, since}` | `{kind:'none'}`. `since` = when
 *  the refusals began (hosts.noteDial keeps `since` across a run of refusals), else the refusal's own instant. */
function secondDialerVerdict({ lastAccept = null, lastRefusal = null, connected = false, now = Date.now() } = {}) {
  const ref = lastRefusal && typeof lastRefusal === 'object' ? lastRefusal : null;
  const refAt = ref ? num(ref.at) : 0;
  if (!refAt || ref.code !== 'token-mismatch') return NONE;
  const accAt = num(lastAccept && lastAccept.at);
  if (refAt <= accAt) return NONE; // an accept after the refusal: the holder of the token is in, the refusal is history
  const from = String(ref.from || '').slice(0, 64);
  const since = Math.min(num(ref.since) || refAt, refAt);
  const live = !!connected || (accAt > 0 && now - accAt <= RECENT_MS);
  if (!live) return { kind: 'stale-token', from, since };
  return now - refAt <= RECENT_MS ? { kind: SECOND, from, since, every: DIAL_EVERY_S } : NONE;
}

/** lane mac-repair-retires-stale (B-06e9, the owner's Macbook 2026-10-18: FOUR installs, one per hub address ever paired,
 *  three re-dialing with old tokens): the install a dial base lands in on the device — the installer's own rule
 *  (scripts/vibespace-agentd-install.sh: `device@` + the dial host, [A-Za-z0-9.-] kept). The hub's record of a device
 *  names the base its current token was minted for (`dial.mintedBase`) ⇒ `device@<that host>` is the LIVE install. → the
 *  directory name, or null when the base names no host. */
function liveInstallOf(base) {
  const m = /^[a-z]+:\/\/([^/:?]+)/.exec(String(base == null ? '' : base));
  const host = m ? m[1].replace(/[^A-Za-z0-9.-]/g, '') : '';
  return host ? `device@${host}` : null;
}
// The supervisor (launchd job / systemd unit / scheduled task) is keyed by the install's directory; `<x>` = the part after
// `device@`. Stopping it is NOT enough: the launchd job is a supervisor that exits 3 («already running») while the agent
// runs DETACHED (ppid 1) holding <install>/state/agentd.lock — so every recipe also stops the agent by that lock's pid.
const POSIX_LIST = "ls ~/.vibespace | grep '^device@'";
const WIN_LIST = "Get-ChildItem \"$env:USERPROFILE\\.vibespace\" -Directory -Filter 'device@*' | Select-Object -ExpandProperty Name";
const RECIPES = Object.freeze({
  darwin: (list) => [list, 'launchctl bootout gui/$(id -u)/cc.vibespace.device.device-<x>', 'kill $(cat ~/.vibespace/device@<x>/state/agentd.lock)'],
  linux: (list) => [list, 'systemctl --user disable --now vibespace-device-device-<x>.service', 'kill $(cat ~/.vibespace/device@<x>/state/agentd.lock)'],
  win32: (list) => [list, "Unregister-ScheduledTask -TaskName 'VibeSpaceDevice-<x>' -Confirm:$false", 'Stop-Process -Id (Get-Content "$env:USERPROFILE\\.vibespace\\device@<x>\\state\\agentd.lock")'],
});
const STOP_RECIPES = Object.freeze(Object.fromEntries(Object.keys(RECIPES).map((p) => [p, RECIPES[p](p === 'win32' ? WIN_LIST : POSIX_LIST).join('\n')])));
/** The platform's stop recipe (the device's STATED platform, from its last accepted dial) — null when unknown. With `liveKey`
 *  (the live install, liveInstallOf) its first line lists only the OTHER installs: the ones to stop, `<x>` each. */
function stopRecipeOf(platform, { liveKey = null } = {}) {
  if (!Object.prototype.hasOwnProperty.call(RECIPES, platform)) return null;
  const live = typeof liveKey === 'string' && /^device@[A-Za-z0-9.-]+$/.test(liveKey) ? liveKey : null;
  if (!live) return STOP_RECIPES[platform];
  const list = platform === 'win32' ? `${WIN_LIST} | Where-Object { $_ -ne '${live}' }` : `${POSIX_LIST} | grep -vxF '${live}'`;
  return RECIPES[platform](list).join('\n');
}

/** A dial host record (+ its live link) → the row's `dialHealth` (second dialer only) or null. `live` = the install the
 *  current token was minted for (null when the record names no base — the recipe then lists every install). */
function dialHealthRow(h, { connected = false, now = Date.now() } = {}) {
  const d = h && h.dial && typeof h.dial === 'object' ? h.dial : null;
  if (!d) return null;
  const v = secondDialerVerdict({ lastAccept: d.lastAccept, lastRefusal: d.lastRefusal, connected, now });
  if (v.kind !== SECOND) return null;
  const platform = d.lastAccept && typeof d.lastAccept.platform === 'string' ? d.lastAccept.platform : null;
  const live = liveInstallOf(d.mintedBase);
  return { ...v, platform, live, recipe: stopRecipeOf(platform, { liveKey: live }) };
}

const logDue = (lastAt, now = Date.now()) => !num(lastAt) || now - num(lastAt) >= LOG_EVERY_MS;
const clearDue = (clearSince, now = Date.now()) => num(clearSince) > 0 && now - num(clearSince) >= CLEAR_MS;

module.exports = { RECENT_MS, DIAL_EVERY_S, LOG_EVERY_MS, CLEAR_MS, SECOND, KINDS, STOP_RECIPES, secondDialerVerdict, liveInstallOf, stopRecipeOf, dialHealthRow, logDue, clearDue };
