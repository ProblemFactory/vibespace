// B-9584 U3 — the profile's «Environment…» dialog, its FORM MODEL (PURE: no DOM, no fetch). The person's three settings as fields, the
// route's body back from them, the page's own check before the save (the server judges again), and what «Automatic» means RIGHT NOW
// from the profile's kept exit — U1's own resolver and verdict (src/browser-environment.js), never a second copy of their rules.
//   · location «this machine's» or «blocked» DROPS the list of sites (主开发 r2497 (5)) — the verdict refuses a list beside them by name
//   · a field left empty in a «value» choice stays empty in the body: the verdict names what is missing, the page never guesses
import { resolveEnvironment, environmentVerdict, keptExitOf, SITES_MAX } from '../browser-environment.js';

export const ENV_KEYS = Object.freeze(['timezone', 'language', 'location']);
/** B-9584, the owner's decision (主开发 r2911 / r2916): does this profile's browser have NO source of this machine's real place? Only an
 *  engine profile whose kernel's probe says so (`geolocationIsolated`, its row of GET /api/browser/engines). Stock Chrome, a Chrome
 *  build or file, a kernel without the patch, an older plugin, an engine not listed, the table not read: false (absent = false). */
export function placeIsolatedOf(r, engines) {
  const b = r && r.browser;
  if (!b || b.kind !== 'plugin' || !b.id) return false;
  const row = Array.isArray(engines) ? engines.find((e) => e && e.id === b.id) : null;
  return !!(row && row.geolocationIsolated === true);
}
export const SITES_LIMIT = SITES_MAX;
const modeOf = (c) => (c && typeof c === 'object' && typeof c.mode === 'string' ? c.mode : 'machine');
const s = (x) => (x == null ? '' : String(x));

/** The kept environment of a profile row (its public view carries `environment`) → the form's fields. */
export function fieldsOf(r) {
  const e = r && r.environment && typeof r.environment === 'object' ? r.environment : {};
  const tz = e.timezone || null, lang = e.language || null, loc = e.location || null;
  const placed = !!(loc && loc.mode === 'value' && loc.value && typeof loc.value === 'object');
  return {
    timezone: { mode: modeOf(tz), value: tz && tz.mode === 'value' ? s(tz.value) : '' },
    language: { mode: modeOf(lang), value: lang && lang.mode === 'value' ? s(lang.value) : '' },
    location: { mode: modeOf(loc), latitude: placed ? s(loc.value.latitude) : '', longitude: placed ? s(loc.value.longitude) : '', accuracy: placed && loc.value.accuracy != null ? s(loc.value.accuracy) : '',
      sites: loc && Array.isArray(loc.sites) ? loc.sites.join('\n') : '' },
  };
}

/** One site a line (a comma also separates); blank lines dropped. */
export const sitesOf = (text) => s(text).split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/** The form's fields → the route's body `{ environment }`. «this machine's» = null; the list rides ONLY beside a place. */
export function bodyOf(f) {
  const env = {};
  for (const k of ['timezone', 'language']) {
    const c = (f && f[k]) || {};
    env[k] = c.mode === 'auto' ? { mode: 'auto' } : c.mode === 'value' ? { mode: 'value', value: s(c.value).trim() } : null;
  }
  const l = (f && f.location) || {};
  if (l.mode === 'block') env.location = { mode: 'block' };
  else if (l.mode === 'value') {
    const value = { latitude: s(l.latitude).trim(), longitude: s(l.longitude).trim() };
    if (s(l.accuracy).trim()) value.accuracy = s(l.accuracy).trim();
    const sites = sitesOf(l.sites);
    env.location = { mode: 'value', value, ...(sites.length ? { sites } : {}) };
  } else env.location = null;   // this machine's: the list DROPPED (r2497 (5))
  return { environment: env };
}

/** The page's own check before the save — U1's verdict on the very body it would send ({ ok, code, error } | { ok, value }). */
export function checkOf(f) { return environmentVerdict(bodyOf(f).environment); }

/** What «Automatic» means RIGHT NOW for the time zone and the language, from the profile's kept exit: { value, from: 'exit' } or
 *  { value: null, said } (nothing to follow: no exit kept, or it lacks what the setting needs — then it acts as this machine's). */
export function autoSaidOf(r) {
  const res = resolveEnvironment({ timezone: { mode: 'auto' }, language: { mode: 'auto' } }, keptExitOf(r || {}));
  const at = (k) => { const x = (res.settings || []).find((y) => y.key === k) || {}; return x.from === 'exit' ? { value: x.value, from: 'exit' } : { value: null, said: x.said || 'no_exit' }; };
  return { timezone: at('timezone'), language: at('language') };
}

/** Did the person change anything? (the unsaved guard) — the bodies compared, never the raw fields. */
export const changedFrom = (r, f) => JSON.stringify(bodyOf(fieldsOf(r))) !== JSON.stringify(bodyOf(f));
