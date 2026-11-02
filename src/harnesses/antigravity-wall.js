'use strict';
// A WALL THE STREAM NAMES IS A READING (lane agy-wall-signal; the owner 2026-11-02: «antigravity会话撞墙了但是用量一直没刷新
// 出来，一直显示0%，我刚才手动刷新才刷出来»). PURE: imports nothing.
// When an Antigravity account runs out, the agy wrapper (data/bin/agy-wrapper.js) journals the refusal twice, 2 ms apart:
//   · a `notice` (noticeKind 'agy-error'): «Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. … Resets
//     in 90h39m34s.»
//   · the turn's `prompt_end` (stopReason 'error'), error.message «Individual quota reached. … Resets in 90h39m34s.»
// Both name WHEN the limit lifts (the record's own `ts` + the stated duration — the incident's re-check read the Gemini
// weekly reset at exactly that second) but not WHICH limit: agy's quota is per MODEL GROUP (the on-demand reading's
// groups, scripts/fixtures/antigravity-usage-1.4.3.json), so the group is the session's model's, and the window is the
// one the reset can be: a 5-hour window never resets more than 5 h away, so a reset further out is the WEEKLY window.
// Anything this cannot read exactly — another duration spelling, a model of no known group — is NO signal (said by the
// consumer once), never a guess. src/server/stream-wall.js writes the signal through the one write path (src/usage-cache-write.js).
const GEMINI_GROUP = 'Gemini Models';
const CLAUDE_GPT_GROUP = 'Claude and GPT models';
/** THE WINDOW RULE: a reset at most 5 h away may be the 5-hour window; one further out can only be the weekly window. */
const FIVE_HOUR_S = 5 * 3600;
const QUOTA_RE = /RESOURCE_EXHAUSTED|\bquota reached\b/i;
const RESETS_RE = /\bResets in (\S+)/;
const DUR_RE = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

/** agy's countdown («90h39m34s», «4h12m», «59s», «1d2h») → seconds; anything else → null. */
function parseResetDuration(s) {
  const t = String(s == null ? '' : s).replace(/[.,;]+$/, '');
  const m = t ? DUR_RE.exec(t) : null;
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}
/** The model GROUP agy's quota names for a model id; null = no known group (never the wrong bucket). */
function modelGroupOf(model) {
  const id = String(model || '').trim().toLowerCase();
  if (/^gemini-/.test(id)) return GEMINI_GROUP;
  if (/^(claude|gpt)-/.test(id)) return CLAUDE_GPT_GROUP;
  return null;
}
/** The window a reset `sec` seconds away can be: ≤ 5 h ⇒ '5h', further ⇒ '7d'. */
function windowKindFor(sec) { return Number(sec) <= FIVE_HOUR_S ? '5h' : '7d'; }
/** The refusal text a wrapper record carries, or null (not a quota wall). */
function wallTextOf(rec) {
  if (!rec || typeof rec !== 'object' || rec.type !== 'acp') return null;
  if (rec.kind === 'notice' && rec.noticeKind === 'agy-error' && typeof rec.text === 'string') return QUOTA_RE.test(rec.text) ? rec.text : null;
  const msg = rec.kind === 'prompt_end' && rec.stopReason === 'error' && rec.error && typeof rec.error.message === 'string' ? rec.error.message : null;
  return msg && QUOTA_RE.test(msg) ? msg : null;
}
/** THE QUOTA CONTRACT'S PASSIVE HALF (`quota.signalFromStream`, `ctx.model` = the session's model):
 *    null                                   not a quota wall
 *    { source:'stream', kind:'unread', why } a wall this cannot read exactly (why: 'duration' | 'model' | 'time')
 *    { source:'stream', kind:'exhausted', limitId, window, usedPct: 100, resetsAt (s), measuredAt (ms), promptId } */
function signalFromStream(rec, ctx = {}) {
  const text = wallTextOf(rec);
  if (!text) return null;
  const m = RESETS_RE.exec(text);
  const dur = m ? parseResetDuration(m[1]) : null;
  if (dur == null) return { source: 'stream', kind: 'unread', why: 'duration' };
  const limitId = modelGroupOf(ctx && ctx.model);
  if (!limitId) return { source: 'stream', kind: 'unread', why: 'model' };
  const at = Date.parse(rec.ts);
  if (!Number.isFinite(at) || at <= 0) return { source: 'stream', kind: 'unread', why: 'time' };
  return { source: 'stream', kind: 'exhausted', limitId, window: windowKindFor(dur), usedPct: 100,
    resetsAt: Math.floor((at + dur * 1000) / 1000), measuredAt: at, promptId: typeof rec.promptId === 'string' ? rec.promptId : null };
}
module.exports = { GEMINI_GROUP, CLAUDE_GPT_GROUP, FIVE_HOUR_S, parseResetDuration, modelGroupOf, windowKindFor, wallTextOf, signalFromStream };
