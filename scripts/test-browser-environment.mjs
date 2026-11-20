#!/usr/bin/env node
// A BROWSER PROFILE'S OWN ENVIRONMENT — U1, THE PURE RULES (B-9584, lane cli-update-needs-nothing; the owner 2026-11-20 «可以按照你的建议»,
// 主开发 r497 / r510). src/browser-environment.js: ONE table, every setting a row (time zone, language, location — nothing of a
// fingerprint); «this machine's», «Automatic» (the KEPT exit only, never a lookup) or a value; Automatic with nothing to follow is
// SAID, never guessed; an untouched profile keeps nothing and tells the browser nothing; a place never reaches a log line.
//   ① THE TABLE — the three settings, each row's choices, its rule, its Automatic (location: none, and why)
//   ② THE LANGUAGE ROWS — no country twice, every code two capitals, every tag the runtime's own spelling, the several-language
//      countries absent
//   ③ THE VERDICT — what the store writer keeps (null for an untouched or all-«this machine's» profile), every refusal by name
//   ④ THE ONE READER of the kept exit
//   ⑤ WHAT EACH SETTING IS — a table of cases, Automatic said when it has nothing to follow
//   ⑥ THE SEEDED LAW — 3 seeds × 400 environments × exits: told ⇔ not this machine's, «exit» only from a kept exit, said ⇒ nothing
//      told, the verdict's kept value resolves as the input, the log view never holds a place's coordinates; the facts judged printed
//   ⑦ REDS — four mutants of the module (through anchored()), each judged by the same legs: the guessed zone (law X), the default
//      moved (law N), the place in the log (law L), the country name guessed
// The runtime decides two facts here: a zone name (its date formatter) and a language tag (Intl.getCanonicalLocales, its ICU data).
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
const tokyo = { egress: { publicIp: '203.0.113.7', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'measured' } };

/** EVERY LEG over a module M → [[name, pass, detail]] — the real module and each mutant are judged by the same list. */
function legs(M) {
  const out = [];
  const leg = (name, pass, detail) => { if (typeof pass !== 'boolean') throw new TypeError(`leg «${name}»: the condition is a ${typeof pass}, not a boolean`); out.push([name, pass, detail]); };   // B-1747's swap guard (the census of inline helpers)
  const V = (x) => M.environmentVerdict(x);
  const R = (env, exit) => M.resolveEnvironment(env, exit);
  const at = (res, key) => res.settings.find((s) => s.key === key) || {};
  // ① THE TABLE
  leg('① the settings are exactly the owner\'s three — time zone, language, location; nothing of a fingerprint', J(M.SETTING_KEYS) === J(['timezone', 'language', 'location']), M.SETTING_KEYS);
  leg('① every row offers «this machine\'s», only known choices, a rule for its value; Automatic is a function exactly where it is offered', M.SETTINGS.every((r) => r.choices.includes('machine') && r.choices.every((c) => Object.values(M.MODES).includes(c)) && typeof r.value === 'function' && (r.choices.includes('auto') ? typeof r.auto === 'function' : r.auto === null)), M.SETTINGS.map((r) => [r.key, r.choices]));
  const loc = M.SETTINGS.find((r) => r.key === 'location') || {};
  leg('① location offers exactly this machine\'s / blocked / a place — no Automatic, and the row says why (the kept exit holds no place)', J(sorted(loc.choices || [])) === J(['block', 'machine', 'value']) && loc.auto === null && loc.noAutomatic === 'exit_has_no_place', loc);
  // ② THE LANGUAGE ROWS
  const codes = M.LANGUAGE_ROWS.map(([c]) => c);
  leg('② the language rows: no country twice', new Set(codes).size === codes.length, codes.filter((c, i) => codes.indexOf(c) !== i));
  leg('② every country is a code of two capitals, every tag is the runtime\'s own spelling of ONE language tag', M.LANGUAGE_ROWS.every(([c, t]) => /^[A-Z]{2}$/.test(c) && (() => { try { return J(Intl.getCanonicalLocales(t)) === J([t]); } catch { return false; } })()), M.LANGUAGE_ROWS.filter(([c, t]) => !/^[A-Z]{2}$/.test(c) || J((() => { try { return Intl.getCanonicalLocales(t); } catch { return []; } })()) !== J([t])));
  leg('② the countries of several public languages are not rows (CH, BE, CA, IN, SG, LU, MY, PH, ZA, HK): Automatic says so for them', ['CH', 'BE', 'CA', 'IN', 'SG', 'LU', 'MY', 'PH', 'ZA', 'HK'].every((c) => M.languageOfCountry(c) === null), ['CH', 'BE', 'CA', 'IN', 'SG', 'LU', 'MY', 'PH', 'ZA', 'HK'].filter((c) => M.languageOfCountry(c) !== null));
  // ③ THE VERDICT
  leg('③ THE DEFAULT: nothing given, an empty object, or every setting «this machine\'s» ⇒ NOTHING kept (null)', [V(null), V(undefined), V({}), V({ timezone: { mode: 'machine' }, language: { mode: 'machine' }, location: { mode: 'machine' } })].every((v) => v.ok && v.value === null), [V({}), V({ timezone: { mode: 'machine' } })]);
  const kept = V({ timezone: { mode: 'value', value: 'asia/tokyo' }, language: { mode: 'value', value: 'ja-jp' }, location: { mode: 'value', value: { latitude: '35.68', longitude: 139.76 } } });
  leg('③ values kept in their canonical spelling: Asia/Tokyo, ja-JP, the place as numbers', kept.ok && J(kept.value) === J({ timezone: { mode: 'value', value: 'Asia/Tokyo' }, language: { mode: 'value', value: 'ja-JP' }, location: { mode: 'value', value: { latitude: 35.68, longitude: 139.76 } } }), kept);
  leg('③ Automatic and blocked are kept as the choice alone; «this machine\'s» beside them is dropped', J(V({ timezone: { mode: 'auto' }, language: { mode: 'machine' }, location: { mode: 'block' } }).value) === J({ timezone: { mode: 'auto' }, location: { mode: 'block' } }), V({ timezone: { mode: 'auto' }, location: { mode: 'block' } }));
  const REFUSALS = [
    ['a fingerprint setting', { userAgent: { mode: 'value', value: 'x' } }, 'env_setting_unknown'],
    ['a choice that is none', { timezone: { mode: 'guess' } }, 'env_mode_invalid'],
    ['a choice in no shape', { timezone: 'auto' }, 'env_mode_invalid'],
    ['Automatic location', { location: { mode: 'auto' } }, 'env_mode_unoffered'],
    ['a blocked time zone', { timezone: { mode: 'block' } }, 'env_mode_unoffered'],
    ['an abbreviation for a zone', { timezone: { mode: 'value', value: 'JST' } }, 'env_timezone_invalid'],
    ['an offset for a zone', { timezone: { mode: 'value', value: '+09:00' } }, 'env_timezone_invalid'],
    ['an empty zone', { timezone: { mode: 'value', value: '' } }, 'env_timezone_invalid'],
    ['two language tags', { language: { mode: 'value', value: 'en-US, en' } }, 'env_language_invalid'],
    ['words for a tag', { language: { mode: 'value', value: 'not a tag' } }, 'env_language_invalid'],
    ['a latitude past 90', { location: { mode: 'value', value: { latitude: 91, longitude: 0 } } }, 'env_place_invalid'],
    ['a longitude past -180', { location: { mode: 'value', value: { latitude: 0, longitude: -181 } } }, 'env_place_invalid'],
    ['an accuracy of 0 m', { location: { mode: 'value', value: { latitude: 0, longitude: 0, accuracy: 0 } } }, 'env_place_invalid'],
    ['a list for the environment', [], 'env_invalid'],
  ];
  for (const [what, input, code] of REFUSALS) { const v = V(input); leg(`③ refused by name: ${what} ⇒ ${code}`, !v.ok && v.code === code && typeof v.error === 'string' && v.error.length > 10, v); }
  // ④ THE ONE READER
  leg('④ keptExitOf: no exit ⇒ null; a kept one ⇒ its five facts under the hand-over\'s names', M.keptExitOf({}) === null && M.keptExitOf(null) === null && M.keptExitOf({ egress: [] }) === null && J(M.keptExitOf(tokyo)) === J({ publicIp: '203.0.113.7', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'measured' }), M.keptExitOf(tokyo));
  // ⑤ WHAT EACH SETTING IS
  const ex = (o) => M.keptExitOf({ egress: { publicIp: '', country: '', timezone: '', ...o } });
  const untouched = R(null, M.keptExitOf(tokyo));
  leg('⑤ THE DEFAULT: an untouched profile, even with a kept exit, tells the browser NOTHING — every setting this machine\'s', J(untouched.told) === J({}) && untouched.settings.every((s) => s.from === 'machine' && s.said === null), untouched);
  const CASES = [
    ['Automatic zone, Tokyo exit kept ⇒ Asia/Tokyo from the exit', { timezone: { mode: 'auto' } }, M.keptExitOf(tokyo), 'timezone', 'exit', 'Asia/Tokyo', null],
    ['Automatic zone, NO exit kept ⇒ SAID «no_exit», nothing told', { timezone: { mode: 'auto' } }, null, 'timezone', 'machine', undefined, 'no_exit'],
    ['Automatic zone, an exit kept without a zone ⇒ SAID «exit_no_timezone»', { timezone: { mode: 'auto' } }, ex({ country: 'JP' }), 'timezone', 'machine', undefined, 'exit_no_timezone'],
    ['Automatic language, JP ⇒ ja-JP', { language: { mode: 'auto' } }, M.keptExitOf(tokyo), 'language', 'exit', 'ja-JP', null],
    ['Automatic language, «jp» typed small ⇒ ja-JP', { language: { mode: 'auto' } }, ex({ country: 'jp' }), 'language', 'exit', 'ja-JP', null],
    ['Automatic language, CH (several) ⇒ SAID «exit_country_no_language», never guessed', { language: { mode: 'auto' } }, ex({ country: 'CH' }), 'language', 'machine', undefined, 'exit_country_no_language'],
    ['Automatic language, the country kept as a NAME («Japan») ⇒ SAID, never guessed', { language: { mode: 'auto' } }, ex({ country: 'Japan' }), 'language', 'machine', undefined, 'exit_country_no_language'],
    ['Automatic language, no country kept ⇒ SAID «exit_no_country»', { language: { mode: 'auto' } }, ex({ timezone: 'Asia/Tokyo' }), 'language', 'machine', undefined, 'exit_no_country'],
    ['Automatic language, NO exit ⇒ SAID «no_exit»', { language: { mode: 'auto' } }, null, 'language', 'machine', undefined, 'no_exit'],
    ['a language set ⇒ told as set', { language: { mode: 'value', value: 'fr-FR' } }, null, 'language', 'value', 'fr-FR', null],
    ['location blocked ⇒ told «block»', { location: { mode: 'block' } }, null, 'location', 'block', 'block', null],
    ['a place set ⇒ told with the stated accuracy (100 m)', { location: { mode: 'value', value: { latitude: 35.68, longitude: 139.76 } } }, null, 'location', 'value', { accuracy: 100, latitude: 35.68, longitude: 139.76 }, null],
    ['a place with its own accuracy ⇒ told with it', { location: { mode: 'value', value: { latitude: 1, longitude: 2, accuracy: 20 } } }, null, 'location', 'value', { accuracy: 20, latitude: 1, longitude: 2 }, null],
  ];
  for (const [what, env, exit, key, from, told, said] of CASES) {
    const res = R(env, exit), s = at(res, key);
    leg(`⑤ ${what}`, s.from === from && s.said === said && J(res.told[key]) === J(told), { s, told: res.told });
  }
  const odd = R({ location: { mode: 'auto' } }, M.keptExitOf(tokyo));
  leg('⑤ a stored choice the row does not offer (Automatic location, written by hand) ⇒ this machine\'s, nothing told', at(odd, 'location').from === 'machine' && !('location' in odd.told), odd);
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
      if (lc) { if (lc === 'value') { place = { latitude: Math.round((rnd() * 180 - 90) * 1e4) / 1e4, longitude: Math.round((rnd() * 360 - 180) * 1e4) / 1e4 }; env.location = { mode: 'value', value: place }; } else env.location = { mode: lc }; }
      const exit = rnd() < 0.3 ? null : M.keptExitOf({ egress: { publicIp: '203.0.113.9', country: pick(COUNTRIES), timezone: pick(ZONES), checkedAt: 1, source: 'typed' } });
      const v = M.environmentVerdict(env);
      const res = M.resolveEnvironment(v.ok ? v.value : env, exit);
      facts.cases++;
      const bad = (law) => { if (facts.broken.length < 4) facts.broken.push({ law, seed, i, env, exit, res }); };
      if (!v.ok) bad('V: every generated choice is a valid one');
      for (const s of res.settings) {
        const toldIt = s.key in res.told;
        if (toldIt) facts.told++;
        if (toldIt !== (s.from === 'value' || s.from === 'exit' || s.from === 'block')) bad('T: told ⇔ the setting is not this machine\'s');
        if (s.from === 'exit') { facts.fromExit++; if (!exit || s.mode !== 'auto') bad('X: a value «from the exit» only from Automatic over a KEPT exit'); }
        if (s.said !== null) { facts.said++; if (s.from !== 'machine' || toldIt) bad('S: an Automatic SAID is never told — it is never guessed'); }
        if (s.mode === 'machine' && toldIt) bad('M: this machine\'s tells nothing');
      }
      const raw = M.resolveEnvironment(env, exit);
      if (v.ok && J(raw.told) !== J(res.told)) bad('K: what the verdict keeps resolves as the person\'s own input');
      if (v.ok && v.value === null) { if (Object.keys(res.told).length) bad('D: nothing kept ⇒ nothing told'); } else facts.kept++;
      if (v.ok && v.value && Object.values(v.value).some((c) => c && c.mode === 'machine')) bad('N: «this machine\'s» is never kept (the default stays the release\'s)');
      if (place) {
        facts.places++;
        const log = J(M.environmentLogView(v.ok ? v.value : env));
        if (log.includes(String(place.latitude)) || log.includes(String(place.longitude))) bad('L: a place\'s coordinates never in the log view');
      }
    }
  }
  return facts;
}

// ── the real module ──
const real = legs(E);
for (const [name, pass, detail] of real) ok(pass, name, detail);
const law = lawOf(E);
console.log(`    the law judged: ${law.cases} environments (seeds 7 / 41 / 9584) — settings told ${law.told}, from the kept exit ${law.fromExit}, Automatic said (nothing told) ${law.said}, kept non-empty ${law.kept}, places ${law.places}`);
ok(law.cases === 1200 && law.broken.length === 0 && law.told > 300 && law.fromExit > 50 && law.said > 50 && law.places > 100, '⑥ THE SEEDED LAW: told ⇔ not this machine\'s (T), «from the exit» only over a kept exit (X), said ⇒ never told (S), this machine\'s tells nothing (M), the kept value resolves as the input (K), nothing kept ⇒ nothing told (D), this machine\'s is never kept (N), no coordinate in the log view (L) — every branch reached', law);

// ── ⑦ REDS: one rule taken back each, judged by the same legs ──
const failedOf = (M) => legs(M).filter(([, pass]) => !pass).map(([name]) => name);
const REDS = [
  ['the guessed zone (Automatic with no exit falls back to UTC)', ["auto: (exit) => (!exit ? { none: 'no_exit' } : exit.timezone ? { value: exit.timezone } : { none: 'exit_no_timezone' }),", "auto: (exit) => (!exit ? { value: 'UTC' } : exit.timezone ? { value: exit.timezone } : { none: 'exit_no_timezone' }),"], '⑤ Automatic zone, NO exit kept', 'X'],
  ['the default moved (this machine\'s kept in the store)', ['    if (mode === MODES.MACHINE) continue;   // this machine\'s: nothing kept\n', ''], '③ THE DEFAULT', 'N'],
  ['the place in the log (the log view keeps its coordinates)', ["out[row.key] = row.key === 'location' ? str(c.mode) :", "out[row.key] = row.key === 'location' ? JSON.stringify(c) :"], '⑦ the log view', 'L'],
  ['the country name guessed (a country kept as a name read as English)', ["const tag = /^[A-Za-z]{2}$/.test(c) ? languageOfCountry(c.toUpperCase()) : null;", "const tag = /^[A-Za-z]{2}$/.test(c) ? languageOfCountry(c.toUpperCase()) : 'en-US';"], '⑤ Automatic language, the country kept as a NAME', null],
];
for (const [what, [from, to], legName, lawName] of REDS) {
  const M = mutantOf(from, to, `B-9584 U1 RED — ${what}`);
  const failed = failedOf(M), lw = lawName ? lawOf(M) : null;
  ok(failed.some((n) => n.startsWith(legName)) && (!lawName || lw.broken.some((b) => b.law.startsWith(lawName))), `⑦ RED — ${what}: the leg «${legName}…» goes red${lawName ? ` and the law's ${lawName} breaks` : ''}`, { failed, law: lw && lw.broken.slice(0, 1) });
}
report();
