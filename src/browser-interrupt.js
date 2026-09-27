'use strict';
/**
 * THE INTERRUPTION — PURE (imports nothing; CJS so the mediator's rules, the takeover model, the keeper, the
 * recorder, the routes AND the bundle spell ONE set of words and ONE cycle model).
 * docs/design-agent-browser-v2.md §6.2 (rewritten 2026-09-27).
 *
 * THE OWNER'S RULING (2026-09-27, verbatim): "关于接管浏览器的时候agent脚本，其实应该直接打断所有脚本和agent操作，
 * 告知agent发生了打断，交还时提醒它重新运行" — when the user takes over the agent's browser, INTERRUPT every script
 * and operation of the agent there, TELL the agent it was interrupted, and on the HANDBACK remind it to re-run.
 * This supersedes D6 ("script evaluation is not fenced while the user drives") and retires the r4 switch
 * `browser.fenceScriptsWhileDriven`: nothing of the agent's runs on a browser the user drives, never a silent pause.
 *
 * WHAT IS DECIDED HERE:
 *   · the WORDS (`browser_interrupted`): the CDP refusal of a mediated lease, the CLI's line, the server's
 *     answers — ONE sentence, agent-facing (never t()-wrapped: the human's words are the live view's toasts);
 *   · `inFlightAt(log, at)` — which of the agent's operations were IN FLIGHT at the takeover instant: a PURE
 *     function of the action trace's command / result records (src/server/browser-trace.js keeps the ring) and
 *     the instant — a command received at or before it with no result at or before it. The daemon's own
 *     bookkeeping (`launch` before every CLI call, the recorder's `boundingbox` probe…) is no operation;
 *   · THE CYCLE — one per (conversation, browser) pair from the takeover to the handback: what was in flight
 *     (the trace), what the mediator aborted (CDP methods), what the agent tried while the user drove (the
 *     /resolve refusals). A second takeover inside an open cycle (the holder's socket died, another viewer took
 *     it) MERGES — nothing is counted twice and no second card is sent; the handback CLOSES it (one re-run
 *     reminder per cycle);
 *   · `takeoverText` — the card / notice at the takeover ("the user took over …; N operations were interrupted:
 *     …"); `rerunSentence` — the handback's reminder ("Re-run what was interrupted: …"), empty when nothing was
 *     in flight and nothing was refused (then the handback says nothing about re-running).
 * Gate: scripts/test-browser-takeover.mjs ⑧ (the PURE cycle over the trace + the instant, one reminder per
 * cycle, the merge) + scripts/test-browser-mediation.mjs ⑦ (the mediator's abort).
 */

const INTERRUPTED_CODE = 'browser_interrupted';
const HEAD = 'The user took over this browser — your operation was interrupted';
const TAIL = 'Wait for the handback, then run it again.';
/** THE sentence (the owner's three facts: taken over, interrupted, run it again after the handback). */
const INTERRUPTED_TEXT = `${HEAD}. ${TAIL}`;
/** The sentence with a detail (the CDP method, the census's words) between the head and the tail. */
function interruptedText(detail = '') {
  const d = String(detail || '').trim();
  return d ? `${HEAD} (${d}). ${TAIL}` : INTERRUPTED_TEXT;
}

/** The script-running CDP calls: a takeover also asks Chrome to stop the one of these RUNNING in that page
 *  (`Runtime.terminateExecution`, measured on Chrome 153: a running script stops at once; a script AWAITING a
 *  timer / fetch is not running and its continuation cannot be recalled). */
const SCRIPT_METHODS = Object.freeze(['Runtime.evaluate', 'Runtime.callFunctionOn', 'Runtime.runScript']);

/** The stream mirror's command records that are no agent OPERATION: the `launch` pair that precedes every CLI
 *  call (measured 0.32.0 / 0.38.1), the recorder's own `get box` probe (`boundingbox`), and the keeper's own
 *  bookkeeping verbs. */
const NOT_AN_OPERATION = Object.freeze(['launch', 'boundingbox', 'session_info', 'stream_status', 'stream_enable', 'stream_disable', 'get_cdp_url', 'cdp_url', 'record_start', 'record_stop', 'recording_start', 'recording_stop']);
/** The daemon's action name → the verb the agent typed (measured on 0.38.1 in test-browser-mediation-chrome ⑦). */
const VERB_OF_ACTION = Object.freeze({ navigate: 'open', evaluate: 'eval' });
const verbOfAction = (action) => { const a = String(action || '').trim().slice(0, 40); return VERB_OF_ACTION[a.toLowerCase()] || a; };
const isOperation = (action) => { const a = String(action || '').trim().toLowerCase(); return !!a && !NOT_AN_OPERATION.includes(a); };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const RING = 64;
/** A command "in flight" for longer than this at the takeover is a LOST result (the tap missed it), never an
 *  interruption — the daemon's own action timeouts are far shorter (a long `wait` included). */
const IN_FLIGHT_MAX_MS = 5 * 60 * 1000;
/** How many operation ids a pair remembers as ALREADY COUNTED (a command whose result was lost is told once). */
const SEEN_CAP = 256;

/** Append one stream record to a trace ring (`{kind:'command'|'result', id, action, at}`), bounded. Only
 *  records with an id are kept; a record of no operation (the `launch` pair, the probe) is dropped whole. */
function noteRecord(log, rec, { cap = RING } = {}) {
  const out = Array.isArray(log) ? log : [];
  if (!rec || (rec.kind !== 'command' && rec.kind !== 'result') || rec.id === undefined || rec.id === null || rec.id === '') return out;
  if ((rec.kind === 'command' || rec.action) && !isOperation(rec.action)) return out; // a result names its action (measured 0.32.0: `{type, id, action, …}`)
  out.push({ kind: rec.kind, id: String(rec.id).slice(0, 80), action: String(rec.action || '').slice(0, 40), at: num(rec.at) });
  if (out.length > cap) out.splice(0, out.length - cap);
  return out;
}

/**
 * WHICH OPERATIONS WERE IN FLIGHT AT `at` — PURE over the trace's records: every `command` received at or before
 * the instant (and within IN_FLIGHT_MAX_MS of it) whose `result` (same id) was not received at or before it, in
 * arrival order. A result that lands after the instant (the interrupted call's own error) does not take it out; a
 * command after the instant was never in flight at it. → [{id, verb, action, at}]
 */
function inFlightAt(log, at, { maxAgeMs = IN_FLIGHT_MAX_MS } = {}) {
  const t = num(at);
  const list = Array.isArray(log) ? log : [];
  const done = new Set(list.filter((r) => r && r.kind === 'result' && num(r.at) <= t).map((r) => String(r.id)));
  const out = []; const seen = new Set();
  for (const r of list) {
    if (!r || r.kind !== 'command' || num(r.at) > t || t - num(r.at) > maxAgeMs || !isOperation(r.action)) continue;
    const id = String(r.id);
    if (done.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, verb: verbOfAction(r.action), action: String(r.action || ''), at: num(r.at) });
  }
  return out;
}

const uniq = (xs) => { const s = new Set(); const out = []; for (const x of xs) { const k = String(x || '').trim(); if (k && !s.has(k)) { s.add(k); out.push(k); } } return out; };

/**
 * A takeover OPENS a cycle — or MERGES into the one still open (a second takeover before the handback: nothing
 * counted twice, `takeovers` counts it, `fresh` false so no second card goes out).
 * `inFlight` = inFlightAt(…) at the instant; `aborted` = the mediator's answer [{method, sessionId}].
 * → { cycle, fresh }
 */
function openInterruption(prev, { takenAt = 0, inFlight = [], aborted = [] } = {}) {
  const p = prev && typeof prev === 'object' ? prev : null;
  const open = p && !p.closedAt ? p : null;
  // a CLOSED previous cycle hands on the ids it already counted (`seen`): a command whose result the trace never got is
  // told once, never again at every later takeover
  const seen = open ? (open.seen || []) : p ? (p.seen || []).concat(p.inFlight.map((x) => x.id)).slice(-SEEN_CAP) : [];
  const base = open || { openedAt: num(takenAt), inFlight: [], aborted: [], refused: [], takeovers: 0, closedAt: 0, seen };
  const ids = new Set(base.inFlight.map((x) => x.id).concat(seen));
  const inF = base.inFlight.slice();
  for (const x of Array.isArray(inFlight) ? inFlight : []) { if (!x || x.id == null || ids.has(String(x.id))) continue; ids.add(String(x.id)); inF.push({ id: String(x.id), verb: String(x.verb || verbOfAction(x.action)), at: num(x.at) }); }
  const ab = base.aborted.slice();
  for (const a of Array.isArray(aborted) ? aborted : []) if (a && a.method) ab.push({ method: String(a.method).slice(0, 80), sessionId: a.sessionId ? String(a.sessionId) : null, at: num(takenAt) });
  if (ab.length > RING) ab.splice(0, ab.length - RING);
  return { cycle: { ...base, inFlight: inF.slice(-RING), aborted: ab, takeovers: base.takeovers + 1 }, fresh: !open };
}
/** The agent tried a verb while the user drove (refused browser_paused at /resolve) — it goes on the re-run list. */
function noteRefused(cycle, { verb = '', at = 0 } = {}) {
  if (!cycle || typeof cycle !== 'object' || cycle.closedAt) return cycle || null;
  const v = String(verb || '').trim().slice(0, 40);
  if (!v) return cycle;
  const refused = cycle.refused.concat([{ verb: v, at: num(at) }]).slice(-RING);
  return { ...cycle, refused };
}
/** The handback CLOSES the cycle (a closed cycle takes no more refusals; the next takeover opens a new one). */
function closeInterruption(cycle, { at = 0 } = {}) {
  if (!cycle || typeof cycle !== 'object') return null;
  return { ...cycle, closedAt: num(at) || 1 };
}
/** What was INTERRUPTED at the takeover: the trace's operations (by id), else — no trace of this browser — the
 *  CDP methods the mediator aborted. → { n, verbs } */
function operationsOf(cycle) {
  const c = cycle && typeof cycle === 'object' ? cycle : null;
  if (!c) return { n: 0, verbs: [] };
  if (c.inFlight.length) return { n: c.inFlight.length, verbs: uniq(c.inFlight.map((x) => x.verb)) };
  const methods = uniq(c.aborted.map((a) => a.method));
  return { n: methods.length, verbs: methods };
}
/** THE RE-RUN LIST at the handback: what was interrupted, then what the agent tried while the user drove — each
 *  verb once, in order. Empty ⇒ the handback says nothing about re-running. */
function interruptedVerbs(cycle) {
  const c = cycle && typeof cycle === 'object' ? cycle : null;
  if (!c) return [];
  return uniq(operationsOf(c).verbs.concat(c.refused.map((r) => r.verb)));
}
/** What the takeover event / the live view / a route carry (never a command's params). */
function interruptionView(cycle) {
  const c = cycle && typeof cycle === 'object' ? cycle : null;
  if (!c) return null;
  const ops = operationsOf(c);
  // verify r6: `terminated` = the CDP sessions a Runtime.terminateExecution went to (one per session that had an aborted
  // SCRIPT call — the mediator's plan) — the live view tells the human that a script running in the page was stopped
  const terminated = new Set(c.aborted.filter((a) => SCRIPT_METHODS.includes(a.method)).map((a) => a.sessionId || '(page)')).size;
  return { openedAt: num(c.openedAt), takeovers: num(c.takeovers), n: ops.n, verbs: ops.verbs, aborted: c.aborted.length, terminated, refused: uniq(c.refused.map((r) => r.verb)), rerun: interruptedVerbs(c), closedAt: num(c.closedAt) };
}

const listText = (verbs, max = 8) => { const v = uniq(verbs); return v.length > max ? `${v.slice(0, max).join(', ')} and ${v.length - max} more` : v.join(', '); };
const whoOf = (label, target = 'browser') => (label ? `the "${label}" ${target === 'window' ? 'window' : 'browser'}` : `your ${target === 'window' ? 'window' : 'browser'}`);
/**
 * THE TAKEOVER'S WORDS — the conversation card and the zero-spend notice the agent reads at its next turn:
 *   "The user took over the "Work" browser; 2 operations were interrupted: fill, eval. Wait for the handback,
 *    then run them again."   ·   "The user took over your browser; nothing of yours was running there. Wait for
 *    the handback before using it again."
 */
function takeoverText({ label = null, n = 0, verbs = [], target = 'browser' } = {}) {
  const who = whoOf(label, target);
  const k = Math.max(0, Math.floor(num(n)));
  if (!k) return `The user took over ${who}; nothing of yours was running there. Wait for the handback before using it again.`;
  return `The user took over ${who}; ${k} operation${k === 1 ? ' was' : 's were'} interrupted: ${listText(verbs)}. Wait for the handback, then run ${k === 1 ? 'it' : 'them'} again.`;
}
/** The handback's reminder; '' when there is nothing to re-run. */
function rerunSentence(verbs) {
  const v = uniq(Array.isArray(verbs) ? verbs : []);
  return v.length ? `Re-run what was interrupted: ${listText(v)} — read the page first; refs from before the takeover are stale.` : '';
}

module.exports = {
  INTERRUPTED_CODE, INTERRUPTED_TEXT, interruptedText, SCRIPT_METHODS, NOT_AN_OPERATION, VERB_OF_ACTION, verbOfAction, isOperation, IN_FLIGHT_MAX_MS, SEEN_CAP,
  noteRecord, inFlightAt, openInterruption, noteRefused, closeInterruption, operationsOf, interruptedVerbs, interruptionView,
  takeoverText, rerunSentence,
};
