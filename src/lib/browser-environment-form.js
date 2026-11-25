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
/** r3795 (3) / r3946: THE OPEN FORM FOLLOWS ITS OWN PROFILE — it asks again only on a move that concerns IT: a profiles broadcast that
 *  moves this profile's own row (its build choice, its kernel mark) or its browser record (its state, its recorded launch), or a move
 *  of the engines' kernels (browser-engines-updated). Another profile's move asks nothing. */
export const LEAK_MOVES = Object.freeze(['browser-profiles-updated', 'browser-engines-updated']);
/** This profile's signature in a digest-shaped message (a broadcast, or the server's own answer): null when the message has no row of it. */
export function leakSignOf(m, id) {
  const p = m && Array.isArray(m.profiles) ? m.profiles.find((x) => x && x.id === id) : null;
  if (!p) return null;
  const b = m.browsers && typeof m.browsers === 'object' ? m.browsers[id] : null;
  return JSON.stringify([p.browser || null, p.kernelLive || null, b ? b.state || null : null, b ? b.browserChoice || null : null]);
}
/** The sentence's watch (no DOM, node-tested): `id` / `choice` the profile and its choice when the form opened, `ask()` → the server's
 *  answer, `say(isolated)`, `on(fn)` / `off(fn)` the app's broadcasts. A profile on stock Chrome ASKS NOTHING (words only, the owner's
 *  decision) until a move of its own puts it on an engine; ONE ask in flight, a move meanwhile asks once more after it; the server's
 *  answer is the baseline the broadcasts are compared with; a reply asked before a move of the profile is dropped (r4127); stop()
 *  (the form closed) says nothing more; idle() resolves once every ask begun is handled. → { start, stop, idle }. */
export function leakWatch({ id = '', choice = null, ask, say, on = null, off = null }) {
  let live = false, inFlight = false, again = false, sign = null, gen = 0, tail = Promise.resolve();
  let plugin = !!(choice && choice.kind === 'plugin');
  const once = async () => {
    if (!live) return;
    if (!plugin) { say(false); return; }
    if (inFlight) { again = true; return; }
    inFlight = true;
    const asked = gen;
    let a = null;
    try { a = await ask(); } catch { a = null; }
    inFlight = false;
    if (!live) return;
    // r4127: A REPLY ASKED BEFORE A MOVE OF THE PROFILE NEVER SPEAKS AFTER IT — it is dropped (asked again while the profile is on an
    // engine); and a profile on stock Chrome never shows the strong sentence, whatever arrives
    if (asked === gen) {
      { const s0 = leakSignOf(a, id); if (s0 !== null) sign = s0; }
      say(plugin && placeIsolatedOf(a));
    } else if (plugin) again = true;
    if (again) { again = false; await once(); }
  };
  /** every ask begun, kept so the watch can say when it has handled them all (idle()) */
  const kick = () => { const p = once(); tail = Promise.all([tail, p]); return p; };
  const onMove = (m) => {
    if (!live || !m || !LEAK_MOVES.includes(m.type)) return;   // only the two moves that can move it
    if (m.type === 'browser-engines-updated') { gen++; if (plugin) kick(); return; }
    const s1 = leakSignOf(m, id);
    if (s1 === null || s1 === sign) return;
    sign = s1; gen++;
    const p = m.profiles.find((x) => x && x.id === id);
    plugin = !!(p && p.browser && p.browser.kind === 'plugin');
    kick();
  };
  return {
    start() { if (live) return Promise.resolve(); live = true; say(false); if (on) on(onMove); return kick(); },
    stop() { live = false; if (off) off(onMove); },
    /** r4340 law 1: the fact a leg waits on — every ask this watch began has been answered and handled */
    idle() { return tail.then(() => undefined); },
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
