// THE ONE FORMATTER OF A TIME (AND A NUMBER) A PERSON READS ON THE PAGE (lane ui-language pick 4, the UI walk's L1 list —
// a Chinese interface printed «11/12/2026, 7:27:40 PM» in a dozen windows: every site called toLocaleString() its own way).
// 主开发's ruling (2026-11-13): zh / ja «2026/11/12 19:27», today «19:27», this year «11/12 19:27»; en = the device's own;
// where the page's zone is not the device's zone the stamp says the zone, once. src/when-words.js stays the AGENTS' clock.
//
//   stampAt(ms, { seconds, full, now })  a date + time (imported as `when` by its readers — the export is named apart:
//                                     test-bundle-globals reads every export name as a symbol, and «when()» is a word in a log line)
//   in the near shape (today drops the date, this year drops the year;
//                                     `full` keeps the year)
//   dateOf(ms, { full, words, now })  the date only, the same near rule (`words`: the sentence form «11月12日», see stampAt)
//   clockOf(ms, { seconds })          the time only
//   span(ms)                          a duration in the reader's units: «2 天 23 小时», «1 小时 59 分钟», «4 分钟», «12 秒»
//   ago(ms, { now })                  «4 分钟前»
//   num(n, opts)                      a number in the device's locale (Intl.NumberFormat options)
//
// The zone: the page's own (owner-facts pageZone — the instance setting, else the hub's zone, else this browser's), handed in
// once by app.js (setPageZone). test-ui-language ⑦ reds a toLocale*String / Intl.DateTimeFormat / a hand-built US date / an
// English unit template anywhere else in the browser bundle (a machine format — an explicit `en-…` locale, a zone sum —
// says so with `// page-time: <why>`).
// a NAMESPACE import: suites bundle their windows with an ./i18n.js stub that exports `t` only — a named import of the rest
// fails their build; a missing helper here means the device's own locale (undefined) and an English page
import * as I18N from './i18n.js';
const t = (s, p) => (typeof I18N.t === 'function' ? I18N.t(s, p) : s);
const deviceLocale = () => (typeof I18N.deviceLocale === 'function' ? I18N.deviceLocale() : undefined);
const resolveLang = () => (typeof I18N.resolveLang === 'function' ? I18N.resolveLang() : 'en');
import { shortName } from '../when-words.js';
import { countdownMark } from './usage-eta.js';   // THE countdown's spelling (PURE, imports nothing — the owner's 09-15 form)

let PAGE_ZONE = null;   // null = the device's own zone
/** app.js, at boot and when the instance's zone setting changes: the zone the page prints in. */
export function setPageZone(zone) { PAGE_ZONE = typeof zone === 'string' && zone ? zone : null; DZ_AT = -Infinity; }
// EVERY ROW CALLS THIS FILE (the .403 prep mirror: the 1 758-row Channels panel redrew in 600–1 450 ms against its 40): building
// an Intl.DateTimeFormat only to read the device's zone cost 34 µs a call, four times a stamp. The zone is KEPT FOR A MINUTE —
// the LIMIT: a device whose zone changes prints in the old zone for up to a minute (a zone setting's change re-reads it at once).
const ZONE_KEEP_MS = 60000;
let DZ = null, DZ_AT = -Infinity;
const deviceZone = () => {
  const n = Date.now();
  if (!(n >= DZ_AT && n - DZ_AT < ZONE_KEEP_MS)) { try { DZ = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { DZ = null; } DZ_AT = n; }
  return DZ;
};
const zoneOpt = () => (PAGE_ZONE && PAGE_ZONE !== deviceZone() ? { timeZone: PAGE_ZONE } : {});
const cjk = () => { const l = resolveLang(); return l === 'zh' || l === 'ja'; };

const CACHE = new Map(), CACHE_MAX = 64;
/** A formatter, built once per what it depends on: the locale, the printing zone (the device's too — a formatter is never reused
 *  across a zone change), the options. */
const OPT_KEY = new WeakMap();
const optKey = (opts) => { let k = OPT_KEY.get(opts); if (k === undefined) { k = JSON.stringify(opts); OPT_KEY.set(opts, k); } return k; };
function fmt(opts, loc = deviceLocale()) {
  const z = zoneOpt();
  const key = `${loc || ''}|${z.timeZone || deviceZone() || ''}|${optKey(opts)}`;
  let f = CACHE.get(key);
  if (!f) {
    try { f = new Intl.DateTimeFormat(loc, { ...opts, ...z, ...(cjk() && opts.hour ? { hourCycle: 'h23' } : {}) }); } catch { f = new Intl.DateTimeFormat(undefined, opts); }
    if (CACHE.size >= CACHE_MAX) CACHE.clear();
    CACHE.set(key, f);
  }
  return f;
}
// what a quarter-hour of one zone reads (its day, whether its hour is the repeated one, its zone's name) is worked out once:
// every zone's offset is a whole number of quarter-hours, so a day's edge (and a DST step) never falls inside a bucket.
// Bounded: a walk over many zones and days clears it at MEMO_MAX (test-ui-language §1b walks it; a page zone needs three entries a row).
const MEMO = new Map(), MEMO_MAX = 16384;   // about 2 MB at the most: three kinds for a few thousand rows
const memo = (kind, ms, f) => {
  const key = `${kind}|${zoneOpt().timeZone || deviceZone() || ''}|${Math.floor(ms / 900000)}`;
  let v = MEMO.get(key);
  if (v === undefined) { v = f(); if (MEMO.size >= MEMO_MAX) MEMO.clear(); MEMO.set(key, v); }
  return v;
};
/** {y, m, d} of `ms` in the page's zone (the near rule compares days in the zone the stamp is printed in) — numbers, read off
 *  one fixed-format formatter (en-CA «2026-11-04»: format() is a fifth of formatToParts' cost), formatToParts if it reads else. */
const DAY_ISO = Object.freeze({ year: 'numeric', month: '2-digit', day: '2-digit' }), DAY_NUM = Object.freeze({ year: 'numeric', month: 'numeric', day: 'numeric' });
function dayParts(ms) {
  return memo('day', ms, () => {
    const d = new Date(ms), m = /^(\d+)-(\d+)-(\d+)$/.exec(fmt(DAY_ISO, 'en-CA').format(d));
    if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    const p = Object.fromEntries(fmt(DAY_NUM).formatToParts(d).map((x) => [x.type, x.value]));
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
  });
}
const valid = (ms) => { const n = Number(ms instanceof Date ? ms.getTime() : ms); return Number.isFinite(n) && n > 0 ? n : null; };
/** The wall clock to the minute in the printing zone — two instants an hour apart that read the same are the repeated hour of
 *  a fall-back (US 2026-11-01 01:30 PDT and 01:30 PST). */
const WALL = Object.freeze({ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }), OFFSET = Object.freeze({ hour: 'numeric', timeZoneName: 'shortOffset' });
const wall = (ms) => fmt(WALL).format(new Date(ms));
const repeated = (ms) => memo('rep', ms, () => { const w = wall(ms); return w === wall(ms - 3600e3) || w === wall(ms + 3600e3); });
/** The zone's words, once: when the page prints in a zone that is not this device's, or when the clock names an hour the zone
 *  lives twice (the closure round: the two US-DST 01:30 instants printed the same). */
const offsetOf = (ms) => { try { return (fmt(OFFSET).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName') || {}).value || ''; } catch { return ''; } };
// the repeated hour is told apart by its OFFSET («GMT-7» / «GMT-8» — a zone's short name is the same for both halves)
// a zone's name changes only with its offset (when-words' shortName builds three formatters a call, 270 µs): asked once per zone + offset
const NAMES = new Map();
const nameOf = (ms) => memo('name', ms, () => { const k = `${PAGE_ZONE}|${offsetOf(ms)}`; let v = NAMES.get(k); if (v === undefined) { v = shortName(PAGE_ZONE, ms); if (NAMES.size >= 256) NAMES.clear(); NAMES.set(k, v); } return v; });
const zoneTail = (ms) => { const rep = repeated(ms); return zoneOpt().timeZone ? ' ' + nameOf(ms) + (rep ? ` (${offsetOf(ms)})` : '') : rep ? ' ' + offsetOf(ms) : ''; };

// the formats' options are CONSTANT objects (a fresh object a call was a fresh key a call): [cjk][seconds], and en's dates
const TIMES = [false, true].map((c) => [false, true].map((sec) => Object.freeze({ hour: c ? '2-digit' : 'numeric', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) })));
const TIME = (seconds) => TIMES[cjk() ? 1 : 0][seconds ? 1 : 0];
const EN_STAMP = [false, true].map((sameYear) => [false, true].map((sec) => Object.freeze({ ...(sameYear ? {} : { year: 'numeric' }), month: 'short', day: 'numeric', ...TIMES[0][sec ? 1 : 0] })));
const EN_DATE = [false, true].map((sameYear) => Object.freeze({ ...(sameYear ? {} : { year: 'numeric' }), month: 'short', day: 'numeric' }));

/** A date + time in the near shape. '' for a time that is not one. */
// `words` = THE SENTENCE FORM (the .403 prep mirror's test-resume-account-chrome: «…已于 2026/11/12 退出登录…»): inside running text
// a Chinese / Japanese reader expects «11月12日» / «2026年11月12日» (the locale's own words); the slashed «2026/11/12» is a
// table's, a column's, a tooltip's. A date that fills a {param} of a t() sentence asks `words: true` (test-ui-language ⑦ reads
// it). en is the same either way («Nov 12», «Nov 12, 2026»).
export function stampAt(ms, { seconds = false, full = false, words = false, now = Date.now() } = {}) {
  const n = valid(ms);
  if (n == null) return '';
  const a = dayParts(n), b = dayParts(now);
  const sameDay = !full && a.y === b.y && a.m === b.m && a.d === b.d;
  const sameYear = !full && a.y === b.y;
  let out;
  if (cjk()) {
    const clock = fmt(TIME(seconds)).format(new Date(n));
    out = sameDay ? clock : words ? `${fmt(EN_DATE[sameYear ? 1 : 0]).format(new Date(n))} ${clock}` : sameYear ? `${a.m}/${a.d} ${clock}` : `${a.y}/${a.m}/${a.d} ${clock}`;
  } else {
    out = fmt(sameDay ? TIME(seconds) : EN_STAMP[sameYear ? 1 : 0][seconds ? 1 : 0]).format(new Date(n));
  }
  return out + zoneTail(n);
}
// the caches' sizes and bounds, for test-ui-language §1b's walk (a property of the stamp, never an export of its own)
stampAt.cacheSizes = () => ({ formats: CACHE.size, formatsMax: CACHE_MAX, memo: MEMO.size, memoMax: MEMO_MAX, names: NAMES.size, namesMax: 256 });
/** The date only, the same near rule (today is still a date here: «11/12»). */
export function dateOf(ms, { full = false, words = false, now = Date.now() } = {}) {
  const n = valid(ms);
  if (n == null) return '';
  const a = dayParts(n), b = dayParts(now);
  const sameYear = !full && a.y === b.y;
  if (cjk() && !words) return sameYear ? `${a.m}/${a.d}` : `${a.y}/${a.m}/${a.d}`;
  return fmt(EN_DATE[sameYear ? 1 : 0]).format(new Date(n));
}
/** The time only. */
export function clockOf(ms, { seconds = false } = {}) {
  const n = valid(ms);
  return n == null ? '' : fmt(TIME(seconds)).format(new Date(n)) + zoneTail(n);
}

/** «1 day» / «{n} days» (en grammar: the reader's round found «1 days ago»; zh / ja say the number either way). */
const dayWords = (n) => (n === 1 ? t('1 day') : t('{n} days', { n }));
/** A duration in the reader's units — the two largest that are not zero («2 天 23 小时», «1 小时 59 分钟»). */
export function span(ms) {
  const s = Math.max(0, Math.round(Math.abs(Number(ms) || 0) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [];
  if (d) parts.push(dayWords(d));
  if (h) parts.push(t('{n} h', { n: h }));
  if (m && !d) parts.push(t('{n} min', { n: m }));
  if (!d && !h && (sec || !m)) parts.push(t('{n} sec', { n: sec }));
  return parts.slice(0, 2).join(' ');
}
/** A compact duration MARK — the same letters in en, zh and ja (the owner, 2026-11-13, under the roster's rings: «不如还是继续用
 *  h/d»): «<1m», «4m», «2h», «3d»; `full` = every unit down to minutes («2d23h59m» — the usage meter's countdown). A ring's count,
 *  an age badge, a row's age say a MARK; a SENTENCE a person reads says its units in words (span / ago). Thresholds in minutes:
 *  hours from `hoursFrom`, days from `daysFrom` (the release's jobs rows: 60 / 1440; the roster's: 120 / 2880). Census ⑦ reads
 *  which is called where (a declared mark sink calls mark; a sentence never does). */
export function durationMark(ms, { full = false, hoursFrom = 60, daysFrom = 1440 } = {}) {
  const m = Math.round(Math.abs(Number(ms) || 0) / 60000);
  if (full) return countdownMark(m);   // a countdown: usage-eta's ONE spelling («2d23h59m»), the roster's fullEta says the same
  return m < 1 ? '<1m' : m < hoursFrom ? `${m}m` : m < daysFrom ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}
/** A row's age as a MARK: «4m» + the page's word for «ago» (the release's jobs rows: «4m ago» / «4m 前»). */
export function markAgo(at, { now = Date.now(), ...o } = {}) {
  const n = valid(at);
  return n == null ? '' : `${durationMark(Math.max(0, now - n), o)} ${t('ago')}`;
}
/** «4 分钟前» — the largest unit only; under 45 s «just now». */
export function ago(ms, { now = Date.now() } = {}) {
  const n = valid(ms);
  if (n == null) return '';
  const d = Math.max(0, now - n);
  if (d < 45000) return t('just now');
  // the unit is chosen AFTER rounding (59:40 is «1 h», never «60 min»; 23:40 h is «1 day»)
  const mins = Math.round(d / 60000), hours = Math.round(d / 3600000);
  const one = mins < 60 ? t('{n} min', { n: Math.max(1, mins) }) : hours < 24 ? t('{n} h', { n: hours }) : dayWords(Math.round(d / 86400000));
  return t('{span} ago', { span: one });
}
/** A number in the device's locale. */
export function num(n, opts = undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? '');
  try { return v.toLocaleString(deviceLocale(), opts); } catch { return String(v); }
}
