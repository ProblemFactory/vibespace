'use strict';
// THE RESET-CREDIT VERDICT (docs/design-reset-credits.zh.md §2/§4, owner
// rulings 2026-09-22). PURE: imports nothing, CJS so the server's pool engine
// and the client bundle (p2's confirm dialog) share ONE spelling of every
// decision and every sentence.
//
// WHAT IT DECIDES: at a usage-limit WALL, is spending one stored reset credit
// worth it RIGHT NOW, and at which rung of the escape ladder. It never decides
// a proactive spend: a credit is only ever a candidate at a wall the vendor
// stated (a rate-limit event, never an estimate).
//
// THE TWO VENDORS ARE DIFFERENT CURVES (§2, the owner's value model):
//   openai    — a credit RE-OPENS the period: the window becomes [t, t+P] at
//               full quota, the remaining q is discarded and the next natural
//               reset moves to t+P. Benefit ≈ (R−t)/P + (1−q): SMOOTH and
//               DECREASING in t, so waiting never helps — use it at the wall at
//               once. The ONE hesitation is scarcity: with one hour left of a
//               week, the LAST credit buys almost nothing (CREDIT_FLOOR below).
//   anthropic — a credit REFILLS IN PLACE: a week's quota now, the deadline R
//               unchanged (measured 2026-09-22 on a real web reset: 49%/97% →
//               0%/0%, same Sep 27 reset). Benefit = min(1, b·(R−t)/W) — a
//               ReLU: full value while the remaining time can burn a whole
//               week's quota again at the current pace (the KNEE is
//               R − t = W / b), linear to zero below it. Below the knee a
//               credit is kept unless the grant would lapse (use-by) or it is
//               re-granted weekly anyway (replenishes — unused is lost).
//
// THE LADDER FORKS BY WARMTH (§2, owner B1 2026-09-22): a credit keeps the SAME
// account, so the prompt cache stays warm; a pool switch cold-starts the whole
// context. A WARM conversation (in a turn, or its cache not yet cold): credit →
// switch → wait. A COLD one: switch → credit → wait — the credit is its rung
// only when no pool member can take it (`poolAlternative === false`) or the
// switch rung already ran and failed (`ladderPosition: 'after-switch'`).
//
// Every refusal NAMES its reason (the speaking contract): the engine journals
// it and the p2 tooltip reads it.

// THE SCARCITY FLOOR. At a wall q ≈ 0, so the owner's (1−q) term is ≈ 1 for
// EVERY wall and cannot tell a good moment from a bad one; what varies is the
// WINDOW term (R−t)/P — "how much of a window is still ahead of the natural
// reset". A tenth of a window (≈ 17 h of a week, 30 min of a 5 h window) is the
// line below which spending the LAST credit buys less than a tenth of what the
// same credit buys at the start of a window; with more than one credit left the
// floor never applies (a spare credit is not scarce).
const CREDIT_FLOOR = 0.1;
// A grant that lapses within a day is used rather than lost (anthropic `use by`).
const USE_BY_IMMINENT_SEC = 24 * 3600;
const VENDORS = Object.freeze(['openai', 'anthropic']);
const LADDER_POSITIONS = Object.freeze(['wall', 'after-switch']);
// The closed set of reasons the verdict can give. `use:true` reasons first.
const REASONS = Object.freeze([
  'wall-use-now', 'above-knee', 'use-by-imminent', 'replenishes',
  'unknown-vendor', 'no-wall', 'no-credits', 'grant-expired', 'cooldown', 'cold-switch-first',
  'last-credit-low-value', 'below-knee-keep', 'burn-unknown',
]);

const num = (x) => (x === null || x === undefined || x === '' ? null : (Number.isFinite(Number(x)) ? Number(x) : null));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * resetCreditVerdict(facts) → { use, reason, valueFraction, windowFraction, waitSavedSec }
 *
 *   vendor          'openai' | 'anthropic' — the credit's semantics (re-open vs refill)
 *   wallHit         a stated rate-limit rejection (true), never an estimate
 *   remainingPct    q as a PERCENT (0..100) of the tripped window; null = unknown (treated as 0 — a wall)
 *   resetsAtSec     R — the tripped window's natural reset (unix s); null/0 = unknown
 *   nowSec          t
 *   periodSec       P — the tripped window's length (openai; e.g. 604800 for a week)
 *   weekQuota       W — anthropic: one week's quota in the SAME unit as burnRate (1 = a whole window)
 *   burnRate        b — anthropic: quota per second at the current pace (see windowPaceRate)
 *   creditsLeft     stored credits; null = the count is unknown (the vendor then answers
 *                   "nothing to reset" harmlessly — unknown is not zero)
 *   useBySec        anthropic grant's use-by instant (unix s) or null
 *   cooldownUntilSec  no credit before this instant (the one-try-per-limit-event floor, a vendor cooldown)
 *   replenishes     anthropic: the grant is re-issued weekly (unused = lost)
 *   inTurn, warm    the conversation's warmth (either one ⇒ warm)
 *   poolAlternative can a pool member take this conversation right now: true/false; null = unknown (⇒ switch first)
 *   ladderPosition  'wall' (default) | 'after-switch' (the switch rung already ran and moved nothing)
 */
function resetCreditVerdict(f = {}) {
  const nowSec = num(f.nowSec) ?? Math.floor(Date.now() / 1000);
  const R = num(f.resetsAtSec);
  const left = R && R > 0 ? Math.max(0, R - nowSec) : null;
  const waitSavedSec = left;
  const out = (use, reason, extra = {}) => ({ use, reason, valueFraction: null, windowFraction: null, waitSavedSec, ...extra });
  if (!VENDORS.includes(f.vendor)) return out(false, 'unknown-vendor');
  // ── the common preconditions (§4) ──
  if (f.wallHit !== true) return out(false, 'no-wall'); // NEVER proactive
  const credits = num(f.creditsLeft);
  if (credits !== null && credits <= 0) return out(false, 'no-credits');
  const useBy = num(f.useBySec);
  if (useBy !== null && useBy > 0 && useBy <= nowSec) return out(false, 'grant-expired');
  const cool = num(f.cooldownUntilSec);
  if (cool !== null && cool > nowSec) return out(false, 'cooldown');
  const warm = f.warm === true || f.inTurn === true;
  const position = LADDER_POSITIONS.includes(f.ladderPosition) ? f.ladderPosition : 'wall';
  if (!warm && position === 'wall' && f.poolAlternative !== false) return out(false, 'cold-switch-first');
  // ── the vendor's curve ──
  if (f.vendor === 'openai') {
    const P = num(f.periodSec);
    const q = clamp((num(f.remainingPct) ?? 0) / 100, 0, 1);
    // the window term is unknowable without both R and P — then only (1−q) speaks,
    // and the scarcity floor cannot be claimed (ignorance never refuses)
    const windowFraction = left !== null && P && P > 0 ? clamp(left / P, 0, 1) : null;
    const valueFraction = Math.round(((windowFraction ?? 0) + (1 - q)) * 1000) / 1000;
    if (credits === 1 && windowFraction !== null && windowFraction < CREDIT_FLOOR) return out(false, 'last-credit-low-value', { valueFraction, windowFraction });
    return out(true, 'wall-use-now', { valueFraction, windowFraction });
  }
  // anthropic
  const b = num(f.burnRate), W = num(f.weekQuota);
  // THE KNEE IS DECIDED ON THE UNROUNDED RATIO (r2): rounding to 3 decimals
  // first let 'above-knee' fire up to 0.05 % below W/b; only the REPORTED
  // valueFraction is rounded
  const ratio = left !== null && b !== null && b > 0 && W !== null && W > 0 ? (b * left) / W : null;
  const valueFraction = ratio !== null ? Math.round(Math.min(1, ratio) * 1000) / 1000 : null;
  if (ratio !== null && ratio >= 1) return out(true, 'above-knee', { valueFraction });
  if (useBy !== null && useBy > nowSec && useBy - nowSec < USE_BY_IMMINENT_SEC) return out(true, 'use-by-imminent', { valueFraction });
  if (f.replenishes === true) return out(true, 'replenishes', { valueFraction });
  return out(false, valueFraction === null ? 'burn-unknown' : 'below-knee-keep', { valueFraction });
}

/** The anthropic knee in seconds: the remaining time at which a refill is worth
 *  exactly one full week at pace `burnRate` (R − t = W / b). null when unknown. */
function kneeSec({ weekQuota, burnRate } = {}) {
  const b = num(burnRate), W = num(weekQuota);
  return b !== null && b > 0 && W !== null && W > 0 ? W / b : null;
}

/** THE PACE of a window, from the facts the cache already holds: the fraction
 *  spent since the window opened (R − P), per second. It is the average pace of
 *  THIS window — "按当前节奏" without a second model (the estimator learns
 *  utilization per DOLLAR, not per second). null when the window has not
 *  opened, or any input is unknown. Unit: window-fractions per second, so the
 *  matching weekQuota is 1. */
function windowPaceRate({ usedFraction, resetsAtSec, periodSec, nowSec } = {}) {
  const u = num(usedFraction), R = num(resetsAtSec), P = num(periodSec), t = num(nowSec);
  if (u === null || !R || !P || P <= 0 || t === null) return null;
  const elapsed = t - (R - P);
  if (!(elapsed > 0)) return null;
  return clamp(u, 0, 1) / elapsed;
}

/** A wait in words: "3d 4h", "2h 5m", "12m", "<1m". */
function fmtWait(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return '<1m';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
const isoMinute = (sec) => new Date(Number(sec) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

// the extraction marker (English-string-as-key): the client words each line with t(key, params)
const i18nKey = (s) => s;

/**
 * describeUse(vendor, verdict, {nowSec, resetsAtSec, periodSec, creditsLeft, fmtTime})
 *   → { text, lines: [{key, params}] }
 * THE sentences the confirm dialog, the For-you item and the auto notice say —
 * one source. `fmtTime(sec)` formats an instant (default: ISO minute, UTC; the
 * client passes its locale formatter). `text` = the English lines joined.
 */
function describeUse(vendor, verdict, { nowSec = Math.floor(Date.now() / 1000), resetsAtSec = null, periodSec = null, creditsLeft = null, fmtTime = isoMinute } = {}) {
  const lines = [];
  const R = num(resetsAtSec), P = num(periodSec), now = num(nowSec) ?? Math.floor(Date.now() / 1000);
  const fill = (key, params) => key.replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? String(params[k]) : m));
  if (vendor === 'openai') {
    if (P && P > 0) lines.push({ key: i18nKey('Starts a new {period} window now, running until {until}.'), params: { period: fmtWait(P), until: fmtTime(now + P) } });
    else lines.push({ key: i18nKey('Starts a new usage window now.'), params: {} });
    if (R) lines.push({ key: i18nKey('Without it the limit resets at {resetsAt}.'), params: { resetsAt: fmtTime(R) } });
  } else if (vendor === 'anthropic') {
    lines.push(R
      ? { key: i18nKey('Refills the limit now; it still resets at {resetsAt} (the period does not change).'), params: { resetsAt: fmtTime(R) } }
      : { key: i18nKey('Refills the limit now; the reset time does not change.'), params: {} });
  }
  const wait = verdict && num(verdict.waitSavedSec);
  if (wait !== null && wait > 0) lines.push({ key: i18nKey('Saves a wait of {wait}.'), params: { wait: fmtWait(wait) } });
  const c = num(creditsLeft);
  if (c !== null && c > 0) lines.push(c === 1 ? { key: i18nKey('This is the last stored reset credit.'), params: {} } : c - 1 === 1 ? { key: i18nKey('1 reset credit left after this one.'), params: {} } : { key: i18nKey('{n} reset credits left after this one.'), params: { n: c - 1 } });
  return { text: lines.map((l) => fill(l.key, l.params)).join(' '), lines };
}

const MODES = Object.freeze(['off', 'ask', 'auto']);
/** THE OFFER a chat card carries (the wall card, the auto-resume arm card):
 *  `{available, mode, accountKey?}` sanitized — a positive integer count and a
 *  known mode, else null. `accountKey` (2.369.157 p2) = the usage identity the
 *  credits belong to (an account id, or the machine login's key), so the card's
 *  button opens the confirm dialog on THAT account; a key that is not a plain
 *  id is dropped, never rendered. The ONE shape both normalizers and the
 *  client read. */
const ACCOUNT_KEY_RE = /^[\w.:@-]{1,120}$/;
function offerOf(x) {
  if (!x || typeof x !== 'object') return null;
  const n = Number(x.available);
  if (!Number.isInteger(n) || n <= 0 || !MODES.includes(x.mode)) return null;
  const out = { available: n, mode: x.mode };
  if (typeof x.accountKey === 'string' && ACCOUNT_KEY_RE.test(x.accountKey)) out.accountKey = x.accountKey;
  // lane reset-path R3: the WALL the offer is about (its stated reset — a later reading past it resolves the
  // card) and the card's RESOLUTION once a later fact answered it; numbers and a closed word, never markup
  const R = num(x.resetsAtSec);
  if (R !== null && Number.isInteger(R) && R > 0) out.resetsAtSec = R;
  const res = resolvedOf(x.resolved);
  if (res) out.resolved = res;
  return out;
}

// ── THE CARD THE CREDIT OUTLIVED (lane reset-path R3, the owner 2026-10-01: a credit used at 10:45 — the wall
// card "Usage limit hit … N stored reset credits available" kept its button). The compaction card's rule: an
// offered action a later fact answered is WITHDRAWN on both carriers — the normalizer resolves the card ON THE
// MESSAGE (every re-render, slab and page-in carry it) and emits ONE `edit` op the client patches in place.
//   used   a credit on that account was consumed after the card (the window re-opened until `untilSec`)
//   reset  a reading taken past the card's stated reset (the limit reset by itself)
//   open   a reading after the card shows the account usable again
const RESOLVE_HOW = Object.freeze(['used', 'reset', 'open']);
function resolvedOf(x) {
  if (!x || typeof x !== 'object' || !RESOLVE_HOW.includes(x.how)) return null;
  const at = num(x.at);
  if (at === null || at <= 0) return null;
  const out = { how: x.how, at: Math.round(at) };
  const u = num(x.untilSec);
  if (u !== null && u > 0) out.untilSec = Math.round(u);
  return out;
}
/**
 * offerResolution(offer, cardTs, ev) → the resolution or null. `cardTs` = the card's own time (ms);
 * ev = {kind:'used', at, untilSec} | {kind:'reading', at, usable}. A fact OLDER than the card answers
 * nothing (a card drawn after it is about a new wall — it keeps its button).
 */
function offerResolution(offer, cardTs, ev) {
  if (!offer || typeof offer !== 'object' || offer.resolved || !ev || typeof ev !== 'object') return null;
  const at = num(ev.at);
  if (at === null || at <= 0) return null;
  const ts = num(cardTs);
  if (ts !== null && ts > at) return null;
  if (ev.kind === 'used') return resolvedOf({ how: 'used', at, untilSec: ev.untilSec });
  if (ev.kind === 'reading') {
    const R = num(offer.resetsAtSec);
    if (R && at >= R * 1000) return resolvedOf({ how: 'reset', at: R * 1000 });
    if (ev.usable === true) return resolvedOf({ how: 'open', at });
  }
  return null;
}
/** THE CARD'S VIEW (the renderer and the in-place patch read it): the button while the offer is open, else
 *  ONE line stating the outcome. → { button, line: {key, params} | null } */
function resetCreditCardView(rc, { fmtTime = isoMinute } = {}) {
  const o = rc && typeof rc === 'object' ? rc : null;
  if (!o) return { button: false, line: null };
  const res = resolvedOf(o.resolved);
  if (res) {
    const time = fmtTime(Math.floor(res.at / 1000));
    if (res.how === 'used') return { button: false, line: res.untilSec ? { key: i18nKey('Used at {time} — the new window runs until {until}.'), params: { time, until: fmtTime(res.untilSec) } } : { key: i18nKey('Used at {time}.'), params: { time } } };
    if (res.how === 'reset') return { button: false, line: { key: i18nKey('The limit reset at {time} — no credit was needed.'), params: { time } } };
    return { button: false, line: { key: i18nKey('The account was usable again at {time} — no credit was needed.'), params: { time } } };
  }
  return { button: !!(o.accountKey && Number(o.available) > 0), line: null };
}

// ── THE MANUAL USE (p2, design-reset-credits §5) ─────────────────────────────
// The three entry points (the Manage Agents roster's "Use…", the wall / arm
// card's button, the ask-mode For-you item) open ONE confirm dialog; what it
// SAYS is decided here, DOM-free, so the sentence builder is a table test.
// `preview` is the server's answer to GET /api/accounts/:id/reset-credit:
//   {key, name, vendor, creditsLeft, resetsAtSec, periodSec, remainingPct,
//    sessionId, cooldownUntilSec, code?}
// `code` = the refusal the POST would answer, BY NAME (REFUSAL_CODES).
const REFUSAL_CODES = Object.freeze(['not_supported', 'no_live_session', 'no_credits', 'in_flight', 'cooldown', 'unsettled', 'spend_refused', 'restart_pending']);
/** The refusal in words, as structure `{key, params}` (the client runs t()). */
function refusalLine(code, { until = null, why = null, member = null } = {}) {
  switch (code) {
    case 'not_supported': return { key: i18nKey('This agent offers no reset-credit interface VibeSpace can use.'), params: {} };
    case 'no_live_session': return { key: i18nKey('Needs a running chat session on this account — the credit is spent through that session’s own CLI. Start one, then try again.'), params: {} };
    case 'no_credits': return { key: i18nKey('This account has no stored reset credits.'), params: {} };
    // lane reset-path: a request was handed to codex and has not been SENT yet (≤ RESET_CREDIT_ACK_MS) —
    // not the ten-minute wait: that one starts only once a request went out
    case 'in_flight': return { key: i18nKey('A reset credit on this account is being sent right now — its answer arrives as a notice.'), params: {} };
    // verify r1 (the unknown consume): an earlier request went out and was never answered, and the press could not
    // READ the account to learn whether it landed (the read failed) — nothing spent, nothing minted
    case 'unsettled': return until
      ? { key: i18nKey('A reset credit sent at {until} got no answer, and the account could not be read to learn whether it landed — nothing was spent. Refresh the account (⟳ in the usage menu) and try again.'), params: { until } }
      : { key: i18nKey('A reset credit sent earlier got no answer, and the account could not be read to learn whether it landed — nothing was spent. Refresh the account (⟳ in the usage menu) and try again.'), params: {} };
    case 'cooldown': return until
      ? { key: i18nKey('A reset credit was already tried on this account in the last 10 minutes — try again after {until}.'), params: { until } }
      : { key: i18nKey('A reset credit was already tried on this account in the last 10 minutes.'), params: {} };
    // r5: the only carrier's cold restart WENT OUT — the verb would ride a process a client is replacing
    case 'restart_pending': return { key: i18nKey('The only conversation holding this login is being restarted onto {member} — a credit sent through it could be lost. Try again from another conversation on this account.'), params: { member: String(member || '?') } };
    case 'spend_refused': return { key: i18nKey('The unattended-spend ceiling refused it: {why}'), params: { why: String(why || '?') } };
    // verify-r6 R1: the window the dialog showed reset (or moved) while it stayed open — nothing was spent
    case 'preview_changed': return { key: i18nKey('The limit this dialog showed has reset since it opened — nothing was spent. Open it again to see the account now.'), params: {} };
    default: return { key: i18nKey('The server refused it: {why}'), params: { why: String(why || code || '?') } };
  }
}
/**
 * dialogModel(preview, {nowSec, fmtTime}) → { lines: [{key, params}], refusal: {key, params}|null, canConfirm }
 * The account, then (openai, not at a wall) what the credit DISCARDS, then
 * describeUse's sentences — the mechanics, the reset instant it replaces, the
 * wait it saves (only AT a wall: remainingPct ≤ 0 — a wait nobody is in is not
 * saved) and the credits left after. `canConfirm` is false whenever the server
 * named a refusal or the vendor is unknown.
 */
function dialogModel(p, { nowSec = Math.floor(Date.now() / 1000), fmtTime = isoMinute, harness = null } = {}) {
  const pv = p && typeof p === 'object' ? p : {};
  const now = num(nowSec) ?? Math.floor(Date.now() / 1000);
  const R = num(pv.resetsAtSec), q = num(pv.remainingPct);
  const vendor = VENDORS.includes(pv.vendor) ? pv.vendor : null;
  // THE HARNESS IS NAMED (lane reset-path): a label-less machine login read "Account: CLI login" —
  // whose CLI? "Codex · CLI login" says which account the credit belongs to (the client passes the
  // harness's own label; without one the old line stands)
  const lines = [typeof harness === 'string' && harness
    ? { key: i18nKey('Account: {harness} · {account}'), params: { harness, account: String(pv.name || pv.key || '?') } }
    : { key: i18nKey('Account: {account}'), params: { account: String(pv.name || pv.key || '?') } }];
  // THE HELPER PATH (lane reset-path): no conversation's wrapper can carry the request, so the
  // credit is used through a short-lived codex helper process — said, never a greyed button
  const hp = helperLine(pv);
  if (hp) lines.push(hp);
  // THE UNKNOWN CONSUME (verify r1): an earlier request on this account went out and was never answered — it
  // may have spent a credit. The press READS the account first (the helper's own read, or the conversation's)
  // and spends a credit only if that one never landed; said here, never a greyed button
  const ul = unsettledLine(pv, { fmtTime });
  if (ul) lines.push(ul);
  // THE READ BEFORE EVERY PRESS (verify r8 T0, the owner's YES on ut-cdaa01aff0): a press reads the account first and
  // spends a credit on what it just read — said when the carrier does it (`preview.readsFirst`) and no unsettled
  // line already says so
  if (!ul && pv.readsFirst === true && !pv.code) lines.push({ key: i18nKey('Use reads the account first, then uses one credit — a credit granted a moment ago is never counted as unused.'), params: {} });
  // THE LAPSED ATTEMPT (verify r2): an earlier request was never settled by a reading and the wall it was for is
  // gone by itself — the press is free, and the count shown may be one high; said, never a greyed button
  const ll = lapsedLine(pv, { fmtTime });
  if (ll) lines.push(ll);
  const walled = q !== null && q <= 0;
  // THE CARRIER IS LEAVING THIS ACCOUNT (r4): the only running conversation that
  // holds this login belongs to a pool that moved on. r5 NAMES THE STATE: a
  // restart request that WENT OUT (`inFlight`) is the `restart_pending` refusal
  // below (no line here — the refusal says it); a move with no request yet
  // (`pending`, no client connected) is allowed, and said first.
  const rp = pv.restartPending && typeof pv.restartPending === 'object' ? pv.restartPending : null;
  if (rp && !rp.inFlight) lines.push({ key: i18nKey('The conversation that carries this credit keeps this login until a client restarts it onto {member} — the credit resets this account’s limit, not that conversation’s.'), params: { member: String(rp.name || rp.id || '?') } });
  if (vendor === 'openai' && q !== null && q > 0) lines.push({ key: i18nKey('The {pct}% still left in the current window is discarded.'), params: { pct: Math.round(q) } });
  if (vendor) {
    const d = describeUse(vendor, { waitSavedSec: walled && R && R > now ? R - now : null }, { nowSec: now, resetsAtSec: R, periodSec: num(pv.periodSec), creditsLeft: num(pv.creditsLeft), fmtTime });
    lines.push(...d.lines);
  }
  const code = typeof pv.code === 'string' && pv.code ? pv.code : (vendor ? null : 'not_supported');
  const refusal = code ? refusalLine(code, { until: code === 'unsettled' ? (num(pv.unsettled && pv.unsettled.sinceSec) ? fmtTime(num(pv.unsettled.sinceSec)) : null) : (num(pv.cooldownUntilSec) ? fmtTime(num(pv.cooldownUntilSec)) : null), why: pv.error || null, member: rp ? (rp.name || rp.id || null) : null }) : null;
  return { lines, refusal, canConfirm: !code };
}
/**
 * THE ROSTER CHIP (p2): what one account row says about reset credits, from its
 * usage snapshot `u`. `capable` = the harness can SPEND one (backend-caps
 * `resetCredit`) — then the stored count (`u.resetCredits.availableCount`, the
 * on-demand read's) is the chip and the button works. Otherwise only a PASSIVE
 * grant sample (`u.resetGrant = {resetsLeft, useBySec}`, design §7 P2 — no
 * producer yet, so nothing renders today) shows, and the button is disabled.
 * null = say nothing (no count, zero, or no sample).
 */
function rosterResetOffer(u, { capable = false } = {}) {
  if (!u || typeof u !== 'object') return null;
  if (capable) {
    const n = num(u.resetCredits && u.resetCredits.availableCount);
    return n !== null && n > 0 ? { count: n, useBySec: null, canUse: true } : null;
  }
  const g = u.resetGrant;
  const n = num(g && g.resetsLeft);
  if (n === null || n <= 0) return null;
  return { count: n, useBySec: num(g.useBySec), canUse: false };
}

// ── THE HELPER PATH'S WORDS (lane reset-path, 2026-10-01) ────────────────────
// `preview.via` = 'session' (a conversation's own wrapper carries the request) | 'helper' (ONE
// bounded `codex app-server` child — src/codex-reset-helper.js); `preview.helperWhy` = why the
// helper: 'no-session' (no chat session on this account) | 'wrapper-predates' (every conversation
// on it runs a wrapper older than the reset-credit fix — Terminate + Resume updates it).
// THE EGRESS IS SAID (verify r1, M3): the helper is an app-server on the account's login, and its STARTUP
// reaches github.com (the plugin marketplace sync — MEASURED, src/codex-reset-helper.js MEASURED_CONNECTS) and
// chatgpt.com on its own; a person pressing Use is told so on the dialog, never after.
const HELPER_WHY = Object.freeze(['no-session', 'wrapper-predates']);
function helperLine(pv) {
  if (!pv || pv.via !== 'helper' || pv.code) return null;
  if (pv.helperWhy === 'wrapper-predates') return { key: i18nKey('The conversation on this account runs a codex wrapper that predates the reset-credit fix — Terminate + Resume it, or use the credit from here: it is sent through a short-lived codex helper process on this account’s login, whose startup also reaches github.com (codex’s plugin marketplace sync) and chatgpt.com.'), params: {} };
  return { key: i18nKey('No chat session is open on this account — the credit is used through a short-lived codex helper process on this account’s login, whose startup also reaches github.com (codex’s plugin marketplace sync) and chatgpt.com.'), params: {} };
}

/** THE UNSETTLED FACT on the dialog (verify r1): `preview.unsettled = {sinceSec}` — an earlier request on this
 *  account got no answer; Use reads the account first. Only without a refusal (a refusal says its own thing). */
function unsettledLine(pv, { fmtTime = isoMinute } = {}) {
  if (!pv || pv.code || !pv.unsettled || typeof pv.unsettled !== 'object') return null;
  const since = num(pv.unsettled.sinceSec);
  return since
    ? { key: i18nKey('A reset credit sent at {time} got no answer — it may have been spent. Use reads the account first and spends a credit only if that one never landed.'), params: { time: fmtTime(since) } }
    : { key: i18nKey('A reset credit sent earlier got no answer — it may have been spent. Use reads the account first and spends a credit only if that one never landed.'), params: {} };
}
/** THE LAPSED FACT on the dialog (verify r2): `preview.lapsed = {sinceSec}` — an earlier request was never settled
 *  by a reading and the wall it was for has passed; the stored count shown may be one high. */
function lapsedLine(pv, { fmtTime = isoMinute } = {}) {
  if (!pv || pv.code || !pv.lapsed || typeof pv.lapsed !== 'object') return null;
  const since = num(pv.lapsed.sinceSec);
  return since
    ? { key: i18nKey('A reset credit sent at {time} was never answered and no reading settled it; the limit it was for has reset since. The count shown may be one high.'), params: { time: fmtTime(since) } }
    : { key: i18nKey('A reset credit sent earlier was never answered and no reading settled it; the limit it was for has reset since. The count shown may be one high.'), params: {} };
}

// ── WHEN AN ATTEMPT ARMS THE TEN-MINUTE FLOOR (lane reset-path, 2026-10-01) ────
// The owner's report: a REFUSED attempt armed "already tried in the last 10 minutes". The floor
// exists so a second press cannot mint a second idempotency key while the first consume might
// still land — so it arms ONLY on a consume that WENT OUT (the wrapper / the helper reports it
// sent the request with its key) and then either re-opened the window (`reset`) or got no answer
// (the retry window: it may have landed). A refusal before the send (a wrapper older than the
// key — codex refused it locally), a request nobody took (no "sent" within RESET_CREDIT_ACK_MS),
// a vendor `nothingToReset` / `noCredit`, an answered error: nothing was spent ⇒ nothing armed.
const RESET_CREDIT_FLOOR_MS = 10 * 60e3;
// how long a written verb may wait for its "sent" before it counts as never sent (the 2.369.199
// wrapper reports its send only in its answer: consume 30 s + one same-key retry 30 s + the
// post-reset read 20 s = 80 s; a spend hold lives 3 min — RESERVE_TTL_MS — so 90 s fits both)
const RESET_CREDIT_ACK_MS = 90e3;
// THE VENDOR'S OWN OUTCOME WORDS — the closed set every MEASURED codex-cli answers the consume with
// (scripts/fixtures/codex-app-server/<version>-methods.json `resetCreditOutcomes`; test-codex-protocol-drift ③ pins
// the two sets equal). verify r3 (reproduced, money): a word outside it read as "answered, nothing spent" — the floor
// not armed, the next press minting a second key over a consume the vendor had taken and answered in a word we
// never measured (the 0.153 → 0.159 enum grew once already: `noCredit`). A word we do not know fails CLOSED:
// `unknown-outcome` = it went out, it was answered, what it did is unknown — charged, the floor, unsettled until a
// reading of the account says whether the count fell. The same for an answer that carries NO word at all.
const VENDOR_OUTCOMES = Object.freeze(['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed']);
// the outcomes an attempt can end in (the vendor's words + ours), and the ones that arm the floor
const ATTEMPT_OUTCOMES = Object.freeze(['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed', 'superseded', 'unanswered', 'no-answer', 'unknown', 'unknown-outcome', 'error', 'refused-stale', 'not-sent', 'skipped']);
const FLOOR_OUTCOMES = Object.freeze(['reset', 'unanswered', 'no-answer', 'unknown', 'unknown-outcome']);
// THE UNKNOWN CONSUME (verify r1, the money class): an attempt that went out — or MAY have gone out: a carrier that
// cannot report its send (a wrapper older than `resetCreditKey`, a process that died with the verb) — and was
// never answered may have spent a credit. After the floor it does not go free: it stays UNSETTLED, blocking
// every press and the auto rung on that identity, until a READING of the account newer than its send says
// whether it landed (settleByReading): the stored credit count fell, or the wall's window moved before its own
// reset ⇒ it landed (`reset`); the same count / the same window ⇒ it did not; a reading past the stated reset
// ⇒ the wall is gone by itself (`expired`, nothing to protect). Every press reads first (the helper's own read,
// the conversation's rung) — the unsettled state is never a dead end.
const UNSETTLED_OUTCOMES = Object.freeze(['unanswered', 'no-answer', 'unknown', 'unknown-outcome']);
// THE CLOCK, NOT THE TIMER (verify r3, reproduced on the real engine): the floor and the ack window were judged by the
// record's OUTCOME, and the outcome was stamped by a TIMER — so between the floor elapsing and the timer's callback
// (a busy event loop: the product has measured loop gaps of seconds) a sent, unanswered attempt read as FREE and a
// press minted a second key; an open attempt on a carrier that cannot report its send read as free past the ack
// window the same way (its `unknown` not yet stamped), and the next press replaced it in the map — the attempt that
// may have gone out was dropped with its timers. The instant an attempt is ARMED from is a function of the record
// and the clock; the timers only make the verdict durable (an outcome on disk, a charge, the followers told).
function armedByClock(t, { now = Date.now(), ackMs = RESET_CREDIT_ACK_MS } = {}) {
  const at = num(t.at) || 0, sentAt = num(t.sentAt) || 0;
  if (t.outcome) return outcomeArmsFloor(t.outcome) ? (sentAt || at) : 0;
  if (sentAt) return sentAt;
  if (t.reportsSent === false && now - at >= ackMs) return at; // the ack timer's `unknown`, from the write, by the clock
  return 0;
}
/** Is the attempt unsettled — an unanswered outcome no reading settled, OR (r3) a record with no outcome whose armed
 *  instant is a whole floor ago by the clock (its timer has not run yet)? `opts` = {now, floorMs, ackMs}. */
function isUnsettled(t, opts = {}) {
  if (!t || typeof t !== 'object' || t.settled) return false;
  if (UNSETTLED_OUTCOMES.includes(t.outcome)) return true;
  if (t.outcome) return false;
  const now = num(opts.now) ?? Date.now(), floorMs = num(opts.floorMs) ?? RESET_CREDIT_FLOOR_MS;
  const armed = armedByClock(t, { now, ackMs: num(opts.ackMs) ?? RESET_CREDIT_ACK_MS });
  return !!(armed && now - armed >= floorMs); // a sent attempt past the floor whose timer has not run is unsettled by the clock
}
/** THE CHAIN (verify r3, reproduced — money): an unsettled attempt rides as the next press's `prior`, and the block
 *  read only the NEWEST record. A press whose helper never started (codex gone: ENOENT, the wall before its first
 *  request) ended `error` — a FREE record — with the unsettled one behind it as its prior; the next press saw no
 *  unsettled fact, carried only the immediate (free) record's verdict, consumed with NO read first, and the unsettled
 *  attempt fell out of the chain. The newest UNSETTLED attempt in a chain is what a press must read over, wherever
 *  it sits: the block walks the chain, and a new attempt's `prior` is that one. */
function unsettledInChain(t, opts = {}) { for (let x = t && typeof t === 'object' ? t : null; x; x = x.prior) if (isUnsettled(x, opts)) return x; return null; }
/** THE PRIOR A NEW PRESS CARRIES (verify r3, the walk's I7): the newest unsettled attempt, its own tail cut to the
 *  unsettled ones that have NOT lapsed (none at a press the block admitted — a lapsed tail behind a lapsed head could
 *  grow by one per press over a lapsed wall when no send ever superseded it: an attempt armed by the clock alone). */
// …and the tail is BOUNDED: a boot revives an open helper record as `unknown` (it may have gone out), so a crash during
// every helper press over an unsettled chain adds one live entry per crash; ONE reading judges them all, so the eight
// newest are enough (older ones are charged already — their settle would only word a notice)
const MAX_PRIOR_TAIL = 8;
function priorForPress(prev, opts = {}) {
  const h = unsettledInChain(prev, opts);
  if (!h) return null;
  const now = num(opts.now) ?? Date.now();
  let tail = null, last = null, n = 0;
  for (let x = h.prior; x && n < MAX_PRIOR_TAIL; x = x.prior) { if (!isUnsettled(x, opts) || now >= lapseAtOf(x)) continue; if (!tail) tail = x; else last.prior = x; last = x; n++; }
  if (last) last.prior = null;
  h.prior = tail;
  return h;
}
// THE CLOCK CLASS (verify r2; the auto-resume rule, src/auto-resume-signal.js RESET_GRACE_SEC): a stated reset is
// minute-precise and the vendor lands late, so a reading inside a minute of the wall's own reset is still "at
// the wall", and a window that restates its next natural reset within that minute ROLLED BY ITSELF.
const RESET_GRACE_SEC = 60;
// THE LAPSE (verify r2): an unsettled attempt is settled by a reading — but a reading never reaches a dead account
// (no conversation, a wrapper too old to read, a login gone), and without a bound every press on that identity was
// refused for ever. The bound is the wall it was for: its stated reset + the grace (the window the credit would
// have reset is gone by itself), else one whole longest window (7 d) after the send. A lapsed attempt blocks
// nothing — and is SAID (the preview's `lapsed`, the dialog's line: the count shown may be one high); it stays
// unsettled on its record so a late reading still settles it for the ledger.
const RESET_CREDIT_LAPSE_MS = 7 * 86400e3;
/**
 * settleByReading(t, r) — does a reading of the identity settle an unsettled attempt?
 *   t = { at, sentAt, outcome, settled, resetsAtSec (the wall's stated reset), periodSec (the wall's window length,
 *         when known), creditsAt (the stored count at the attempt, null = unknown) }
 *   r = { fetchedAt (ms), creditsLeft (the reading's stored count, null = not carried), resetsAtSec (the SAME
 *         window's reset as the reading states it, null = not carried), periodSec (that window's length),
 *         windowStartSec (the START of the reading's longest window, null = not carried) }
 *   → { how: 'landed' | 'not-landed' | 'expired' | 'untold', why } | null (a reading that cannot tell: older than
 *     the send, or carrying no witness at all)
 *   verify r2: `expired` also when the window ROLLED by the clock (R1 = R0 + period within the grace — not a
 *   credit's new window) and when the attempt had no window and the reading's windows all began after the send;
 *   `untold` when no count was known at the send but the reading carries one — the attempt cannot be judged,
 *   the block ends, and the person sees the count the reading carries (the press that read spends nothing).
 */
function settleByReading(t, r = {}, opts = {}) {
  if (!isUnsettled(t, opts)) return null;
  const sentAt = num(t.sentAt) || num(t.at) || 0;
  const at = num(r && r.fetchedAt);
  if (at === null || at <= sentAt) return null;
  // verify r3 (reproduced): a prior was judged by the reading taken AFTER its successor's consume — the count that
  // fell was the newer one's, and the person was told the OLD request "did land". A reading at or after the instant
  // a newer attempt went out (`supersededAt`, stamped by supersede()) cannot judge this one
  // verify r4 (reproduced on the real engine, the availability class): a RESTART during a press over an unsettled prior
  // stamps the prior superseded while it is unsettled and not lapsed — and r3's rule refused EVERY later reading for it,
  // so nothing could settle it before its lapse (up to 7 d): every press read the account, settled the newer one, and the
  // person was told "the reading could not tell — try again after ⟳" for days. A reading after the supersession cannot
  // CREDIT a landing to this attempt (the count that fell may be the newer one's) — but a count that did NOT fall, or a
  // window that did NOT move, proves no consume landed at all, this one included: NOT LANDED is still provable; a fall
  // (or a moved window) is `untold` — which request landed cannot be said; the block ends, the person sees the count
  const sup = num(t.supersededAt), superseded = !!(sup && at >= sup);
  const c0 = num(t.creditsAt), c1 = num(r.creditsLeft);
  const R0 = num(t.resetsAtSec), R1 = num(r.resetsAtSec), P = num(t.periodSec) || num(r.periodSec);
  // THE WINDOW'S OWN WORD (verify r5): 'same' = no consume reset it · 'rolled' = the clock's next natural reset · 'moved' =
  // restated LATER before its own reset: a credit's new window (a credit's starts at the consume and ends a whole period
  // later — always LATER than the reset it replaced) · null = no witness (not carried, or restated EARLIER: some other
  // re-statement, never a credit's)
  const win = R0 && R1 !== null ? (R1 === R0 ? 'same' : (P && Math.abs(R1 - (R0 + P)) <= RESET_GRACE_SEC) ? 'rolled' : (R1 > R0 ? 'moved' : null)) : null;
  if (c0 !== null && c1 !== null) {
    if (c1 < c0) return superseded ? { how: 'untold', why: `the stored credit count fell ${c0} → ${c1} after a later request went out — which request landed cannot be said` } : { how: 'landed', why: `the stored credit count fell ${c0} → ${c1}` };
    // verify r5 (reproduced on the real engine, money): the count did NOT fall — and a credit GRANTED after the send (the
    // vendor re-issues them on its own clock) masks a consume that landed: press 1 landed (3 → 2), a grant (2 → 3), the read
    // before press 2 saw "still 3" and press 2 consumed AGAIN over a re-opened window. An unchanged count proves NOT LANDED
    // only while the WINDOW agrees (unchanged, or no window witness at all); a window that MOVED under an unchanged count is
    // a landing + a grant, or somebody else's consume (the web) — which cannot be said: untold, the press that read spends
    // nothing and the person sees the account as it is. A count that ROSE is a grant for certain — then only the window may
    // judge (unchanged ⇒ not landed; moved ⇒ untold; none ⇒ untold)
    if (win === 'moved') return { how: 'untold', why: `the stored credit count is still ${c1} but the window moved (${R0} → ${R1}) — a credit may have been granted since the send, or another request moved the window; which cannot be said` };
    if (win === 'rolled') return { how: 'expired', why: `the window rolled by itself (${R0} → ${R1}, its next natural reset)` };
    if (c1 > c0) return win === 'same' ? { how: 'not-landed', why: `the window is unchanged (the stored credit count rose ${c0} → ${c1}: a credit was granted since the send)` } : { how: 'untold', why: `the stored credit count rose ${c0} → ${c1} — a credit was granted since the send, so the count cannot say whether the request landed` };
    return { how: 'not-landed', why: `the stored credit count is still ${c1}` };
  }
  if (R0 && at >= (R0 + RESET_GRACE_SEC) * 1000) return { how: 'expired', why: 'the reading is past the wall\'s own reset' };
  if (win === 'same') return { how: 'not-landed', why: 'the window is unchanged' };
  if (win === 'rolled') return { how: 'expired', why: `the window rolled by itself (${R0} → ${R1}, its next natural reset)` };
  if (win === 'moved') return superseded ? { how: 'untold', why: `the window moved (${R0} → ${R1}) after a later request went out — which request moved it cannot be said` } : { how: 'landed', why: `the window moved (${R0} → ${R1}) before its own reset` };
  const S1 = num(r.windowStartSec);
  if (!R0 && S1 !== null && S1 * 1000 > sentAt) return { how: 'expired', why: 'every window of the account began after the send' };
  if (c0 === null && c1 !== null) return { how: 'untold', why: `no credit count was known when it was sent — the account now holds ${c1}` };
  return null;
}
/** THE NEWER ATTEMPT WENT OUT at `at` (verify r3): every prior is superseded from then — a reading after it cannot credit
 *  a LANDING to them (settleByReading; verify r4: a count or window that did not move still settles them NOT LANDED, a
 *  fall is `untold`) — and a prior that is LAPSED can never be settled now (every later reading is after the send),
 *  so it is dropped: it blocks nothing, it is charged already, and a chain of lapsed priors would otherwise grow without
 *  bound (one per press over a lapsed wall). A settled or a not-yet-lapsed prior keeps its place. → the new chain */
function supersede(prior, at, opts = {}) {
  let head = null, tail = null;
  for (let x = prior && typeof prior === 'object' ? prior : null; x; x = x.prior) {
    if (!num(x.supersededAt)) x.supersededAt = num(at) || Date.now();
    if (isUnsettled(x, opts) && (num(at) || Date.now()) >= lapseAtOf(x)) continue;
    if (!head) head = x; else tail.prior = x;
    tail = x;
  }
  if (tail) tail.prior = null;
  return head;
}
/** The instant an unsettled attempt LAPSES (ms): the wall's stated reset + the grace, else a whole longest window after the send. */
function lapseAtOf(t) {
  if (!t || typeof t !== 'object') return 0;
  const R0 = num(t.resetsAtSec), sentAt = num(t.sentAt) || num(t.at) || 0;
  return R0 ? (R0 + RESET_GRACE_SEC) * 1000 : sentAt + RESET_CREDIT_LAPSE_MS;
}
function isLapsed(t, now = Date.now(), opts = {}) { return isUnsettled(t, { ...opts, now }) && now >= lapseAtOf(t); }
/**
 * creditAnswerOf(payload) — a `reset_credit_result` (the wrapper's, or the engine's spelling of the
 * helper's) → { outcome, sent, answered, keyed }.
 *   · an `outcome` = the vendor answered ⇒ it went out; a KEYED `alreadyRedeemed` is this press's
 *     own reset (codex-cli: "the same idempotency key already completed a reset"), a keyless one
 *     (a wrapper older than the key) stays `alreadyRedeemed` (somebody else's credit — superseded);
 *   · keyless + an error naming `idempotencyKey` = a wrapper older than the key, refused LOCALLY by
 *     codex-cli (every measured version requires it) ⇒ `refused-stale`, never sent;
 *   · "timed out after" = no answer: `unanswered` (sent) — unless the payload says it was never
 *     sent (`sent:false`, or keyed with zero attempts: the helper's wall before the consume) ⇒ `not-sent`;
 *   · any other error = answered, nothing spent — but a KEYED error after a retry (attempts ≥ 2: the
 *     first consume timed out and may have landed) is still `unanswered` (money-safe).
 */
function creditAnswerOf(p = {}) {
  const pv = p && typeof p === 'object' ? p : {};
  const keyed = typeof pv.idempotencyKey === 'string' && pv.idempotencyKey !== '';
  const out0 = pv.outcome || (pv.result && pv.result.outcome) || null;
  const attempts = num(pv.attempts);
  const sentFlag = pv.sent === true || pv.sent === false ? pv.sent : (keyed && attempts !== null ? attempts >= 1 : null);
  // verify r8 T0: the conversation's wrapper read first and did NOT consume (the engine's verdict on that read, or no
  // verdict within its wait) — nothing went out, whatever else the record says
  if (pv.skipped === true && !out0) return { outcome: 'skipped', sent: false, answered: true, keyed, why: typeof pv.why === 'string' ? pv.why : null };
  if (out0) {
    const word = String(out0);
    if (word === 'alreadyRedeemed' && keyed) return { outcome: 'reset', sent: true, answered: true, keyed };
    // verify r3 (money): a word outside the measured enum is not "nothing spent" — it is a consume we cannot read
    if (!VENDOR_OUTCOMES.includes(word)) return { outcome: 'unknown-outcome', sent: true, answered: true, keyed, word };
    return { outcome: word, sent: true, answered: true, keyed };
  }
  // verify r2 (reproduced, money): the helper's app-server EXITED after taking the consume — sent, never answered.
  // Its error text is not a timeout, so it read as "answered, nothing spent" and the next press minted a second
  // key over a request that may have landed. A carrier that SAYS it was not answered is unanswered, whatever the words
  if (pv.answered === false && sentFlag === true) return { outcome: 'unanswered', sent: true, answered: false, keyed };
  const err = String(pv.error || '');
  if (!keyed && /idempotencyKey/.test(err)) return { outcome: 'refused-stale', sent: false, answered: true, keyed };
  if (/timed out after/.test(err)) return sentFlag === false ? { outcome: 'not-sent', sent: false, answered: false, keyed } : { outcome: 'unanswered', sent: true, answered: false, keyed };
  if (keyed && attempts !== null && attempts >= 2) return { outcome: 'unanswered', sent: true, answered: false, keyed };
  // verify r3 (money): an answer with neither a word nor an error (a result shape we never measured) is not "nothing
  // spent" either — it went out (unless the carrier says it did not) and what it did is unknown
  if (!err && sentFlag !== false) return { outcome: 'unknown-outcome', sent: true, answered: true, keyed, word: null };
  return { outcome: 'error', sent: sentFlag === true, answered: true, keyed };
}
/** Does an attempt that ENDED in `outcome` arm the floor? (only a consume that went out and either
 *  re-opened the window or got no answer) */
function outcomeArmsFloor(outcome) { return FLOOR_OUTCOMES.includes(outcome); }
/**
 * attemptBlock(t, {now, floorMs, ackMs}) — what an identity's newest attempt blocks NOW.
 *   t = { at (the verb written), sentAt (0 until it went out), outcome (null while open) }
 *   → { code: 'in_flight' | 'cooldown' | 'unsettled' | null, until (ms), armedAt (ms, 0 = the floor never armed) }
 * `in_flight` = written, not yet sent, inside the ack window (a second press would race it);
 * `cooldown` = THE floor, from the instant it went out, for FLOOR_OUTCOMES (or still open);
 * `unsettled` = past the floor, never answered, not yet settled by a reading (verify r1: `until` 0 — a reading ends it).
 */
function attemptBlock(t, { now = Date.now(), floorMs = RESET_CREDIT_FLOOR_MS, ackMs = RESET_CREDIT_ACK_MS } = {}) {
  if (!t || typeof t !== 'object') return { code: null, until: 0, armedAt: 0 };
  const at = num(t.at) || 0, sentAt = num(t.sentAt) || 0;
  const armedAt = armedByClock(t, { now, ackMs }); // r3: the clock, not the timer's stamp
  if (!t.outcome && !sentAt && now - at < ackMs) return { code: 'in_flight', until: at + ackMs, armedAt: 0 };
  if (armedAt && armedAt + floorMs > now) return { code: 'cooldown', until: armedAt + floorMs, armedAt };
  // past the floor, an attempt nobody answered is not free: it blocks until a reading settles it (verify r1) —
  // or until it LAPSES (verify r2: the wall it was for is gone by itself; said, never silently free). THE CHAIN
  // (verify r3): the newest record may be free (a helper that never started, a refused answer) while an older
  // attempt behind it is still unsettled — that one blocks, wherever it sits in the chain
  const opts = { now, floorMs, ackMs };
  // the newest unsettled attempt that has NOT lapsed blocks, wherever it sits (a lapsed head never hides one — r3 walk);
  // only when every unsettled one has lapsed is the chain free, and the newest lapsed one is said
  let live = null, lapsedOne = null;
  for (let x = t; x; x = x.prior) { if (!isUnsettled(x, opts)) continue; if (now >= lapseAtOf(x)) { if (!lapsedOne) lapsedOne = x; } else if (!live) live = x; }
  if (live) return { code: 'unsettled', until: 0, armedAt, sinceMs: num(live.sentAt) || num(live.at) || 0, lapseAtMs: lapseAtOf(live) };
  if (lapsedOne) return { code: null, until: 0, armedAt, lapsed: { sinceMs: num(lapsedOne.sentAt) || num(lapsedOne.at) || 0, atMs: lapseAtOf(lapsedOne) } };
  return { code: null, until: 0, armedAt };
}
/**
 * rungBlockUntil(t, {now, eventKey, resetsAtSec}) — the AUTO rung's bound (ms; 0 = free): the
 * attempt's own block (above), and ONE TRY PER LIMIT EVENT: an attempt on this very event
 * (`<identity>|<stated reset>`) that ENDED — whatever it ended in, armed or not — is not retried
 * before the event's own reset (a wall restated by every failed turn must not re-ask the vendor
 * each time; the floor no longer covers a `nothingToReset`). A person's press is not bound by it.
 */
function rungBlockUntil(t, { now = Date.now(), eventKey = null, resetsAtSec = null, floorMs = RESET_CREDIT_FLOOR_MS, ackMs = RESET_CREDIT_ACK_MS } = {}) {
  const b = attemptBlock(t, { now, floorMs, ackMs });
  // an unsettled attempt holds the rung a floor at a time (the wall's own reading — every turn carries one — settles it)
  let until = b.code === 'unsettled' ? now + floorMs : (b.code ? b.until : 0);
  if (t && t.outcome && eventKey && t.eventKey === eventKey) {
    const R = num(resetsAtSec);
    const ev = R && R * 1000 > now ? R * 1000 : (num(t.outcomeAt) || now) + floorMs;
    if (ev > now) until = Math.max(until, ev);
  }
  return until > now ? until : 0;
}


// ── THE ATTEMPT LIFECYCLE, ONE CLOSED TABLE (verify r3, 2026-10-01) ─────────
// Three rounds found money holes in the same state machine, each in a different corner of the engine (the floor at
// the write, silence as not-sent, a witness-less settle, a free record hiding an unsettled one, the timer's stamp as
// the clock, a prior judged after its successor's send). The machine is now ONE pure step over the record the engine
// persists: `attemptStep(t, event, opts) → { t, effects }`. The engine's handlers are its effects (a charge, a hold
// released, a key minted, a refusal by name, a settle, the followers' walk); test-reset-credit-verdict §9 walks every
// reachable state × every event and a seeded set of length-4 sequences against six invariants, and
// test-reset-credit-ui drives the REAL engine through the same events and compares phase by phase.
//
//   PHASES (derived from the record + the clock, never stored): none · open (written, inside the ack window, not
//   sent) · sent (went out, inside the floor, no answer yet) · landed (reset) · unspent (answered, nothing spent:
//   nothingToReset / noCredit / a keyless alreadyRedeemed / error / refused-stale / skipped / superseded) · not-sent ·
//   unanswered (no answer, inside the floor) · unsettled (past the floor, no reading settled it) · lapsed (past its
//   wall's reset + grace, else 7 d — free, said) · settled (a reading settled it: not-landed / expired / untold).
//   EVENTS: press {via, origin, reportsSent, creditsAt, window, resetsAtSec} · sent · answer {payload} · skipped (the
//   helper's read-first said no) · ack-expired · floor-expired · reading {r} · clock · boot · torn · pool-move · clear.
//   A SESSION press is refused by the block (the verb would go out at once); a HELPER press over an unsettled chain
//   is ADMITTED with that attempt as its prior — its read-first settles it, and the send is refused while any prior
//   is still unsettled and not lapsed (the engine's readFirst gate).
const ATTEMPT_PHASES = Object.freeze(['none', 'open', 'sent', 'landed', 'unspent', 'not-sent', 'unanswered', 'unsettled', 'lapsed', 'settled']);
const ATTEMPT_EVENTS = Object.freeze(['press', 'sent', 'answer', 'skipped', 'ack-expired', 'floor-expired', 'reading', 'clock', 'boot', 'torn', 'pool-move', 'clear']);
// what the engine WRITES (data/reset-credit-tries.json, resetCreditTryRecord) — the phase is a function of these alone
const PERSISTED_FIELDS = Object.freeze(['key', 'at', 'sentAt', 'sid', 'via', 'origin', 'resetsAtSec', 'lane', 'eventKey', 'idempotencyKey', 'identity', 'charged', 'outcome', 'outcomeAt', 'creditsAt', 'reportsSent', 'window', 'settled', 'supersededAt']);
function persistedView(t) { if (!t || typeof t !== 'object') return null; const o = {}; for (const k of PERSISTED_FIELDS) if (t[k] !== undefined) o[k] = t[k]; o.prior = persistedView(t.prior); return JSON.parse(JSON.stringify(o)); }
/** The phase of a record NOW. `opts` = {now, floorMs, ackMs}. */
function phaseOf(t, opts = {}) {
  if (!t || typeof t !== 'object') return 'none';
  const now = num(opts.now) ?? Date.now(), floorMs = num(opts.floorMs) ?? RESET_CREDIT_FLOOR_MS, ackMs = num(opts.ackMs) ?? RESET_CREDIT_ACK_MS;
  if (t.settled) return t.outcome === 'reset' ? 'landed' : 'settled';
  if (t.outcome === 'reset') return 'landed';
  const armed = armedByClock(t, { now, ackMs });
  if (!t.outcome) {
    if (!armed) return now - (num(t.at) || 0) < ackMs ? 'open' : 'not-sent';
    if (now - armed < floorMs) return 'sent';
    return now >= lapseAtOf(t) ? 'lapsed' : 'unsettled';
  }
  if (UNSETTLED_OUTCOMES.includes(t.outcome)) return now - armed < floorMs ? 'unanswered' : (now >= lapseAtOf(t) ? 'lapsed' : 'unsettled');
  if (t.outcome === 'not-sent') return 'not-sent';
  return 'unspent';
}
// ── THE READ BEFORE A PRESS, JUDGED (verify r8 T0 — the owner's YES, ut-cdaa01aff0, 2026-10-02: a human press reads the
// account before it consumes; one more vendor read per press, only on a person's click, never the auto rung). ONE table
// for BOTH carriers — the helper's read-first (`readFirst` in src/codex-reset-helper.js) and a conversation wrapper's
// (`codex-reset-credit {readFirst:true}` → its `rate_limits_updated {beforeReset:true}` → the engine's
// `codex-reset-credit-go`). The rows, in order:
//   window-moved    the read states a window other than the one the dialog showed ⇒ no consume (what you approve is what runs)
//   prior-*         an earlier attempt on this identity is still unsettled (not lapsed) ⇒ no consume; settled landed /
//                   expired / untold ⇒ no consume (the credit was used then / the wall reset by itself / cannot be judged);
//                   only a prior settled NOT LANDED lets the consume through
//   read-failed     the read itself failed ⇒ the consume STILL goes out, on the count the dialog showed (a failed read
//                   never blocks a human's press — but it is said); with an unsettled prior the rows above refuse first
//   no-credits      the read counts zero credits ⇒ no consume, said (`no_credits`)
//   go              everything else
/** preConsumeVerdict(t, {readOk, freshWindow, freshCount, now, floorMs, ackMs}) → {go, why, window?, prior?}
 *  `t` = the OPEN attempt (its `resetsAtSec` = the window shown, its `prior` chain), `readOk` false = the read failed,
 *  `freshWindow` = the reading's reset instant for the attempt's bucket (null = none stated), `freshCount` = the read's
 *  stored credit count (null = none carried). PURE: the priors are judged as they stand (the caller settled them by the
 *  reading first). */
function preConsumeVerdict(t, { readOk = true, freshWindow = null, freshCount = null, now = Date.now(), floorMs = RESET_CREDIT_FLOOR_MS, ackMs = RESET_CREDIT_ACK_MS } = {}) {
  const o = { now, floorMs, ackMs };
  const x0 = t && typeof t === 'object' ? t : {};
  const shown = num(x0.resetsAtSec) || 0;
  if (readOk !== false && freshWindow !== null && num(freshWindow) !== null && shown > 0 && num(freshWindow) !== shown) return { go: false, why: 'window-moved', window: num(freshWindow) };
  for (let x = x0.prior; x; x = x.prior) {
    if (now >= lapseAtOf(x)) continue; // LAPSED (its wall gone by itself): blocks nothing — whatever this very reading just said about it
    if (isUnsettled(x, o)) return { go: false, why: 'prior-unsettled', prior: x };
    if (!x.settled || x.settled.how !== 'not-landed') return { go: false, why: `prior-${(x.settled && x.settled.how) || 'unknown'}`, prior: x };
  }
  if (readOk === false) return { go: true, why: 'read-failed' };
  if (freshCount !== null && num(freshCount) !== null && num(freshCount) <= 0) return { go: false, why: 'no-credits' };
  return { go: true, why: null };
}
const PRE_CONSUME_WHY = Object.freeze(['window-moved', 'prior-unsettled', 'prior-landed', 'prior-expired', 'prior-untold', 'prior-unknown', 'read-failed', 'no-credits']);
const cloneChain = (t) => (t ? { ...t, settled: t.settled ? { ...t.settled } : null, prior: cloneChain(t.prior) } : null);
let ATTEMPT_KEY_SEQ = 0;
/**
 * attemptStep(t, ev, opts) → { t: the record after (a new chain; the input is never written), effects }
 *   effects = { charge (the spend ledger notes it — once per attempt, ever), release (the hold given back), minted (a new
 *   key went out — only over a free chain), refused (the block's code, by name), settle (the outcome / the reading's
 *   verdict), walk (the auto leader / the followers walk the switch-wait ladder), notice, dropped (a torn file) }
 * The engine's handlers do exactly this: openResetCreditTry = press; noteResetCreditSent / onResetCreditSentRecord =
 * sent; handleResetCreditResult = answer; onResetCreditNotSent / onResetCreditUnknown = ack-expired; the floor timer =
 * floor-expired; settleResetCreditByReading = reading; loadResetCreditTries = boot / torn.
 */
function attemptStep(t0, ev, opts = {}) {
  const now = num(ev && ev.now) ?? num(opts.now) ?? Date.now();
  const o = { now, floorMs: num(opts.floorMs) ?? RESET_CREDIT_FLOOR_MS, ackMs: num(opts.ackMs) ?? RESET_CREDIT_ACK_MS };
  const fx = { charge: false, release: false, minted: false, refused: null, settle: null, walk: false, notice: null, dropped: false, late: false, reopened: false };
  let t = cloneChain(t0 && typeof t0 === 'object' ? t0 : null);
  const charge = (x) => { if (!x.charged) { x.charged = true; fx.charge = true; } x.hold = false; };
  const release = (x) => { if (x.hold && !x.charged) { x.hold = false; fx.release = true; } };
  const e = ev && typeof ev === 'object' ? ev : {};
  switch (e.type) {
    case 'press': {
      const b = attemptBlock(t, o);
      const helper = e.via === 'helper';
      if (b.code && !(helper && b.code === 'unsettled')) { fx.refused = b.code; break; }
      const key = String(e.key || 'k');
      // verify r8 T0: `readFirst` = the carrier reads the account BEFORE its consume (the helper always since the owner's
      // yes; a session wrapper that advertises it) — its open head takes the reading's count, and a `skipped` ends it
      t = { key, at: now, sentAt: 0, sid: helper ? null : (e.sid || 'cx1'), via: helper ? 'helper' : 'session', origin: e.origin === 'auto' ? 'auto' : 'user', resetsAtSec: num(e.resetsAtSec) || 0, lane: null, eventKey: `${key}|${num(e.resetsAtSec) || '?'}`, idempotencyKey: e.idemKey || `k-${++ATTEMPT_KEY_SEQ}`, hold: true, identity: { key, name: key }, charged: false, outcome: null, outcomeAt: 0, creditsAt: num(e.creditsAt), reportsSent: e.reportsSent !== false, window: e.window && num(e.window.resetsAtSec) > 0 ? { resetsAtSec: num(e.window.resetsAtSec), periodSec: num(e.window.periodSec) } : null, settled: null, readFirst: helper || e.readFirst === true, prior: priorForPress(t, o) };
      fx.minted = true; break;
    }
    case 'sent': {
      if (!t) break;
      if (t.sentGuessed) { t.sentGuessed = false; t.sentAt = 0; } // verify r10: a REAL send over a boot's guessed one (the wrapper's own `reset_credit_sent`, read back from its file at its instant) — the floor runs from it
      if (t.sentAt) break;
      // the helper's readFirst gate: no send while a prior is unsettled and not lapsed (it read first; the reading did not tell)
      for (let x = t.prior; x; x = x.prior) if (isUnsettled(x, o) && now < lapseAtOf(x)) { fx.refused = 'unsettled-prior'; break; }
      if (fx.refused) break;
      if (t.outcome === 'not-sent') { t.outcome = null; t.outcomeAt = 0; } // a late "sent": the request did go out after all
      t.sentAt = now; charge(t); t.prior = supersede(t.prior, now, o); break;
    }
    case 'skipped': { // the carrier read first and did not consume (the prior had landed, the window moved, no credits, or the reading could not tell)
      if (!t || t.outcome || t.sentAt || !(t.via === 'helper' || t.readFirst === true)) break;
      release(t); t.outcome = 'skipped'; t.outcomeAt = now; fx.settle = 'skipped'; break;
    }
    case 'answer': {
      if (!t) break;
      const ans = creditAnswerOf(e.payload || {});
      // verify r4: an answer that echoes a KEY belongs to that attempt wherever it sits in the chain — and to nothing
      // else: a late answer for an attempt the chain no longer tracks (settled, dropped at a later send) changes no
      // record (`late`: charged at its send already; a `reset` is said and resolves the cards — the engine's effects)
      const k = e.payload && typeof e.payload.idempotencyKey === 'string' && e.payload.idempotencyKey ? e.payload.idempotencyKey : null;
      let x = t;
      if (k && e.keyed !== false) { x = null; for (let y = t; y; y = y.prior) if (y.idempotencyKey === k) { x = y; break; } if (!x) { fx.late = true; fx.settle = ans.outcome === 'reset' ? 'late-reset' : null; break; } }
      if (ans.sent && !x.sentAt) { x.sentAt = now; charge(x); x.prior = supersede(x.prior, now, o); }
      if (ans.sent && x.sentGuessed) x.sentGuessed = false; // verify r10: an answer that proves a send ends the boot's guess — the earliest-known instant stays (only a `sent` record carries the instant)
      if (!ans.sent) release(x);
      if (!ans.sent && ans.outcome === 'skipped' && x.outcome === 'unknown' && x.revivedAt && x.sentGuessed) { x.sentAt = 0; x.sentGuessed = false; x.settled = null; } // verify r9 ②: the wrapper's word (nothing sent) over a boot's guess — verify r10: only while the SEND is the guess (a sent record's `skipped` is nobody's)
      if (ans.outcome === 'reset') { x.outcome = 'reset'; x.outcomeAt = now; x.settled = null; fx.settle = 'reset'; break; }
      if (x.outcome) { if (x.outcome !== ans.outcome) { x.outcome = ans.outcome; x.outcomeAt = now; } } // a late answer states the true outcome
      else { x.outcome = ans.outcome; x.outcomeAt = now; fx.walk = x.origin === 'auto'; }
      fx.settle = ans.outcome; break;
    }
    case 'ack-expired': {
      if (!t || t.outcome || t.sentAt || now - (num(t.at) || 0) < o.ackMs) break;
      if (t.reportsSent === false) { t.sentAt = t.at; charge(t); t.outcome = 'unknown'; t.outcomeAt = now; t.prior = supersede(t.prior, t.at, o); }
      else { release(t); t.outcome = 'not-sent'; t.outcomeAt = now; }
      fx.walk = t.origin === 'auto'; fx.settle = t.outcome; break;
    }
    case 'floor-expired': {
      if (!t || t.outcome || !t.sentAt || now - t.sentAt < o.floorMs) break;
      t.outcome = 'no-answer'; t.outcomeAt = now; fx.walk = t.origin === 'auto'; fx.settle = 'no-answer'; break;
    }
    case 'reading': {
      // verify r9 ② (reproduced): the read a reads-first wrapper pushed for a press revived `unknown` at a boot (`beforeReset` + its
      // key) proves nothing went out — the record is RE-OPENED (the press instant = now: the in_flight window covers the go's
      // flight), the boot's charge stands, and this reading then judges it like any press (the engine: reopenRevivedReadFirst)
      // verify r10 ② (reproduced): only while the SEND is the boot's guess (`sentGuessed`) — a record SENT before the restart is never re-opened by a replayed push
      if (t && e.beforeReset === true && t.outcome === 'unknown' && t.revivedAt && t.sentGuessed === true && t.readFirst === true && (!e.idemKey || e.idemKey === t.idempotencyKey)) { t.pressedAt = t.pressedAt || t.at; t.at = now; t.reopenedAt = now; t.outcome = null; t.outcomeAt = 0; t.sentAt = 0; t.settled = null; fx.reopened = true; }
      for (let x = t; x; x = x.prior) {
        // verify r5 (the read-first seam): a helper press still OPEN (read first, not yet sent) takes the reading's count as
        // the count AT ITS SEND — the cached count the press carried was the r3 LOW (a credit granted between the cached
        // reading and the press made an unanswered consume read "not landed")
        if (x === t && (x.via === 'helper' || x.readFirst === true) && !x.sentAt && !x.outcome && num(e.r && e.r.creditsLeft) !== null) x.creditsAt = num(e.r.creditsLeft);
        if (!isUnsettled(x, o)) continue;
        const r = settleByReading(x, e.r || {}, o);
        if (!r) continue;
        x.settled = { how: r.how, why: r.why, at: num(e.r && e.r.fetchedAt) || now };
        if (r.how === 'landed') { x.outcome = 'reset'; x.outcomeAt = now; }
        fx.settle = r.how;
      }
      break;
    }
    case 'boot': { // the process died: a record with no outcome may have gone out — unknown, charged by its identity
      // verify r10 ②: WHICH half is the guess — a record with no send on file has its SEND guessed (`sentGuessed`); one sent before the boot keeps its send as a fact
      for (let x = t; x; x = x.prior) { x.hold = false; if (!x.outcome) { x.sentGuessed = !x.sentAt; x.sentAt = x.sentAt || x.at; x.outcome = 'unknown'; x.outcomeAt = now; charge(x); x.revivedAt = now; } if (x.sentAt) x.prior = supersede(x.prior, x.sentAt, o); }
      break;
    }
    case 'torn': { if (t) { fx.dropped = true; fx.notice = 'attempts-unreadable'; } t = null; break; }
    case 'clock': case 'pool-move': case 'clear': break; // the clock moves on its own; the pool's link and a cleared record change no attempt
    default: throw new Error(`attemptStep: not an attempt event: ${String(e.type)}`);
  }
  return { t, effects: fx };
}

/** The refusal reason in words (journal / tooltip). */
function reasonText(reason) {
  switch (reason) {
    case 'wall-use-now': return 'at the wall — a re-opened window is worth most now';
    case 'above-knee': return 'enough time left to burn a whole week again';
    case 'use-by-imminent': return 'the grant lapses within a day';
    case 'replenishes': return 'the grant is re-issued weekly (unused is lost)';
    case 'unknown-vendor': return 'no reset-credit semantics known for this harness';
    case 'no-wall': return 'no usage limit was hit (never spent proactively)';
    case 'no-credits': return 'no stored reset credits';
    case 'grant-expired': return 'the reset grant has expired';
    case 'cooldown': return 'a reset credit was already tried for this limit';
    case 'cold-switch-first': return 'the conversation is cold — switching accounts comes first';
    case 'last-credit-low-value': return 'the last credit, with less than a tenth of a window left';
    case 'below-knee-keep': return 'too little time left to use a full refill — kept';
    case 'burn-unknown': return 'no burn rate known — kept';
    default: return String(reason || 'unknown');
  }
}

module.exports = {
  CREDIT_FLOOR, USE_BY_IMMINENT_SEC, VENDORS, LADDER_POSITIONS, REASONS, MODES, REFUSAL_CODES,
  resetCreditVerdict, offerOf, kneeSec, windowPaceRate, describeUse, reasonText, fmtWait,
  dialogModel, refusalLine, rosterResetOffer, // p2: the ONE confirm dialog's sentences + the roster chip (client, DOM-free)
  // lane reset-path: when an attempt arms the floor (only a consume that went out), the auto rung's one-try-per-event bound, the helper path's words
  RESET_CREDIT_FLOOR_MS, RESET_CREDIT_ACK_MS, ATTEMPT_OUTCOMES, FLOOR_OUTCOMES, VENDOR_OUTCOMES, HELPER_WHY,
  creditAnswerOf, outcomeArmsFloor, attemptBlock, rungBlockUntil, helperLine,
  // verify r1: the unknown consume — unsettled after the floor until a reading says whether it landed
  UNSETTLED_OUTCOMES, isUnsettled, unsettledInChain, priorForPress, armedByClock, settleByReading, unsettledLine,
  // verify r2: the lapse (the wall it was for is gone), the clock grace, the untold attempt's line
  RESET_GRACE_SEC, RESET_CREDIT_LAPSE_MS, lapseAtOf, isLapsed, lapsedLine, supersede,
  // verify r8 T0: the read before every press — ONE verdict table for the helper's read-first and the wrapper's
  preConsumeVerdict, PRE_CONSUME_WHY,
  // lane reset-path R3: the card the credit outlived — resolved on the message, said in one line
  RESOLVE_HOW, resolvedOf, offerResolution, resetCreditCardView,
  // verify r3: the attempt lifecycle as ONE closed table (the phases, the events, the persisted view, the step)
  ATTEMPT_PHASES, ATTEMPT_EVENTS, PERSISTED_FIELDS, persistedView, phaseOf, attemptStep,
};
