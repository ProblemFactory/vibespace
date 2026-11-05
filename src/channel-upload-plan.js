'use strict';
/**
 * channel-upload-plan.js — PURE: WHEN a channel adapter tries a file's upload again (lane channel-upload-retry, userW
 * inc-mw35tppf-jrvo, 2026-11-05: files.slack.com answered one file's bytes HTTP 504 and the reply stopped "partly sent").
 * ONE law for the Slack bytes POST (src/channels/slack.js `uploadFile`) and Lark's im/v1 upload (src/channels/lark.js
 * `upload`): a TRANSPORT failure of the upload (a 5xx, a network error, the attempt's timeout) is tried again, at most
 * UPLOAD_ATTEMPTS in all, and
 *   - the wait between two attempts is 1 s then 3 s, each jittered ±20 % (`backoffMs`);
 *   - r2 F1: never inside a wait the VENDOR named. A failure carrying Retry-After / the vendor's reset
 *     (`detail.retryAfterSec`) waits AT LEAST that long; a named wait over UPLOAD_WAIT_MAX_MS is no brief error, so no
 *     attempt is made and the failure is said now with its `retryAfterSec` (the outbox / the owner wait it, as the base did);
 *   - r2 F3: never past the send's BUDGET. The caller's remaining time (`budgetMs` on the adapter's send; `commandBudgetMs`
 *     / OUTBOX_SEND_BUDGET_MS say what each lane brings) bounds the chain. A retry is made only if its wait plus
 *     UPLOAD_MIN_WINDOW_MS fit, and its window is min(UPLOAD_WINDOW_MS, what is left). The FIRST attempt is the base's own
 *     request with its own 60 s; the budget bounds only what a retry adds.
 *   - r3 m1/m2: EVERY request a retry makes reads its window right BEFORE it leaves — after its bucket, its pace, Lark's
 *     token — from `windowMs`: Slack's URL ask gets min(its own 20 s, what is left − UPLOAD_MIN_WINDOW_MS) (it leaves the
 *     bytes their minimum), the bytes / Lark's upload min(60 s, what is left); under UPLOAD_MIN_WINDOW_MS the request is
 *     not sent (no unit metered, no URL minted) and the upload stops on the budget, «(after n − 1 attempts (budget))».
 * A failure that stopped says why in its words (`stopWords`): «(after 3 attempts)» (the count), «(after 2 attempts
 * (budget))» (the budget), «(after 1 attempt (budget) — Retry-After 30 s)» (a vendor wait that did not fit).
 * Reads no clock and no randomness of its own: every instant and the jitter source are handed in. Imports nothing.
 * Gate: scripts/test-channel-send-files.mjs ⑫ (R⑧–R⑮) + ⑫b (F1 F2 F3, r3 m1 m2, their patched-copy controls).
 */

const UPLOAD_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = Object.freeze([1000, 3000]);
const UPLOAD_WINDOW_MS = 60000;        // one attempt's own window: the base's bytes / upload timeout
const UPLOAD_MIN_WINDOW_MS = 5000;     // a retry is made only if at least this much window is left after its wait
const UPLOAD_WAIT_MAX_MS = 10000;      // the longest wait a send sits through between attempts (a vendor naming more: no retry)
/** What an agent's waiting command brings (r2 F3): the CLI's write budget (= src/cli-call.js BUDGETS.write, pinned
 *  equal by the gate), less SEND_BUDGET_RESERVE_MS for what the send does after the chain (the completing call, the
 *  outcome write, the receipt). Nobody's command waits on an outbox send: it brings OUTBOX_SEND_BUDGET_MS. */
const CLI_WRITE_BUDGET_MS = 30000;
const SEND_BUDGET_RESERVE_MS = 2000;
const OUTBOX_SEND_BUDGET_MS = 120000;

const clamp01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));
/** The wait after failed attempt n (1-based): 1 s then 3 s, ±20 % by `random()` ∈ [0, 1). */
function backoffMs(n, random = Math.random) {
  return Math.round(UPLOAD_BACKOFF_MS[Math.min(Math.max(1, n), UPLOAD_BACKOFF_MS.length) - 1] * (0.8 + 0.4 * clamp01(random())));
}
/** The deadline a send's budget sets on the adapter's clock; no budget handed (null / not a number) = none (Infinity). */
function deadlineOf(budgetMs, now) {
  const b = budgetMs === null || budgetMs === undefined || budgetMs === '' ? NaN : Number(budgetMs);
  return Number.isFinite(b) ? Number(now) + Math.max(0, b) : Infinity;
}
/** The window (ms) of one request of attempt n, read at `now` = the instant it leaves: the first attempt's is its own
 *  (`ownMs`, the base's — the bytes' / upload's UPLOAD_WINDOW_MS); a retry's is what the budget has left less what a LATER
 *  request of the same attempt needs (`leaveMs` — Slack's URL ask leaves the bytes UPLOAD_MIN_WINDOW_MS), capped at
 *  `ownMs`, and 0 when that is under UPLOAD_MIN_WINDOW_MS (r3: the request is not sent). */
function windowMs(n, now, deadline = Infinity, { ownMs = UPLOAD_WINDOW_MS, leaveMs = 0 } = {}) {
  if (n <= 1) return ownMs;
  const left = Number(deadline) - Number(now) - leaveMs;
  return left >= UPLOAD_MIN_WINDOW_MS ? Math.min(ownMs, left) : 0;
}
/** After attempt n failed in transport: `{ go: true, waitMs }` (wait, then attempt n + 1), or `{ go: false, stop }` where
 *  `stop` is 'count' (UPLOAD_ATTEMPTS made) or 'budget' (the wait the next attempt needs, the vendor's included, does not
 *  fit the send's budget or is longer than UPLOAD_WAIT_MAX_MS). */
function nextTry({ n, retryAfterSec = null, random = Math.random, now = 0, deadline = Infinity } = {}) {
  if (n >= UPLOAD_ATTEMPTS) return { go: false, stop: 'count' };
  const named = Number(retryAfterSec) > 0 ? Math.ceil(Number(retryAfterSec) * 1000) : 0;
  const waitMs = Math.max(backoffMs(n, random), named);
  if (waitMs > UPLOAD_WAIT_MAX_MS || Number(now) + waitMs + UPLOAD_MIN_WINDOW_MS > Number(deadline)) return { go: false, stop: 'budget', waitMs };
  return { go: true, waitMs };
}
/** The words a stopped upload's failure ends with (appended to the vendor's own message). */
function stopWords({ n, stop = 'count', retryAfterSec = null } = {}) {
  const tries = `after ${n} attempt${n === 1 ? '' : 's'}`;
  if (stop !== 'budget') return `(${tries})`;
  const named = Number(retryAfterSec) > 0 ? ` — Retry-After ${Math.ceil(Number(retryAfterSec))} s` : '';
  return `(${tries} (budget)${named})`;
}
/** What an agent's WAITING command brings to its send (ms): the CLI's write budget, or the outbox's collect window when
 *  the command reads the receipt inline and the window is shorter (a send that ends past it has its receipt sent as a
 *  message instead), less the reserve. The caller sets the deadline at the proposal's own instant. */
function commandBudgetMs({ collectWindowMs = null } = {}) {
  const c = Number(collectWindowMs);
  return Math.max(0, Math.min(CLI_WRITE_BUDGET_MS, c > 0 ? c : Infinity) - SEND_BUDGET_RESERVE_MS);
}
/** The budget a send hands its adapter (ms): what is left before the command's deadline, else the outbox's own. */
function sendBudgetMs(deadline, now) {
  return deadline === null || deadline === undefined || !Number.isFinite(Number(deadline)) ? OUTBOX_SEND_BUDGET_MS : Math.max(0, Number(deadline) - Number(now));
}

module.exports = {
  UPLOAD_ATTEMPTS, UPLOAD_BACKOFF_MS, UPLOAD_WINDOW_MS, UPLOAD_MIN_WINDOW_MS, UPLOAD_WAIT_MAX_MS,
  CLI_WRITE_BUDGET_MS, SEND_BUDGET_RESERVE_MS, OUTBOX_SEND_BUDGET_MS,
  backoffMs, deadlineOf, windowMs, nextTry, stopWords, commandBudgetMs, sendBudgetMs,
};
