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
import { SCALE_CHOICES, parseScaleChoice, normalizeScale } from '../desktop-fit.js';

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
 *  current (checked — a live row like the others, never greyed: lane ui-controls-and-bugs). */
export function scaleDefaultMenuModel(map, key) {
  const cur = scaleChoiceOf(map, key);
  return SCALE_CHOICES.map((choice) => ({ choice, current: choice === cur }));
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
/**
 * B-92aa (the coordinator's r2217) — THE PANE A RELAUNCH HANDS ITS NEW CONNECTION'S FIRST MAP: only a size the window TAKES.
 * `fit` = the window manager's own answer to the relaunch fit's ask (WindowManager.fitSizeFor: the layout size resizeWindowTo
 * applies — its minimum raised, capped at the workspace — or null when it refuses: maximized, minimized, a tab chain, a fixed
 * size, the phone layout). The pane = that size × the UI scale − the chrome around the pane, ROUNDED the way the pane is then
 * measured (clientWidth: a whole CSS px, at least 1 — a half pixel handed on maps a pixel narrow and is refit). → { width,
 * height }, or null: no plan, the first map measures the pane (the release's road).
 */
export function relaunchHandOver({ fit = null, chrome = null, uiScale = 1 } = {}) {
  if (!fit || !(Number(fit.w) > 0) || !(Number(fit.h) > 0)) return null;
  const s = Number(uiScale) > 0 ? Number(uiScale) : 1, c = chrome || {};
  const width = Math.round(Number(fit.w) * s - (Number(c.w) || 0)), height = Math.round(Number(fit.h) * s - (Number(c.h) || 0));
  return width >= 1 && height >= 1 ? { width, height } : null;
}
/**
 * …and whether a handed plan still holds when the first connect reads it (r2217; r2389): the window still takes a fit (`refused`
 * false — not maximized, minimized, chained or on the phone layout NOW) and its own size is EXACTLY the fit's (`fit`). Its size
 * from before the fit (`at`) counts only while the fit has NOT run yet (`landed` false); once the fit ran, a window back at its
 * old size (the person snapped it into the same zone in the «Starting…» wait) drops the plan, as does any other size. Sizes as
 * the window's own style strings ('' = never sized).
 * IN THE PRODUCT THE FIT RUNS IN THE PLAN's OWN TICK (planRelaunch: relaunchPlanFor, then fitAfterRelaunch), so the not-landed
 * branch is met by NO road today: it is the order's own safety — if the fit ever lands later again, the first map still takes
 * the plan — and the stall suite (its copy holds the fit past the map) is its one reader (the coordinator's r2391).
 */
/** …and THE FIT's OWN VERDICT on a plan not read yet (r2391): the fit applied exactly the plan's size ⇒ the plan, now `landed`; refused
 *  (false) or another size ⇒ null — a not-landed plan never outlives its relaunch. desktop-app-window.js fitAfterRelaunch asks it. */
export function relaunchPlanAfterFit(plan, done) {
  if (!plan || !plan.fit) return null;
  return done && done.w === plan.fit.w && done.h === plan.fit.h ? { ...plan, landed: true } : null;
}
export function relaunchPlanHolds({ at = null, fit = null, now = null, refused = false, landed = true } = {}) {
  if (refused || !fit || !now) return false;
  const same = (a, b) => String(a.w) === String(b.w) && String(a.h) === String(b.h);
  return same(now, fit) || (!landed && !!at && same(now, at));
}
/**
 * B-a52d (主开发 r4884) — THE PLAN IS MADE AT THE FIRST OF THE TWO EVENTS. The hub broadcasts a relaunch's successor BEFORE it
 * answers the press (src/desktop-serve.js relaunch: commit, then the old app's stop, then the answer) and the window follows the
 * broadcast at once, so its new connection could map before the answer's plan and fit existed (a stale map, then the refit a
 * person sees: the placed stall 823b4235e-20261126093305-box, every relaunch that changes the size). The press keeps only what the
 * plan is made from (the window's geometry — the plan itself needs the successor's RECORD: «auto» is the server's to resolve);
 * the window's retarget names the successor on ITS OWN press (`nextId`); the first event that carries that record — the answer,
 * or the record's door before the view connects — takes the press and plans; the second finds none and changes nothing.
 * `press` = { fromId, nextId?, at } (this window's own press, in flight), `nextId` = the record's id, `now` (ms). → true = plan now.
 * A press waits at most RELAUNCH_PRESS_MS for its successor and ENDS WITH ITS ANSWER whatever it is (desktop-app-window.js relaunchAt:
 * a refusal, a lost answer or the successor named) — nothing it leaves can shape a later relaunch, another press's or another
 * client's (主开发 r5011 (a)); a window that did not press has none (a second client is as before).
 */
export const RELAUNCH_PRESS_MS = 60 * 1000;
export function relaunchPressTakes(press, { nextId = null, now = 0 } = {}) {
  if (!press || !press.nextId || !nextId || press.nextId !== nextId || press.nextId === press.fromId) return false;
  const age = Number(now) - (Number(press.at) || 0);
  return age >= 0 && age <= RELAUNCH_PRESS_MS;
}
