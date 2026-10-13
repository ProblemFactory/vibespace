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
 *   dialHealthRow        the /api/hosts row's `dialHealth` — the verdict + the stop recipe of the device's platform
 *   stopRecipeOf         WORDS the person runs on that machine, never an op the hub runs
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

const STOP_RECIPES = Object.freeze({
  darwin: 'launchctl list | grep -i vibespace\nlaunchctl bootout gui/$(id -u)/<label>',
  linux: 'systemctl --user list-units | grep -i vibespace\nsystemctl --user disable --now <unit>',
  win32: 'schtasks /query | findstr /i vibespace\nschtasks /end /tn <name>',
});
/** The platform's stop recipe (the device's STATED platform, from its last accepted dial) — null when unknown. */
function stopRecipeOf(platform) { return Object.prototype.hasOwnProperty.call(STOP_RECIPES, platform) ? STOP_RECIPES[platform] : null; }

/** A dial host record (+ its live link) → the row's `dialHealth` (second dialer only) or null. */
function dialHealthRow(h, { connected = false, now = Date.now() } = {}) {
  const d = h && h.dial && typeof h.dial === 'object' ? h.dial : null;
  if (!d) return null;
  const v = secondDialerVerdict({ lastAccept: d.lastAccept, lastRefusal: d.lastRefusal, connected, now });
  if (v.kind !== SECOND) return null;
  const platform = d.lastAccept && typeof d.lastAccept.platform === 'string' ? d.lastAccept.platform : null;
  return { ...v, platform, recipe: stopRecipeOf(platform) };
}

const logDue = (lastAt, now = Date.now()) => !num(lastAt) || now - num(lastAt) >= LOG_EVERY_MS;
const clearDue = (clearSince, now = Date.now()) => num(clearSince) > 0 && now - num(clearSince) >= CLEAR_MS;

module.exports = { RECENT_MS, DIAL_EVERY_S, LOG_EVERY_MS, CLEAR_MS, SECOND, KINDS, STOP_RECIPES, secondDialerVerdict, stopRecipeOf, dialHealthRow, logDue, clearDue };
