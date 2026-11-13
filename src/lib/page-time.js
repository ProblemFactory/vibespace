// THE ONE FORMATTER OF A TIME (AND A NUMBER) A PERSON READS ON THE PAGE (lane ui-language pick 4, the UI walk's L1 list —
// a Chinese interface printed «11/12/2026, 7:27:40 PM» in a dozen windows: every site called toLocaleString() its own way).
// 主开发's ruling (2026-11-13): zh / ja «2026/11/12 19:27», today «19:27», this year «11/12 19:27»; en = the device's own;
// where the page's zone is not the device's zone the stamp says the zone, once. src/when-words.js stays the AGENTS' clock.
//
//   stampAt(ms, { seconds, full, now })  a date + time (imported as `when` by its readers — the export is named apart:
//                                     test-bundle-globals reads every export name as a symbol, and «when()» is a word in a log line)
//   in the near shape (today drops the date, this year drops the year;
//                                     `full` keeps the year)
//   dateOf(ms, { full, now })         the date only, the same near rule
//   clockOf(ms, { seconds })          the time only
//   span(ms)                          a duration in the reader's units: «2 天 23 小时», «1 小时 59 分钟», «4 分钟», «12 秒»
//   ago(ms, { now }) / until(ms, …)   «4 分钟前» / «还有 1 小时 59 分钟»
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

let PAGE_ZONE = null;   // null = the device's own zone
/** app.js, at boot and when the instance's zone setting changes: the zone the page prints in. */
export function setPageZone(zone) { PAGE_ZONE = typeof zone === 'string' && zone ? zone : null; }
const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };
const zoneOpt = () => (PAGE_ZONE && PAGE_ZONE !== deviceZone() ? { timeZone: PAGE_ZONE } : {});
const cjk = () => { const l = resolveLang(); return l === 'zh' || l === 'ja'; };

const CACHE = new Map();
function fmt(opts) {
  const z = zoneOpt();
  const key = JSON.stringify([deviceLocale() || '', z.timeZone || deviceZone() || '', opts]);   // the device's zone too: a formatter is never reused across a zone change
  let f = CACHE.get(key);
  if (!f) {
    try { f = new Intl.DateTimeFormat(deviceLocale(), { ...opts, ...z, ...(cjk() && opts.hour ? { hourCycle: 'h23' } : {}) }); } catch { f = new Intl.DateTimeFormat(undefined, opts); }
    if (CACHE.size > 64) CACHE.clear();
    CACHE.set(key, f);
  }
  return f;
}
/** {y, m, d} of `ms` in the page's zone (the near rule compares days in the zone the stamp is printed in). */
function dayParts(ms) {
  const p = Object.fromEntries(fmt({ year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day };
}
const valid = (ms) => { const n = Number(ms instanceof Date ? ms.getTime() : ms); return Number.isFinite(n) && n > 0 ? n : null; };
/** The zone's words, once, when the page prints in a zone that is not this device's. */
const zoneTail = (ms) => (zoneOpt().timeZone ? ' ' + shortName(PAGE_ZONE, ms) : '');

const TIME = (seconds) => ({ hour: cjk() ? '2-digit' : 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });

/** A date + time in the near shape. '' for a time that is not one. */
export function stampAt(ms, { seconds = false, full = false, now = Date.now() } = {}) {
  const n = valid(ms);
  if (n == null) return '';
  const a = dayParts(n), b = dayParts(now);
  const sameDay = !full && a.y === b.y && a.m === b.m && a.d === b.d;
  const sameYear = !full && a.y === b.y;
  let out;
  if (cjk()) {
    const clock = fmt(TIME(seconds)).format(new Date(n));
    out = sameDay ? clock : sameYear ? `${a.m}/${a.d} ${clock}` : `${a.y}/${a.m}/${a.d} ${clock}`;
  } else {
    out = fmt(sameDay ? TIME(seconds) : { ...(sameYear ? {} : { year: 'numeric' }), month: 'short', day: 'numeric', ...TIME(seconds) }).format(new Date(n));
  }
  return out + zoneTail(n);
}
/** The date only, the same near rule (today is still a date here: «11/12»). */
export function dateOf(ms, { full = false, now = Date.now() } = {}) {
  const n = valid(ms);
  if (n == null) return '';
  const a = dayParts(n), b = dayParts(now);
  const sameYear = !full && a.y === b.y;
  if (cjk()) return sameYear ? `${a.m}/${a.d}` : `${a.y}/${a.m}/${a.d}`;
  return fmt({ ...(sameYear ? {} : { year: 'numeric' }), month: 'short', day: 'numeric' }).format(new Date(n));
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
/** «还有 1 小时 59 分钟» — what is left until `ms`; an instant already past says when it was («4 分钟前»), never «in 0 sec». */
export function until(ms, { now = Date.now() } = {}) {
  const n = valid(ms);
  if (n == null) return '';
  return n <= now ? ago(n, { now }) : t('in {span}', { span: span(n - now) });
}
/** A number in the device's locale. */
export function num(n, opts = undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? '');
  try { return v.toLocaleString(deviceLocale(), opts); } catch { return String(v); }
}
