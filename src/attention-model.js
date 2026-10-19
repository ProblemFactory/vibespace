'use strict';
/**
 * PURE (imports nothing; CJS so the decision engine, the decision model and the browser bundle share ONE spelling) —
 * THE ATTENTION LIST (design q-044 §2, lane foryou-folds; the owner accepted decisions 1 2 3 6 8 on 2026-10-19).
 *
 * 「需要我」: a person or an agent is waiting for the owner to do one thing (answer, approve, choose, sign in, pay), and
 * the wait still holds today. ONE list, FIVE bands, a FIXED first screen — the tray, its badge, a chat window's title-bar
 * badge and the arrival toasts all read it (lane ② attention-predicate-shared feeds the Channels rows through the same
 * `needsMe`; lane ③ phone-first-screen draws it as the phone's first page).
 *
 *   band 1 urgent   — urgency `urgent` (a login ending, a hub act card, a device alert)                  newest first
 *   band 2 waiting  — a plugin's reminder (pinned at the head — owner 2026-10-19 「urgent 之下」), an agent BLOCKED on the
 *                     board for this ask (the facts' state), a permission / helper ask nobody answered in 60 s
 *                     (WAIT_ACTIONS), a person's direct / @-you row (`waitedBy: 'person'`, lane ②)     longest waiting first
 *   band 3 dated    — a `due` inside DUE_WINDOW_MS (ahead, or passed less than that ago), or the attention judge's
 *                     deadline_money clause (`deadlineMoney`, lane ②)                                    nearest date first
 *   band 4 decide   — option chips, a producer's button (`action`) or card                                newest first
 *   band 5 ask      — every other action row (normal / high / low)                  NEWEST first; the inbox judge's score
 *                     ONLY breaks a tie (two rows asked in the same TIE_MS bucket); an answered row waits at its tail
 *   parked (搁置)    — the tail: a row whose last ask is PARK_DAYS old (a plugin reminder: PLUGIN_FOLD_DAYS) — never
 *                     deleted, never on the first screen, its count always shown; a re-ask (a newer `at`) brings it back.
 *                     Band 1 and a live date (band 3) never park; a blocked board parks like any ask — a status nobody
 *                     refreshed for 7 days is the 14-day-old 「现在要你」 row the owner complained about (2026-10-13).
 *   notices         — never in the list: a grey count only (`counts.notices`).
 *
 * RISING is by FACTS only (a blocked board, a re-ask, an @, a date entering the window); the judge never moves a row
 * between bands. THE FIRST SCREEN = the first CAP rows of bands 1–5 in order; everything after folds BY BAND
 * (`folds` — a band's head says how many it holds back, and the band expands IN PLACE); band 1 never folds (more urgent
 * rows than CAP push the screen open).
 *
 *   rowOf(item, now)            — a For-you item → its row {id, key, source, band, at, due, urgency, origin, kind, options,
 *                                 action, judged, reasks, blocked, waitedBy, answered, plugin, notice} (null for garbage)
 *   parkedOf(row, now, policy)  — does this row sit in 搁置 now?
 *   placeOf(row, now, policy)   — its band in the list: 1–5, PARKED, or 0 (a notice: not in the list)
 *   needsMe(rows, now, policy)  — {list, screen, folds, counts, parked, bands}
 *   tieCandidates(rows, now, policy) — the ids the inbox judge may score: band-5 rows that share their TIE_MS bucket
 *   badgeRows(rows, now, policy) — the rows the badges count (bands 1–4, never parked)
 *   toastWorthy(row)            — does an arrival raise a toast? (bands 1–2 only)
 * policy = {cap, parkDays, pluginFoldDays, tieMs, expanded} — `expanded` = the bands (numbers) whose fold is open.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CAP = 6;                         // decision 1: the first screen holds the first 6 rows (both surfaces fit 6, §1.3)
const PARK_DAYS = 7;                   // decision 6: an ask nobody answered in 7 days folds into 搁置
const PLUGIN_FOLD_DAYS = 3;            // decision 6: a plugin's reminder nobody clicked in 3 days folds too
const DUE_WINDOW_MS = 48 * 60 * 60 * 1000; // band 3: a date within 48 h (ahead, or passed less than 48 h ago)
const TIE_MS = 60 * 1000;              // band 5: two asks in the same minute are a tie — the only place the judge's score counts
const PARKED = 6;                      // the 搁置 band's number (after the five)
const BANDS = Object.freeze([
  Object.freeze({ band: 1, code: 'urgent', name: 'Urgent' }),
  Object.freeze({ band: 2, code: 'waiting', name: 'Someone is waiting' }),
  Object.freeze({ band: 3, code: 'dated', name: 'A deadline or money' }),
  Object.freeze({ band: 4, code: 'decide', name: 'Needs your decision' }),
  Object.freeze({ band: 5, code: 'ask', name: 'Other questions' }),
  Object.freeze({ band: PARKED, code: 'parked', name: 'On hold' }),
]);
const BADGE_BANDS = Object.freeze([1, 2, 3, 4]); // the For-you badge + a chat window's title-bar badge count these
const TOAST_BANDS = Object.freeze([1, 2]);       // only these raise an arrival toast (the rest move a number)
const WAIT_ACTIONS = Object.freeze(['main-ask', 'helper-ask', 'exit-run-ask']); // an agent's tool call held on the owner's Allow
const FOLD_HEAD = '{n} more — expand';           // a fold's words (an English t() key; zh 还有 {n} 条 — 展开)
const POLICY = Object.freeze({ cap: CAP, parkDays: PARK_DAYS, pluginFoldDays: PLUGIN_FOLD_DAYS, tieMs: TIE_MS, expanded: Object.freeze([]) });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bandInfo = (b) => BANDS.find((x) => x.band === b) || null;
function policyOf(p) {
  const x = p && typeof p === 'object' ? p : {};
  const pos = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const ex = x.expanded instanceof Set ? [...x.expanded] : Array.isArray(x.expanded) ? x.expanded : [];
  return { cap: Math.floor(pos(x.cap, CAP)), parkDays: pos(x.parkDays, PARK_DAYS), pluginFoldDays: pos(x.pluginFoldDays, PLUGIN_FOLD_DAYS), tieMs: pos(x.tieMs, TIE_MS), expanded: new Set(ex.map(Number)) };
}

/** A For-you item → its ROW (the band by FACTS only — the item's declaration, its producer's action, the board's facts
 *  the engine wrote beside it; never its words). `now` decides only whether a date is inside the window. */
function rowOf(item, now = 0) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  const j = item.judged && typeof item.judged === 'object' ? item.judged : null;
  const f = j && j.facts && typeof j.facts === 'object' ? j.facts : null;
  const urgency = item.urgency || 'normal';
  const at = Math.max(num(item.createdAt) || 0, num(item.reaskedAt) || 0, f ? num(f.askedAt) || 0 : 0);
  const action = item.action && typeof item.action.type === 'string' ? item.action.type : null;
  const options = Array.isArray(item.options) ? item.options.length : 0;
  const plugin = item.origin === 'plugin' && typeof item.plugin === 'string' && item.plugin ? item.plugin : null;
  const due = num(item.due) !== null ? num(item.due) : f ? num(f.due) : null;
  const row = {
    id: item.id, key: item.sessionKey || null, source: 'foryou', band: 0, at, due, urgency, origin: item.origin || null,
    kind: item.kind === 'notice' ? 'notice' : 'action', options, action, card: !!item.card, plugin,
    judged: j && (j.group === 'now' || j.group === 'later') ? { group: j.group, p: num(j.p) } : null,
    reasks: Math.max(0, Math.floor(num(item.reasks) || (f ? num(f.reasks) : 0) || 0)),
    blocked: !!(f && f.state === 'blocked'), waitedBy: item.waitedBy === 'person' ? 'person' : null,
    deadlineMoney: item.deadlineMoney === true, answered: !!(item.reply && item.reply.text), notice: item.kind === 'notice',
  };
  row.band = bandOfRow(row, now);
  return row;
}
/** The band of a row by its facts (0 = a notice: never in the list). Exported so lane ②'s Channels rows ask the SAME
 *  rule: set `waitedBy` / `deadlineMoney` / `blocked` / `due` and leave `band` out. */
function bandOfRow(r, now = 0) {
  if (!r || r.notice || r.kind === 'notice') return 0;
  if (r.urgency === 'urgent') return 1;
  if (r.plugin || r.blocked || r.waitedBy === 'person' || (r.action && WAIT_ACTIONS.includes(r.action))) return 2;
  if (r.deadlineMoney || (num(r.due) !== null && r.due - Number(now) <= DUE_WINDOW_MS && Number(now) - r.due <= DUE_WINDOW_MS)) return 3;
  if (r.options > 0 || r.action || r.card) return 4;
  return 5;
}
/** Does the row sit in 搁置 now? Its last ask is parkDays old (a plugin reminder: pluginFoldDays) and no live fact holds
 *  it up (band 1; a date inside the window — band 3). */
function parkedOf(r, now = 0, policy = null) {
  if (!r || !(r.band >= 2 && r.band <= 5) || r.band === 3) return false;
  const p = policyOf(policy);
  const days = r.plugin ? p.pluginFoldDays : p.parkDays;
  return Number(now) - (num(r.at) || 0) >= days * DAY_MS;
}
/** The row's place in the list: its band, PARKED, or 0 (a notice). */
function placeOf(r, now = 0, policy = null) {
  if (!r || !r.band) return 0;
  return parkedOf(r, now, policy) ? PARKED : r.band;
}
/** The judge's tie score: `now` with its p above an unjudged row, `later` below it. */
const tieScore = (r) => (r.judged ? (r.judged.group === 'now' ? 1 + (r.judged.p === null ? 0.5 : r.judged.p) : 1 - (r.judged.p === null ? 0.5 : r.judged.p)) : 1);
const byNewest = (a, b) => (b.at - a.at) || String(a.id).localeCompare(String(b.id));
/** The order inside a band (see the header's table). `tieMs` is band 5's tie bucket. */
function compareIn(band, tieMs = TIE_MS) {
  if (band === 2) return (a, b) => (!!b.plugin - !!a.plugin) || (a.plugin ? byNewest(a, b) : (a.at - b.at) || String(a.id).localeCompare(String(b.id)));
  if (band === 3) return (a, b) => ((a.due === null) - (b.due === null)) || (a.due !== null && b.due !== null ? a.due - b.due : 0) || byNewest(a, b);
  if (band === 5) {
    const bucket = (r) => Math.floor((num(r.at) || 0) / tieMs);
    return (a, b) => (a.answered - b.answered) || (bucket(b) - bucket(a)) || (tieScore(b) - tieScore(a)) || byNewest(a, b);
  }
  return byNewest;
}

/** THE LIST. `rows` = rowOf's rows (or lane ②'s, same shape); a row without a band is placed by bandOfRow.
 *  → {list: the ordered rows (bands 1–5, then 搁置), screen: the first-screen rows, folds: [{band, code, name, n,
 *  hidden: ids, head: {key, n}}] (a band holding rows back — 搁置 always, when it has any), counts: {1..5, parked,
 *  notices, needsMe (bands 1–4), open (every action row)}, parked: its rows, bands: [{band, code, name, rows, shown,
 *  hidden, expanded}] (every band that holds a row, in order — what the tray draws)}. */
function needsMe(rows, now = 0, policy = null) {
  const p = policyOf(policy);
  const by = new Map(BANDS.map((b) => [b.band, []]));
  let notices = 0;
  for (const r0 of Array.isArray(rows) ? rows : []) {
    if (!r0 || !r0.id) continue;
    const r = r0.band === undefined || r0.band === null ? { ...r0, band: bandOfRow(r0, now) } : r0;
    const place = placeOf(r, now, p);
    if (!place) { if (r.notice || r.kind === 'notice') notices++; continue; }
    by.get(place).push(r);
  }
  for (const [b, list] of by) list.sort(compareIn(b === PARKED ? 0 : b, p.tieMs));
  const active = [1, 2, 3, 4, 5].flatMap((b) => by.get(b));
  const room = Math.max(p.cap, by.get(1).length);   // band 1 never folds: more urgent rows than the cap push the screen open
  const screen = active.slice(0, room);
  const onScreen = new Set(screen.map((r) => r.id));
  const bands = [], folds = [];
  for (const b of BANDS) {
    const list = by.get(b.band);
    if (!list.length) continue;
    const expanded = b.band !== 1 && p.expanded.has(b.band);
    const shown = b.band === 1 || expanded ? list : list.filter((r) => onScreen.has(r.id));
    const hidden = b.band === 1 || expanded ? [] : list.filter((r) => !onScreen.has(r.id));
    bands.push({ band: b.band, code: b.code, name: b.name, rows: list, shown: shown.map((r) => r.id), hidden: hidden.map((r) => r.id), expanded });
    if (hidden.length) folds.push({ band: b.band, code: b.code, name: b.name, n: hidden.length, hidden: hidden.map((r) => r.id), head: { key: FOLD_HEAD, n: hidden.length } });
  }
  const counts = { 1: by.get(1).length, 2: by.get(2).length, 3: by.get(3).length, 4: by.get(4).length, 5: by.get(5).length, parked: by.get(PARKED).length, notices };
  counts.needsMe = counts[1] + counts[2] + counts[3] + counts[4];
  counts.open = counts.needsMe + counts[5] + counts.parked;
  return { list: [...active, ...by.get(PARKED)], screen, folds, counts, parked: by.get(PARKED), bands };
}

/** THE JUDGE'S ONLY QUESTION (decision 3): the band-5 rows (not parked, not answered) that share their TIE_MS bucket with
 *  another such row — the only rows whose order a score can change. Everything else is placed by facts. → Set of ids. */
function tieCandidates(rows, now = 0, policy = null) {
  const p = policyOf(policy);
  const buckets = new Map();
  for (const r0 of Array.isArray(rows) ? rows : []) {
    if (!r0 || !r0.id) continue;
    const r = r0.band === undefined || r0.band === null ? { ...r0, band: bandOfRow(r0, now) } : r0;
    if (placeOf(r, now, p) !== 5 || r.answered) continue;
    const k = Math.floor((num(r.at) || 0) / p.tieMs);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r.id);
  }
  const out = new Set();
  for (const ids of buckets.values()) if (ids.length > 1) for (const id of ids) out.add(id);
  return out;
}
/** The rows the badges count: bands 1–4, never 搁置, never a notice. */
function badgeRows(rows, now = 0, policy = null) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && BADGE_BANDS.includes(placeOf(r.band === undefined || r.band === null ? { ...r, band: bandOfRow(r, now) } : r, now, policy)));
}
/** An arrival raises a toast only in bands 1–2 (urgent, someone waiting); the rest move a number. */
const toastWorthy = (r) => !!r && TOAST_BANDS.includes(r.band);

module.exports = {
  CAP, PARK_DAYS, PLUGIN_FOLD_DAYS, DUE_WINDOW_MS, TIE_MS, PARKED, BANDS, BADGE_BANDS, TOAST_BANDS, WAIT_ACTIONS, FOLD_HEAD, POLICY,
  bandInfo, policyOf, rowOf, bandOfRow, parkedOf, placeOf, needsMe, tieCandidates, badgeRows, toastWorthy,
};
