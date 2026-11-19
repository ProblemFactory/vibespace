'use strict';
/**
 * PURE (imports nothing; CJS so the agent route, the hold store, the For-you bundle and the suites share ONE spelling) — AN ASK
 * THAT PROPOSES ONE CHANGE OF ONE SETTING (lane setting-doors pick 2, 主开发's GO 2026-11-15 14:03Z with seven amendments).
 *
 * `vibespace-ask "…" --propose <row>=<value> [--until 22:00 | 6h | 90m]` files an item whose ACTION is the change itself —
 * built HERE from the schema's own facts, never the agent's words — and the owner takes it in ONE press on the owner's own page.
 * The laws (the GO's amendments):
 *   1. a RAISE is always time-boxed — a value above the present one needs its «until»; a LOWER may last or carry one. No press ever
 *      leaves a ceiling raised with nothing that returns it (judged at the ask AND at the press);
 *   2. «until» is 5 minutes to 48 hours away;
 *   5. a RELATIVE «until» (6h) counts from the PRESS; a CLOCK moment (22:00) is a moment — passed when the owner looks ⇒ no press;
 *   7. the list is CLOSED and said on the schema row itself (`proposable: true`): the three ceilings on turns nobody typed. A row not
 *      on it, a key that is no row, a value out of its range, a bound out of its own — refused BY NAME, with the row's link.
 * (3, 4, 6 are the hold store's: src/server/setting-holds.js.)
 */

// THE ACTION TYPE, spelled ONCE (its row in src/foryou-actions.js names this file as builtIn): every surface asks isSettingChange,
// never compares the string (test-architecture §78's foryou family)
const TYPE = 'setting-change';
const LINK = (key) => `vibespace://settings/${key}`;   // src/internal-link.js settingLink (test-setting-holds pins the two equal)
// THE CLOSED LIST — mirrored from the schema rows marked `proposable: true` (src/lib/settings-schema.js; test-setting-holds pins them
// equal: key, min, max, step, default); the hold store and the press judge against THIS table
const PROPOSABLE = Object.freeze({   // + `label` = the row's schema label (an i18n key — the hub's notices name the row by it)
  'spend.unattendedPerIdentityHour': Object.freeze({ min: 0, max: 200, step: 1, def: 30, label: 'Unattended turns per account per hour' }),   // ui-words: the row's schema label as an i18n KEY — the client says it through t() (the hold store's words param); zh / ja rows are the schema's
  'spend.unattendedPerIdentityDay': Object.freeze({ min: 0, max: 2000, step: 5, def: 200, label: 'Unattended turns per account per day' }),   // ui-words: the row's schema label as an i18n KEY — the client says it through t() (the hold store's words param); zh / ja rows are the schema's
  'spend.unattendedPerInstanceDay': Object.freeze({ min: 0, max: 10000, step: 10, def: 800, label: 'Unattended turns for this instance per day' }),   // ui-words: the row's schema label as an i18n KEY — the client says it through t() (the hold store's words param); zh / ja rows are the schema's
});
const MIN_MS = 5 * 60 * 1000, MAX_MS = 48 * 60 * 60 * 1000;
const KEY_RE = /^[A-Za-z0-9_.-]{1,120}$/;
const NUM = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' ? NaN : Number(v));   // Number(null) is 0 — an absent «until» is NO moment

/** `<row>=<value>` → { ok, key, value } | { ok: false, code, error } (the words name the rule and offer the row's link). */
function parsePropose(spec) {
  const s = String(spec == null ? '' : spec).trim(), eq = s.indexOf('=');
  const key = eq > 0 ? s.slice(0, eq).trim() : s, raw = eq > 0 ? s.slice(eq + 1).trim() : '';
  if (eq <= 0 || !KEY_RE.test(key)) return { ok: false, code: 'propose-bad', error: `--propose takes <row>=<value> (e.g. --propose spend.unattendedPerInstanceDay=800); nothing was filed` };
  const row = PROPOSABLE[key];
  if (!row) return { ok: false, code: 'propose-not-allowed', error: `--propose ${key}: only ${Object.keys(PROPOSABLE).join(', ')} can be proposed for one press; nothing was filed. Ask the owner in words and give the row's link: ${LINK(key)}` };
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return { ok: false, code: 'propose-bad', error: `--propose ${key}=${raw || '?'}: the value is a number; nothing was filed` };
  const value = Number(raw);
  if (value < row.min || value > row.max) return { ok: false, code: 'propose-range', error: `--propose ${key}=${value}: the row takes ${row.min}–${row.max}; nothing was filed (${LINK(key)})` };
  return { ok: true, key, value };
}

/** `--until` → { ok, untilRel } (ms, from the PRESS) | { ok, untilAt } (epoch ms, a moment) | { ok, none } | refusal. `22:00` = the next
 *  22:00 in the given zone offset (minutes EAST of UTC, the hub's own when absent); an ISO moment is taken as written. */
function parseUntil(spec, { now = Date.now(), tzOffsetMin = -new Date(now).getTimezoneOffset() } = {}) {
  if (spec == null || spec === '') return { ok: true, none: true };
  const s = String(spec).trim();
  const rel = /^(\d+(?:\.\d+)?)\s*(m|min|h|hr|d)$/i.exec(s);
  let untilRel = null, untilAt = null;
  if (rel) untilRel = Math.round(Number(rel[1]) * ({ m: 60e3, min: 60e3, h: 3600e3, hr: 3600e3, d: 86400e3 }[rel[2].toLowerCase()]));
  else if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [hh, mm] = s.split(':').map(Number);
    if (hh > 23 || mm > 59) return { ok: false, code: 'until-bad', error: `--until ${s}: not a time of day; nothing was filed` };
    const local = new Date(now + tzOffsetMin * 60e3);   // the zone's wall clock as UTC fields
    let at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) - tzOffsetMin * 60e3;
    if (at <= now) at += 86400e3;
    untilAt = at;
  } else if (!Number.isNaN(Date.parse(s)) && /\d{4}-\d{2}-\d{2}/.test(s)) untilAt = Date.parse(s);
  else return { ok: false, code: 'until-bad', error: `--until ${s}: a time of day (22:00), a stretch (90m, 6h) or a moment (2026-11-15T22:00); nothing was filed` };
  const span = untilRel != null ? untilRel : untilAt - now;
  if (!(span >= MIN_MS && span <= MAX_MS)) return { ok: false, code: 'until-range', error: `--until ${s}: «until» is 5 minutes to 48 hours away; longer is the row's own (Settings); nothing was filed` };
  return untilRel != null ? { ok: true, untilRel } : { ok: true, untilAt };
}

/** A HOLD IS LIVE ONLY WHILE THE ROW HOLDS ITS VALUE (主开发's law B after the check): a row the owner changed by hand has no hold —
 *  for every reader at once. `pending` = the value a SECOND timed press is replacing, until its settings write lands (a crash
 *  between keeps the hold live on the old value, never stranded). PURE: the store, the card and Settings ask THIS. */
const holdIsLive = (h, present) => !!h && typeof h === 'object' && Number.isFinite(NUM(present)) && (NUM(h.value) === NUM(present) || (h.pending !== undefined && NUM(h.pending) === NUM(present)));
/** WHILE A HOLD IS LIVE, THE ROW'S LASTING VALUE IS THE HOLD'S «BEFORE» (law A) — null = the row's default. */
const lastingOf = (key, h) => (h && h.before != null && Number.isFinite(NUM(h.before)) ? NUM(h.before) : PROPOSABLE[key] ? PROPOSABLE[key].def : NaN);

/** THE ASK'S VERDICT → { ok, action } | refusal. `present` = the row's value now (the server's own reading); `lasting` = the row's
 *  LASTING value when a live hold stands (its «before», law A). Amendment 1: a value above the lasting one with no «until» is a
 *  RAISE and refused, with the row's link (a lasting raise is the row's own). */
function askVerdict({ propose, until }, { present, now = Date.now(), tzOffsetMin, lasting } = {}) {
  const p = parsePropose(propose); if (!p.ok) return p;
  const u = parseUntil(until, { now, tzOffsetMin }); if (!u.ok) return u;
  const cur = Number.isFinite(NUM(present)) ? NUM(present) : PROPOSABLE[p.key].def;
  const base = Number.isFinite(NUM(lasting)) ? NUM(lasting) : null;
  if (base != null && u.none && p.value > base && p.value !== cur) return { ok: false, code: 'raise-over-hold', error: `--propose ${p.key}=${p.value}: the row is held at ${cur} for now and goes back to ${base} — a lasting ${p.value} above ${base} is a RAISE and always time-boxed: add --until (5 min – 48 h); a lasting raise is the owner's own, on the row: ${LINK(p.key)}; nothing was filed` };
  if (p.value > cur && u.none && base == null) return { ok: false, code: 'raise-needs-until', error: `--propose ${p.key}=${p.value}: a RAISE (it is ${cur} now) is always time-boxed — add --until (5 min – 48 h), e.g. --until 6h; a lasting raise is the owner's own, on the row: ${LINK(p.key)}; nothing was filed` };
  if (p.value === cur) return { ok: false, code: 'propose-same', error: `--propose ${p.key}=${p.value}: it is already ${cur}; nothing was filed` };
  return { ok: true, action: { type: TYPE, key: p.key, value: p.value, was: cur, ...(u.untilRel != null ? { untilRel: u.untilRel } : {}), ...(u.untilAt != null ? { untilAt: u.untilAt } : {}), askedAt: now } };   // `was` = the value when asked (the card says a value that moved since)
}

/** THE PRESS'S VERDICT (the card draws it; the server judges it again) → { press: true, untilAt|null, raise, endsHold } | { press:
 *  false, why }. `present` = the value NOW; `lasting` = the row's LASTING value while a live hold stands (its «before», law A): a
 *  lasting change above it is a raise (why 'raise-over-hold'), at or below it ends the hold and stays. A relative «until» counts
 *  from `now` (the press) and keeps the ask's bounds there too (5 min – 48 h). */
function pressVerdict(action, { present, now = Date.now(), lasting } = {}) {
  const a = action || {}, row = PROPOSABLE[a.key];
  if (!row || !Number.isFinite(NUM(a.value))) return { press: false, why: 'not-proposable' };   // the change itself (key, value, until) — the surfaces ask isSettingChange first
  const value = NUM(a.value), cur = Number.isFinite(NUM(present)) ? NUM(present) : row.def;
  if (value < row.min || value > row.max) return { press: false, why: 'range' };
  if (value === cur) return { press: false, why: 'same' };
  const untilAt = Number.isFinite(NUM(a.untilRel)) ? now + NUM(a.untilRel) : Number.isFinite(NUM(a.untilAt)) ? NUM(a.untilAt) : null;
  if (untilAt != null && untilAt <= now) return { press: false, why: 'passed' };
  if (untilAt != null && (untilAt - now > MAX_MS)) return { press: false, why: 'too-far' };
  if (Number.isFinite(NUM(a.untilRel)) && NUM(a.untilRel) < MIN_MS) return { press: false, why: 'too-near' };   // the ask's floor, at the press too
  const base = Number.isFinite(NUM(lasting)) ? NUM(lasting) : null;
  if (untilAt == null && base != null && value > base) return { press: false, why: 'raise-over-hold', lasting: base };
  if (value > cur && untilAt == null && base == null) return { press: false, why: 'raise-needs-until' };
  return { press: true, untilAt, raise: value > cur, value, present: cur, ...(untilAt == null && base != null ? { endsHold: true } : {}) };
}

/** The agent's line after a filing (vibespace-ask prints it as the hub's words): what the owner sees and what one press does. */
function proposedLine(action) {
  const a = action || {}, mins = Number.isFinite(NUM(a.untilRel)) ? Math.round(NUM(a.untilRel) / 60000) : null;
  const when = mins != null ? ` for ${mins >= 120 && mins % 60 === 0 ? `${mins / 60} h` : `${mins} min`} from the owner's press` : Number.isFinite(NUM(a.untilAt)) ? ` until ${new Date(NUM(a.untilAt)).toISOString()}` : ' (lasting)';
  return `proposed: ${a.key} → ${a.value}${when} — the owner sees the row, its value now and ONE button; one press changes it${mins != null || Number.isFinite(NUM(a.untilAt)) ? ', and it goes back by itself at the moment' : ''}. The answer arrives as a reply.`;
}

const isProposable = (key) => Object.prototype.hasOwnProperty.call(PROPOSABLE, key);
/** THE one test every surface asks: an item's action is a proposed change of a row on the closed list */
const isSettingChange = (a) => !!a && typeof a === 'object' && a.type === TYPE && isProposable(a.key);
module.exports = { TYPE, isSettingChange, PROPOSABLE, MIN_MS, MAX_MS, LINK, parsePropose, parseUntil, askVerdict, pressVerdict, proposedLine, isProposable, holdIsLive, lastingOf };
