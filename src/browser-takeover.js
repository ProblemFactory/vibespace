'use strict';
/**
 * TAKEOVER AND HANDBACK — PURE (imports only its PURE sibling browser-stale.js; CJS so the keeper, the ws
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
 *     `viewer-left` (the holder's window closed), `restart`, `detach`,
 *     `stop` (lane H verify r6: the browser was stopped while the user drove
 *     it). Any viewer may hand back: releasing the agent is never a fight.
 *   · `browserPausedRefusal` — the typed refusal an agent command gets while
 *     the user drives (the `tab_gone` precedent): who took over, when, and
 *     what to do — never a timeout, never a guess.
 *   · `announceVerdict` — §4.3.1's THREE MOMENTS: take-over delivers nothing
 *     (the agent is told by the refusal, free); an EXPLICIT handback delivers
 *     through the ladder (the agent may be idle and only a turn wakes it);
 *     an IDLE / viewer-left handback delivers NOTHING unless the default-OFF
 *     setting `browser.announceIdleHandback` says so. `restart`/`detach`/
 *     `stop` never deliver. The lease flip is a state change and happens regardless.
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
 *   · THE KEYBOARD WHILE YOU DRIVE (lane J r2 — the 2026-09-25 naive-user
 *     study: typed text vanished or landed in the CHAT COMPOSER, one Enter
 *     from sending "tomsmith…" — a password — to the agent). While THIS
 *     client drives, the live view owns the keyboard at DOCUMENT level:
 *     `keyboardOwnership` says when (takeover + mine + connected + displayed
 *     + open), `keyRoute` says where each key goes (the page; the app for the
 *     named `RESERVED_CHORDS` only; the IME sink while composing; the browser's
 *     own paste event for the paste chord), `focusVerdict` says that no
 *     editable element outside the live view may hold focus meanwhile, and
 *     `ownerOf` picks ONE owner when two views drive on one client. Esc goes
 *     to the page — pages close their own dialogs with it; handing back is
 *     the bar's button, never a key a user presses for another reason.
 *   · STALE APPROVALS (lane J r2, the study's S8-36): an approval card the
 *     agent queued for a browser PAGE command before the user took over
 *     would, once allowed, run a step planned on a page that may be gone.
 *     `browserApprovalVerdict` reads a pending shell permission's command
 *     (the shell words, `vibespace-browser`'s own verb table through an
 *     injected `classify`, the handle it names) and says whether it targets
 *     the browser the user took; `staleDenyText` is the deny the CLI hands
 *     the model (it NAMES browser_paused), `staleFromDenyMessage` reads it
 *     back (a rebuild after a restart keeps the reason). Two moments: at
 *     the takeover (queued before it) and at the handback (queued during it).
 * Gate: scripts/test-browser-takeover.mjs (fast); the window noun in
 * scripts/test-window-target.mjs; the real rung in test-browser-live ⑥.
 */

const INPUT_SIDES = Object.freeze(['agent', 'user']);
// lane H verify r6 LOW 3: `stop` — the browser the takeover was on was STOPPED (a panel Stop while the user drove it): the
// takeover cannot outlive its browser, so control goes back with the stop (a state change, never a delivered turn)
const HANDBACK_CAUSES = Object.freeze(['explicit', 'idle', 'viewer-left', 'restart', 'detach', 'stop']);
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
        : c === 'stop' ? `The user stopped ${who} while they were driving it; control is back with you.`
          : `Control of ${who} is back with you (${c}).`;
  // lane H verify r6 LOW 3: a stopped browser has no page to re-orient on — its pages are gone; the next command starts it
  if (c === 'stop' && tg === 'browser') return `${head} Its open pages are closed — your next browser command starts it again${url ? ` (the user was last on ${url})` : ''}.`;
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
function modeBadge({ mode = 'watch', mine = false, stopped = false, unstable = null } = {}) {
  // naive study 2 (finding 3): a view of a STOPPED browser never says somebody drives it (it read "Agent is driving"
  // over about:blank as if a new browser had started) — a view never starts a browser; it waits for the next command
  // lane H verify r5: `stopped` may name WHY (the refusal's code) — a closed browser is not a stopped one
  if (stopped === 'browser_closed') return 'Browser closed';
  // lane H verify r6 MINOR 1: `unstable: 'failing'` = every ask to start it again FAILED — no browser ever came back to close
  if (stopped === 'browser_unstable') return unstable === 'failing' ? 'Browser could not start' : 'Browser keeps closing';
  if (stopped) return 'Browser stopped';
  if (mode !== 'takeover') return 'Agent is driving';
  return mine ? 'You are driving — agent asked to pause' : 'Another viewer is driving — agent asked to pause';
}

// ── lane J r2: THE KEYBOARD WHILE YOU DRIVE ────────────────────────────────
/** The ONLY chords a driving viewer does not send to the page — each named
 *  with why. Everything else goes to the page (Esc and Tab included). */
const RESERVED_CHORDS = Object.freeze([
  Object.freeze({ id: 'command-mode', spell: 'Ctrl+\\', why: "the window manager's prefix key: the one keyboard way to another window, and no page uses it" }),
  Object.freeze({ id: 'desktop-switch', spell: 'Ctrl+Alt+Left / Ctrl+Alt+Right', why: 'switches virtual desktops — hiding the live view hands the keyboard back to the app by itself' }),
]);
const kflags = (k) => ({ key: String((k && k.key) || ''), ctrl: !!(k && k.ctrlKey), alt: !!(k && k.altKey), meta: !!(k && k.metaKey), shift: !!(k && k.shiftKey) });
function reservedChordOf(k) {
  const f = kflags(k);
  if (f.key === '\\' && f.ctrl && !f.alt && !f.meta) return 'command-mode';
  if ((f.key === 'ArrowLeft' || f.key === 'ArrowRight') && f.ctrl && f.alt && !f.meta) return 'desktop-switch';
  return null;
}
/** Ctrl+V / Cmd+V / Shift+Insert: the browser's own `paste` event carries the
 *  text (the page gets the TEXT, never the chord — the remote browser's
 *  clipboard is not yours). */
function isPasteChord(k) {
  const f = kflags(k);
  if ((f.key === 'v' || f.key === 'V') && (f.ctrl || f.meta) && !f.alt) return true;
  return f.key === 'Insert' && f.shift && !f.ctrl && !f.meta && !f.alt;
}
/**
 * Does THIS live view own the keyboard right now? Only while this viewer holds
 * the takeover (`mode:'takeover'`, `mine`), its socket is open (a dead socket
 * would swallow every key — the input side went back to the agent anyway),
 * the view is on screen (typing blind into a hidden page is not driving) and
 * the window is open. `{owns, why}`.
 */
function keyboardOwnership({ mode = 'watch', mine = false, connected = true, displayed = true, closed = false } = {}) {
  if (closed) return { owns: false, why: 'closed' };
  if (mode !== 'takeover') return { owns: false, why: 'watch' };
  if (!mine) return { owns: false, why: 'another viewer drives' };
  if (!connected) return { owns: false, why: 'disconnected' };
  if (!displayed) return { owns: false, why: 'hidden' };
  return { owns: true, why: 'driving' };
}
/**
 * Where one key goes while a view owns the keyboard:
 *   'compose' — an IME composition (or a dead key) is in progress: the view's
 *               own input sink composes, `compositionend` hands the text over;
 *   'app'     — a RESERVED_CHORDS chord, or the window manager's command mode
 *               is armed (after its prefix the next key is the app's);
 *   'paste'   — the paste chord: let the browser raise `paste`, forward its text;
 *   'page'    — everything else, forwarded as a key record.
 * `k` = the DOM KeyboardEvent's fields; `appMode` = 'command' while the
 * command-mode prefix is armed.
 */
function keyRoute(k, { appMode = null } = {}) {
  const f = kflags(k);
  if ((k && (k.isComposing || Number(k.keyCode) === 229)) || f.key === 'Dead' || f.key === 'Process') return { to: 'compose' };
  const chord = reservedChordOf(k);
  if (chord) return { to: 'app', chord };
  if (appMode === 'command') return { to: 'app', chord: 'command-mode' };
  if (isPasteChord(k)) return { to: 'paste' };
  return { to: 'page' };
}
/**
 * Focus while a view owns the keyboard: an EDITABLE element (a textarea, an
 * input, a contenteditable — the chat composer, a terminal's hidden textarea,
 * a dialog's field) outside the owning view may not hold it — the view takes
 * it back (`'reclaim'`); the view's own sink and every non-editable element
 * are left alone (`'allow'`). Not owning ⇒ always `'allow'`.
 */
function focusVerdict({ owns = false, editable = false, insideView = false } = {}) {
  if (!owns || !editable || insideView) return 'allow';
  return 'reclaim';
}
/** Two views driving on one client (two browsers taken over): the LAST claim
 *  that still owns wins. `claims` = [{id, owns:boolean}] in claim order. */
function ownerOf(claims) {
  const list = Array.isArray(claims) ? claims : [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].owns) return list[i].id;
  return null;
}

// ── lane J r2: STALE APPROVALS ────────────────────────────────────────────
// the deny's words + their read-back live in src/browser-stale.js (the normalizer reads them back, and a module the
// device bundle carries must not grow the CLI's name — test-architecture §52b); re-exported here for one import site
const { STALE_MOMENTS, STALE_MARK, staleDenyText, staleFromDenyMessage } = require('./browser-stale.js');
/** The permission tool names that carry a shell command (claude's Bash; the
 *  codex normalizer maps commandExecution approvals onto the same name). */
const SHELL_TOOLS = Object.freeze(['bash', 'shell']);
/** Words that run the NEXT word as the command (so `timeout 30 vibespace-browser
 *  click` and `env X=1 node …/vibespace-browser click` are invocations, and
 *  `echo vibespace-browser click` is not). */
const RUNNERS = Object.freeze(['env', 'command', 'exec', 'nohup', 'time', 'timeout', 'sudo', 'node', 'nice', 'stdbuf']);
const BROWSER_CLI = 'vibespace-browser';
/** A shell command → its simple commands, each as words (POSIX quoting:
 *  '…', "…" with \ escapes, \ outside quotes; ; & | && || newline ( ) $( `
 *  separate). `{ok:false}` when a quote never closes — the caller decides. */
function shellSegments(command) {
  const src = String(command || '');
  const segs = []; let words = []; let cur = ''; let has = false; let i = 0;
  const endWord = () => { if (has) words.push(cur); cur = ''; has = false; };
  const endSeg = () => { endWord(); if (words.length) segs.push(words); words = []; };
  while (i < src.length) {
    const c = src[i];
    if (c === "'") { const j = src.indexOf("'", i + 1); if (j < 0) return { ok: false, segments: segs }; cur += src.slice(i + 1, j); has = true; i = j + 1; continue; }
    if (c === '"') {
      let j = i + 1; let buf = '';
      for (; j < src.length && src[j] !== '"'; j++) { if (src[j] === '\\' && j + 1 < src.length && '"\\$`'.includes(src[j + 1])) { buf += src[j + 1]; j++; } else buf += src[j]; }
      if (j >= src.length) return { ok: false, segments: segs };
      cur += buf; has = true; i = j + 1; continue;
    }
    if (c === '\\' && i + 1 < src.length) { cur += src[i + 1]; has = true; i += 2; continue; }
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    if (c === '\n' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '`') { endSeg(); i++; continue; }
    if (c === '$' && src[i + 1] === '(') { endSeg(); i += 2; continue; }
    cur += c; has = true; i++;
  }
  endSeg();
  return { ok: true, segments: segs };
}
const baseName = (w) => String(w || '').split('/').pop();
/** The argv after `vibespace-browser` in one simple command, or null when the
 *  command does not RUN it (a mention in an echo, a grep, a path). */
function browserArgvOf(words) {
  const w = Array.isArray(words) ? words : [];
  let i = 0;
  while (i < w.length) {
    const x = w[i];
    if (baseName(x) === BROWSER_CLI) return w.slice(i + 1);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(x)) { i++; continue; }                        // an env assignment
    if (RUNNERS.includes(baseName(x))) { i++; while (i < w.length && (/^-/.test(w[i]) || /^\d+[smhd]?$/.test(w[i]))) i++; continue; } // a runner and its flags / duration
    return null;
  }
  return null;
}
/**
 * Is this pending approval a browser PAGE command aimed at the browser the
 * user took? `permission` = the normalized card ({toolName, input:{command}}),
 * `classify` = browser-verbs.classify (injected — this module imports
 * nothing), `taken` = {handles:[alias, profileId…], isDefault} of the browser
 * taken over (the ephemeral browser: `isDefault:true`, no handles).
 * → `{stale, why, verb?, handle?}`. An unparseable command that names the
 * CLI is stale (the user is driving; denying costs one re-plan, allowing
 * could act on a page nobody planned for).
 */
function browserApprovalVerdict({ permission = null, classify = null, taken = {} } = {}) {
  const p = isObj(permission) ? permission : null;
  if (!p) return { stale: false, why: 'no permission' };
  if (p.resolved) return { stale: false, why: 'already answered' };
  if (p.kind === 'user_input') return { stale: false, why: 'a question, not a command' };
  if (!SHELL_TOOLS.includes(String(p.toolName || '').toLowerCase())) return { stale: false, why: 'not a shell command' };
  const input = isObj(p.input) ? p.input : {};
  const cmd = Array.isArray(input.command) ? input.command.map(String).join(' ') : String(input.command || '');
  if (!cmd.includes(BROWSER_CLI)) return { stale: false, why: 'does not run the browser CLI' };
  const parsed = shellSegments(cmd);
  if (!parsed.ok) return { stale: true, why: 'names the browser CLI in a command that could not be read (an unclosed quote)' };
  const handles = Array.isArray(taken && taken.handles) ? taken.handles.map(String) : [];
  for (const words of parsed.segments) {
    const argv = browserArgvOf(words);
    if (!argv) continue;
    let c = null;
    try { c = typeof classify === 'function' ? classify(argv, { ours: true }) : null; } catch { c = null; }
    const kind = c && c.kind;
    if (kind !== 'page' && kind !== 'escape') continue;                                  // `status`, `profiles`, `help`… never touch the page
    const handle = c.profile ? String(c.profile) : null;
    if (handle ? handles.includes(handle) : !!(taken && taken.isDefault)) return { stale: true, why: `a page command (${c.verb || '?'}) on the browser the user took`, verb: c.verb || null, handle };
  }
  return { stale: false, why: 'no page command on the browser the user took' };
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
  // lane J r2: the keyboard while you drive; stale approvals
  RESERVED_CHORDS, reservedChordOf, isPasteChord, keyboardOwnership, keyRoute, focusVerdict, ownerOf,
  STALE_MOMENTS, STALE_MARK, SHELL_TOOLS, shellSegments, browserArgvOf, browserApprovalVerdict, staleDenyText, staleFromDenyMessage,
};
