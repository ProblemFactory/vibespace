'use strict';
// AGY'S TOKEN USAGE, PER TURN (lane agy-status-bar-facts, 2026-10-21). PURE: imports nothing — data/bin/agy-wrapper.js
// builds the journal's `usage` record with it, the suites drive it directly.
// MEASURED on the owner's two Antigravity conversations (production, read-only, shapes only — the login file never
// opened): the stream's `result.usage` {input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens} is
// the CONVERSATION'S RUNNING TOTAL. It equals, to the token, the sum over every model call of every turn in agy's own
// transcript (brain/<conversation>/.system_generated/logs/transcript.jsonl — one JSON row per step; a MODEL row carries
// input_tokens / cache_read_tokens / output_tokens): one turn of 90 calls = 545 062 / 172 175 / 6 556 922, five turns =
// 577 850 / 58 173 / 4 065 912 (the binary names the computation steps.CalculateTokenSums). total_tokens = input + output;
// input EXCLUDES cache reads (6.56 M read from cache against 545 k input). So:
//   · the odometer is the stream's total as it stands;
//   · a turn's spend = the transcript's model rows since the turn's USER_INPUT row (else the delta of two totals);
//   · the LIVE CONTEXT is the turn's LAST model call, input + cache_read (90 228 tokens at the end of that 90-call turn —
//     the turn's sum, 7.1 M, would read 677 % of a 1 M window).
// step_update `usage` (the docs list it) is NOT used: no capture of it exists (the wrapper never journaled it), so what it
// counts is unmeasured — the sidecar keeps its copy as before.
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; };

/** agy's usage object → {input, output, thinking, cacheRead, total} (absent counters are 0), or null when not an object. */
function usageOf(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  return { input: num(u.input_tokens), output: num(u.output_tokens), thinking: num(u.thinking_tokens), cacheRead: num(u.cache_read_tokens), total: num(u.total_tokens) };
}
const isZero = (u) => !u || (!u.input && !u.output && !u.thinking && !u.cacheRead && !u.total);

/** This turn's share of two running totals, or null when there is no earlier total or a counter went DOWN (a count that
 *  restarted is not this conversation's running total — never a guessed split). */
function deltaOf(total, prev) {
  if (!total || !prev) return null;
  const keys = ['input', 'output', 'thinking', 'cacheRead', 'total'];
  if (keys.some((k) => total[k] < prev[k])) return null;
  return Object.fromEntries(keys.map((k) => [k, total[k] - prev[k]]));
}

/** The CURRENT turn in a transcript tail (text, possibly cut mid-line at its head): the model rows after the last
 *  USER_INPUT row, summed, and the last of them. `complete` = the turn's USER_INPUT row is inside the tail. */
function transcriptTurn(text) {
  const lines = String(text || '').split('\n');
  const calls = [];
  let complete = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l || l[0] !== '{') continue;
    let r; try { r = JSON.parse(l); } catch { continue; }
    if (!r || typeof r !== 'object') continue;
    if (r.type === 'USER_INPUT') { complete = true; break; }
    if (r.input_tokens != null || r.cache_read_tokens != null || r.output_tokens != null) calls.push({ input: num(r.input_tokens), cacheRead: num(r.cache_read_tokens), output: num(r.output_tokens) });
  }
  if (!calls.length) return { calls: 0, input: 0, output: 0, cacheRead: 0, last: null, complete };
  const sum = (k) => calls.reduce((s, c) => s + c[k], 0);
  return { calls: calls.length, input: sum('input'), output: sum('output'), cacheRead: sum('cacheRead'), last: calls[0], complete };
}

/** THE `usage` RECORD'S FIELDS for one finished turn — or null when agy counted nothing (an unauthenticated refusal).
 *  total = agy's running total; turn = this turn's spend (the transcript's rows when the whole turn is in the tail, else
 *  the delta of two totals, else null); last = the turn's last model call (the live context; null without a transcript);
 *  model = the slug agy named (`modelFrom` 'agy') or the one it was started with ('asked' — headless agy never falls back,
 *  it refuses an unknown slug), else null; durationSeconds = the result's own. */
function turnUsage({ usage, prev = null, transcript = null, model = null, modelFrom = null, durationSeconds = null } = {}) {
  const total = usageOf(usage);
  if (!total || isZero(total)) return null;
  const d = deltaOf(total, prev);
  let turn = null;
  if (transcript && transcript.complete && transcript.calls) turn = { input: transcript.input, output: transcript.output, thinking: d ? d.thinking : null, cacheRead: transcript.cacheRead, total: transcript.input + transcript.output, calls: transcript.calls };
  else if (d) turn = { ...d, calls: null };
  const last = transcript && transcript.last ? { ...transcript.last } : null;
  const secs = Number(durationSeconds);
  return { total, turn, last, model: model ? String(model) : null, modelFrom: model ? (modelFrom === 'agy' ? 'agy' : 'asked') : null, durationSeconds: Number.isFinite(secs) && secs >= 0 ? secs : null };
}

module.exports = { usageOf, deltaOf, transcriptTurn, turnUsage };
