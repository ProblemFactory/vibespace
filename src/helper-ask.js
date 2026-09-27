'use strict';
/**
 * PURE (imports nothing; CJS so the claude normalizer — which the device daemon
 * bundles — the server and the browser bundle share ONE spelling) — A HELPER'S
 * PERMISSION REQUEST (lane S1, backlog B-6e95; the one finding both naive-user
 * studies hit: "帮手要权限时没有任何地方能点'允许'").
 *
 * WHAT THE PARENT'S STDOUT CARRIES (measured on CLI 2.1.281, 2026-09-26, one
 * real parent turn with two background helpers — WebFetch + Bash):
 *   · the helper's own assistant records ride the parent stream tagged
 *     `parent_tool_use_id` = the parent's Agent call (background helpers too),
 *     so its tool_use lands in the helper's view BEFORE the ask;
 *   · `system/session_state_changed {state:'requires_action'}`, then
 *   · `{type:'control_request', request_id, request:{subtype:'can_use_tool',
 *      tool_name, display_name, input, description, permission_suggestions,
 *      decision_reason_type?, tool_use_id: <the HELPER's tool_use>,
 *      agent_id: <the helper = task_started.task_id>}}` — NO parent_tool_use_id;
 *     the parent's Agent call is reached through task_started (task_id →
 *     tool_use_id);
 *   · the answer is the ordinary `control_response {request_id, response:
 *     {behavior, updatedInput, updatedPermissions?}}` on the PARENT's stdin —
 *     the helper's tool_result followed 1.1 s later;
 *   · stopping a helper whose ask is pending (`stop_task`) ⇒
 *     `control_cancel_request {request_id}` + task_updated {status:'killed'} +
 *     task_notification {status:'stopped'};
 *   · the helper's JSONL did NOT yet hold the asked tool_use when the ask
 *     arrived (the file watcher cannot be the carrier).
 * Before this lane the parent normalizer looked the ask's tool_use_id up among
 * the PARENT's cards, found nothing, and dropped it — every screen was silent
 * while the chip said "waiting for you" (4–18 min hangs in both studies).
 *
 * This module is the model: which records are a helper's ask, which card a
 * request belongs to, what the waiting chip says, when the For-you inbox is
 * told, and how a stopped helper's card reads. Gate: scripts/test-helper-ask.mjs.
 */

/** After this long unanswered a helper's ask is filed in the For-you inbox (origin `agent`). */
const HELPER_ASK_INBOX_MS = 60 * 1000;
/** The terminal task statuses (the binary's task_notification enum + task_updated patches). */
const TERMINAL = new Set(['completed', 'failed', 'stopped', 'killed', 'finished']);

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/** A `control_request` that is a HELPER's permission ask → the normalized ask,
 *  else null (a main-session ask carries no `agent_id`). Strings bounded — the
 *  input is agent-authored. A FUTURE CLI may stamp the record itself with
 *  `parent_tool_use_id` (the parent's Agent call, the way every other helper
 *  record is tagged — verify r2, M2): that names the helper's card directly and
 *  is honoured with or without `agent_id`. */
function helperAskOf(rec) {
  if (!rec || typeof rec !== 'object' || rec.type !== 'control_request') return null;
  const r = rec.request;
  if (!r || typeof r !== 'object' || r.subtype !== 'can_use_tool') return null;
  const agentId = str(r.agent_id, 64).trim();
  const parentToolUseId = str(rec.parent_tool_use_id, 120).trim() || null;
  if ((!agentId && !parentToolUseId) || rec.request_id == null) return null;
  return {
    requestId: String(rec.request_id).slice(0, 120),
    agentId: agentId || null,
    parentToolUseId,
    toolUseId: str(r.tool_use_id, 120) || null,
    toolName: str(r.tool_name, 80) || 'tool',
    input: r.input && typeof r.input === 'object' ? r.input : {},
    description: str(r.description, 300),
    suggestions: Array.isArray(r.permission_suggestions) ? r.permission_suggestions.slice(0, 12) : [],
  };
}

/** The raw `control_request` a normalized ask came from — what a helper's own
 *  view is fed when it is created after the ask (a restart, a late viewer). */
function askRecordOf(ask) {
  if (!ask || !ask.requestId) return null;
  return {
    type: 'control_request', request_id: ask.requestId,
    ...(ask.parentToolUseId ? { parent_tool_use_id: ask.parentToolUseId } : {}),
    request: {
      subtype: 'can_use_tool', tool_name: ask.toolName, input: ask.input || {},
      ...(ask.description ? { description: ask.description } : {}),
      permission_suggestions: ask.suggestions || [], tool_use_id: ask.toolUseId, ...(ask.agentId ? { agent_id: ask.agentId } : {}),
    },
  };
}

/** The parent's Agent call (`tool_use_id`) a helper runs under, from the
 *  session's persisted task records (`{<tool_use_id>: {started, …}}`, the
 *  stdout consumer's `_taskRecords`) — task_started names both ids. */
function helperParentOf(agentId, taskRecords) {
  if (!agentId || !taskRecords || typeof taskRecords !== 'object') return null;
  for (const [tuid, cur] of Object.entries(taskRecords)) {
    if (cur && cur.started && String(cur.started.task_id) === String(agentId)) return tuid;
  }
  return null;
}

/** WHAT the helper wants to do, in one line (the card and the inbox detail). */
function askTarget(ask) {
  const i = (ask && ask.input) || {};
  const one = (s) => String(s).split('\n')[0].trim().slice(0, 200);
  if (typeof i.url === 'string' && i.url) return one(i.url);
  if (typeof i.command === 'string' && i.command) return one(i.command);
  if (typeof i.file_path === 'string' && i.file_path) return one(i.file_path);
  if (typeof i.path === 'string' && i.path) return one(i.path);
  if (typeof i.pattern === 'string' && i.pattern) return one(i.pattern);
  if (ask && ask.description) return one(ask.description);
  return '';
}

const isTerminal = (ti) => !!(ti && typeof ti.status === 'string' && TERMINAL.has(ti.status));

// ═══ THE ASK'S LIFE — ONE CLOSED TRANSITION TABLE (verify r3, 2026-09-26) ═══
// Every round of the adversarial verify found a STATE the card or the For-you
// item did not know (r1: answered twice on stdin, a dead parent's item; r2: a
// withdrawal after our own answer, a twin item, a stale id after a resume).
// The closure: the life of an ask is this table and nothing else — every
// consumer (message-manager's settle, helper-asks' settledState / forget /
// sync, the ws permission-response case, the renderer, the chip) is a LOOKUP
// into it, and the walk in test-helper-ask ⑪ proves its invariants over every
// order of events: stdin is written AT MOST ONCE per ask; a settled ask never
// returns to `asked`; the For-you item is released exactly when the ask
// leaves `asked` (or its parent ends); a parent-ended / unrouted ask never
// writes stdin; the card's words are a function of the STATE alone.
//
// STATES (closed):
//   asked        — the CLI holds the request; the card has buttons
//   allowed      — settled by a control_response allow (ours, another client's,
//                  or the helper's own tool_result proving it ran)
//   denied       — settled by a control_response deny (ours, another client's,
//                  the takeover sweep's stale deny) or a tool_result carrying the
//                  CLI's rejection words — a settlement the CLI made ITSELF (its
//                  own deadline, a decision elsewhere): no record of ours exists,
//                  only the helper's result — the brief's "expired" case
//   cancelled    — the CLI withdrew it (control_cancel_request: a stopped helper);
//                  OVERRIDES our own allowed/denied (2.1.281 removes the
//                  request's abort listener the moment it settles — a cancel
//                  after our answer proves the answer was dropped; verify r2 C1)
//   ended        — DERIVED, never written: no record about the request, but the
//                  helper's card carries a REAL terminal status (a level-set
//                  soft close, closedBy 'level', is a guess and is NOT this)
//   parent-ended — the parent was killed / exited (the kill + exit paths' forget)
//   unrouted     — the answer names a request no live session knows (a stale
//                  View Log window after Terminate + Resume, a dead session)
//   unknown      — (verify r5) the helper's tool_result for the asked call is an
//                  ERROR whose sentence the census (src/permission-outcome.js)
//                  does not know — the tool's own failure after an allow, or a
//                  sentence a newer CLI invented; NEVER read as allowed. A
//                  record about the request (ours, the CLI's withdrawal) is
//                  more precise and wins, as on `ended`.
// EVENTS (closed): press-allow / press-deny (the ws case — a button, another
//   client's button, the takeover sweep — BEFORE anything is written),
//   record-allow / record-deny (a control_response record fed to the
//   normalizer: after our write, or from the buffer at a rebuild), withdraw
//   (control_cancel_request), result-allow / result-deny / result-cancel /
//   result-unknown (the helper's tool_result for the asked call —
//   message-manager's _resolutionFromResult reads the CENSUS of the CLI's own
//   sentences, src/permission-outcome.js: a non-error ran ⇒ allow; the user's
//   words ⇒ deny; the CLI's own interrupt / turn-ended / parked-expired
//   markers ⇒ cancel; any other error ⇒ unknown), helper-end (the helper's real
//   terminal record), level-drop (a level set omitting the helper — a guess),
//   parent-end (kill / exit), reattach (a restart's rebuild redraws the state
//   the records say), reply (a For-you typed reply), timer (the 60 s inbox
//   clock / a due sync).
// EFFECTS (closed): write-stdin · refuse · resolve-item (release the For-you
//   item — helper-asks.resolveItems re-points it at a live twin with the same
//   words first, verify r2 C2) · file-item · redraw · nothing.
const ASK_STATES = Object.freeze(['asked', 'allowed', 'denied', 'cancelled', 'ended', 'parent-ended', 'unrouted', 'unknown']);
const ASK_EVENTS = Object.freeze(['press-allow', 'press-deny', 'record-allow', 'record-deny', 'withdraw', 'result-allow', 'result-deny', 'result-cancel', 'result-unknown', 'helper-end', 'level-drop', 'parent-end', 'reattach', 'reply', 'timer']);
const ASK_EFFECTS = Object.freeze(['write-stdin', 'refuse', 'resolve-item', 'file-item', 'redraw', 'nothing']);
const ASK_INITIAL = 'asked';
/** The events a RECORD feeds through message-manager's settle (never a press — the press is the ws case's, and it writes). */
const ASK_RECORD_EVENTS = Object.freeze(['record-allow', 'record-deny', 'withdraw', 'result-allow', 'result-deny', 'result-cancel', 'result-unknown']);
/** The census's outcome word → the table's result event (verify r5; the ONE mapping message-manager uses). */
const RESULT_EVENT_OF = Object.freeze({ allowed: 'result-allow', denied: 'result-deny', cancelled: 'result-cancel', unknown: 'result-unknown' });
const X = (state, ...effects) => Object.freeze({ state, effects: Object.freeze(effects.length ? effects : ['nothing']) });
const SETTLE = ['redraw', 'resolve-item'];
/** state → event → {state, effects}. Fully enumerated (8 × 15 = 120 cells; the suite's census refuses a hole). */
const ASK_TABLE = Object.freeze({
  asked: Object.freeze({
    'press-allow': X('allowed', 'write-stdin', ...SETTLE), 'press-deny': X('denied', 'write-stdin', ...SETTLE),
    'record-allow': X('allowed', ...SETTLE), 'record-deny': X('denied', ...SETTLE),
    withdraw: X('cancelled', ...SETTLE),
    'result-allow': X('allowed', ...SETTLE), 'result-deny': X('denied', ...SETTLE),
    // verify r5: the CLI's own cancellation sentence (interrupted / turn ended / parked approval expired) and an
    // error sentence outside the census — never allowed
    'result-cancel': X('cancelled', ...SETTLE), 'result-unknown': X('unknown', ...SETTLE),
    'helper-end': X('ended', ...SETTLE), 'level-drop': X('asked'), 'parent-end': X('parent-ended', 'resolve-item'),
    reattach: X('asked', 'redraw'), reply: X('asked', 'refuse'), timer: X('asked', 'file-item'),
  }),
  allowed: Object.freeze({
    'press-allow': X('allowed', 'refuse'), 'press-deny': X('allowed', 'refuse'),
    'record-allow': X('allowed'), 'record-deny': X('allowed'),
    withdraw: X('cancelled', 'redraw'),
    'result-allow': X('allowed'), 'result-deny': X('allowed'),
    'result-cancel': X('cancelled', 'redraw'), 'result-unknown': X('allowed'), // a cancel sentence after our allow: the call never ran (as withdraw); an unrecognised error after it: our record is the more precise word
    'helper-end': X('allowed'), 'level-drop': X('allowed'), 'parent-end': X('parent-ended'),
    reattach: X('allowed', 'redraw'), reply: X('allowed', 'refuse'), timer: X('allowed'),
  }),
  denied: Object.freeze({
    'press-allow': X('denied', 'refuse'), 'press-deny': X('denied', 'refuse'),
    'record-allow': X('denied'), 'record-deny': X('denied'),
    withdraw: X('cancelled', 'redraw'),
    'result-allow': X('denied'), 'result-deny': X('denied'),
    'result-cancel': X('cancelled', 'redraw'), 'result-unknown': X('denied'),
    'helper-end': X('denied'), 'level-drop': X('denied'), 'parent-end': X('parent-ended'),
    reattach: X('denied', 'redraw'), reply: X('denied', 'refuse'), timer: X('denied'),
  }),
  cancelled: Object.freeze({
    'press-allow': X('cancelled', 'refuse'), 'press-deny': X('cancelled', 'refuse'),
    'record-allow': X('cancelled'), 'record-deny': X('cancelled'),
    withdraw: X('cancelled'),
    'result-allow': X('cancelled'), 'result-deny': X('cancelled'),
    'result-cancel': X('cancelled'), 'result-unknown': X('cancelled'),
    'helper-end': X('cancelled'), 'level-drop': X('cancelled'), 'parent-end': X('parent-ended'),
    reattach: X('cancelled', 'redraw'), reply: X('cancelled', 'refuse'), timer: X('cancelled'),
  }),
  // a DERIVED end: a record about the request itself is more precise and wins (the words say what happened)
  ended: Object.freeze({
    'press-allow': X('ended', 'refuse'), 'press-deny': X('ended', 'refuse'),
    'record-allow': X('allowed', 'redraw'), 'record-deny': X('denied', 'redraw'),
    withdraw: X('cancelled', 'redraw'),
    'result-allow': X('allowed', 'redraw'), 'result-deny': X('denied', 'redraw'),
    'result-cancel': X('cancelled', 'redraw'), 'result-unknown': X('unknown', 'redraw'),
    'helper-end': X('ended'), 'level-drop': X('ended'), 'parent-end': X('parent-ended'),
    reattach: X('ended', 'redraw'), reply: X('ended', 'refuse'), timer: X('ended'),
  }),
  'parent-ended': Object.freeze({
    'press-allow': X('parent-ended', 'refuse'), 'press-deny': X('parent-ended', 'refuse'),
    'record-allow': X('parent-ended'), 'record-deny': X('parent-ended'),
    withdraw: X('parent-ended'),
    'result-allow': X('parent-ended'), 'result-deny': X('parent-ended'),
    'result-cancel': X('parent-ended'), 'result-unknown': X('parent-ended'),
    'helper-end': X('parent-ended'), 'level-drop': X('parent-ended'), 'parent-end': X('parent-ended'),
    reattach: X('parent-ended'), reply: X('parent-ended', 'refuse'), timer: X('parent-ended'),
  }),
  unrouted: Object.freeze({
    'press-allow': X('unrouted', 'refuse'), 'press-deny': X('unrouted', 'refuse'),
    'record-allow': X('unrouted'), 'record-deny': X('unrouted'),
    withdraw: X('unrouted'),
    'result-allow': X('unrouted'), 'result-deny': X('unrouted'),
    'result-cancel': X('unrouted'), 'result-unknown': X('unrouted'),
    'helper-end': X('unrouted'), 'level-drop': X('unrouted'), 'parent-end': X('unrouted'),
    reattach: X('unrouted'), reply: X('unrouted', 'refuse'), timer: X('unrouted'),
  }),
  // verify r5: an error sentence the census does not know — settled (never a button, never allowed); a record
  // about the request or a classified result is the more precise word and wins, exactly as on `ended`
  unknown: Object.freeze({
    'press-allow': X('unknown', 'refuse'), 'press-deny': X('unknown', 'refuse'),
    'record-allow': X('allowed', 'redraw'), 'record-deny': X('denied', 'redraw'),
    withdraw: X('cancelled', 'redraw'),
    'result-allow': X('allowed', 'redraw'), 'result-deny': X('denied', 'redraw'),
    'result-cancel': X('cancelled', 'redraw'), 'result-unknown': X('unknown'),
    'helper-end': X('unknown'), 'level-drop': X('unknown'), 'parent-end': X('parent-ended'),
    reattach: X('unknown', 'redraw'), reply: X('unknown', 'refuse'), timer: X('unknown'),
  }),
});
/** THE LOOKUP. An unknown state or event throws — a consumer that invents one is a defect, never a silent no-op. */
function askTransition(state, event) {
  const row = ASK_TABLE[state];
  if (!row) throw new Error(`askTransition: unknown ask state ${JSON.stringify(state)}`);
  const cell = row[event];
  if (!cell) throw new Error(`askTransition: unknown ask event ${JSON.stringify(event)}`);
  return cell;
}
/** Is the ask still the user's to answer? (the ONE spelling of "waiting" — consumers never compare a state literal) */
const isWaiting = (state) => state === ASK_INITIAL;
/** Did an error sentence outside the census settle it? (verify r5 — the drift card's lookup; the one spelling) */
const isUnknownOutcome = (state) => state === 'unknown';
/** A press on a card, judged by the table BEFORE anything is written: `{write:true}` from `asked`, else
 *  `{write:false, code, words}` — `permission-settled` for a request this server knows as settled,
 *  `permission-unrouted` for one no live session holds. `state` null/undefined = unknown here ⇒ the CLI
 *  decides (an answer for a request older than the buffer must still reach it — verify r1's rule). */
function answerVerdict(state) {
  const st = state == null ? ASK_INITIAL : state;
  const tr = askTransition(st, 'press-allow');
  if (tr.effects.includes('write-stdin')) return { write: true, state: st };
  const unrouted = st === 'unrouted' || st === 'parent-ended';
  return { write: false, state: st, code: unrouted ? 'permission-unrouted' : 'permission-settled', words: answerRefusalWords(st) || `This request was already settled (${st}). Nothing was sent.` };
}

/** An ask's state as the card shows it — ALWAYS a member of ASK_STATES: its own
 *  resolution (written only by the table), else `ended` when the helper's card
 *  says the helper is over (a DERIVATION, not a write — a rebuild replays the
 *  task records after the transcript, so the close may arrive long after the
 *  ask), else `asked`. null only for no ask at all. */
function askState(ask, card) {
  if (!ask) return null;
  if (ask.resolved) return ask.resolved; // written only by the table (message-manager's settle)
  // verify r1: a card the LEVEL SET soft-closed (`closedBy:'level'`, message-manager's
  // guessed close — reopened when a later set names it) is not over: a helper cannot
  // have finished while its ask is open, and the CLI still waits on it. Treating the
  // guess as `ended` hid the buttons on the parent card (the studies' symptom again)
  // until a restart brought them back. verify r3: the derivation IS the table's
  // `helper-end` row on `asked` (a level drop is its `level-drop` row — no move).
  const ev = card && isTerminal(card.taskInfo) ? (card.taskInfo.closedBy === 'level' ? 'level-drop' : 'helper-end') : null;
  return ev ? askTransition(ASK_INITIAL, ev).state : ASK_INITIAL;
}

/** Does this card hold an ask the user must answer? (the run fold never swallows it) */
function hasPendingHelperAsk(card) {
  return !!(card && Array.isArray(card.helperAsks) && card.helperAsks.some((a) => isWaiting(askState(a, card))));
}

/** The helper's name as the parent chat shows it (the Agent call's description). */
function helperLabelOf(card) {
  const b = card && Array.isArray(card.content) ? card.content[0] : null;
  const d = (b && b.input && typeof b.input.description === 'string' && b.input.description) || (card && card.taskInfo && card.taskInfo.description) || '';
  return String(d).trim().slice(0, 120);
}

/** EVERY ask a user can answer in this conversation, oldest first — the main
 *  session's own permission cards (and AskUserQuestion) and each helper's.
 *  `messages` = a normalizer's list (harness-neutral: every normalizer keeps the
 *  same `permission` shape). `msgIndex` is the index the chat window pages by
 *  (`indexOf(m, k)` when `messages` is a candidate subset of the full list). */
function pendingAsksOf(messages, { indexOf = null } = {}) {
  const out = [];
  if (!Array.isArray(messages)) return out;
  for (let k = 0; k < messages.length; k++) {
    const m = messages[k];
    if (!m) continue;
    const idx = typeof indexOf === 'function' ? indexOf(m, k) : k;
    const p = m.permission;
    if (p && !p.resolved && p.requestId != null && !p.stale) {
      out.push({ kind: p.kind === 'user_input' ? 'question' : 'main', requestId: String(p.requestId), toolName: p.toolName || m.toolName || null, target: askTarget({ input: p.input || {} }), label: '', msgId: m.id, msgIndex: idx, toolUseId: m.toolCallId || null, parentToolUseId: null, at: Number(m.ts) || 0 });
    }
    if (Array.isArray(m.helperAsks)) {
      for (const a of m.helperAsks) {
        if (!isWaiting(askState(a, m))) continue;
        out.push({ kind: 'helper', requestId: a.requestId, toolName: a.toolName || null, target: askTarget(a), label: helperLabelOf(m), msgId: m.id, msgIndex: idx, toolUseId: a.toolUseId || null, parentToolUseId: m.toolCallId || null, agentId: a.agentId, at: Number(a.at) || 0 });
      }
    }
  }
  out.sort((x, y) => (x.at || 0) - (y.at || 0) || x.msgIndex - y.msgIndex);
  return out;
}

/** A stable signature of a pending list (a change ⇒ one meta op / one inbox sync). */
function asksSignature(asks) {
  return (asks || []).map((a) => `${a.kind}:${a.requestId}`).join('|');
}

/** The default formatter (the suite and the server pass none): English with
 *  `{param}` filled — the client passes its own `t`. */
const fmt = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
/** `i18nKey` = the extractor's marker for a declared human-visible string (no call to t() here). */
const i18nKey = (s) => s;

/** THE WAITING CHIP's words. `t` is injected (the client's i18n). With nothing
 *  to point at, the chip keeps its harness-reported sentence and is not
 *  clickable. */
function waitingChip(asks, t = fmt) {
  const list = Array.isArray(asks) ? asks : [];
  if (!list.length) return { title: t('The agent is waiting for you — the turn is paused, not finished (reported by the harness).'), clickable: false };
  const who = (a) => (a.kind === 'helper'
    ? (a.label ? t('Helper “{name}”', { name: a.label }) : t('A helper'))
    : a.kind === 'question' ? t('The agent (a question)') : t('The agent'));
  if (list.length === 1) {
    const a = list[0];
    const tool = a.toolName || t('a tool');
    if (a.kind === 'question') return { title: t('The agent is asking you a question — click to go there'), clickable: true };
    if (a.kind === 'helper') return { title: a.label ? t('Helper “{name}” needs your approval to use {tool} — click to go there', { name: a.label, tool }) : t('A helper needs your approval to use {tool} — click to go there', { tool }), clickable: true };
    return { title: t('The agent needs your approval to use {tool} — click to go there', { tool }), clickable: true };
  }
  const names = list.slice(0, 3).map(who).join(', ') + (list.length > 3 ? ', …' : '');
  return { title: t('{n} approvals are waiting ({who}) — click to go to the first', { n: list.length, who: names }), clickable: true };
}

/** The header line above a helper's permission card in the parent chat. */
function helperAskHead(label, t = fmt) {
  return label ? t('Helper “{name}” needs your approval', { name: label }) : t('A helper needs your approval');
}

/** How a settled helper ask reads (never buttons). */
function helperAskSettledWords(state, t = fmt) {
  if (state === 'allowed') return { icon: '✓', cls: 'allowed', text: t('Allowed') };
  if (state === 'denied') return { icon: '✗', cls: 'denied', text: t('Denied') };
  if (state === 'cancelled') return { icon: '✗', cls: 'denied', text: t('No longer waiting — the helper was stopped') };
  if (state === 'ended') return { icon: '✗', cls: 'denied', text: t('No longer waiting — the helper has finished') };
  if (state === 'parent-ended') return { icon: '✗', cls: 'denied', text: t('No longer waiting — the conversation ended') };
  if (state === 'unrouted') return { icon: '✗', cls: 'denied', text: t('No longer waiting — this request belongs to a process that ended') };
  if (state === 'unknown') return { icon: '?', cls: 'unknown', text: t('Ended — reason unknown (the CLI wrote a result VibeSpace does not recognise)') };
  return null; // asked: the card has buttons
}

/** How a MAIN card's settled permission reads (verify r5 — the renderer's one speller; `resolved` is a
 *  permission-outcome word: allowed · denied · cancelled · unknown). null = not settled (buttons). */
function mainAskSettledWords(resolved, t = fmt) {
  if (resolved === 'allowed') return { icon: '✓', cls: 'allowed', text: t('Allowed') };
  if (resolved === 'denied') return { icon: '✗', cls: 'denied', text: t('Denied') };
  if (resolved === 'cancelled') return { icon: '✗', cls: 'denied', text: t('Not run — the request was withdrawn or the turn ended before an answer') };
  if (resolved === 'unknown') return { icon: '?', cls: 'unknown', text: t('Ended — reason unknown (the CLI wrote a result VibeSpace does not recognise)') };
  return null;
}

/** The For-you item for an ask left unanswered for HELPER_ASK_INBOX_MS. `text`
 *  is English (the store's dedupe key and the agent CLI's contract); `i18n` the
 *  same words as structure for the client; `action` names the request so the
 *  item is resolved when it is answered and a click lands on the card. */
function inboxItemFor(ask, { label = '', sessionId = null } = {}) {
  const tool = (ask && ask.toolName) || 'a tool';
  const text = label ? `Helper “${label}” needs your approval to use ${tool}` : `A helper needs your approval to use ${tool}`;
  const target = askTarget(ask || {});
  const detail = `${target ? tool + ': ' + target + '\n' : ''}The helper is paused until you answer. Open the conversation and use Allow or Deny on the helper's card (the “waiting for you” chip at the bottom of the chat jumps to it).`;
  return {
    text, detail,
    i18n: { text: label ? { key: i18nKey('Helper “{name}” needs your approval to use {tool}'), params: { name: label, tool } } : { key: i18nKey('A helper needs your approval to use {tool}'), params: { tool } } },
    action: { type: 'helper-ask', requestId: String((ask && ask.requestId) || ''), ...(sessionId ? { sessionId: String(sessionId) } : {}) },
  };
}

/** When the inbox is told about an ask first seen at `at`. */
function inboxDueAt(at) { return (Number(at) || 0) + HELPER_ASK_INBOX_MS; }

/** The CLI's canned words for a tool call the user stopped (its REJECT_MESSAGE,
 *  also what a foreground Agent call's result carries after Stop). */
function isStopRejection(text) {
  return /^\s*The user doesn'?t want to proceed with this tool use\b/i.test(String(text || ''))
    || /^\s*\[Request interrupted by user/i.test(String(text || ''));
}

/** THE WORDS OF A REFUSED ANSWER (verify r1): a `permission-response` for a
 *  request this session already knows as settled — answered from the other
 *  window, withdrawn by the CLI, or its helper over — writes NOTHING to stdin
 *  (a second control_response for one request id, or an allow after a
 *  withdrawal) and says why in the window that pressed the button. */
function answerRefusalWords(state, t = fmt) {
  if (state === 'allowed') return t('Already answered — allowed. Nothing was sent.');
  if (state === 'denied') return t('Already answered — denied. Nothing was sent.');
  if (state === 'cancelled') return t('No longer waiting — the helper was stopped. Nothing was sent.');
  if (state === 'ended') return t('No longer waiting — the helper has finished. Nothing was sent.');
  if (state === 'parent-ended') return t('This answer did not reach the agent: the conversation ended. Nothing was sent.');
  if (state === 'unrouted') return t('This answer did not reach the agent: no running session holds this request. Nothing was sent.');
  if (state === 'unknown') return t('Already ended — reason unknown. Nothing was sent.');
  return null; // asked: nothing to refuse
}

/** A helper card's lifecycle chip in words (null = no chip: running uses the
 *  spinner chip, completed draws none). */
function agentStatusWords(status, t = fmt) {
  if (status === 'stopped' || status === 'killed') return { label: t('stopped'), title: t('Stopped before it finished'), cls: 'soft' };
  if (status === 'failed') return { label: t('failed'), title: t('The helper failed'), cls: 'err' };
  if (status === 'finished') return { label: t('finished'), title: t('finished (outcome not reported)'), cls: 'soft' };
  return null;
}

/** Which live session answers a `permission-response` (PURE over plain data):
 *  the session the frame names when it is live; else — a helper's View Log
 *  window sends its own virtual id (`sub-<tool_use_id>` / `sub-agent-<id>`) —
 *  the live session that holds that request. `sessions` = [{id, requestIds:
 *  Set|Array, subIds: Set|Array}]. */
function answerSessionFor(data, sessions) {
  if (!data || !Array.isArray(sessions)) return null;
  const has = (c, v) => (c && typeof c.has === 'function' ? c.has(v) : Array.isArray(c) && c.includes(v));
  const direct = sessions.find((s) => s && s.id === data.sessionId);
  if (direct) return direct.id;
  const rid = data.requestId != null ? String(data.requestId) : '';
  if (rid) { const hit = sessions.find((s) => s && has(s.requestIds, rid)); if (hit) return hit.id; }
  const sid = String(data.sessionId || '');
  if (/^sub-/.test(sid)) { const hit = sessions.find((s) => s && has(s.subIds, sid)); if (hit) return hit.id; }
  return null;
}

module.exports = {
  HELPER_ASK_INBOX_MS, helperAskOf, askRecordOf, helperParentOf, askTarget, askState, hasPendingHelperAsk, helperLabelOf,
  pendingAsksOf, asksSignature, waitingChip, helperAskHead, helperAskSettledWords, mainAskSettledWords, inboxItemFor, inboxDueAt,
  isStopRejection, agentStatusWords, answerSessionFor, answerRefusalWords,
  // verify r3: THE TABLE
  ASK_STATES, ASK_EVENTS, ASK_EFFECTS, ASK_INITIAL, ASK_RECORD_EVENTS, ASK_TABLE, askTransition, isWaiting, answerVerdict,
  RESULT_EVENT_OF, isUnknownOutcome, // verify r5: the census's outcome word → the table's result event; the unknown speller
};
