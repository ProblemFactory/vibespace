'use strict';
// THE LEARNED VENDOR BUDGET (lane gmail-quota-share, 2026-10-05 — the owner:
// "有没有可能避免触发限额"). PURE: imports nothing, reads no clock.
//
// One Google mailbox was connected on TWO VibeSpace instances through the same
// OAuth client, so both drew from ONE vendor bucket (Gmail meters per project +
// user: 6 000 units/min) while each kept its own default budget of 3 000 — the
// whole cap between them. Whenever their passes overlapped the vendor refused;
// the rate ladder parked the account and the next pass spent to the same wall
// (three times an afternoon, ~50 min parked each). The instances cannot see
// each other: the vendor's refusal is the only shared signal, so the budget is
// LEARNED from it (AIMD per account), never only set.
//
// `budgetStep(state, event, facts)` over the CLOSED events below is the whole
// rule; the engine only drives it (the channel-drain precedent) and persists
// the state beside the account record (adapters.json — never the index):
//   refused          a burst's FIRST rate strike HALVES the ceiling (floor: 10 %
//                    of the setting, never below one read); the burst's later
//                    strikes only restart the quiet clock. The ceiling the
//                    vendor refused is remembered as the WALL for WALL_MS.
//   quiet-minute     every whole minute without a refusal raises the ceiling by
//                    10 % of the setting until the setting is back — while the
//                    wall stands, never above one step under it (a creep back to
//                    the very ceiling that tripped re-trips within minutes)
//   setting-changed  the setting is the CAP: the learned fraction is kept
//   boot             a persisted state restored: validated, clamped, the day rolled
// `facts` = { setting, minUnit, now, burstStart?, day? } (`minUnit` = one read's
// price in the budget's unit; `day` = the owner's day for the twice-a-day item).
// The per-second pace follows in proportion (the engine scales it by ratioOf).

const EVENTS = Object.freeze(['refused', 'quiet-minute', 'setting-changed', 'boot']);
const QUIET_MS = 60e3;           // one quiet minute
const CREEP_FRAC = 0.1;          // a quiet minute raises the ceiling by 10 % of the setting
const FLOOR_FRAC = 0.1;          // the ceiling never falls below 10 % of the setting
const WALL_MS = 60 * 60e3;       // how long the refused ceiling holds the creep one step under it
const LOUD_HALVES = 2;           // halved this many times in one day ⇒ the owner hears it (one item a day)

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const dayOf = (t) => new Date(Number(t) || 0).toISOString().slice(0, 10);
/** The lowest ceiling the rule may reach: 10 % of the setting, never below one read (and never above the setting). */
function floorOf(setting, minUnit = 1) {
  const s = Math.max(0, num(setting) || 0);
  return Math.min(s, Math.max(Math.ceil(s * FLOOR_FRAC), Math.max(1, num(minUnit) || 1)));
}
const stepOf = (setting) => Math.max(1, Math.round((num(setting) || 0) * CREEP_FRAC));
/** The untouched state: the ceiling IS the setting. */
function fullState(setting) {
  return { v: 1, ceiling: setting, setting, refusedAt: null, steppedAt: null, wall: null, wallUntil: null, day: null, halvesToday: 0 };
}
/** A persisted (or carried) state made valid against the live facts: the setting change applied, every value clamped. */
function normalise(state, facts) {
  const setting = Math.max(1, num(facts && facts.setting) || 1);
  const floor = floorOf(setting, facts && facts.minUnit);
  const raw = state && typeof state === 'object' && num(state.ceiling) > 0 ? state : null;
  const today = facts && facts.day ? String(facts.day) : (num(facts && facts.now) !== null ? dayOf(facts.now) : (raw && raw.day) || null);
  if (!raw) return { ...fullState(setting), day: today };
  const was = num(raw.setting) > 0 ? num(raw.setting) : setting;
  const scale = setting / was;   // setting-changed: the learned FRACTION is kept
  const clamp = (x) => Math.min(setting, Math.max(floor, Math.round(x)));
  const wall = num(raw.wall) > 0 ? clamp(num(raw.wall) * scale) : null;
  return {
    v: 1, ceiling: clamp(num(raw.ceiling) * scale), setting,
    refusedAt: num(raw.refusedAt), steppedAt: num(raw.steppedAt),
    wall, wallUntil: wall ? num(raw.wallUntil) : null,
    day: raw.day && raw.day === today ? raw.day : today,
    halvesToday: raw.day && raw.day === today ? Math.max(0, Math.floor(num(raw.halvesToday) || 0)) : 0,
  };
}
const same = (a, b) => !!a && !!b && ['ceiling', 'setting', 'refusedAt', 'steppedAt', 'wall', 'wallUntil', 'day', 'halvesToday'].every((k) => a[k] === b[k]);

/** THE RULE: `{state, changed, halved, crept, loud, full}` — `loud` = this halving is the day's LOUD_HALVES-th
 *  (the one "For you" item a day), `full` = the ceiling is back at the setting. An unknown event changes nothing. */
function budgetStep(state, event, facts = {}) {
  const t = num(facts.now) || 0;
  const s = normalise(state, facts);
  const before = state && typeof state === 'object' ? state : null;
  let halved = false, crept = false, loud = false;
  if (event === 'refused') {
    const floor = floorOf(s.setting, facts.minUnit);
    if (facts.burstStart !== false) {
      s.wall = s.ceiling; s.wallUntil = t + WALL_MS;
      s.ceiling = Math.max(floor, Math.floor(s.ceiling / 2));
      s.halvesToday += 1; halved = true;
      loud = s.halvesToday === LOUD_HALVES;
    }
    s.refusedAt = t; s.steppedAt = t;
  } else if (event === 'quiet-minute') {
    // the wall's end: the minutes under it do not bank — the creep resumes a step a minute from there
    if (s.wall && !(s.wallUntil > t)) { s.steppedAt = Math.max(s.steppedAt || 0, s.wallUntil || 0); s.wall = null; s.wallUntil = null; }
    const since = Math.max(s.refusedAt || 0, s.steppedAt || 0);
    const k = Math.floor((t - since) / QUIET_MS);
    if (s.ceiling < s.setting && k >= 1) {
      const step = stepOf(s.setting);
      const walled = !!(s.wall && s.wallUntil > t);
      const cap = walled ? Math.max(floorOf(s.setting, facts.minUnit), Math.min(s.setting, s.wall - step)) : s.setting;
      const next = Math.min(cap, s.ceiling + k * step);
      // a capped creep (the wall, the setting) spends every minute it waited; an uncapped one keeps the part-minute
      if (next > s.ceiling) { crept = true; s.steppedAt = next < s.ceiling + k * step ? t : since + k * QUIET_MS; s.ceiling = next; }
      else s.steppedAt = t;
    }
  } else if (event !== 'setting-changed' && event !== 'boot') {
    return { state: before ? { ...before } : s, changed: false, halved, crept, loud, full: s.ceiling >= s.setting };
  }
  return { state: s, changed: !same(before, s), halved, crept, loud, full: s.ceiling >= s.setting };
}

/** The pace's scale: the learned ceiling over the setting (1 = untouched). */
function ratioOf(state) {
  return state && num(state.setting) > 0 && num(state.ceiling) > 0 ? Math.min(1, num(state.ceiling) / num(state.setting)) : 1;
}
/** When the ceiling is back at the setting if nothing refuses again (null = it is). */
function fullAtOf(state, facts = {}) {
  const s = normalise(state, facts);
  if (s.ceiling >= s.setting) return null;
  const t = num(facts.now) || 0;
  const step = stepOf(s.setting);
  const walled = !!(s.wall && s.wallUntil > t);
  const from = walled ? s.wallUntil : Math.max(t, s.steppedAt || s.refusedAt || t);
  const ceiling = walled ? Math.max(s.ceiling, Math.min(s.setting, s.wall - step)) : s.ceiling;
  return from + Math.ceil((s.setting - ceiling) / step) * QUIET_MS;
}

module.exports = { EVENTS, QUIET_MS, CREEP_FRAC, FLOOR_FRAC, WALL_MS, LOUD_HALVES, budgetStep, floorOf, ratioOf, fullAtOf, normalise };
