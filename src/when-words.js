'use strict';
// THE OWNER'S CLOCK (lane agent-context-owner-facts, B-7960 a — userW 2026-10-20). Every time the product told an agent
// was UTC (`toISOString().slice(0, 16)`: the board, the Activity log, TASK.md, the SessionStart context, the backlog rows,
// the CLI answers) while the owner lives in America/Los_Angeles: an agent relayed «23:16» for 16:16 PT and the owner
// answered the wrong meeting. ONE formatter for every time an agent reads and for the board's own rows.
//
// THE RULE — whenOf(ms, { zone, now }):
//   · `YYYY-MM-DD HH:MM <ZONE>` in the instance's zone, the zone NAMED by its short name (shortName: PT, ET, UTC, GMT+8);
//   · with `now`, a time on the same calendar day IN THAT ZONE drops its date (`16:16 PT`). Only a rendering that ALSO
//     states that day passes `now` (zoneSentence says it), so a dateless time is never read against another day; a file
//     that outlives the day it was written (TASK.md) passes none — every row keeps its date.
// THE ZONE — zoneOf(setting, { env, system }): the instance setting `instance.timezone` (an IANA name this runtime knows)
//   → the server process's TZ env → the system zone → UTC as the last resort only (never UTC by preference).
// PURE: imports nothing — the caller hands in the TZ env and the system zone (src/server/owner-facts.js on the server, the
// hub's own answer on the page).

const FMT = new Map();   // zone → its Intl formatter (a formatter costs ~50 µs to build; a TASK.md renders 50 rows)
function fmtOf(zone) {
  let f = FMT.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (FMT.size > 64) FMT.clear();
    FMT.set(zone, f);
  }
  return f;
}

/** An IANA zone this runtime knows, in its canonical spelling — or null. A TZ env value may carry the POSIX `:` prefix. */
function validZone(z) {
  const s = typeof z === 'string' ? z.trim().replace(/^:/, '') : '';
  if (!s || s.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(s)) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: s }).resolvedOptions().timeZone || null; } catch { return null; }
}

/** THE instance's zone → `{ zone, from }`, from ∈ 'setting' | 'env' | 'system' | 'fallback'; `refused` names a setting this
 *  runtime does not know (the zone then falls through, and the Settings row's words can say so). */
function zoneOf(setting, { env = null, system = null } = {}) {
  const asked = typeof setting === 'string' ? setting.trim() : '';
  const out = (zone, from) => (asked && from !== 'setting' ? { zone, from, refused: asked.slice(0, 64) } : { zone, from });
  const s = validZone(asked);
  if (s) return out(s, 'setting');
  const e = validZone(env);
  if (e) return out(e, 'env');
  const y = validZone(system);
  if (y) return out(y, 'system');
  return out('UTC', 'fallback');
}

const ABBR = /^[A-Z]{2,5}$/;
/** The zone's short name at `ms` (DST-aware): the generic abbreviation when there is one (PT, ET — not GMT, which hides
 *  UTC), else the specific one (UTC, PDT, GMT in a London winter), else the offset (GMT+8, GMT+5:30). */
function shortName(zone, ms = Date.now()) {
  const pick = (kind) => {
    try { return (new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: kind }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName') || {}).value || ''; } catch { return ''; }
  };
  const g = pick('shortGeneric');
  if (ABBR.test(g) && g !== 'GMT') return g;
  const s = pick('short');
  if (ABBR.test(s)) return s;
  return pick('shortOffset') || 'UTC';
}

/** { date: 'YYYY-MM-DD', time: 'HH:MM' } of `ms` in `zone`, or null. */
function partsOf(ms, zone) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  let p;
  try { p = Object.fromEntries(fmtOf(zone).formatToParts(new Date(n)).map((x) => [x.type, x.value])); } catch { return null; }
  if (!p.year || !p.month || !p.day) return null;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

/** THE formatter (the rule above). A time that is not one reads «an unknown time». */
function whenOf(ms, { zone = 'UTC', now = null } = {}) {
  const z = validZone(zone) || 'UTC';
  const p = partsOf(ms, z);
  if (!p) return 'an unknown time';
  const today = now != null ? partsOf(now, z) : null;
  return `${today && today.date === p.date ? '' : p.date + ' '}${p.time} ${shortName(z, Number(ms))}`;
}

/** `HH:MM <ZONE>` — a time under a header that already names its day (the board's day groups). */
function timeOf(ms, zone) {
  const z = validZone(zone) || 'UTC';
  const p = partsOf(ms, z);
  return p ? `${p.time} ${shortName(z, Number(ms))}` : 'an unknown time';
}

/** The calendar day of `ms` in `zone` ('YYYY-MM-DD'), or null. */
function dayOf(ms, zone) { const p = partsOf(ms, validZone(zone) || 'UTC'); return p ? p.date : null; }

/** How the zone reads in words: 'America/Los_Angeles (PT)', 'UTC'. */
function zoneLabel(zone, ms = Date.now()) {
  const z = validZone(zone) || 'UTC';
  const s = shortName(z, ms);
  return s === z ? z : `${z} (${s})`;
}

/** THE sentence a rendering that drops today's date carries (the SessionStart paragraph): the zone, whose clock it is,
 *  and the day a dateless time means. A UTC instance says UTC — and never calls it the owner's clock. */
function zoneSentence({ zone } = {}, now = Date.now()) {
  const z = validZone(zone) || 'UTC';
  const utc = shortName(z, now) === 'UTC';
  return `Times are ${utc ? 'UTC' : `the owner's clock, ${zoneLabel(z, now)}`}; today there is ${dayOf(now, z)} (no date = today).`;
}

module.exports = { whenOf, timeOf, zoneOf, validZone, shortName, dayOf, zoneLabel, zoneSentence };
