'use strict';
/**
 * PURE (imports nothing; CJS so the claude normalizer — which the device daemon
 * bundles — the server and the browser bundle share ONE spelling) — THE SAFETY
 * STOP: the two records the CLI writes when a safety classifier stops the
 * agent's reply (lane classifier-stop-card, 2026-10-03, owner: 「那个安全护栏那个
 * 消息似乎没有被处理（显示成红色）」 — the notice was the red Unknown-event card).
 *
 * THE CENSUS (read in the binary with python over bytes — never run; offsets
 * are byte positions in ~/.local/share/claude/versions/2.1.288, 245 734 584 B).
 * The same-model refusal retry `Ka({refused, kept, answered, started, model, …})`
 * @215447803 returns `{notRun, notice, nudge}` and the query loop yields them
 * back to back (@215532353):
 *   · the NOTICE = `lC(`${No(s)}'s safeguards stopped the response above \xB7
 *     continuing once with that noted`, "notice")` — `lC` @207379335 builds
 *     `{type:'system', subtype:'informational', content, isMeta:false, timestamp,
 *     uuid, level, …highlight}`; `No()` = the model's display name ("Opus 5.5");
 *   · the NUDGE = `{type:'user', isMeta:true, turnCompanion:true, message:
 *     {content: v > 0 ? t9r : err}}` — text written for the MODEL, never the
 *     user's words (`v` = tool calls the stop interrupted while they ran;
 *     `err` @200610410, `t9r = err + ' Exception: …'` @200610648).
 * Every build on this box spells all three (2.1.280 · 2.1.281 · 2.1.287 ·
 * 2.1.288 ⇒ since '≤2.1.280'); this box's lane transcripts carry the pair
 * verbatim (2.1.287 ×1, 2.1.288 ×3). The stream re-emits the notice as
 * `system/informational {content, level}` and stamps the nudge's isMeta as
 * `isSynthetic` (the headless converter, `isSynthetic: I4e(e)`).
 *
 * THE RULE. A line is read from this table or it is NOT a safety stop: an
 * informational line the table does not know stays the generic dim card (never
 * the red card, never the stop card); a user text the table does not know stays
 * whatever it was. `measured` = the build the rows were read from.
 */
const SAFETY_STOP_CLI_VERSION = '2.1.288';

const row = (id, kind, match, text, since, evidence) => Object.freeze({ id, kind, match, text, since, evidence });
const NUDGE_HEAD = 'Your response above was stopped by a safety classifier — this is not a tool or API error. The rest of it was withheld, and tool calls in it that had not finished did not run. Do not produce that content again, even reworded.';

/** THE TABLE. `match` = 'suffix' (the model's name leads the line) | 'prefix'
 *  (the binary composes t9r as err + a sentence — a prefix absorbs growth);
 *  the most specific row first. */
const SAFETY_STOP_ROWS = Object.freeze([
  row('notice', 'notice', 'suffix', "'s safeguards stopped the response above · continuing once with that noted", '≤2.1.280',
    'system/informational, level notice — lC(`${No(s)}…`) in the same-model refusal retry Ka @215447803; the text before the suffix is the model display name'),
  row('t9r', 'nudge', 'prefix', NUDGE_HEAD + ' Exception: a tool call whose result reads "Interrupted" was already running when the response was stopped; it may have partially or fully completed.', '≤2.1.280',
    'the nudge when a tool call was already running at the stop (v > 0) — isMeta + turnCompanion user text, @200610648'),
  row('err', 'nudge', 'prefix', NUDGE_HEAD, '≤2.1.280',
    'the nudge — isMeta + turnCompanion user text, @200610410'),
]);

/**
 * THE LOOKUP. `{kind:'notice', model, row}` | `{kind:'nudge', model:null, row}`
 * | null. Never throws; a non-string is no stop.
 */
function safetyStopOf(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s || s.length > 4000) return null;
  for (const r of SAFETY_STOP_ROWS) {
    if (r.match === 'suffix') {
      if (!s.endsWith(r.text)) continue;
      const model = s.slice(0, s.length - r.text.length).trim();
      if (model && model.length <= 80 && !/[\r\n]/.test(model)) return { kind: r.kind, model, row: r };
      continue;
    }
    if (s.startsWith(r.text)) return { kind: r.kind, model: null, row: r };
  }
  return null;
}

module.exports = { SAFETY_STOP_CLI_VERSION, SAFETY_STOP_ROWS, safetyStopOf };
