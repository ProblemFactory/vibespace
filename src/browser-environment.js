'use strict';
/**
 * A BROWSER PROFILE'S OWN ENVIRONMENT — PURE, THE CONTRACT the start, the dialog, the command and the census build on (B-9584 U1, lane
 * cli-update-needs-nothing; the owner 2026-11-20 «可以按照你的建议»: the five decisions of
 * int359/sched-1117/lines/cli-update-needs-nothing-B-9584-plan.md). What a named profile tells a site about where it is: its clock's
 * time zone, its language, the place it answers «where are you» with. NOTHING of a browser's fingerprint: that stays in the custom
 * kernel's own settings (decision 4).
 *   · SETTINGS — THE ONE TABLE, under the names of the engine plugin's hand-over (the kernel conversation's launcher specification,
 *     主开发 r539: `environment: { timezone, language, location: { latitude, longitude } }` beside the exit). Every setting is a row:
 *     its key, the choices it offers, how a value is judged, what «Automatic» reads from the kept exit. A new setting is a new row;
 *     every reader walks the table, none names a setting by hand.
 *   · A setting is «this machine's» (the browser is told nothing for it), «Automatic» (it follows the exit the person KEPT in «Check
 *     the exit…»; VibeSpace never looks an address up by itself: no timer, no start), a value the person set, or (location only)
 *     blocked.
 *   · environmentVerdict(input)       — a person's choice, judged and normalised: what the store writer keeps (null = nothing kept)
 *   · keptExitOf(profile)             — THE ONE READER of «the kept exit» (if the connections design moves where an exit lives,
 *                                       only this moves)
 *   · resolveEnvironment(env, exit)   — what each setting IS now → { settings, told, geolocation, unfollowed }:
 *       told        — THE HAND-OVER'S OWN OBJECT, as the engine plugin takes it beside the exit: { timezone?, language?,
 *                     location?: { latitude, longitude } | 'blocked' (r745: the kernel's word for blocked) }, a «this machine's»
 *                     setting ABSENT; NULL when nothing is told (主开发
 *                     r617: an untouched profile hands NOTHING — the kernel treats a present object as ruling all three)
 *       geolocation — the browser's own protocol road for a place and for «blocked» (the stock browser, which has no launch switch
 *                     for either: a geolocation override with its accuracy — the person's, else PLACE_ACCURACY_M —, or the
 *                     geolocation permission denied); an accuracy is never in the resolve-launch object: { kind: 'place', latitude, longitude, accuracy } |
 *                     { kind: 'blocked' } | null
 *       unfollowed  — 主开发 r617: «SAYS SO» AT THE START — every setting the person chose that this start cannot follow (an
 *                     Automatic with nothing to follow, a kept value the runtime no longer accepts): [{ key, mode, said }]. The
 *                     start still runs (the owner's decision 2: it acts as this machine's), and it SAYS so where the person is
 *   · environmentLogView(env)         — a place is the person's private fact: never in a log or a journal line (its kind only;
 *                                       its sites by their COUNT, never an origin)
 *   · siteVerdict(s) / sitesVerdict(list) — B-9584 THE PLACE'S ROAD (the owner's choice B, 主开发 r1791 / r1898): the sites a place is
 *                                       given to — each an EXACT origin (scheme, host, port; no wildcard, no suffix match), at most
 *                                       SITES_MAX, sorted, once each; default none (no site reads the place)
 *   · stockLaunchOf(resolved, o)      — U2b: the STOCK browser's own start — its two language switches (one tag), its TZ, the
 *                                       store's mark that a language was ever told
 *   · machineLanguageTag(locale)      — the hub's own tag, STATED at «this machine's» once a language was told (its base —
 *                                       language and region — when the resolved locale is not a tag the kernel rule takes)
 *   · withEnvironmentArgs(args, extra) — a launch config's `args` (a list or the driver's comma / newline text) with the switches added
 *   · canonicalZone(v) / canonicalTag(v) — the hub's own two canonical forms: an engine's echo is compared through them, both sides
 *   · geoStoredDenial(prefs) / geoStoredRestore(prefs, kept) — U2c: the profile's OWN stored denial (fail closed at the browser) and
 *                                       the person's own values given back; geoKeptMerge(kept, found) — a row they allowed while held joins them
 * THE DEFAULT IS UNCHANGED: a profile with no `environment`, or one whose every setting is «this machine's», keeps nothing and hands
 * nothing (told null) — its start is the release's, byte for byte.
 * The runtime decides two facts: a zone name by its date formatter (src/browser-exit.js zoneVerdict, the exit check's one rule) and a
 * language tag by Intl.getCanonicalLocales — the runtime's ICU data; a tag is then held to the kernel's own shape.
 */
const { zoneVerdict } = require('./browser-exit');

const MODES = Object.freeze({ MACHINE: 'machine', AUTO: 'auto', VALUE: 'value', BLOCK: 'block' });
const MODE_LIST = Object.freeze(Object.values(MODES));
/** A place's accuracy (metres) when the person names none — said beside the place in the dialog. */
const PLACE_ACCURACY_M = 100;
/** «Automatic» language (主开发 r510, the owner's decision 2 inside its bounds): a ROW LIST from a country CODE (ISO 3166-1 alpha-2) to
 *  ONE language. THE RULE (主开发 r617, in those words): the list holds the language a browser sold in that country speaks by default,
 *  and each country listed has one such language (IE, NZ, PE, ES and IL were questioned by a reader and ruled KEPT by it). Every other
 *  case — a country with several (CH, BE, CA, IN …), a code not listed, a country kept as a NAME — is NOT guessed: the setting acts
 *  as «this machine's» and SAYS so. Pinned by content, row by row, in the suite; never fetched, never grown by itself. */
const LANGUAGE_ROWS = Object.freeze([
  ['JP', 'ja-JP'], ['KR', 'ko-KR'], ['CN', 'zh-CN'], ['TW', 'zh-TW'], ['TH', 'th-TH'], ['VN', 'vi-VN'], ['ID', 'id-ID'], ['IL', 'he-IL'],
  ['TR', 'tr-TR'], ['RU', 'ru-RU'], ['UA', 'uk-UA'], ['PL', 'pl-PL'], ['CZ', 'cs-CZ'], ['SK', 'sk-SK'], ['HU', 'hu-HU'], ['RO', 'ro-RO'],
  ['BG', 'bg-BG'], ['GR', 'el-GR'], ['DE', 'de-DE'], ['AT', 'de-AT'], ['FR', 'fr-FR'], ['IT', 'it-IT'], ['ES', 'es-ES'], ['PT', 'pt-PT'],
  ['NL', 'nl-NL'], ['SE', 'sv-SE'], ['NO', 'nb-NO'], ['DK', 'da-DK'], ['IS', 'is-IS'], ['US', 'en-US'], ['GB', 'en-GB'], ['AU', 'en-AU'],
  ['NZ', 'en-NZ'], ['IE', 'en-IE'], ['BR', 'pt-BR'], ['MX', 'es-MX'], ['AR', 'es-AR'], ['CL', 'es-CL'], ['CO', 'es-CO'], ['PE', 'es-PE'],
  ['UY', 'es-UY'],
].map((r) => Object.freeze(r)));
const languageOfCountry = (code) => { const r = LANGUAGE_ROWS.find(([c]) => c === code); return r ? r[1] : null; };
const str = (v) => (v == null ? '' : String(v));
const refuse = (code, error) => ({ ok: false, code, error });

/** A language: ONE BCP 47 tag, in the runtime's canonical spelling (ja-jp ⇒ ja-JP, zh-hant-tw ⇒ zh-Hant-TW) — and NO WIDER than the
 *  engine plugin's own rule (主开发 r617): a tag the kernel would refuse (an extension like -u-…, a private-use part -x-…, a first part
 *  of more than three letters) is refused here by name, so a profile is never kept that every start then refuses. */
const KERNEL_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
function languageVerdict(v) {
  const s = str(v).trim();
  if (!s || s.length > 35 || /[\s,;]/.test(s)) return refuse('env_language_invalid', `«${s.slice(0, 40)}» is not one language tag — give one like ja-JP or en-US`);
  let canon = [];
  try { canon = Intl.getCanonicalLocales(s); } catch { canon = []; }
  if (canon.length !== 1) return refuse('env_language_invalid', `«${s.slice(0, 40)}» is not a language tag — give one like ja-JP or en-US`);
  if (!KERNEL_TAG.test(canon[0])) return refuse('env_language_invalid', `«${s.slice(0, 40)}» has a part no browser start takes (an extension, a private-use part, or a first part of more than three letters) — give one like ja-JP or zh-Hant-TW`);
  return { ok: true, value: canon[0] };
}
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
/** A place: `latitude` −90…90, `longitude` −180…180 (WGS84 decimal degrees), an `accuracy` 1…100 000 m if the person gives one —
 *  the names of the engine plugin's hand-over (resolve-launch's `environment.location`), so nothing maps them. */
function placeVerdict(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  const num = (x) => (typeof x === 'number' ? x : typeof x === 'string' && DECIMAL.test(x.trim()) ? Number(x.trim()) : NaN);   // 主开发 r617: a plain decimal only (no hex, no exponent)
  const lat = o ? num(o.latitude) : NaN, lng = o ? num(o.longitude) : NaN, acc = o && o.accuracy != null && o.accuracy !== '' ? num(o.accuracy) : null;
  if (!(Number.isFinite(lat) && lat >= -90 && lat <= 90)) return refuse('env_place_invalid', 'the latitude is a number from -90 to 90');
  if (!(Number.isFinite(lng) && lng >= -180 && lng <= 180)) return refuse('env_place_invalid', 'the longitude is a number from -180 to 180');
  if (acc !== null && !(Number.isFinite(acc) && acc >= 1 && acc <= 100000)) return refuse('env_place_invalid', 'the accuracy is a number of metres from 1 to 100000');
  const six = (x) => Math.round(x * 1e6) / 1e6 || 0;   // kept at six decimals (≈ 0.11 m): what a start uses, no finer private fact stored
  return { ok: true, value: { latitude: six(lat), longitude: six(lng), ...(acc !== null ? { accuracy: acc } : {}) } };
}
/** B-9584 THE PLACE'S ROAD (主开发 r1898 (6)): A LISTED SITE IS AN EXACT ORIGIN — its scheme, host and port, nothing else (a path, a query,
 *  a fragment are dropped: the origin is what the browser grants); never a wildcard, a pattern or a suffix match; http or https only;
 *  no user name or password. → { ok, value: 'https://maps.example.com' } | refused by name. */
const SITES_MAX = 20;
function siteVerdict(s) {
  const t = str(s).trim();
  if (!t || t.length > 300) return refuse('env_site_invalid', 'a site is one address, like https://maps.example.com');
  if (/[*\s]/.test(t)) return refuse('env_site_invalid', `«${t.slice(0, 60)}»: a site is ONE exact address — no wildcard, no space`);
  let u = null; try { u = new URL(t); } catch { u = null; }
  if (!u) return refuse('env_site_invalid', `«${t.slice(0, 60)}» is not an address — write it with its scheme: https://…`);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return refuse('env_site_invalid', `«${t.slice(0, 60)}»: a site is an http or https address`);
  if (u.username || u.password) return refuse('env_site_invalid', 'a site carries no user name or password');
  if (!u.hostname) return refuse('env_site_invalid', `«${t.slice(0, 60)}» names no host`);
  return { ok: true, value: u.origin };
}
/** The list beside a place: absent = none; each judged (siteVerdict), once each, sorted; at most SITES_MAX. */
function sitesVerdict(list) {
  if (list == null) return { ok: true, value: [] };
  if (!Array.isArray(list)) return refuse('env_sites_invalid', 'the sites are a list of addresses');
  if (list.length > SITES_MAX) return refuse('env_sites_invalid', `at most ${SITES_MAX} sites may know a place`);
  const out = new Set();
  for (const x of list) { const v = siteVerdict(x); if (!v.ok) return v; out.add(v.value); }
  return { ok: true, value: [...out].sort() };
}
/** A zone: the exit check's own rule (a real IANA name, canonical spelling), under this setting's code; an empty name is no zone. */
function timezoneVerdict(v) {
  const z = zoneVerdict(v);
  if (!z.ok) return refuse('env_timezone_invalid', z.error);
  if (!z.value) return refuse('env_timezone_invalid', 'give a zone name like Asia/Shanghai');
  return z;
}

/** THE ONE TABLE. `auto(exit)` → { value } | { none: why } — `exit` is keptExitOf's answer (null: no exit kept). */
const SETTINGS = Object.freeze([
  Object.freeze({
    key: 'timezone', choices: Object.freeze([MODES.MACHINE, MODES.AUTO, MODES.VALUE]), value: timezoneVerdict,
    auto: (exit) => { if (!exit) return { none: 'no_exit' }; if (!exit.timezone) return { none: 'exit_no_timezone' }; const z = timezoneVerdict(exit.timezone); return z.ok ? { value: z.value } : { none: 'exit_timezone_invalid' }; },   // the kept zone judged again by the same rule (a hand-edited store never reaches a start)
  }),
  Object.freeze({
    key: 'language', choices: Object.freeze([MODES.MACHINE, MODES.AUTO, MODES.VALUE]), value: languageVerdict,
    auto: (exit) => {
      if (!exit) return { none: 'no_exit' };
      const c = str(exit.country).trim();
      if (!c) return { none: 'exit_no_country' };
      const tag = /^[A-Za-z]{2}$/.test(c) ? languageOfCountry(c.toUpperCase()) : null;
      return tag ? { value: tag } : { none: 'exit_country_no_language' };
    },
  }),
  // 主开发 r510: NO «Automatic» — the kept exit holds no place and decision 2 makes none from an address; the row says why, so the
  // dialog never shows a choice that could only answer «no place». this machine's = the browser asks, as today
  Object.freeze({ key: 'location', choices: Object.freeze([MODES.MACHINE, MODES.BLOCK, MODES.VALUE]), value: placeVerdict, auto: null, noAutomatic: 'exit_has_no_place' }),
]);
const SETTING_KEYS = Object.freeze(SETTINGS.map((s) => s.key));
const rowOf = (key) => SETTINGS.find((s) => s.key === key) || null;

/** A person's choice ({ timezone: { mode, value? }, … }) → { ok, value } with only what is not «this machine's» (null when nothing is) |
 *  refused by name: a setting the table has not, a choice it does not offer, a value its rule refuses. */
function environmentVerdict(input) {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== 'object' || Array.isArray(input)) return refuse('env_invalid', 'the environment is an object of settings');
  const out = {};
  for (const [key, choice] of Object.entries(input)) {
    const row = rowOf(key);
    if (!row) return refuse('env_setting_unknown', `«${str(key).slice(0, 40)}» is not a setting of a profile's environment — the settings are ${SETTING_KEYS.join(', ')}`);
    if (choice == null) continue;   // a cleared field: this machine's
    const c = choice && typeof choice === 'object' && !Array.isArray(choice) ? choice : null;
    const mode = c ? str(c.mode) : '';
    if (!MODE_LIST.includes(mode)) return refuse('env_mode_invalid', `${key}: the choice is one of ${row.choices.join(', ')}`);
    if (!row.choices.includes(mode)) return refuse('env_mode_unoffered', `${key} offers ${row.choices.join(', ')} — not ${mode}`);
    const listed = key === 'location' && c && c.sites != null && !(Array.isArray(c.sites) && c.sites.length === 0);
    if (listed && mode !== MODES.VALUE) return refuse(   /* r2311: beside «this machine's» refused by name too, never dropped in silence */
      'env_sites_unoffered', 'location: sites are listed only beside a place');   // B-9584 (B): a «blocked» location gives no site anything
    if (mode === MODES.MACHINE) continue;   // this machine's: nothing kept
    if (mode !== MODES.VALUE) { out[key] = { mode }; continue; }
    const v = row.value(c.value);
    if (!v.ok) return { ...v, error: `${key}: ${v.error}` };
    out[key] = { mode, value: v.value };
    if (key === 'location') { const sv = sitesVerdict(c.sites); if (!sv.ok) return { ...sv, error: `location: ${sv.error}` }; if (sv.value.length) out[key].sites = sv.value; }   // B-9584 (B): the sites that may know the place (default none)
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

/** THE ONE READER of «the kept exit»: the profile's `egress` (kept by «Check the exit…», src/browser-exit.js egressRecordOf) — or null. */
function keptExitOf(profile) {
  const e = profile && typeof profile === 'object' ? profile.egress : null;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  return { publicIp: str(e.publicIp), country: str(e.country), timezone: str(e.timezone), checkedAt: Number(e.checkedAt) || 0, source: e.source === 'measured' ? 'measured' : 'typed' };
}

/** What each setting IS now → { settings: [{ key, mode, from, value, said }], told, geolocation, unfollowed } (the contract: the head).
 *  `from`: 'machine' (nothing told) · 'value' (the person's) · 'exit' (Automatic, from the kept exit) · 'block' (location blocked).
 *  `said`: why a choice told nothing — an Automatic with nothing to follow ('no_exit', 'exit_no_timezone', 'exit_timezone_invalid',
 *  'exit_no_country', 'exit_country_no_language') or a kept value the runtime refuses now (its own refusal code). */
function resolveEnvironment(environment, exit = null) {
  const env = environment && typeof environment === 'object' ? environment : {};
  const settings = [], told = {}, unfollowed = [];
  let geolocation = null;
  for (const row of SETTINGS) {
    const c = env[row.key] && typeof env[row.key] === 'object' ? env[row.key] : null;
    const mode = c && row.choices.includes(c.mode) ? c.mode : MODES.MACHINE;
    let r;
    if (mode === MODES.VALUE) { const v = row.value(c.value); r = v.ok ? { from: 'value', value: v.value } : { from: 'machine', value: null, said: v.code }; }
    else if (mode === MODES.BLOCK) r = { from: 'block', value: null };
    else if (mode === MODES.AUTO) { const a = row.auto(exit); r = 'value' in a ? { from: 'exit', value: a.value } : { from: 'machine', value: null, said: a.none }; }
    else r = { from: 'machine', value: null };
    if (r.from === 'value' || r.from === 'exit') told[row.key] = row.key === 'location' ? { latitude: r.value.latitude, longitude: r.value.longitude } : r.value;
    if (r.from === 'block') told[row.key] = 'blocked';   // B-9584 U2a (主开发 r745): the kernel's hand-over now has a form for it — the word
    if (row.key === 'location' && (r.from === 'value' || r.from === 'exit')) { const sv = r.from === 'value' ? sitesVerdict(c && c.sites) : { ok: false }; geolocation = { kind: 'place', latitude: r.value.latitude, longitude: r.value.longitude, accuracy: r.value.accuracy != null ? r.value.accuracy : PLACE_ACCURACY_M, sites: sv.ok ? sv.value : [] }; }   /* r2311: the sites only beside a place the person SET, as at the door */   // B-9584 (B): the sites judged again at use — a list that no longer passes gives NO site the place (fail closed)
    if (row.key === 'location' && r.from === 'block') geolocation = { kind: 'blocked' };
    if (r.said) unfollowed.push({ key: row.key, mode, said: r.said });
    settings.push({ key: row.key, mode, from: r.from, value: r.value, said: r.said || null });
  }
  return { settings, told: Object.keys(told).length ? told : null, geolocation, unfollowed };
}

/** B-9584 U2b — THE STOCK BROWSER'S OWN START for a resolved environment (the box measure of 2026-11-21, int361 01:35Z / 03:27Z: TZ in the
 *  driver's env reaches Chrome; Chrome keeps a prior --accept-lang in the profile's Preferences). → { args, env, language, languageTold }:
 *  `args` = --lang=<tag> --accept-lang=<tag> — ONE tag (主开发 r726), comma-free, so the driver's one config line carries it whole;
 *  `env` = { TZ: <zone> } — the browser process's own variable, the whole browser from its first page; `languageTold` = the store's
 *  mark that a language was ever told: a profile back at «this machine's» then STATES the machine's own tag (`machineTag`), as the
 *  kernel's launcher does, since Chrome would keep the old one. An untouched profile (told null, no mark) ⇒ nothing at all. */
function stockLaunchOf(resolved, { languageTold = false, machineTag = null } = {}) {
  const told = (resolved && resolved.told) || {};
  const own = typeof told.language === 'string' ? told.language : null;
  const lang = own || (languageTold && machineTag ? machineTag : null);
  const args = lang ? [`--lang=${lang}`, `--accept-lang=${lang}`] : [];
  const env = typeof told.timezone === 'string' ? { TZ: told.timezone } : {};
  return { args, env, language: lang, languageTold: !!own || !!languageTold };
}
/** The machine's own language tag (the hub's runtime locale), judged by the same rule as a person's. A resolved locale that rule
 *  refuses (an extension such as -u-va-posix, a variant) falls back to its BASE — its language and region — so a profile once told a
 *  language still STATES one at «this machine's» (round wyx4vuerd 9); null only when not even the base is a tag. */
function machineLanguageTag(locale = (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return ''; } })()) {
  const v = languageVerdict(locale);
  if (v.ok) return v.value;
  let base = '';
  try { const l = new Intl.Locale(str(locale)); base = l.region ? `${l.language}-${l.region}` : l.language; } catch { base = ''; }
  const b = base ? languageVerdict(base) : null;
  return b && b.ok ? b.value : null;
}
/** B-9584 U2c (主开发 r1264, FAIL CLOSED AT THE BROWSER; measured on a real Chrome): THE PROFILE'S OWN STORED DENIAL. Chrome keeps a
 *  default geolocation «block» written into the profile's Preferences before its launch, and a site with no row of its own is denied —
 *  but a site the person allowed before keeps its stored «allow» and WINS over that default; its row rewritten to «block» is denied.
 *  So a profile whose location is a place or «blocked» starts with the default AND every stored geolocation row at «block»: whatever
 *  of VibeSpace is down (the hold, the hub, a relaunch, a hand-over), the browser itself denies the position. PURE over the parsed
 *  Preferences (`prefs`, or null for a profile Chrome never opened) → { ok, changed, prefs, kept } — `kept` = the person's OWN values
 *  (the default and each row's setting, never a place: these are site names and their allow / ask / block), kept beside the profile to
 *  give back when the location returns to «this machine's» (geoStoredRestore). A file of another shape is refused, never overwritten. */
const GEO_BLOCK = 2;
/** r2172 (b)(d) OURS KEPT APART FROM THE PERSON'S: every row the denial writes carries OUR stamp in its `last_modified` (the browser sets a
 *  row's own stamp whenever a person changes it), kept beside the person's values. The give-back restores a row ONLY while it still
 *  carries our stamp — a row the person changed since (to «block» too) stays as the browser keeps it, and a give-back that half ran
 *  never runs again over it; the default (no stamp of its own) only while it still reads our «block». `stamp` = the browser's own
 *  clock form (microseconds since 1601, a string); absent ⇒ no row is stamped (a kept file of the built part gives back what reads «block»). */
function geoStoredDenial(prefs, { stamp = null } = {}) {
  if (prefs !== null && (typeof prefs !== 'object' || Array.isArray(prefs))) return { ok: false, why: 'its Preferences are not an object' };
  const p = prefs ? JSON.parse(JSON.stringify(prefs)) : {};
  const prof = p.profile && typeof p.profile === 'object' && !Array.isArray(p.profile) ? p.profile : (p.profile = {});
  const dflt = prof.default_content_setting_values && typeof prof.default_content_setting_values === 'object' ? prof.default_content_setting_values : (prof.default_content_setting_values = {});
  const cs = prof.content_settings && typeof prof.content_settings === 'object' ? prof.content_settings : (prof.content_settings = {});
  const ex = cs.exceptions && typeof cs.exceptions === 'object' ? cs.exceptions : (cs.exceptions = {});
  const rows = ex.geolocation && typeof ex.geolocation === 'object' && !Array.isArray(ex.geolocation) ? ex.geolocation : (ex.geolocation = {});
  const kept = { default: Object.prototype.hasOwnProperty.call(dflt, 'geolocation') ? dflt.geolocation : null, rows: {}, ...(stamp ? { stamp: String(stamp), stamps: {} } : {}) };
  let changed = dflt.geolocation !== GEO_BLOCK;
  dflt.geolocation = GEO_BLOCK;
  for (const [key, row] of Object.entries(rows)) {
    if (!row || typeof row !== 'object') continue;
    kept.rows[key] = Object.prototype.hasOwnProperty.call(row, 'setting') ? row.setting : null;
    if (stamp) kept.stamps[key] = Object.prototype.hasOwnProperty.call(row, 'last_modified') ? row.last_modified : null;
    if (row.setting !== GEO_BLOCK) { row.setting = GEO_BLOCK; changed = true; }
    if (stamp && row.last_modified !== String(stamp)) { row.last_modified = String(stamp); changed = true; }   // OURS, told apart from the person's
  }
  return { ok: true, changed, prefs: p, kept };
}
/** Give the person's own values back (the location is «this machine's» again): the default and each row still there, as they were;
 *  a row added since stays as Chrome keeps it. PURE → { ok, changed, prefs }. */
/** r2311: the stamps that are OURS — the last denial's and the one before it (`prev`: a later launch wrote its kept file, then a crash
 *  kept its Preferences from being written: the rows still carry the earlier stamp, never the person's). PURE. */
function oursStamp(kept, lm) { return lm != null && !!kept && (String(lm) === String(kept.stamp) || (kept.prev != null && String(lm) === String(kept.prev))); }
function geoStoredRestore(prefs, kept) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return { ok: false, why: 'its Preferences are not an object' };
  if (!kept || typeof kept !== 'object') return { ok: false, why: 'nothing kept to give back' };
  const p = JSON.parse(JSON.stringify(prefs));
  const prof = p.profile && typeof p.profile === 'object' ? p.profile : (p.profile = {});
  const dflt = prof.default_content_setting_values && typeof prof.default_content_setting_values === 'object' ? prof.default_content_setting_values : (prof.default_content_setting_values = {});
  let changed = false;
  const oursDefault = dflt.geolocation === GEO_BLOCK;   // r2172 (b): a default the person changed since (not our «block») stays theirs
  if (oursDefault && (kept.default === null || kept.default === undefined)) { delete dflt.geolocation; changed = true; }
  else if (oursDefault && dflt.geolocation !== kept.default) { dflt.geolocation = kept.default; changed = true; }
  const rows = (((prof.content_settings || {}).exceptions || {}).geolocation) || {};
  for (const [key, setting] of Object.entries(kept.rows || {})) {
    const row = rows[key];
    if (!row || typeof row !== 'object') continue;
    // r2172 (b)(d): only a row still as OUR denial left it — our stamp (or, from a kept file without one, still «block»); a row the
    // person changed since keeps the person's value, whatever it is
    if (kept.stamp ? !oursStamp(kept, row.last_modified) : row.setting !== GEO_BLOCK) continue;
    if (setting === null) { if ('setting' in row) { delete row.setting; changed = true; } }
    else if (row.setting !== setting) { row.setting = setting; changed = true; }
    if (kept.stamp) { const lm = kept.stamps && Object.prototype.hasOwnProperty.call(kept.stamps, key) ? kept.stamps[key] : null; if (lm === null) delete row.last_modified; else row.last_modified = lm; changed = true; }   // its own stamp back: never ours again
  }
  return { ok: true, changed, prefs: p };
}
/** B-9584 U2c follow (主开发 r1707 (3)): THE PERSON'S OWN SETTINGS ARE NEVER LOST — a site the person allowed in Chrome's own settings
 *  WHILE the profile was held is theirs too: at each later held launch a row the kept values lack, and whose setting is not «block»,
 *  joins them (`found` = geoStoredDenial's `kept` of that launch). A row kept before keeps its FIRST value while it is still OURS
 *  (it carries one of our stamps — the last denial's or the one before it), never a denial's over it; a row the PERSON changed since
 *  our last denial (any other stamp; without stamps, anything but «block») takes the person's value and stamp (r2311 must (1): a
 *  block they set while held gives back a block). The default: the person's when it reads anything but our «block». The kept
 *  file carries this launch's stamp and the one before (`prev`). PURE → { ok, changed, kept }; another shape refused. */
function geoKeptMerge(kept, found) {
  if (!kept || typeof kept !== 'object' || Array.isArray(kept) || (kept.rows !== undefined && (!kept.rows || typeof kept.rows !== 'object' || Array.isArray(kept.rows)))) return { ok: false, why: 'the kept values are not of their shape' };
  const stamped = !!(found && found.stamp);
  const out = { default: Object.prototype.hasOwnProperty.call(kept, 'default') ? kept.default : null, rows: { ...(kept.rows || {}) },
    ...(stamped ? { stamp: found.stamp, ...(kept.stamp && String(kept.stamp) !== String(found.stamp) ? { prev: kept.stamp } : kept.prev != null ? { prev: kept.prev } : {}), stamps: { ...(kept.stamps || {}) } }
      : kept.stamp ? { stamp: kept.stamp, ...(kept.prev != null ? { prev: kept.prev } : {}), stamps: { ...(kept.stamps || {}) } } : {}) };   // r2172: the stamp of THIS launch's denial (the rows carry it now)
  const fstamps = (found && found.stamps) || {};
  let changed = false;
  for (const [key, setting] of Object.entries((found && found.rows) || {})) {
    const lm = Object.prototype.hasOwnProperty.call(fstamps, key) ? fstamps[key] : null;
    if (!Object.prototype.hasOwnProperty.call(out.rows, key)) {   // a row the kept values lack: the person's, unless it blocks (it stays as Chrome keeps it)
      if (setting === GEO_BLOCK) continue;
      out.rows[key] = setting; if (out.stamps && stamped) out.stamps[key] = lm; changed = true; continue;
    }
    // r2311 MUST (1): A ROW THE PERSON CHANGED SINCE OUR LAST DENIAL — its stamp at this launch is none of ours (or, from a kept
    // file without stamps, it reads anything but our «block») — is the PERSON's now: its value and its own stamp are kept, so a
    // block they set while held gives back a block (an «ask» an «ask»), never the first value; a row still ours keeps its first
    const persons = kept.stamp && stamped ? !oursStamp(kept, lm) : setting !== GEO_BLOCK;
    if (!persons || (out.rows[key] === setting && (!out.stamps || out.stamps[key] === lm))) continue;
    out.rows[key] = setting; if (out.stamps && stamped) out.stamps[key] = lm; changed = true;
  }
  // the default has no stamp of its own: anything but our «block» at this launch is the person's change since our last denial
  if (found && Object.prototype.hasOwnProperty.call(found, 'default') && found.default !== GEO_BLOCK && found.default !== out.default) { out.default = found.default; changed = true; }
  if (found && found.stamp && found.stamp !== kept.stamp) changed = true;   // a new launch's stamp is written beside the values
  return { ok: true, changed, kept: out };
}
/** THE HUB'S TWO CANONICAL FORMS (round wyx4vuerd 3) — a zone as the runtime's date formatter spells it (a legacy alias and its zone,
 *  another case: one name), a tag as Intl.getCanonicalLocales spells it; a value neither reads is kept as given (it then differs).
 *  An engine's echo is compared to what was told through these, on BOTH sides (src/browser-engines.js echoMismatch). */
function canonicalZone(v) { const z = zoneVerdict(v); return z.ok && z.value ? z.value : str(v); }
function canonicalTag(v) { try { const c = Intl.getCanonicalLocales(str(v)); return c.length === 1 ? c[0] : str(v); } catch { return str(v); } }
/** A launch config's `args` (a list, or the driver's comma / newline text) with the environment's switches added — the shape kept. */
function withEnvironmentArgs(args, extra = []) {
  const add = (Array.isArray(extra) ? extra : []).map(String).filter(Boolean);
  if (!add.length) return args;
  if (Array.isArray(args)) return [...args, ...add];
  if (typeof args !== 'string' || !args.trim()) return add.join(',');
  const sep = args.includes('\n') ? '\n' : ',';
  return [...args.split(/[,\n]/).map((x) => x.trim()).filter(Boolean), ...add].join(sep);
}

/** For a log or a journal line: each setting's choice — a place never by its coordinates (decision: a location is private). */
function environmentLogView(environment) {
  const env = environment && typeof environment === 'object' ? environment : {};
  const out = {};
  for (const row of SETTINGS) {
    const c = env[row.key];
    if (!c || typeof c !== 'object') continue;
    out[row.key] = row.key === 'location' ? `${str(c.mode)}${Array.isArray(c.sites) && c.sites.length ? ` · ${c.sites.length} site${c.sites.length === 1 ? '' : 's'}` : ''}` : c.mode === MODES.VALUE ? `${c.mode}:${str(c.value)}` : str(c.mode);   // B-9584 (B): the sites by their COUNT, never an origin
  }
  return out;
}

module.exports = { siteVerdict, sitesVerdict, SITES_MAX, stockLaunchOf, machineLanguageTag, canonicalZone, canonicalTag, geoStoredDenial, geoStoredRestore, geoKeptMerge, GEO_BLOCK, withEnvironmentArgs, MODES, PLACE_ACCURACY_M, KERNEL_TAG, LANGUAGE_ROWS, languageOfCountry, SETTINGS, SETTING_KEYS, environmentVerdict, keptExitOf, resolveEnvironment, environmentLogView, languageVerdict, placeVerdict, timezoneVerdict };
