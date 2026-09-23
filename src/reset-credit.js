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
  return out;
}

// ── THE MANUAL USE (p2, design-reset-credits §5) ─────────────────────────────
// The three entry points (the Manage Agents roster's "Use…", the wall / arm
// card's button, the ask-mode For-you item) open ONE confirm dialog; what it
// SAYS is decided here, DOM-free, so the sentence builder is a table test.
// `preview` is the server's answer to GET /api/accounts/:id/reset-credit:
//   {key, name, vendor, creditsLeft, resetsAtSec, periodSec, remainingPct,
//    sessionId, cooldownUntilSec, code?}
// `code` = the refusal the POST would answer, BY NAME (REFUSAL_CODES).
const REFUSAL_CODES = Object.freeze(['not_supported', 'no_live_session', 'no_credits', 'cooldown', 'spend_refused', 'restart_pending']);
/** The refusal in words, as structure `{key, params}` (the client runs t()). */
function refusalLine(code, { until = null, why = null, member = null } = {}) {
  switch (code) {
    case 'not_supported': return { key: i18nKey('This agent offers no reset-credit interface VibeSpace can use.'), params: {} };
    case 'no_live_session': return { key: i18nKey('Needs a running chat session on this account — the credit is spent through that session’s own CLI. Start one, then try again.'), params: {} };
    case 'no_credits': return { key: i18nKey('This account has no stored reset credits.'), params: {} };
    case 'cooldown': return until
      ? { key: i18nKey('A reset credit was already tried on this account in the last 10 minutes — try again after {until}.'), params: { until } }
      : { key: i18nKey('A reset credit was already tried on this account in the last 10 minutes.'), params: {} };
    // r5: the only carrier's cold restart WENT OUT — the verb would ride a process a client is replacing
    case 'restart_pending': return { key: i18nKey('The only conversation holding this login is being restarted onto {member} — a credit sent through it could be lost. Try again from another conversation on this account.'), params: { member: String(member || '?') } };
    case 'spend_refused': return { key: i18nKey('The unattended-spend ceiling refused it: {why}'), params: { why: String(why || '?') } };
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
function dialogModel(p, { nowSec = Math.floor(Date.now() / 1000), fmtTime = isoMinute } = {}) {
  const pv = p && typeof p === 'object' ? p : {};
  const now = num(nowSec) ?? Math.floor(Date.now() / 1000);
  const R = num(pv.resetsAtSec), q = num(pv.remainingPct);
  const vendor = VENDORS.includes(pv.vendor) ? pv.vendor : null;
  const lines = [{ key: i18nKey('Account: {account}'), params: { account: String(pv.name || pv.key || '?') } }];
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
  const refusal = code ? refusalLine(code, { until: num(pv.cooldownUntilSec) ? fmtTime(num(pv.cooldownUntilSec)) : null, why: pv.error || null, member: rp ? (rp.name || rp.id || null) : null }) : null;
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
};
