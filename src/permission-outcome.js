'use strict';
/**
 * PURE (imports nothing; CJS so the claude normalizer — which the device daemon
 * bundles — the server and the browser bundle share ONE spelling) — THE
 * PERMISSION OUTCOME A TOOL_RESULT SAYS, read from a CENSUS of the CLI's OWN
 * sentences (lane S1 verify r5, B-6e95, 2026-09-27).
 *
 * THE CLASS THIS CLOSES. `message-manager._resolutionFromResult` — the ONE
 * reader of a main card's `autoResolved` and the helper table's `result-*`
 * rows — decided allowed / denied from a tool_result's TEXT with "not the
 * rejection words ⇒ allowed": a fail-OPEN classifier over the vendor's
 * sentences. Every CLI build can add one (r4 caught the WebFetch deadline; r5
 * found the SUBAGENT's own denial sentence, the interrupt marker, the parked
 * approval that expired, the turn-ended markers — all read "✓ Allowed").
 * The closure is a closed table of the sentences the binary itself writes,
 * and `unknown` for everything else that is an error: an outcome is read from
 * the table or it is unknown — it is NEVER inferred allowed from an error.
 *
 * THE CENSUS (2.1.281, read in the binary with grep — never run; offsets are
 * byte positions in ~/.local/share/claude/versions/2.1.281, 237 375 560 B):
 *   · `Gd()` @208494952 returns the 13 harness-authored tool_result texts
 *     `[ww,Dx,hL,v6,pb,pme,ume,l4e,c4e,Ud,ok,kH,TH]` and `Hd()` judges a
 *     tool_result harness-authored by `startsWith` over them — the binary's
 *     own prefix discipline, kept here (`match:'prefix'`);
 *   · `IS` @215766292 = the exact is_error set `[Jw,Ud,ok,kH,TH,pb,pb+u4e,
 *     ume,ume+u4e,pme,pme+u4e,l4e,c4e,ww,ww+u4e]` (`u4e` = the flag-gated
 *     "\n\nNote: The user's next message may contain a correction…" SUFFIX
 *     `gL()` appends to a main agent's sentence — a prefix match absorbs it);
 *   · `fme` @194407364 (the user-message markers, `RT()`);
 *   · the WRITERS: `cancelAndAbort(feedback, isAbort)` @219984621 —
 *     `M=!!agentId; A = feedback ? (M?v6:Dx)+feedback : (M?hL:ww)` — a MAIN
 *     agent's denial is ww / Dx+feedback, a SUBAGENT's (a helper's) is
 *     hL / v6+feedback, and a HOST's deny with a message (ours) lands as
 *     `cancelAndAbort(W.message)` ⇒ Dx / v6 + our message; the executor's
 *     `Xo({outcome})` @224923208: `cancelled` ⇒ `IWe(signal)` (permission-stop
 *     ⇒ pme, interrupt ⇒ ume under a flag, else pb), `interrupted` ⇒ `ar()`
 *     (turn-abort ⇒ ok, else Ud); `createSyntheticErrorMessage` @208502906:
 *     user_interrupted ⇒ ok / pb / ww by the abort reason, conversation_ended
 *     and streaming_fallback ⇒ the two <tool_use_error> literals; the resume
 *     of an interrupted turn `fHt` @203295373 retires unanswered calls with
 *     Ud (or kH / TH under `wNo()`); the PARKED permission of print.ts
 *     (class Hu @215876593, `iv = {interrupt: ww, denied: ww, new_input: c4e,
 *     timeout: l4e}`) retires an approval nobody answered within
 *     `CLAUDE_CODE_PARKED_PERMISSION_WAIT_MS ?? 2000` ms of a resume;
 *   · `p4n` @201764657 = the WebFetch PROVENANCE re-ask's deadline
 *     (`f4n = 300000` ms) thrown as a TelemetrySafeError whose message wraps
 *     the sentence (`match:'contains'`). NOTE the re-ask is issued with a
 *     FRESH `toolUseId: randomUUID()` (`g.ask({url,prompt},{toolUseId:c4n(),
 *     forceDecision})` → `canUseTool(…, p.toolUseId, …)`), so its
 *     control_request names NO tool card and its result lands on the
 *     WebFetch call's own id.
 *   · NOT rows: `<tool_use_error>${denyMessage}</tool_use_error>` of a
 *     permission RULE / a hook (toolDenialKind permission-rule, @201995953) is
 *     written for a tool denied WITHOUT a prompt (no control_request ever
 *     exists — `system/permission_denied` is its witness); the served-call
 *     outcome table `DHe` (ask_expired, denied_by_session, …) is Remote
 *     Control's wire, not this transport; `mme` "Operation stopped by hook"
 *     is a hook stop, not an ask's outcome.
 *   · `since`: the sentence's first build among the three on this box
 *     (2.1.274 · 2.1.280 · 2.1.281; "≤2.1.274" = already in the oldest).
 *
 * THE INFERENCE THAT IS SAFE. A tool_result that is NOT an error after an ask
 * ⇒ the tool RAN ⇒ the permission was allowed (by us, another client, a hook
 * or a parked adoption — the word says only that it ran): every refusal the
 * binary writes is `is_error: true` (`Xde` and every `Xo` branch stamp it;
 * a denied tool never executes — the executor returns the synthetic result).
 * An is_error text OUTSIDE the table ⇒ `unknown`: it may be the tool's own
 * failure after an allow (hundreds per real transcript) or a sentence a newer
 * build invented — this reader cannot tell, so it says so, and a card is
 * never read "✓ Allowed" from a refusal.
 *
 * Gates: scripts/test-helper-ask.mjs (every row drives the real rebuild, an
 * unknown sentence ⇒ unknown + the drift card, the fail-open copy goes red on
 * the deadline AND a synthetic future sentence) and scripts/test-record-shape.mjs
 * §4d (the binary's own lists vs this table — a newer build's extra sentence
 * prints and FAILS until classified).
 */

/** The closed outcome vocabulary a tool_result can say. */
const PERMISSION_OUTCOMES = Object.freeze(['allowed', 'denied', 'cancelled', 'unknown']);
/** The CLI build the census was read from (test-record-shape §4d runs STRICT against it). */
const PERMISSION_OUTCOME_CLI_VERSION = '2.1.281';

const row = (id, outcome, match, text, since, binary, evidence) => Object.freeze({ id, outcome, match, text, since, binary, evidence });

/**
 * THE TABLE. `id` = the binary's minified constant (2.1.281), `match` =
 * 'prefix' (the binary's own startsWith discipline) | 'contains' (a sentence
 * that rides inside a wrapper), `binary` = which of the binary's own lists
 * carries it ('Gd' the tool_result census, 'IS' the exact is_error set,
 * 'fme' the user-message markers, 'literal' a spelled string), `evidence` =
 * where it is written from.
 */
const PERMISSION_OUTCOME_ROWS = Object.freeze([
  // ── the USER's decision (toolDenialKind user-rejected) ──
  row('ww', 'denied', 'prefix', "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.", '≤2.1.274', 'Gd',
    'a MAIN agent\'s deny without feedback (cancelAndAbort @219984621, agentId unset); the Esc-interrupt of a queued call (createSyntheticErrorMessage @208502906, reason neither turn-abort nor background); the parked approval retired as interrupt / denied (Hu.iv @215876593)'),
  row('Dx', 'denied', 'prefix', "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said:", '≤2.1.274', 'Gd',
    'a MAIN agent\'s deny WITH feedback — a host\'s deny message (ours: "User denied this action", the takeover\'s browser_paused) rides after it (cancelAndAbort(W.message))'),
  row('hL', 'denied', 'prefix', 'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). Try a different approach or report the limitation to complete your task.', '≤2.1.274', 'Gd',
    'a SUBAGENT\'s (a helper\'s) deny without feedback — cancelAndAbort with agentId set; ALSO the interrupt of a helper\'s pending ask (resolveIfAborted → cancelAndAbort(void 0, true)); the r5 finding: read "✓ Allowed" before this table'),
  row('v6', 'denied', 'prefix', 'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user said:', '≤2.1.274', 'Gd',
    'a SUBAGENT\'s deny WITH feedback — our own deny message on a helper\'s ask lands here'),
  row('p4n', 'denied', 'contains', 'The permission request for this URL was not answered in time. Ask the user to approve the fetch or include the URL in a message, then try again.', '≤2.1.274', 'literal',
    'the WebFetch PROVENANCE re-ask\'s own deadline (f4n = 300 000 ms, @201764657): thrown as a TelemetrySafeError wrapping {error_type:"PROVENANCE_REQUIRED", message} — hence contains; the re-ask carries a fresh randomUUID tool_use_id, the result lands on the WebFetch call\'s id'),
  // ── the CLI's own CANCELLATION — nobody decided (toolDenialKind cancelled / interrupted) ──
  row('pb', 'cancelled', 'prefix', "The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.", '≤2.1.274', 'Gd',
    'toolDenialKind "cancelled": the abort reason "background" (Xo/IWe default @224923208, createSyntheticErrorMessage @208503275), every unanswered call at a queued-command resume (Xde @204158716, @207232180)'),
  row('Ud', 'cancelled', 'prefix', '[Request interrupted by user for tool use]', '≤2.1.274', 'Gd',
    'toolDenialKind "interrupted": `ar(signal)` when the abort reason is not turn-abort (@224923208); Gw(AbortError) @201808077; the resume of an interrupted turn retires every unanswered call with it (fHt @203295373)'),
  row('ok', 'cancelled', 'prefix', '[Tool call did not complete: the turn was ended to deliver the message that follows. Nothing refused it; re-run it if still needed.]', '≤2.1.274', 'Gd',
    'toolDenialKind "interrupted", abort reason turn-abort (ar() / createSyntheticErrorMessage)'),
  row('ume', 'cancelled', 'prefix', '[Tool call skipped: the turn ended to deliver the message that follows before this call ran. Nothing refused it; re-run it if still needed.]', '≤2.1.274', 'Gd',
    'toolDenialKind "cancelled", abort reason interrupt under the tengu_fizzy_grove flag (IWe @201805950)'),
  row('pme', 'cancelled', 'prefix', '[Tool call skipped: the turn was stopped before this call ran, by the check whose denial is on another call in this batch. Nothing refused this call and it had no effects; re-run it if still needed.]', '2.1.280', 'Gd',
    'toolDenialKind "cancelled", abort reason permission-stop (a sibling call\'s denial stopped the batch; IWe @201805950)'),
  row('l4e', 'cancelled', 'prefix', "[Tool call not completed: an approval request expired with no answer, so the action awaiting approval did not run. Nobody refused it, so this is not the user's decision; ask again if it is still needed.]", '2.1.280', 'Gd',
    'the PARKED approval of an interrupted turn, retired `timeout` after CLAUDE_CODE_PARKED_PERMISSION_WAIT_MS ?? 2000 ms of the resume (print.ts Hu.arm/fire/retireInTranscript, iv @215876593) — the brief\'s "expired" shape'),
  row('c4e', 'cancelled', 'prefix', "[Tool call not completed: an approval request was still unanswered when the message that follows arrived and was closed, so the action awaiting approval did not run. Nobody refused it, so this is not the user's decision; ask again if it is still needed.]", '2.1.280', 'Gd',
    'the PARKED approval retired `new_input` (a user message arrived while it waited; iv @215876593)'),
  row('Jw', 'cancelled', 'prefix', '[Request interrupted by user]', '≤2.1.274', 'IS',
    'the user-message interrupt marker (fme/RT); the binary\'s exact is_error set IS lists it as a possible tool_result content — a defensive row'),
  row('conversation_ended', 'cancelled', 'prefix', '<tool_use_error>Cancelled: Claude ended the conversation</tool_use_error>', '≤2.1.274', 'literal',
    'createSyntheticErrorMessage "conversation_ended" (@208502906): the model ended the conversation while this call waited'),
  row('streaming_fallback', 'cancelled', 'prefix', '<tool_use_error>Error: Streaming fallback - tool execution discarded</tool_use_error>', '≤2.1.274', 'literal',
    'createSyntheticErrorMessage default (@208502906): the streamed call was discarded — it never ran'),
  // ── the CLI itself says UNKNOWN ──
  row('kH', 'unknown', 'prefix', "[Tool call interrupted: the session ended before this call's result was recorded, so its outcome is unknown. Check whether it took effect before relying on it or running it again.]", '2.1.281', 'Gd',
    'the resume of a turn whose session ended mid-call (fHt @203295373 under wNo()) — the CLI\'s own word is unknown'),
  row('TH', 'unknown', 'prefix', '[Tool call result not in this copy: this session was copied from another session before that session recorded this call\'s result. The call may have finished there, may still be running there, or may never have run. Check whether it took effect before relying on it or running it again.]', '2.1.281', 'Gd',
    'a copied (forked) session whose source had not recorded the result (fHt @203295373) — unknown by the CLI\'s own word'),
]);

/** The one-line head of a sentence (the drift card's name for it; ≤ 80 chars). */
function outcomeHead(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * THE LOOKUP. `{outcome, row}` — `row` null for `allowed` (no sentence: the
 * tool ran) and for `unknown` (no row matched). Never throws; a non-string is
 * an empty text.
 */
function permissionOutcome(text, isError) {
  if (!isError) return { outcome: 'allowed', row: null };
  const s = typeof text === 'string' ? text : (text == null ? '' : String(text));
  const t = s.replace(/^\s+/, '');
  for (const r of PERMISSION_OUTCOME_ROWS) {
    if (r.match === 'prefix' ? t.startsWith(r.text) : s.includes(r.text)) return { outcome: r.outcome, row: r };
  }
  return { outcome: 'unknown', row: null };
}

/** Is this word one the table may write onto a card? (a consumer never compares a literal) */
const isPermissionOutcome = (w) => PERMISSION_OUTCOMES.includes(w);

module.exports = { PERMISSION_OUTCOMES, PERMISSION_OUTCOME_CLI_VERSION, PERMISSION_OUTCOME_ROWS, permissionOutcome, outcomeHead, isPermissionOutcome };
