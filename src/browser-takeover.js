'use strict';
/**
 * TAKEOVER AND HANDBACK — PURE (imports nothing; CJS so the keeper, the ws
 * bridge, the routes AND the browser bundle carry ONE rule set).
 * docs/design-agent-browser-v2.md §4.3 / §4.3.1, phase P3.
 *
 * WHAT IS DECIDED HERE:
 *   · WHO HOLDS THE INPUT SIDE of one (conversation, browser) pair — the
 *     INPUT STATE `{input:'agent'|'user', takenAt, takenBy:{viewerId,at},
 *     lastUserInputAt, handedBackAt, handbackCause, url}`. Kept IN MEMORY by
 *     the keeper (a server restart is a handback by construction: the viewer
 *     that held the controls is gone, and a reload must never re-seize them).
 *   · `decideTakeover` — a click flips it to `user`; a SECOND viewer while a
 *     live one holds it is refused with the typed `held` (the human side is
 *     one side, and two hands on one mouse is what §4.3's badge exists to
 *     prevent); the same viewer again is idempotent.
 *   · `decideHandback` — flips it back and RECORDS WHY (`HANDBACK_CAUSES`):
 *     `explicit` (the click), `idle` (the timer — §4.3.1's zero-spend moment),
 *     `viewer-left` (the holder's window closed), `restart`, `detach`. Any
 *     viewer may hand back: releasing the agent is never a fight.
 *   · `browserPausedRefusal` — the typed refusal an agent command gets while
 *     the user drives (the `tab_gone` precedent): who took over, when, and
 *     what to do — never a timeout, never a guess.
 *   · `announceVerdict` — §4.3.1's THREE MOMENTS: take-over delivers nothing
 *     (the agent is told by the refusal, free); an EXPLICIT handback delivers
 *     through the ladder (the agent may be idle and only a turn wakes it);
 *     an IDLE / viewer-left handback delivers NOTHING unless the default-OFF
 *     setting `browser.announceIdleHandback` says so. `restart`/`detach`
 *     never deliver. The lease flip is a state change and happens regardless.
 *   · `handbackText` — the announcement, CARRYING THE CURRENT URL so the
 *     agent re-orients (the human may have logged in, solved a captcha, or
 *     navigated — that is the point). `handbackNotice` is the zero-spend
 *     twin that rides the user's own next message when nothing is delivered.
 *   · `--confirm-actions` (§4.3 last bullet): `confirmationFromUpstream`
 *     reads the daemon's `confirmation_required` answer (measured strings on
 *     0.32.0: a `confirmation_required` response with a `confirmation_id`,
 *     "Pending confirmations auto-deny after 60 seconds", `confirm <id>` /
 *     `deny <id>`) off the stream's `result` mirror; `confirmationView` is
 *     the card with its countdown; `decisionArgv` is the CLI call an answer
 *     becomes — never a second mechanism beside upstream's.
 *   · `agentCursorFromCommand` — the labelled agent cursor: the last CDP
 *     input coordinates the stream's `command` mirror carried (a selector
 *     click carries none — the label still moves to the last known point).
 *   · `target` (P9b, design §4.9 / §6.6): a WINDOW target's takeover and
 *     handback are the same thing as a tab's — the same input state, the same
 *     three modes, the same spend gate — so the wording functions take
 *     `target: 'browser' | 'window'` and change only the NOUN and the
 *     re-orient line (a window has no URL to carry: the agent snapshots it).
 *     The browser strings are byte-identical to before (pinned).
 * Gate: scripts/test-browser-takeover.mjs (fast); the window noun in
 * scripts/test-window-target.mjs.
 */

const INPUT_SIDES = Object.freeze(['agent', 'user']);
const HANDBACK_CAUSES = Object.freeze(['explicit', 'idle', 'viewer-left', 'restart', 'detach']);
/** What a takeover is OF: a browser tab (the default, every string unchanged)
 *  or a native window target (P9b — the noun changes, the rules do not). */
const TARGETS = Object.freeze(['browser', 'window']);
const targetOf = (t) => (TARGETS.includes(t) ? t : 'browser');
/** "the "Notes" window" / "your browser" — the ONE noun rule. */
const whoOf = (label, target = 'browser') => { const n = targetOf(target); return label ? `the "${label}" ${n}` : `your ${n}`; };
/** The ONE declared unattended-spend reason of this feature (§4.3.1). */
const SPEND_REASON = 'browser-handback';
/** Measured on 0.32.0: "Pending confirmations auto-deny after 60 seconds." */
const CONFIRM_TTL_MS = 60 * 1000;
/** The inactivity window after which a takeover somebody walked away from
 *  hands back by itself (setting `browser.takeoverIdleMs`; this is the default
 *  and what an unreadable value falls back to). */
const DEFAULT_TAKEOVER_IDLE_MS = 10 * 60 * 1000;
const MIN_TAKEOVER_IDLE_MS = 30 * 1000;
/** Upstream `command` actions that carry pointer coordinates (0.32.0's CDP
 *  mirror: `params.x/params.y` on the mouse family; a selector click has none). */
const POINTER_ACTIONS = Object.freeze(['click', 'dblclick', 'mouse_move', 'mouse_down', 'mouse_up', 'mousemove', 'mousedown', 'mouseup', 'hover', 'tap', 'drag', 'scroll', 'wheel', 'input_mouse', 'input_touch']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** ONE key per (conversation, browser): the ephemeral browser has no profile. */
function inputKeyFor(browserKey, profileId) { return `${String(browserKey || '')}|${profileId ? String(profileId) : 'ephemeral'}`; }

function newInputState() {
  return { input: 'agent', takenAt: 0, takenBy: null, lastUserInputAt: 0, handedBackAt: 0, handbackCause: null, url: '' };
}

/** `browser.takeoverIdleMs` → a usable number: unreadable ⇒ the default,
 *  0 = never (a real choice, like the idle timeout), else ≥ 30 s. */
function takeoverIdleMs(v) {
  if (v === undefined || v === null || v === '') return DEFAULT_TAKEOVER_IDLE_MS;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TAKEOVER_IDLE_MS;
  if (n === 0) return 0;
  return Math.max(MIN_TAKEOVER_IDLE_MS, Math.round(n));
}

const spellAgo = (ms) => { const s = Math.max(0, Math.round(num(ms) / 1000)); return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
const spellDur = (ms) => { const s = Math.max(0, Math.round(num(ms) / 1000)); return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };

/**
 * The user takes over. `{ok:true, state, already}` or the typed `held` when
 * ANOTHER viewer holds the controls (`holderAlive` is the bridge's fact: a
 * holder whose socket is gone never blocks — the bridge hands back for it).
 */
function decideTakeover({ state = null, viewerId = null, now = 0, holderAlive = true } = {}) {
  if (viewerId === null || viewerId === undefined || viewerId === '') return { ok: false, code: 'bad-request', error: 'a takeover needs the viewer taking it' };
  const s = state && typeof state === 'object' ? state : newInputState();
  const t = num(now);
  if (s.input === 'user' && s.takenBy && s.takenBy.viewerId === viewerId) return { ok: true, state: { ...s }, already: true };
  if (s.input === 'user' && s.takenBy && holderAlive) {
    return { ok: false, code: 'held', error: `another viewer took over ${spellAgo(t - num(s.takenAt))} — the controls are theirs until they hand back`, holder: { ...s.takenBy } };
  }
  return { ok: true, already: false, state: { ...s, input: 'user', takenAt: t, takenBy: { viewerId, at: t }, lastUserInputAt: t, handedBackAt: 0, handbackCause: null } };
}

/**
 * Control goes back to the agent. `cause` ∈ HANDBACK_CAUSES; `url` is the
 * page the human left it on (carried into the announcement). Any viewer may
 * hand back; `byHolder` says whether it was the one driving.
 */
function decideHandback({ state = null, viewerId = null, cause = 'explicit', now = 0, url = '' } = {}) {
  const s = state && typeof state === 'object' ? state : newInputState();
  const c = HANDBACK_CAUSES.includes(cause) ? cause : 'explicit';
  if (s.input !== 'user') return { ok: false, code: 'not_taken', error: 'nobody has taken over this browser — nothing to hand back' };
  const t = num(now);
  const u = typeof url === 'string' && url ? url : (s.url || '');
  return {
    ok: true, cause: c, heldMs: Math.max(0, t - num(s.takenAt)), byHolder: !!(s.takenBy && viewerId !== null && s.takenBy.viewerId === viewerId),
    state: { ...s, input: 'agent', takenBy: null, handedBackAt: t, handbackCause: c, url: u },
  };
}

/** Has a takeover lapsed? `idleMs` 0 = never. */
function idleHandbackVerdict({ state = null, now = 0, idleMs = DEFAULT_TAKEOVER_IDLE_MS } = {}) {
  const s = state && typeof state === 'object' ? state : null;
  if (!s || s.input !== 'user') return { lapsed: false, idleFor: 0, why: 'not taken over' };
  const lim = num(idleMs);
  const last = num(s.lastUserInputAt) || num(s.takenAt);
  const idleFor = Math.max(0, num(now) - last);
  if (!(lim > 0)) return { lapsed: false, idleFor, why: 'idle handback is off (0)' };
  return { lapsed: idleFor >= lim, idleFor, why: idleFor >= lim ? `no input for ${spellDur(idleFor)} (window ${spellDur(lim)})` : 'still within the window' };
}

/**
 * §4.3.1's three moments, as one verdict: does THIS handback open a billed
 * turn through the ladder? `announceIdle` = setting browser.announceIdleHandback.
 */
function announceVerdict({ cause = 'explicit', announceIdle = false } = {}) {
  const c = HANDBACK_CAUSES.includes(cause) ? cause : 'explicit';
  if (c === 'explicit') return { deliver: true, reason: SPEND_REASON, why: 'an explicit handback is a per-occurrence owner act, and the agent may be idle — only a turn wakes it (it still takes the ceiling)' };
  if (c === 'idle' || c === 'viewer-left') return announceIdle
    ? { deliver: true, reason: SPEND_REASON, why: `browser.announceIdleHandback is ON — a ${c} handback is announced under the same reason and the same ceiling` }
    : { deliver: false, reason: null, why: `a ${c} handback is nobody's action: zero-spend by default (the lease flips, the live view and the card update, the agent discovers it when its next command succeeds; the notice rides the next message)` };
  return { deliver: false, reason: null, why: `a ${c} handback is a state change only` };
}

/** The typed refusal an agent command gets while the user drives. */
function browserPausedRefusal({ state = null, label = null, handles = [], now = 0, idleMs = DEFAULT_TAKEOVER_IDLE_MS, target = 'browser' } = {}) {
  const s = state && typeof state === 'object' ? state : newInputState();
  const tg = targetOf(target);
  const who = whoOf(label, tg);
  const lim = num(idleMs);
  const back = lim > 0 ? `the live view hands back explicitly, or by itself after ${spellDur(lim)} without input` : 'the live view hands back explicitly';
  const after = tg === 'window' ? 'snapshot the window again when it comes back — they may have changed it' : 'it names the page they left you on';
  return {
    ok: false, code: tg === 'window' ? 'window_paused' : 'browser_paused',
    error: `the user took over ${who} ${spellAgo(num(now) - num(s.takenAt))} — your command did NOT run. Wait for the handback (${back}); ${after}. Do not retry in a loop.`,
    takenAt: num(s.takenAt), lastUserInputAt: num(s.lastUserInputAt), handles: Array.isArray(handles) ? handles : [], target: tg,
  };
}

/** The announcement the ladder delivers (a turn the agent is billed for —
 *  say the whole thing once, with the URL first). */
function handbackText({ cause = 'explicit', label = null, url = '', heldMs = 0, idleMs = DEFAULT_TAKEOVER_IDLE_MS, target = 'browser', handle = null } = {}) {
  const tg = targetOf(target);
  const who = whoOf(label, tg);
  const c = HANDBACK_CAUSES.includes(cause) ? cause : 'explicit';
  const head = c === 'explicit' ? `The user handed ${who} back to you after ${spellDur(heldMs)} of driving it.`
    : c === 'idle' ? `The user's takeover of ${who} lapsed (no input for ${spellDur(idleMs)}); control is back with you.`
      : c === 'viewer-left' ? `The user closed the live view that held ${who}; control is back with you.`
        : `Control of ${who} is back with you (${c}).`;
  if (tg === 'window') return `${head} Snapshot it before continuing (\`vibespace-window snapshot ${handle || '<handle>'}\`) — the window may have changed (something typed, a dialog opened, a different state); refs from before the takeover are stale.`;
  const where = url ? `Current URL: ${url}` : 'Current URL: unknown (read it with `vibespace-browser -- get url`)';
  return `${head} ${where}. Re-orient before continuing — the page may have changed (a login, a captcha, a navigation).`;
}

/** The zero-spend notice (session-status `pushNotice`, kind `browser-handback`)
 *  that rides the user's own next message when nothing is delivered. */
function handbackNotice({ cause = 'idle', label = null, url = '', heldMs = 0, idleMs = DEFAULT_TAKEOVER_IDLE_MS, at = 0, target = 'browser', handle = null } = {}) {
  const tg = targetOf(target);
  return { kind: 'browser-handback', cause: HANDBACK_CAUSES.includes(cause) ? cause : 'idle', label: label || null, url: url || null, heldMs: num(heldMs), idleMs: num(idleMs), at: num(at), ...(tg === 'window' ? { target: tg, handle: handle || null } : {}) };
}
function renderHandbackNotice(n) {
  return '<system-reminder>\n' + handbackText(n || {}) + '\n</system-reminder>';
}

/** The "For you" item an idle handback files (§4.3.1: "file one item saying the takeover lapsed"). */
function idleInboxItem({ label = null, idleMs = DEFAULT_TAKEOVER_IDLE_MS, url = '', sessionName = '', target = 'browser' } = {}) {
  const tg = targetOf(target);
  const who = label ? `the "${label}" ${tg}` : `the agent's ${tg}`;
  return {
    text: `Your takeover of ${who}${sessionName ? ` (${sessionName})` : ''} lapsed after ${spellDur(idleMs)} without input — the agent is driving again`,
    detail: `${url ? `Page you left it on: ${url}. ` : ''}Nothing was sent to the agent (browser.announceIdleHandback is off); it learns of the handback when its next ${tg} command succeeds, or with your next message. Take over again from the live view if you were not done.`,
    urgency: 'low',
  };
}

// ── --confirm-actions (§4.3) ──────────────────────────────────────────────
/** A pending confirmation read off the stream's `result` mirror (or the CLI's
 *  own JSON answer). null when the record is not one. */
function confirmationFromUpstream(msg, now = 0) {
  if (!isObj(msg)) return null;
  const d = isObj(msg.data) ? msg.data : null;
  const flag = msg.confirmation_required === true || (d && d.confirmation_required === true) || msg.status === 'confirmation_required' || (d && d.status === 'confirmation_required')
    || (typeof msg.error === 'string' && /confirmation[_ ]required|requires? (?:a )?confirmation/i.test(msg.error)); // 0.32.0 spells it both ways ("confirmation_required" in the status, "Action requires confirmation" in the error text)
  if (!flag) return null;
  let id = msg.confirmation_id || (d && d.confirmation_id) || msg.confirmationId || (d && d.confirmationId) || null;
  if (!id && typeof msg.error === 'string') { const m = msg.error.match(/\b(c_[0-9a-f]{4,})\b/i); if (m) id = m[1]; }
  if (!id) return null;
  const action = String(msg.action || (d && d.action) || (isObj(msg.params) && msg.params.action) || 'action').slice(0, 40);
  const category = String((d && d.category) || msg.category || '').slice(0, 60) || null;
  const at = num(msg.timestamp) || num(now);
  return { id: String(id).slice(0, 80), action, category, at, expiresAt: at + CONFIRM_TTL_MS, commandId: msg.id ? String(msg.id).slice(0, 40) : null };
}
/** A `command`/`result` for `confirm <id>` / `deny <id>` resolves a pending one. */
function confirmationResolvedFromUpstream(msg) {
  if (!isObj(msg) || (msg.type !== 'command' && msg.type !== 'result')) return null;
  const action = String(msg.action || '');
  if (action !== 'confirm' && action !== 'deny') return null;
  const p = isObj(msg.params) ? msg.params : {};
  const id = p.id || p.confirmation_id || p.confirmationId || (Array.isArray(p.args) ? p.args[0] : null) || null;
  if (!id) return null;
  return { id: String(id).slice(0, 80), decision: action, source: msg.type };
}
/** The card: what is pending, and how long the daemon will still take an answer. */
function confirmationView(c, now = 0) {
  if (!c) return null;
  const remainingMs = Math.max(0, num(c.expiresAt) - num(now));
  return { type: 'confirmation', id: c.id, action: c.action, category: c.category || null, at: num(c.at), expiresAt: num(c.expiresAt), remainingMs, expired: remainingMs <= 0 };
}
/** An answer becomes upstream's own command — never a second mechanism. */
function decisionArgv(id, decision) {
  const d = decision === 'deny' ? 'deny' : (decision === 'confirm' ? 'confirm' : null);
  if (!d) return { ok: false, code: 'bad-request', error: 'a decision is confirm or deny' };
  const i = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(i)) return { ok: false, code: 'bad-request', error: 'a confirmation id is 1-80 chars of [A-Za-z0-9_-]' };
  return { ok: true, argv: [d, i], decision: d, id: i };
}
/** The daemon's answer to confirm/deny → a typed verdict ("No pending confirmation" ⇒ no_confirmation). */
function decisionVerdict(json) {
  if (!isObj(json)) return { ok: false, code: 'unavailable', error: 'no JSON answer from agent-browser' };
  if (json.success === false || json.error) {
    const e = String(json.error || 'confirm/deny failed');
    return /no pending confirmation/i.test(e) ? { ok: false, code: 'no_confirmation', error: 'no pending confirmation with that id (it was answered, or auto-denied after 60 s)' } : { ok: false, code: 'refused', error: e.slice(0, 300) };
  }
  return { ok: true, code: null, error: null };
}

// ── the agent cursor (§4.3 "cursor identity") ─────────────────────────────
/** The last CDP input coordinates the `command` mirror carried. `{action, x, y, at}`
 *  (x/y null when the action names no point — a selector click); null for a
 *  record that is not a pointer command. */
function agentCursorFromCommand(msg) {
  if (!isObj(msg) || msg.type !== 'command') return null;
  const action = String(msg.action || '');
  const p = isObj(msg.params) ? msg.params : {};
  const hasXY = Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
  const pt = hasXY ? { x: Number(p.x), y: Number(p.y) } : (Array.isArray(p.touchPoints) && isObj(p.touchPoints[0]) && Number.isFinite(Number(p.touchPoints[0].x)) ? { x: Number(p.touchPoints[0].x), y: Number(p.touchPoints[0].y) } : null);
  if (!POINTER_ACTIONS.includes(action) && !pt) return null;
  return { action: action.slice(0, 40), x: pt ? pt.x : null, y: pt ? pt.y : null, at: num(msg.timestamp) || 0 };
}

/** The badge's words: one of three, never ambiguous (§4.3's table). */
function modeBadge({ mode = 'watch', mine = false } = {}) {
  if (mode !== 'takeover') return 'Agent is driving';
  return mine ? 'You are driving — agent asked to pause' : 'Another viewer is driving — agent asked to pause';
}

/** What the session card / status bar publish: 'user' while anybody drives
 *  ANY of this conversation's browsers, 'agent' when it has one, null when none. */
function inputSummary(states, hasBrowser) {
  const list = Array.isArray(states) ? states : [];
  const held = list.find((s) => s && s.input === 'user');
  if (held) return { input: 'user', takenAt: num(held.takenAt) };
  return hasBrowser ? { input: 'agent', takenAt: 0 } : null;
}

module.exports = {
  INPUT_SIDES, HANDBACK_CAUSES, TARGETS, SPEND_REASON, CONFIRM_TTL_MS, DEFAULT_TAKEOVER_IDLE_MS, MIN_TAKEOVER_IDLE_MS, POINTER_ACTIONS,
  inputKeyFor, newInputState, takeoverIdleMs, decideTakeover, decideHandback, idleHandbackVerdict, announceVerdict,
  browserPausedRefusal, handbackText, handbackNotice, renderHandbackNotice, idleInboxItem,
  confirmationFromUpstream, confirmationResolvedFromUpstream, confirmationView, decisionArgv, decisionVerdict,
  agentCursorFromCommand, modeBadge, inputSummary,
};
