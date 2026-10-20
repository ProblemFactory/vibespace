// lane agent-context-owner-facts (B-7960): THE page's side of the owner's facts (the server's twin: src/server/owner-facts.js).
// ① the CLOCK — the board's times go through the SAME formatter the agents read (src/when-words.js, PURE), in the SAME
// zone: the instance setting `instance.timezone` (a zone this browser knows), else the zone the hub resolved for it (its
// TZ env, else its system zone — /api/home `zone`), else this browser's own. So the row the owner reads says what an agent
// tells them: 16:16 PT. ② the PAGE — what this page tells the hub about the owner's screen, so the agents name the tray by
// the label the owner reads and where it is on the device they use (src/tray-words.js ownerPageDelta).
import { zoneOf, whenOf, timeOf } from '../when-words.js';
import { ownerPageDelta } from '../tray-words.js';
import { resolveLang } from './i18n.js';

let hubZone = null;
/** app.js hands in /api/home's `zone` ({ zone, from }) at boot. */
export function setHubZone(z) { hubZone = z && typeof z.zone === 'string' ? z.zone : null; }

/** THE zone the page prints in. */
export function pageZone(app) {
  let set = '';
  try { set = app && app.settings && typeof app.settings.get === 'function' ? app.settings.get('instance.timezone') : ''; } catch { set = ''; }
  let own = null;
  try { own = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { own = null; }
  return zoneOf(set, { env: hubZone, system: own }).zone;   // the hub's resolved zone stands where the server's TZ env does
}
/** `2026-10-20 16:16 PT` (whenOf's rule: `now` drops today's date) */
export const whenOn = (app, ms, opts = {}) => whenOf(ms, { zone: pageZone(app), ...opts });
/** `16:16 PT` — a row under its day's own header */
export const timeOn = (app, ms) => timeOf(ms, pageZone(app));

/** After the page loaded user-state (the sidebar's one fetch): `ownerPage = { lang, phone }` — this page's language and
 *  whether it is the phone layout — PATCHed (merge-only) only when user-state does not already say so. */
export function reportOwnerPage(state, { phone = false } = {}) {
  const page = ownerPageDelta(state, { lang: resolveLang(), phone: !!phone });
  if (page) fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(page) }).catch(() => {});
  return page;
}
