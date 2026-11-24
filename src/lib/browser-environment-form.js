// B-9584 U3 — the profile's «Environment…» dialog, its FORM MODEL (PURE: no DOM, no fetch). The person's three settings as fields, the
// route's body back from them, the page's own check before the save (the server judges again), and what «Automatic» means RIGHT NOW
// from the profile's kept exit — U1's own resolver and verdict (src/browser-environment.js), never a second copy of their rules.
//   · location «this machine's» or «blocked» DROPS the list of sites (主开发 r2497 (5)) — the verdict refuses a list beside them by name
//   · a field left empty in a «value» choice stays empty in the body: the verdict names what is missing, the page never guesses
import { resolveEnvironment, environmentVerdict, keptExitOf, SITES_MAX } from '../browser-environment.js';

export const ENV_KEYS = Object.freeze(['timezone', 'language', 'location']);
/** B-9584, the owner's decision (主开发 r2911 / r2916 / r3795): may the page say «cannot leak»? ONLY the server's own verdict for this
 *  profile says so (GET /api/browser/engines?profile=<id> → `placeIsolated`: what runs now and what starts next both a kernel whose
 *  probe stated it — the keeper's placeIsolatedFor). A missing answer, an error, any other value: false (the weaker sentence). */
export function placeIsolatedOf(answer) {
  return !!(answer && !answer.error && answer.placeIsolated === true);
}
/** r3795 (3): THE OPEN FORM FOLLOWS THE PROFILE — the broadcasts that can move the verdict (its record: Change build…; its browser's
 *  state: a start, a stop, a kernel landing at a start) ask the server again while the form is open. */
export const LEAK_MOVES = Object.freeze(['browser-profiles-updated', 'browser-housekeeping-updated']);
/** The sentence's watch (no DOM, node-tested): `ask()` → the server's answer, `say(isolated)`, `on(fn)` / `off(fn)` the app's
 *  broadcasts. start() says the weaker sentence at once, then asks; ONE ask in flight — a move meanwhile asks once more after it;
 *  stop() (the form closed) says nothing more. → { start, stop }. */
export function leakWatch({ ask, say, on = null, off = null }) {
  let live = false, inFlight = false, again = false;
  const once = async () => {
    if (!live) return;
    if (inFlight) { again = true; return; }
    inFlight = true;
    let isolated = false;
    try { isolated = placeIsolatedOf(await ask()); } catch { isolated = false; }
    inFlight = false;
    if (live) say(isolated);
    if (again && live) { again = false; await once(); }
  };
  const onMove = (m) => { if (live && m && LEAK_MOVES.includes(m.type)) once(); };
  return {
    start() { if (live) return Promise.resolve(); live = true; say(false); if (on) on(onMove); return once(); },
    stop() { live = false; if (off) off(onMove); },
  };
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
