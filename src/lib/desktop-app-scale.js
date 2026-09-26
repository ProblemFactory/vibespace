// THE PER-APP DEFAULT SCALE — PURE (lane D, 2026-09-25; docs/design-desktop-apps-seamless.zh.md §3.4 note). The owner:
// "最好加入可以在app启动前那个app选择界面调整每个app默认dpi的能力". A person picks, per APP, the scale it starts at
// (Auto / 1× / 1.5× / 2× / 2.5× / 3×) on its card in the launch dialog — or from a running window's Scale ▸ ("Make n× the
// default for this app"). It is remembered in user state `desktopAppScale[<key>]` (synced to every client, the
// `desktopAppFrame` pattern — the SAME key: the registry app id, else `exec:<basename>`), rides the launch POST as
// `scaleChoice` and becomes the record's scale with origin 'app' (src/desktop-apps.js scalePick: a window's own Scale ▸
// relaunch > the app default > an explicit Settings → Desktop app scale > auto). 'auto' is not stored: it REMOVES the key
// (the instance default decides again) — the map never grows by choices that change nothing.
// This file DECIDES (structure only, no words, no DOM); desktop-app-launcher.js / desktop-app-window.js say it.
// Gate: scripts/test-desktop-app-scale.mjs (fast).
import { frameKeyOf } from './desktop-seamless.js';
import { SCALE_CHOICES, parseScaleChoice, normalizeScale } from '../desktop-apps.js';

/** The user-state key the per-app default scales live under. */
export const SCALE_PREF_KEY = 'desktopAppScale';

/** The key an app's default scale is remembered under — THE frame key (one key per app for both per-app choices):
 *  a record, a catalog row (`{appId}`) or a typed command (`{exec}`); null when nothing names the app. */
export const scaleKeyOf = (x) => frameKeyOf(x);

/** The default scale stored for an app: a number of EXPLICIT_SCALES, or 'auto' (none / unreadable). */
export function scaleChoiceOf(map, key) {
  if (!key || !map || typeof map !== 'object' || !Object.prototype.hasOwnProperty.call(map, key)) return 'auto';
  const c = parseScaleChoice(map[key]);
  return typeof c === 'number' ? c : 'auto';
}

/** The map after one choice: 'auto' (or anything that is not an explicit scale) REMOVES the key. */
export function setScaleChoice(map, key, choice) {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  if (!key) return next;
  const c = parseScaleChoice(choice);
  if (typeof c === 'number') next[key] = c; else delete next[key];
  return next;
}

/** The launch body's `scaleChoice` for a launch payload (`{appId}` a catalog card, `{exec}` a typed / recent command):
 *  the stored default (a number), or null — nothing is sent, the instance default decides. */
export function launchScaleChoice(map, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const key = scaleKeyOf(p.appId ? { appId: p.appId } : { exec: p.exec });
  const c = scaleChoiceOf(map, key);
  return typeof c === 'number' ? c : null;
}

/** A catalog card's default-scale menu: every SCALE_CHOICES row ('auto' = follow the instance default), the stored one
 *  current (checked, not offered again). */
export function scaleDefaultMenuModel(map, key) {
  const cur = scaleChoiceOf(map, key);
  return SCALE_CHOICES.map((choice) => ({ choice, current: choice === cur, disabled: choice === cur }));
}

/**
 * The tail of a running window's Scale ▸ (after the scale rows): what its app's default is and what a person may do with
 * it — `{ key, def, running, make, isDefault, clear }`:
 *   def       the stored default ('auto' = none);
 *   running   what the window runs at, as a CHOICE: 'auto' when its scale was derived, else the explicit scale (null when
 *             the value is not one a person picks — a record from before the explicit set);
 *   make      the scale "Make n× the default for this app" would store (the running explicit scale when it differs from
 *             the default), else null;
 *   isDefault the window runs AT its app's default (the menu says so, one line);
 *   clear     a default is stored ("Forget this app's default" puts the instance default back).
 * A record nothing names (no key) ⇒ null: no rows.
 */
export function appDefaultModel(rec, map) {
  const key = scaleKeyOf(rec);
  if (!key || !rec) return null;
  const def = scaleChoiceOf(map, key);
  const explicit = parseScaleChoice(normalizeScale(rec.scale));
  const running = rec.scaleOrigin === 'auto' ? 'auto' : typeof explicit === 'number' ? explicit : null;
  const make = typeof running === 'number' && running !== def ? running : null;
  return { key, def, running, make, isDefault: typeof def === 'number' && running === def, clear: typeof def === 'number' };
}
