#!/usr/bin/env node
// A BROWSER PROFILE'S OWN ENVIRONMENT — U1, THE PURE RULES, THE CONTRACT (B-9584, lane cli-update-needs-nothing; the owner 2026-11-20
// «可以按照你的建议», 主开发 r497 / r510 / r539 / r617). src/browser-environment.js: ONE table, every setting a row (time zone, language,
// location — nothing of a fingerprint) under the engine plugin's hand-over names; «this machine's», «Automatic» (the KEPT exit only,
// never a lookup) or a value; an untouched profile hands NOTHING (told null); a choice the start cannot follow is SAID at the start
// (`unfollowed`); the hand-over carries a place's latitude and longitude only, its accuracy and «blocked» ride `geolocation`; a
// language is no wider than the kernel's own rule; a place is a plain decimal kept at six decimals and never reaches a log line.
//   ① THE TABLE — the three settings, each row's choices, its rule, its Automatic (location: none, and why)
//   ② THE LANGUAGE ROWS — pinned BY CONTENT, row by row; no country twice, canonical tags, the several-language countries absent
//   ③ THE VERDICT — the default (nothing kept), the spellings a person types (zones, languages, places) kept or refused by name
//   ④ THE ONE READER of the kept exit
//   ⑤ WHAT EACH SETTING IS — told (the hand-over's own object, or null), geolocation, unfollowed, case by case
//   ⑥ THE SEEDED LAW — 3 seeds × 400 environments × exits; the facts judged printed
//   ⑦ REDS — eight mutants of the module (through anchored()), each judged by the same legs
// The runtime decides two facts here: a zone name (its date formatter) and a language tag (Intl.getCanonicalLocales, its ICU data);
// where the runtime's own spelling is the expected value (a legacy alias, Etc/UTC, a three-letter code), the leg asks the runtime.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'src/browser-environment.js';
const SRC = fs.readFileSync(path.join(REPO, REL), 'utf8');
const { ok, report } = checker();
const J = JSON.stringify;
const E = require('../src/browser-environment.js');
/** The module with one rule taken back — the edit through THE one door (anchored: «ANCHOR GONE» / «ANCHOR NOT UNIQUE» by name). */
function mutantOf(anchor, to, name) {
  const file = path.join(REPO, REL);
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(anchored(SRC, anchor, to, name), file);
  return m.exports;
}
const sorted = (a) => [...a].map(String).sort();
const zoneOf = (z) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone; } catch { return null; } };   // the runtime's own spelling
const tagOf = (t) => { try { return Intl.getCanonicalLocales(t)[0]; } catch { return null; } };
const tokyo = { egress: { publicIp: '203.0.113.7', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'measured' } };
// ② the rows as ruled (主开发 r510 / r617) — any change to the table is a reviewed edit HERE
const ROWS_RULED = [['JP', 'ja-JP'], ['KR', 'ko-KR'], ['CN', 'zh-CN'], ['TW', 'zh-TW'], ['TH', 'th-TH'], ['VN', 'vi-VN'], ['ID', 'id-ID'], ['IL', 'he-IL'], ['TR', 'tr-TR'], ['RU', 'ru-RU'], ['UA', 'uk-UA'], ['PL', 'pl-PL'], ['CZ', 'cs-CZ'], ['SK', 'sk-SK'], ['HU', 'hu-HU'], ['RO', 'ro-RO'], ['BG', 'bg-BG'], ['GR', 'el-GR'], ['DE', 'de-DE'], ['AT', 'de-AT'], ['FR', 'fr-FR'], ['IT', 'it-IT'], ['ES', 'es-ES'], ['PT', 'pt-PT'], ['NL', 'nl-NL'], ['SE', 'sv-SE'], ['NO', 'nb-NO'], ['DK', 'da-DK'], ['IS', 'is-IS'], ['US', 'en-US'], ['GB', 'en-GB'], ['AU', 'en-AU'], ['NZ', 'en-NZ'], ['IE', 'en-IE'], ['BR', 'pt-BR'], ['MX', 'es-MX'], ['AR', 'es-AR'], ['CL', 'es-CL'], ['CO', 'es-CO'], ['PE', 'es-PE'], ['UY', 'es-UY']];

/** EVERY LEG over a module M → [[name, pass, detail]] — the real module and each mutant are judged by the same list. */
function legs(M) {
  const out = [];
  const leg = (name, pass, detail) => { if (typeof pass !== 'boolean') throw new TypeError(`leg «${name}»: the condition is a ${typeof pass}, not a boolean`); out.push([name, pass, detail]); };   // B-1747's swap guard (the census of inline helpers)
  const V = (x) => M.environmentVerdict(x);
  const R = (env, exit) => M.resolveEnvironment(env, exit);
  const at = (res, key) => res.settings.find((s) => s.key === key) || {};
  const toldOf = (res) => res.told || {};
  // ① THE TABLE
  leg('① the settings are exactly the owner\'s three, under the hand-over\'s names — timezone, language, location; nothing of a fingerprint', J(M.SETTING_KEYS) === J(['timezone', 'language', 'location']), M.SETTING_KEYS);
  leg('① every row offers «this machine\'s», only known choices, a rule for its value; Automatic is a function exactly where it is offered', M.SETTINGS.every((r) => r.choices.includes('machine') && r.choices.every((c) => Object.values(M.MODES).includes(c)) && typeof r.value === 'function' && (r.choices.includes('auto') ? typeof r.auto === 'function' : r.auto === null)), M.SETTINGS.map((r) => [r.key, r.choices]));
  const loc = M.SETTINGS.find((r) => r.key === 'location') || {};
  leg('① location offers exactly this machine\'s / blocked / a place — no Automatic, and the row says why (the kept exit holds no place)', J(sorted(loc.choices || [])) === J(['block', 'machine', 'value']) && loc.auto === null && loc.noAutomatic === 'exit_has_no_place', loc);
  // ② THE LANGUAGE ROWS
  leg('② THE LANGUAGE ROWS PINNED BY CONTENT: the 41 rows as ruled, in their order (主开发 r510 / r617: IE, NZ, PE, ES, IL kept)', J(M.LANGUAGE_ROWS) === J(ROWS_RULED), M.LANGUAGE_ROWS.filter((r, i) => J(r) !== J(ROWS_RULED[i])));
  const codes = M.LANGUAGE_ROWS.map(([c]) => c);
  leg('② no country twice; every code two capitals; every tag the runtime\'s own spelling of ONE tag the kernel takes', new Set(codes).size === codes.length && M.LANGUAGE_ROWS.every(([c, t]) => /^[A-Z]{2}$/.test(c) && tagOf(t) === t && M.KERNEL_TAG.test(t)), M.LANGUAGE_ROWS.filter(([c, t]) => !/^[A-Z]{2}$/.test(c) || tagOf(t) !== t));
  const SEVERAL = ['CH', 'BE', 'CA', 'IN', 'SG', 'LU', 'MY', 'PH', 'ZA', 'HK'];
  leg('② the countries of several public languages are not rows (CH, BE, CA, IN, SG, LU, MY, PH, ZA, HK): Automatic says so for them', SEVERAL.every((c) => M.languageOfCountry(c) === null), SEVERAL.filter((c) => M.languageOfCountry(c) !== null));
  // ③ THE VERDICT
  leg('③ THE DEFAULT: nothing given, an empty object, a cleared (null) choice, or every setting «this machine\'s» ⇒ NOTHING kept (null)', [V(null), V(undefined), V({}), V({ timezone: null }), V({ timezone: { mode: 'machine' }, language: { mode: 'machine' }, location: { mode: 'machine' } })].every((v) => v.ok === true && v.value === null), [V({}), V({ timezone: null }), V({ timezone: { mode: 'machine' } })]);
  leg('③ Automatic and blocked are kept as the choice alone; «this machine\'s» beside them is dropped', J(V({ timezone: { mode: 'auto' }, language: { mode: 'machine' }, location: { mode: 'block' } }).value) === J({ timezone: { mode: 'auto' }, location: { mode: 'block' } }), V({ timezone: { mode: 'auto' }, location: { mode: 'block' } }));
  const KEPT = [
    ['a zone in another case', { timezone: { mode: 'value', value: 'asia/tokyo' } }, 'timezone', 'Asia/Tokyo'],
    ['the UTC name', { timezone: { mode: 'value', value: 'UTC' } }, 'timezone', 'UTC'],
    ['the UTC name in lower case', { timezone: { mode: 'value', value: 'utc' } }, 'timezone', 'UTC'],
    ['the Etc spelling of UTC (kept as the runtime spells it)', { timezone: { mode: 'value', value: 'Etc/UTC' } }, 'timezone', zoneOf('Etc/UTC')],
    ['a legacy alias (Asia/Calcutta, as the runtime spells it)', { timezone: { mode: 'value', value: 'Asia/Calcutta' } }, 'timezone', zoneOf('Asia/Calcutta')],
    ['a legacy alias (US/Eastern, as the runtime spells it)', { timezone: { mode: 'value', value: 'US/Eastern' } }, 'timezone', zoneOf('US/Eastern')],
    ['a language in small letters', { language: { mode: 'value', value: 'ja-jp' } }, 'language', 'ja-JP'],
    ['a language with a script part', { language: { mode: 'value', value: 'zh-hant-tw' } }, 'language', 'zh-Hant-TW'],
    ['a three-letter language code (as the runtime spells it)', { language: { mode: 'value', value: 'jpn' } }, 'language', tagOf('jpn')],
    ['a place as decimal strings, kept at SIX decimals', { location: { mode: 'value', value: { latitude: '35.67623456', longitude: '139.6503' } } }, 'location', { latitude: 35.676235, longitude: 139.6503 }],
    ['a place at the poles and the date line (the bounds are inclusive)', { location: { mode: 'value', value: { latitude: -90, longitude: 180 } } }, 'location', { latitude: -90, longitude: 180 }],
    ['a place with its own accuracy', { location: { mode: 'value', value: { latitude: 90, longitude: -180, accuracy: 20 } } }, 'location', { latitude: 90, longitude: -180, accuracy: 20 }],
  ];
  for (const [what, input, key, want] of KEPT) { const v = V(input); leg(`③ kept: ${what} ⇒ ${J(want)}`, v.ok === true && !!v.value && J(v.value[key].value) === J(want), v); }
  const REFUSALS = [
    ['a fingerprint setting', { userAgent: { mode: 'value', value: 'x' } }, 'env_setting_unknown'],
    ['a choice that is none', { timezone: { mode: 'guess' } }, 'env_mode_invalid'],
    ['a choice in no shape', { timezone: 'auto' }, 'env_mode_invalid'],
    ['Automatic location', { location: { mode: 'auto' } }, 'env_mode_unoffered'],
    ['a blocked time zone', { timezone: { mode: 'block' } }, 'env_mode_unoffered'],
    ['an abbreviation for a zone (JST)', { timezone: { mode: 'value', value: 'JST' } }, 'env_timezone_invalid'],
    ['an offset for a zone (+09:00)', { timezone: { mode: 'value', value: '+09:00' } }, 'env_timezone_invalid'],
    ['an offset after UTC (UTC+8)', { timezone: { mode: 'value', value: 'UTC+8' } }, 'env_timezone_invalid'],
    ['an Etc offset (Etc/GMT-8)', { timezone: { mode: 'value', value: 'Etc/GMT-8' } }, 'env_timezone_invalid'],
    ['an empty zone', { timezone: { mode: 'value', value: '' } }, 'env_timezone_invalid'],
    ['two language tags', { language: { mode: 'value', value: 'en-US, en' } }, 'env_language_invalid'],
    ['a quality value (ja;q=0.9)', { language: { mode: 'value', value: 'ja;q=0.9' } }, 'env_language_invalid'],
    ['an empty language', { language: { mode: 'value', value: '' } }, 'env_language_invalid'],
    ['words for a tag', { language: { mode: 'value', value: 'not a tag' } }, 'env_language_invalid'],
    ['a private-use tag alone (x-foo)', { language: { mode: 'value', value: 'x-foo' } }, 'env_language_invalid'],
    ['an extension the kernel refuses (en-US-u-hc-h23)', { language: { mode: 'value', value: 'en-US-u-hc-h23' } }, 'env_language_invalid'],
    ['a collation extension (de-DE-u-co-phonebk)', { language: { mode: 'value', value: 'de-DE-u-co-phonebk' } }, 'env_language_invalid'],
    ['a private-use part (en-US-x-twain)', { language: { mode: 'value', value: 'en-US-x-twain' } }, 'env_language_invalid'],
    ['a first part of five to eight letters (abcde)', { language: { mode: 'value', value: 'abcde' } }, 'env_language_invalid'],
    ['a latitude past 90', { location: { mode: 'value', value: { latitude: 90.000001, longitude: 0 } } }, 'env_place_invalid'],
    ['a longitude past -180', { location: { mode: 'value', value: { latitude: 0, longitude: -180.000001 } } }, 'env_place_invalid'],
    ['a hex latitude (0x10)', { location: { mode: 'value', value: { latitude: '0x10', longitude: 0 } } }, 'env_place_invalid'],
    ['an exponent (1e1)', { location: { mode: 'value', value: { latitude: '1e1', longitude: 0 } } }, 'env_place_invalid'],
    ['NaN', { location: { mode: 'value', value: { latitude: NaN, longitude: 0 } } }, 'env_place_invalid'],
    ['Infinity', { location: { mode: 'value', value: { latitude: 0, longitude: Infinity } } }, 'env_place_invalid'],
    ['an accuracy of 0 m', { location: { mode: 'value', value: { latitude: 0, longitude: 0, accuracy: 0 } } }, 'env_place_invalid'],
    ['an accuracy over 100 000 m', { location: { mode: 'value', value: { latitude: 0, longitude: 0, accuracy: 100001 } } }, 'env_place_invalid'],
    ['a list for the environment', [], 'env_invalid'],
  ];
  for (const [what, input, code] of REFUSALS) { const v = V(input); leg(`③ refused by name: ${what} ⇒ ${code}`, v.ok === false && v.code === code && typeof v.error === 'string' && v.error.length > 10, v); }
  // ④ THE ONE READER
  leg('④ keptExitOf: no exit ⇒ null; a kept one ⇒ its five facts under the hand-over\'s names', M.keptExitOf({}) === null && M.keptExitOf(null) === null && M.keptExitOf({ egress: [] }) === null && J(M.keptExitOf(tokyo)) === J({ publicIp: '203.0.113.7', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'measured' }), M.keptExitOf(tokyo));
  // ⑤ WHAT EACH SETTING IS
  const ex = (o) => M.keptExitOf({ egress: { publicIp: '', country: '', timezone: '', ...o } });
  const untouched = R(null, M.keptExitOf(tokyo)), allMachine = R({ timezone: { mode: 'machine' }, language: { mode: 'machine' } }, M.keptExitOf(tokyo));
  leg('⑤ THE DEFAULT: an untouched profile, even with a kept exit, hands NOTHING — told null (never {}), no geolocation, nothing unfollowed', [untouched, allMachine].every((r) => r.told === null && r.geolocation === null && r.unfollowed.length === 0 && r.settings.every((s) => s.from === 'machine' && s.said === null)), untouched);
  const CASES = [
    ['Automatic zone, Tokyo exit kept ⇒ Asia/Tokyo from the exit', { timezone: { mode: 'auto' } }, M.keptExitOf(tokyo), 'timezone', 'exit', 'Asia/Tokyo', null],
    ['Automatic zone, NO exit kept ⇒ SAID «no_exit», nothing told', { timezone: { mode: 'auto' } }, null, 'timezone', 'machine', undefined, 'no_exit'],
    ['Automatic zone, an exit kept without a zone ⇒ SAID «exit_no_timezone»', { timezone: { mode: 'auto' } }, ex({ country: 'JP' }), 'timezone', 'machine', undefined, 'exit_no_timezone'],
    ['Automatic zone, a kept zone the rule refuses (a hand-edited store) ⇒ SAID «exit_timezone_invalid», never told', { timezone: { mode: 'auto' } }, ex({ timezone: 'UTC+9' }), 'timezone', 'machine', undefined, 'exit_timezone_invalid'],
    ['Automatic language, JP ⇒ ja-JP', { language: { mode: 'auto' } }, M.keptExitOf(tokyo), 'language', 'exit', 'ja-JP', null],
    ['Automatic language, «jp» typed small ⇒ ja-JP', { language: { mode: 'auto' } }, ex({ country: 'jp' }), 'language', 'exit', 'ja-JP', null],
    ['Automatic language, CH (several) ⇒ SAID «exit_country_no_language», never guessed', { language: { mode: 'auto' } }, ex({ country: 'CH' }), 'language', 'machine', undefined, 'exit_country_no_language'],
    ['Automatic language, the country kept as a NAME («Japan») ⇒ SAID, never guessed', { language: { mode: 'auto' } }, ex({ country: 'Japan' }), 'language', 'machine', undefined, 'exit_country_no_language'],
    ['Automatic language, no country kept ⇒ SAID «exit_no_country»', { language: { mode: 'auto' } }, ex({ timezone: 'Asia/Tokyo' }), 'language', 'machine', undefined, 'exit_no_country'],
    ['Automatic language, NO exit ⇒ SAID «no_exit»', { language: { mode: 'auto' } }, null, 'language', 'machine', undefined, 'no_exit'],
    ['a language set ⇒ told as set', { language: { mode: 'value', value: 'fr-FR' } }, null, 'language', 'value', 'fr-FR', null],
    ['a place set ⇒ the hand-over carries its latitude and longitude ONLY', { location: { mode: 'value', value: { latitude: 35.68, longitude: 139.76 } } }, null, 'location', 'value', { latitude: 35.68, longitude: 139.76 }, null],
    ['location blocked ⇒ the hand-over\'s own word «blocked» (主开发 r745: the kernel\'s form)', { location: { mode: 'block' } }, null, 'location', 'block', 'blocked', null],
  ];
  for (const [what, env, exit, key, from, told, said] of CASES) {
    const res = R(env, exit), s = at(res, key);
    leg(`⑤ ${what}`, s.from === from && s.said === said && J(toldOf(res)[key]) === J(told), { s, told: res.told });
  }
  // ⑤ geolocation: what the hand-over has no form for (a place's accuracy, blocked) — the protocol road's
  const gp = R({ location: { mode: 'value', value: { latitude: 35.68, longitude: 139.76 } } }), gpa = R({ location: { mode: 'value', value: { latitude: 1, longitude: 2, accuracy: 20 } } }), gb = R({ location: { mode: 'block' } });
  leg('⑤ geolocation: a place with the stated 100 m, a place with its own accuracy, blocked — and the hand-over carries blocked as its word, never an accuracy', J(gp.geolocation) === J({ kind: 'place', latitude: 35.68, longitude: 139.76, accuracy: 100 }) && J(gpa.geolocation) === J({ kind: 'place', latitude: 1, longitude: 2, accuracy: 20 }) && J(gb.geolocation) === J({ kind: 'blocked' }) && J(gb.told) === J({ location: 'blocked' }) && !('accuracy' in (gpa.told || {}).location), { gp: gp.geolocation, gpa: gpa.geolocation, gb });
  // ⑤ «SAYS SO» AT THE START (主开发 r617): every choice the start cannot follow is listed for the start road to say
  const pr = R({ timezone: { mode: 'auto' }, language: { mode: 'auto' } }, null), fine = R({ timezone: { mode: 'auto' }, language: { mode: 'auto' } }, M.keptExitOf(tokyo));
  const stale = R({ timezone: { mode: 'value', value: 'Mars/Olympus' } });
  leg('⑤ «SAYS SO» AT THE START: the proxy changed (no exit kept) under two Automatic choices ⇒ unfollowed names both with their reasons; followed ⇒ none', J(pr.unfollowed) === J([{ key: 'timezone', mode: 'auto', said: 'no_exit' }, { key: 'language', mode: 'auto', said: 'no_exit' }]) && pr.told === null && fine.unfollowed.length === 0, { pr: pr.unfollowed, fine: fine.unfollowed });
  leg('⑤ «SAYS SO»: a kept value the runtime refuses now is listed too (never told, never silent)', J(stale.unfollowed) === J([{ key: 'timezone', mode: 'value', said: 'env_timezone_invalid' }]) && stale.told === null, stale);
  const odd = R({ location: { mode: 'auto' } }, M.keptExitOf(tokyo));
  leg('⑤ a stored choice the row does not offer (Automatic location, written by hand) ⇒ this machine\'s, nothing told', at(odd, 'location').from === 'machine' && odd.told === null, odd);
  // ⑦'s probe: the log view of a place
  const lv = M.environmentLogView({ timezone: { mode: 'value', value: 'Asia/Tokyo' }, location: { mode: 'value', value: { latitude: 35.6812, longitude: 139.7671 } } });
  leg('⑦ the log view: a zone by its choice and name, a place by its kind ONLY — no coordinate', J(lv) === J({ timezone: 'value:Asia/Tokyo', location: 'value' }) && !/35\.68|139\.76/.test(J(lv)), lv);
  return out;
}

/** ⑥ THE SEEDED LAW over a module M → the facts judged and the first breaks. */
function lawOf(M, seeds = [7, 41, 9584], n = 400) {
  const facts = { cases: 0, told: 0, fromExit: 0, said: 0, kept: 0, places: 0, broken: [] };
  const ZONES = ['Asia/Tokyo', 'Europe/Paris', 'America/Sao_Paulo', '', 'UTC'], COUNTRIES = ['JP', 'CH', 'de', 'Japan', '', 'BR'], LANGS = ['ja-JP', 'pt-BR', 'en-US'];
  for (const seed of seeds) {
    let st = seed >>> 0; const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let x = st; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };   // mulberry32
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    for (let i = 0; i < n; i++) {
      const env = {};
      const tz = pick(['machine', 'auto', 'value', null]); if (tz) env.timezone = tz === 'value' ? { mode: 'value', value: pick(ZONES.filter(Boolean)) } : { mode: tz };
      const lg = pick(['machine', 'auto', 'value', null]); if (lg) env.language = lg === 'value' ? { mode: 'value', value: pick(LANGS) } : { mode: lg };
      const lc = pick(['machine', 'block', 'value', null]); let place = null;
      if (lc) { if (lc === 'value') { place = { latitude: Math.round((rnd() * 180 - 90) * 1e7) / 1e7, longitude: Math.round((rnd() * 360 - 180) * 1e7) / 1e7 }; env.location = { mode: 'value', value: place }; } else env.location = { mode: lc }; }
      const exit = rnd() < 0.3 ? null : M.keptExitOf({ egress: { publicIp: '203.0.113.9', country: pick(COUNTRIES), timezone: pick(ZONES), checkedAt: 1, source: 'typed' } });
      const v = M.environmentVerdict(env);
      const res = M.resolveEnvironment(v.ok ? v.value : env, exit);
      facts.cases++;
      const bad = (law) => { if (facts.broken.length < 4) facts.broken.push({ law, seed, i, env, exit, res }); };
      if (!v.ok) bad('V: every generated choice is a valid one');
      const told = res.told || {};
      if (res.told !== null && !Object.keys(res.told).length) bad('E: an empty hand-over is null, never {}');
      for (const s of res.settings) {
        const inTold = s.key in told;
        if (inTold) facts.told++;
        if (inTold !== (s.from === 'value' || s.from === 'exit' || s.from === 'block')) bad('T: in the hand-over ⇔ a value, an Automatic followed, or blocked (its word)');
        if (s.key === 'location' && (res.geolocation !== null) !== (s.from === 'value' || s.from === 'block')) bad('G: geolocation ⇔ a place or blocked');
        if (s.from === 'exit') { facts.fromExit++; if (!exit || s.mode !== 'auto') bad('X: a value «from the exit» only from Automatic over a KEPT exit'); }
        if (s.said !== null) { facts.said++; if (s.from !== 'machine' || inTold) bad('S: a choice not followed is never told — it is never guessed'); }
        if ((s.said !== null) !== res.unfollowed.some((u) => u.key === s.key && u.said === s.said)) bad('U: unfollowed ⇔ said — the start can say every one');
        if (s.mode === 'machine' && inTold) bad('M: this machine\'s tells nothing');
      }
      const raw = M.resolveEnvironment(env, exit);
      if (v.ok && J(raw.told) !== J(res.told)) bad('K: what the verdict keeps resolves as the person\'s own input');
      if (v.ok && v.value === null) { if (res.told !== null) bad('D: nothing kept ⇒ nothing handed (null)'); } else facts.kept++;
      if (v.ok && v.value && Object.values(v.value).some((c) => c && c.mode === 'machine')) bad('N: «this machine\'s» is never kept (the default stays the release\'s)');
      if (place) {
        facts.places++;
        const kept = v.ok && v.value && v.value.location ? v.value.location.value : null;
        if (!kept || [kept.latitude, kept.longitude].some((x) => Math.round(x * 1e6) / 1e6 !== x)) bad('P: a place is kept at six decimals, no finer');
        const log = J(M.environmentLogView(v.ok ? v.value : env));
        if (log.includes(String(place.latitude).slice(0, 6)) || log.includes(String(place.longitude).slice(0, 6))) bad('L: a place\'s coordinates never in the log view');
      }
    }
  }
  return facts;
}

// ── the real module ──
const real = legs(E);
for (const [name, pass, detail] of real) ok(pass, name, detail);
const law = lawOf(E);
console.log(`    the law judged: ${law.cases} environments (seeds 7 / 41 / 9584) — settings handed over ${law.told}, from the kept exit ${law.fromExit}, not followed (said) ${law.said}, kept non-empty ${law.kept}, places ${law.places}`);
ok(law.cases === 1200 && law.broken.length === 0 && law.told > 300 && law.fromExit > 50 && law.said > 50 && law.places > 100, '⑥ THE SEEDED LAW: an empty hand-over is null (E), in the hand-over ⇔ followed (T), geolocation ⇔ a place or blocked (G), «from the exit» only over a kept exit (X), not followed ⇒ never told (S), unfollowed ⇔ said (U), this machine\'s tells nothing (M), the kept value resolves as the input (K), nothing kept ⇒ nothing handed (D), this machine\'s is never kept (N), six decimals (P), no coordinate in the log view (L) — every branch reached', law);

// ── ⑦ REDS: one rule taken back each, judged by the same legs ──
const failedOf = (M) => legs(M).filter(([, pass]) => !pass).map(([name]) => name);
const REDS = [
  ['the guessed zone (Automatic with no exit falls back to UTC)', ["auto: (exit) => { if (!exit) return { none: 'no_exit' };", "auto: (exit) => { if (!exit) return { value: 'UTC' };"], '⑤ Automatic zone, NO exit kept', 'X'],
  ['the default moved (this machine\'s kept in the store)', ['    if (mode === MODES.MACHINE) continue;   // this machine\'s: nothing kept\n', ''], '③ THE DEFAULT', 'N'],
  ['the place in the log (the log view keeps its coordinates)', ["out[row.key] = row.key === 'location' ? str(c.mode) :", "out[row.key] = row.key === 'location' ? JSON.stringify(c) :"], '⑦ the log view', 'L'],
  ['the country name guessed (a country kept as a name read as English)', ["const tag = /^[A-Za-z]{2}$/.test(c) ? languageOfCountry(c.toUpperCase()) : null;", "const tag = /^[A-Za-z]{2}$/.test(c) ? languageOfCountry(c.toUpperCase()) : 'en-US';"], '⑤ Automatic language, the country kept as a NAME', null],
  ['the start left unsaid (no unfollowed list)', ['    if (r.said) unfollowed.push({ key: row.key, mode, said: r.said });\n', ''], '⑤ «SAYS SO» AT THE START', 'U'],
  ['an untouched profile hands {} (the told object always present)', ['  return { settings, told: Object.keys(told).length ? told : null, geolocation, unfollowed };', '  return { settings, told, geolocation, unfollowed };'], '⑤ THE DEFAULT', 'E'],
  ['the language rule wider than the kernel\'s (its shape not checked)', ['  if (!KERNEL_TAG.test(canon[0])) return refuse(', '  if (false) return refuse('], '③ refused by name: an extension the kernel refuses', null],
  ['a hex or an exponent read as a number', ["typeof x === 'string' && DECIMAL.test(x.trim()) ? Number(x.trim()) : NaN", "typeof x === 'string' && x.trim() !== '' ? Number(x.trim()) : NaN"], '③ refused by name: a hex latitude', null],
];
for (const [what, [from, to], legName, lawName] of REDS) {
  const M = mutantOf(from, to, `B-9584 U1 RED — ${what}`);
  const failed = failedOf(M), lw = lawName ? lawOf(M, [7, 41, 9584], 100) : null;   // a mutant's law over 300 environments (the fast tier's sum: a break shows in the first few dozen)
  ok(failed.some((n) => n.startsWith(legName)) && (!lawName || lw.broken.some((b) => b.law.startsWith(lawName))), `⑦ RED — ${what}: the leg «${legName}…» goes red${lawName ? ` and the law's ${lawName} breaks` : ''}`, { failed, law: lw && lw.broken.slice(0, 1) });
}
report();
