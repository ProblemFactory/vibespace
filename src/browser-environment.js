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
 *   · environmentLogView(env)         — a place is the person's private fact: never in a log or a journal line (its kind only)
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
    if (mode === MODES.MACHINE) continue;   // this machine's: nothing kept
    if (mode !== MODES.VALUE) { out[key] = { mode }; continue; }
    const v = row.value(c.value);
    if (!v.ok) return { ...v, error: `${key}: ${v.error}` };
    out[key] = { mode, value: v.value };
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
    if (row.key === 'location' && (r.from === 'value' || r.from === 'exit')) geolocation = { kind: 'place', latitude: r.value.latitude, longitude: r.value.longitude, accuracy: r.value.accuracy != null ? r.value.accuracy : PLACE_ACCURACY_M };
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
/** The machine's own language tag (the hub's runtime locale), judged by the same rule as a person's (null when it is not one). */
function machineLanguageTag(locale = (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return ''; } })()) {
  const v = languageVerdict(locale);
  return v.ok ? v.value : null;
}
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
    out[row.key] = row.key === 'location' ? str(c.mode) : c.mode === MODES.VALUE ? `${c.mode}:${str(c.value)}` : str(c.mode);
  }
  return out;
}

module.exports = { stockLaunchOf, machineLanguageTag, withEnvironmentArgs, MODES, PLACE_ACCURACY_M, KERNEL_TAG, LANGUAGE_ROWS, languageOfCountry, SETTINGS, SETTING_KEYS, environmentVerdict, keptExitOf, resolveEnvironment, environmentLogView, languageVerdict, placeVerdict, timezoneVerdict };
