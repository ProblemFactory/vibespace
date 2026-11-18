'use strict';
// WHY A SESSION STOPPED — A FACT OF THE SESSION (lane auto-resume-bulk, .349; userW's fleet, 2026-10-23: dozens of
// its conversations stopped the same day on usage walls with auto-resume off, and nobody will open and resume them one
// by one). Before this nothing remembered it: the wall machine's `_turnWallSigs` die with the turn, and the auto-resume
// core's armed map is filled only when auto-resume is ON (`armIfEnabled` returns at its first line otherwise) — so a
// session the wall took with the feature off looked exactly like one that had finished its work.
//
// THE FACT: `stoppedBy: { kind: 'quota' | 'overload', at, resetsAt?, memberId?, said }` on the session (persisted in its
// session-meta, carried on the live list), written at the turn end that stopped it and CLEARED by the next turn that
// runs. Everything here is PURE — the verdict from signals the core ALREADY has (never a second parser), the live
// list's fact, and the words the card and the filter print.
//   quota     the wall machine's own walled-turn verdict (usage-pool-engine onWalledTurn: a turn whose wall signals the
//             turn end confirmed) — its stated reset and the slot it landed on ride along, nothing is re-read
//   overload  a turn the harness ended because the model was overloaded, from a field the harness already TYPES:
//             claude's synthetic assistant record carries `error`, an enum the CLI fills from the HTTP status (2.1.308:
//             529 or `overloaded_error` → "overloaded", 429 → "rate_limit"), declared on the stream union in
//             src/record-shape.js; codex's task_failed carries `codexErrorInfo` (app-server 0.153.4 `serverOverloaded`).
//             WHICH values mean "overloaded" is the HARNESS's declared row (`quota.overloadErrors`, read through
//             harnesses.overloadErrorsOf) — handed in here, never a backend id. No text is matched.
// PURE: imports nothing. Words go through the caller's `t` (the client's dictionaries hold zh/ja; test-stopped-by pins
// every key below in src/lib/i18n-zh.js and src/lib/i18n-ja.js).

const STOP_KINDS = Object.freeze(['quota', 'overload']);
const SAID_MAX = 200;
const canon = (x) => String(x || '').toLowerCase().replace(/[_-]/g, '');
const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);

/** The harness's own line, bounded — one line, ≤ SAID_MAX characters. */
function boundSaid(text) {
  if (typeof text !== 'string') return null;
  const one = text.replace(/\s+/g, ' ').trim();
  if (!one) return null;
  return one.length > SAID_MAX ? one.slice(0, SAID_MAX - 1) + '…' : one;
}

/** Does this TYPED error say the model was overloaded? `declared` = the harness's quota.overloadErrors (compared
 *  case- and separator-insensitively, like codex-quota canonInfo: one variant, two spellings). */
function isOverloadError(declared, error) {
  if (!error || !Array.isArray(declared) || !declared.length) return false;
  const c = canon(error);
  return declared.some((d) => canon(d) === c);
}

/** THE VERDICT at a turn end. `walled` = the wall machine's walled-turn classification (it outranks everything: a turn
 *  the wall ended is a quota stop whatever else it said); else the turn's LAST typed error decides overload; else null
 *  (the turn ended for any other reason — nothing to mark). */
function stopVerdict({ walled = false, resetsAt = 0, memberId = null, lastError = null, overloadErrors = [], said = null, at = Date.now() } = {}) {
  if (walled) {
    const out = { kind: 'quota', at: num(at) || Date.now(), resetsAt: num(resetsAt) || null, memberId: memberId ? String(memberId) : null, said: boundSaid(said) };
    return out;
  }
  if (isOverloadError(overloadErrors, lastError)) return { kind: 'overload', at: num(at) || Date.now(), said: boundSaid(said) };
  return null;
}

/** A persisted / relayed value, re-validated (a meta written by an older or newer build must not reach a card raw). */
function normalizeStoppedBy(x) {
  if (!x || typeof x !== 'object' || !STOP_KINDS.includes(x.kind) || !num(x.at)) return null;
  const out = { kind: x.kind, at: num(x.at), said: boundSaid(x.said) };
  if (x.kind === 'quota') { out.resetsAt = num(x.resetsAt) || null; out.memberId = x.memberId ? String(x.memberId) : null; }
  return out;
}

/** THE LIVE LIST'S FACT (server.js activeSessionsPayload): the session's stop re-validated, with its auto-continue state for
 *  the card's switch — `status` = the auto-resume core's statusFor(id) ({resume, enabled, armed, watch}). No switch
 *  (`autoResume: null`) where it can promise nothing: a harness that cannot continue a turn (no `resume`), and an OVERLOAD
 *  (auto-continue waits for a usage limit's reset — it never arms on an overload). `waiting` = the core holds a wait for
 *  this stop (armed, or watching for a fresh window): ON without it is said as such on the card. null when not stopped. */
function liveFactOf(sb, status = null) {
  const f = normalizeStoppedBy(sb);
  if (!f) return null;
  const can = !!(status && status.resume) && f.kind === 'quota';
  return { ...f, autoResume: can ? !!status.enabled : null, waiting: can ? !!(status.armed || status.watch) : false };
}

/** THE FILTER PREDICATE — the sidebar's «stopped by a limit or overload» filter and the bulk resume's candidate set. */
function isStoppedBy(row) { return !!(row && normalizeStoppedBy(row.stoppedBy)); }

// ── THE WORDS ────────────────────────────────────────────────────────────────
const plain = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tOf = (tIn) => (typeof tIn === 'function' ? (s, p) => tIn(s, p) : plain);
/** The clock a word prints a time with: the CALLER's — the page hands page-time's stampAt (the ONE formatter a person reads,
 *  test-ui-language ⑦); this fallback (an ISO instant) is what a caller that hands none would see, never a hand-built hh:mm. */
const isoClock = (ms) => new Date(ms).toISOString();

/** The card's chip: {text, tip, toggle, cls}. «因用量停止 · 重置 14:00» / «模型过载 · 停于 13:42», and the auto-resume
 *  state beside it («自动继续：开/关»). `autoResumeOn` null = this harness cannot continue a turn (no toggle drawn). */
function chipWords(sb, tIn, { now = Date.now(), autoResumeOn = null, waiting = null, clock = isoClock } = {}) {
  const f = normalizeStoppedBy(sb);
  if (!f) return null;
  const t = tOf(tIn);
  let text;
  if (f.kind === 'quota') {
    text = !f.resetsAt ? t('Stopped by a usage limit')
      : f.resetsAt > now ? t('Stopped by a usage limit · resets {time}', { time: clock(f.resetsAt, now) })
        : t('Stopped by a usage limit · the limit has reset');
  } else {
    text = t('Model overloaded · stopped {time}', { time: clock(f.at, now) });
  }
  const toggle = autoResumeOn === null ? null : (autoResumeOn ? (waiting === false ? t('Auto-continue: on · not waiting for this limit') : t('Auto-continue: on')) : t('Auto-continue: off'));
  const lines = [text];
  if (f.said) lines.push(t('The harness said: {said}', { said: f.said }));
  lines.push(t('This mark stays until the session runs again.'));
  return { text, tip: lines.join(' · '), toggle, cls: f.kind === 'quota' ? 'quota' : 'overload' };
}

/** The filter row's entry. */
function filterWords(n, tIn) { return tOf(tIn)('Stopped by a limit or overload ({n})', { n: Number(n) || 0 }); }

/** Every key the words above can print — test-stopped-by holds zh + ja to it. */
const WORD_KEYS = Object.freeze([
  'Stopped by a usage limit', 'Stopped by a usage limit · resets {time}', 'Stopped by a usage limit · the limit has reset',
  'Model overloaded · stopped {time}', 'Auto-continue: on', 'Auto-continue: off', 'The harness said: {said}',
  'This mark stays until the session runs again.', 'Stopped by a limit or overload ({n})', 'Auto-continue: on · not waiting for this limit',
]);

module.exports = {
  STOP_KINDS, SAID_MAX, WORD_KEYS,
  boundSaid, isOverloadError, stopVerdict, normalizeStoppedBy, liveFactOf, isStoppedBy,
  chipWords, filterWords,
};
