'use strict';
// CODEX QuotaSignalSource (harness S4, docs/design-harness-plugins.md §2.4):
// everything the quota/pool engine needs to know about HOW the codex harness
// reports quota, in one object — the engine consults the harness registry,
// never a backend-id branch. Contract (shared by every harness):
//   normalize(raw, fetchedAt)  → {fiveHour, sevenDay, scopedWeekly?, …} | null
//   signalFromStream(record)   → a typed wall/quota signal | null
//   probe                      → capsOf(id).quotaProbe rung name | null
//   classifyAuthFailure(info)  → boolean (auth-class failure the pool routes around)
// PURE by construction (no I/O — every reading is passed in): the same file
// may run in the orchestrator, a test, or the device daemon.
//
// normalize() is the former usage-routes.js normalizeCodexRateLimit, moved
// here VERBATIM (2.368.18 P0 semantics: windows classify by LENGTH never by
// primary/secondary position; every exhaustion marker survives). The
// usage-routes export of the same name still resolves to THIS function.
const { capsOf } = require('../backend-caps.js');

function normalizeCodexRateLimit(raw, fetchedAt = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  // Windows are classified by their LENGTH, never by primary/secondary
  // position (P0 fix, design-backend-parity.md §0): codex 0.149.x switched to
  // a SINGLE-window shape where `primary` IS the weekly window (10080min,
  // secondary null) — the old positional mapping labeled weekly usage as the
  // 5h bucket on every current reading. Field names also differ per channel:
  // rollout snake_case `window_minutes`, live app-server push
  // `windowDurationMins` — read all three.
  const toWindow = (entry, fallbackWindowMinutes) => {
    if (!entry || typeof entry !== 'object') return null;
    const usedPercent = Number(entry.used_percent ?? entry.usedPercent);
    const normalizedPercent = Number.isFinite(usedPercent)
      ? Math.max(0, Math.min(100, usedPercent))
      : 0;
    return {
      utilization: normalizedPercent / 100,
      usedPercent: normalizedPercent,
      windowMinutes: Number(entry.window_minutes ?? entry.windowMinutes ?? entry.windowDurationMins ?? entry.window_duration_mins) || fallbackWindowMinutes || 0,
      resetsAt: Number(entry.resets_at ?? entry.resetsAt) || 0,
    };
  };

  let fiveHour = null, sevenDay = null;
  const bucketOfPos = {}; // raw position → the bucket it classified into
  for (const [pos, entry, fallback] of [['primary', raw.primary, 300], ['secondary', raw.secondary, 10080]]) {
    const w = toWindow(entry, fallback);
    if (!w) continue;
    // ≤ 8h = the burst window; anything longer = the weekly lane
    if (w.windowMinutes && w.windowMinutes <= 480) { if (!fiveHour) { fiveHour = w; bucketOfPos[pos] = w; } }
    else if (!sevenDay) { sevenDay = w; bucketOfPos[pos] = w; }
  }
  if (!fiveHour && !sevenDay) return null;

  // Exhaustion markers used to be DROPPED here — they are the entire signal a
  // pool auto-switch gates on (rate_limit_reached_type names WHICH raw window
  // tripped; spend_control/credits are the monthly-cap lane).
  const reached = raw.rate_limit_reached_type ?? raw.rateLimitReachedType ?? null;
  const spendControl = raw.spend_control_reached ?? raw.spendControlReached ?? null;
  const credits = raw.credits && typeof raw.credits === 'object' ? {
    hasCredits: !!(raw.credits.has_credits ?? raw.credits.hasCredits),
    unlimited: !!(raw.credits.unlimited),
    balance: String(raw.credits.balance ?? ''),
  } : null;
  if (reached && bucketOfPos[reached]) {
    const w = bucketOfPos[reached]; // tripped window reads as dead, whatever its %
    w.utilization = 1; w.usedPercent = 100; w.status = 'limited';
  }

  return {
    limitId: raw.limit_id || raw.limitId || 'codex',
    limitName: raw.limit_name || raw.limitName || '',
    planType: raw.plan_type || raw.planType || '',
    fiveHour,
    sevenDay,
    rateLimitReachedType: reached,
    spendControlReached: spendControl,
    credits,
    fetchedAt: Number(fetchedAt) || Date.now(),
  };
}

// The typed exhaustion enum the wrapper forwards on task_failed (codex
// `codex_error_info`; the UsageLimitReachedError family) — the pool
// auto-switch / auto-resume trigger. Lives HERE (the harness owns its own
// vocabulary); the engine only ever sees the classified signal.
const EXHAUSTION_RE = /^(usage_limit_reached|quota_exceeded|usage_not_included|workspace_owner_usage_limit_reached|workspace_member_usage_limit_reached|workspace_member_credits_depleted)$/;

// Which normalized window a `rate_limit_reached_type` tripped (the engine's
// exact rule since 2.368.20: primary→the burst window when present, else the
// weekly; secondary→the weekly, else the burst).
function trippedWindow(snap) {
  if (!snap || !snap.rateLimitReachedType) return null;
  return snap.rateLimitReachedType === 'primary' ? (snap.fiveHour || snap.sevenDay) : (snap.sevenDay || snap.fiveHour);
}

// OpenAI/codex auth-failure wording (design-backend-parity.md §2 item 5 —
// "codex 各写一个": the claude classifier keys on Anthropic phrasing).
// Sources: the typed `codex_error_info` enum (`unauthorized`), app-server
// error messages ("401 Unauthorized", "invalid_grant", "token has expired",
// "Not logged in", "account/organization … deactivated|suspended"), and
// HTTP 401/403 statuses. Like the claude rule, a lone first-attempt 401 is
// the mid-refresh-race shape and does NOT qualify; 5xx/429 never do.
const CODEX_AUTH_FAIL_RE = /\bunauthorized\b|invalid_grant|invalid[_ ]token|token (?:has )?(?:expired|been revoked)|refresh token.*(?:expired|invalid|revoked)|not logged in|login required|(?:account|organization|workspace).*(?:deactivated|suspended|disabled|banned)|insufficient permissions|forbidden/i;
function classifyAuthFailure({ status, message, attempt, codexErrorInfo } = {}) {
  const info = String(codexErrorInfo || '').toLowerCase();
  if (info === 'unauthorized') return true; // the typed enum — never a race
  const msg = String(message || '');
  if (CODEX_AUTH_FAIL_RE.test(msg)) return true;
  const st = Number(status);
  if (st === 403) return true;
  if (st === 401) return (attempt || 0) >= 2;
  return false;
}

// Classify one wrapper stdout record. Accepts the server-side frame
// ({type:'event_msg', payload}) OR the bare payload the engine already holds.
// Returns null for anything that is not a quota/wall signal.
//   {source:'rate_limits_updated', kind:'reading'|'exhausted'|'probe-failed', snapshot, tripped, resetsAtMs, onDemand, error}
//   {source:'task_failed',         kind:'exhausted'|'auth-failure', errorInfo, resetsAtSec, resetsAtMs, snapshot}
//   {source:'reset_credit_result', kind:'recovered'|'reset-credit-failed', outcome, error}
function signalFromStream(record, now = Date.now()) {
  if (!record || typeof record !== 'object') return null;
  const payload = record.type === 'event_msg' ? record.payload : record;
  if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') return null;
  if (payload.type === 'rate_limits_updated') {
    if (!payload.rateLimits) return { source: 'rate_limits_updated', kind: 'probe-failed', snapshot: null, tripped: null, resetsAtMs: 0, onDemand: !!payload.onDemand, error: String(payload.error || 'no rateLimits in reply') };
    const snapshot = normalizeCodexRateLimit(payload.rateLimits, now);
    if (!snapshot) return { source: 'rate_limits_updated', kind: 'probe-failed', snapshot: null, tripped: null, resetsAtMs: 0, onDemand: !!payload.onDemand, error: 'unparseable rateLimits' };
    // stored reset-credit count rides ONLY the on-demand rateLimits/read
    // (owner ask: usage 展示剩余 reset) — keep it on the account snapshot
    if (payload.resetCredits) {
      const rc = payload.resetCredits;
      snapshot.resetCredits = { availableCount: Number(rc.availableCount ?? rc.available_count ?? rc?.summary?.availableCount) || 0 };
    }
    const tripped = trippedWindow(snapshot);
    return { source: 'rate_limits_updated', kind: tripped ? 'exhausted' : 'reading', snapshot, tripped, resetsAtMs: (Number(tripped?.resetsAt) || 0) * 1000, onDemand: !!payload.onDemand, error: null };
  }
  if (payload.type === 'task_failed') {
    const errorInfo = String(payload.codexErrorInfo || payload.codex_error_info || '');
    if (!errorInfo) return null;
    if (EXHAUSTION_RE.test(errorInfo)) {
      const resets = Number(payload.resetsAt || payload.resets_at) || 0;
      return { source: 'task_failed', kind: 'exhausted', errorInfo, resetsAtSec: resets, resetsAtMs: resets * 1000, snapshot: normalizeCodexRateLimit(payload.rateLimits, now) };
    }
    if (classifyAuthFailure({ codexErrorInfo: errorInfo, message: payload.error })) return { source: 'task_failed', kind: 'auth-failure', errorInfo, resetsAtMs: 0, snapshot: null };
    return null;
  }
  if (payload.type === 'reset_credit_result') {
    const outcome = payload.outcome || payload.result?.outcome || null;
    return { source: 'reset_credit_result', kind: outcome === 'reset' ? 'recovered' : 'reset-credit-failed', outcome, error: payload.error || null };
  }
  return null;
}

module.exports = {
  normalize: normalizeCodexRateLimit,
  signalFromStream,
  probe: capsOf('codex').quotaProbe, // 'rpc-rate-limits': account/rateLimits/read on a LIVE app-server
  classifyAuthFailure,
  // named helpers for current callers / tests
  normalizeCodexRateLimit, EXHAUSTION_RE, trippedWindow,
};
