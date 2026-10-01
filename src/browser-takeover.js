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
 *   · THE TAKEOVER INTERRUPTS (the owner's ruling, 2026-09-27 — "直接打断所有脚本和
 *     agent操作，告知agent发生了打断，交还时提醒它重新运行"; the words and the cycle are
 *     PURE src/browser-interrupt.js, re-exported here): `takeoverNotice` /
 *     `renderTakeoverNotice` = the zero-spend notice the agent reads at its next
 *     turn ("…; N operations were interrupted: …"), the handback's words carry
 *     `rerun` ("Re-run what was interrupted: …" — absent when nothing was in flight
 *     and nothing was refused, so those strings stay byte-identical), and so does
 *     the idle handback's For-you item.
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
 *     becomes — never a second mechanism beside upstream's. r6 A-F8 ("what
 *     you approve is what runs"): the STRUCTURED fields only (never an error
 *     string), the card names the TARGET, first write wins per id
 *     (`pendingNoteVerdict`), an answer passes `answerGate` (pending HERE; a
 *     Confirm carries `confirmationDigest` of what its card showed), and the
 *     card's rows keep their slots (`confirmSlots`). r6 A-F9: `handbackWakes`
 *     is how many billed turns an explicit Hand back starts, `handbackWakeEcho`
 *     the count the control showed, checked.
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
 *   · THE USER'S OWN PRESS YIELDS (lane takeover-keyboard, userW
 *     inc-mum339id-1zsb, 2026-09-28: the chat beside the live view in one
 *     split group, Take over, three presses on the chat composer — the typing
 *     went to the page): the reclaim above was written for PROGRAMMATIC focus
 *     (an attach / reconnect / message moving the caret into the composer
 *     while a password is typed into the page) and it treated the user's own
 *     pointer press on the composer the same way, silently. `userPressFocus`
 *     says whether a focus follows the user's OWN trusted press on that very
 *     editable within `USER_PRESS_MS`; `focusVerdict` then answers `'yield'`
 *     (the keyboard goes there, the takeover continues) instead of
 *     `'reclaim'`; `keyboardOwnership` takes `yielded` (a yielded view owns
 *     no keys); `yieldAfter` is the yield's transitions (a press inside the
 *     view, a fresh claim or its release ends it). A focus nobody pressed for
 *     is reclaimed exactly as before.
 *   · A DIALOG YOU OPENED TAKES THE KEYS (lane dialog-keys, the owner's "ok" 2026-09-30 on takeover-keyboard r4's
 *     proposal — before, Delete → the confirm → Enter put a line break into the PAGE and the file stayed): an app modal the
 *     user's own trusted act opened (`dialogOpener`) gets Enter / Escape / Tab / typing (`dialogVerdict` → 'take';
 *     `keyboardOwnership` reads `dialog`), the takeover continues, and its close gives the keys back where they were
 *     (`dialogReturn`: the page, the text box they were yielded to, the older dialog's field); a modal that opens BY
 *     ITSELF while the keys are the page's is taken back and said once (`dialogReclaimCue`) — the password guard.
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

const INT = require('./browser-interrupt.js'); // PURE: the interruption's words + cycle (the owner's ruling, 2026-09-27)
const TBS = require('./browser-tabs.js'); // lane browser-resume C (PURE): the user's tab acts while he drove, said at the handback
// re-exported under their own names (shorthand keeps node's CJS named-export detection whole: the client imports this file as ESM)
const { INTERRUPTED_CODE, INTERRUPTED_TEXT, inFlightAt, openInterruption, noteRefused, closeInterruption, interruptedVerbs, interruptionView, takeoverText, rerunSentence } = INT;
const INPUT_SIDES = Object.freeze(['agent', 'user']);
// lane H verify r6 LOW 3: `stop` — the browser the takeover was on was STOPPED (a panel Stop while the user drove it): the
// takeover cannot outlive its browser, so control goes back with the stop (a state change, never a delivered turn)
// lane browser-resume B (§3.9, the owner's ruling 2): `continue` — the user's "Hand back and continue": the takeover ends and
// the user's note + the tabs ride the conversation's NEXT turn through the stash (ONE carrier — never a delivered turn,
// never the zero-spend notice beside it)
const HANDBACK_CAUSES = Object.freeze(['explicit', 'idle', 'viewer-left', 'restart', 'detach', 'stop', 'continue']);
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

/**
 * lane P verify (docs/design-browser-multiview.md D3, finding 3): the viewer DRIVING hands its control to ANOTHER
 * view of the same browser (a fold-back of the window you drive) — the takeover goes on (takenAt, the idle clock
 * and the url kept), only its holder changes; nothing is handed back to the agent. The bridge checks that `to` is a
 * view of the very same relay; this verdict checks who may pass.
 */
function decidePass({ state = null, from = null, to = null, now = 0 } = {}) {
  const s = state && typeof state === 'object' ? state : newInputState();
  if (to === null || to === undefined || to === '' || to === from) return { ok: false, code: 'bad-request', error: 'a pass names ANOTHER view to hand the controls to' };
  if (s.input !== 'user' || !s.takenBy) return { ok: false, code: 'not_taken', error: 'nobody has taken over this browser — nothing to pass' };
  if (s.takenBy.viewerId !== from) return { ok: false, code: 'not_holder', error: 'only the view that is driving can pass the controls on' };
  return { ok: true, state: { ...s, takenBy: { viewerId: to, at: num(now) } } };
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
function announceVerdict({ cause = 'explicit', announceIdle = false, sibling = false, rerun = [] } = {}) {
  const c = HANDBACK_CAUSES.includes(cause) ? cause : 'explicit';
  // verify r7 (S2, spend): a handback MIRRORED to a sibling conversation (taken WITH the primary — the user never looked at
  // its view) is delivered only when ITS cycle interrupted or refused something (its agent was told to wait for the handback
  // that names it); with nothing of its own to re-run, a billed wake would tell an idle agent nothing it needs now — the
  // zero-spend notice rides its next turn. One click on one view never wakes every conversation leased on the browser.
  if (c === 'explicit' && sibling && !(Array.isArray(rerun) && rerun.length)) return { deliver: false, reason: null, why: 'a handback mirrored from another conversation\'s view, with nothing of this conversation\'s interrupted or refused: zero-spend — the notice rides its next turn' };
  if (c === 'explicit') return { deliver: true, reason: SPEND_REASON, why: 'an explicit handback is a per-occurrence owner act, and the agent may be idle — only a turn wakes it (it still takes the ceiling)' };
  // lane browser-resume B: the between-turns twin — the stash entry IS its carrier (the agent reads it at its next turn); no
  // turn, no notice (two carriers read the same hand-back twice — the owner's one-carrier rule, 2026-09-27)
  if (c === 'continue') return { deliver: false, reason: null, notice: false, why: 'the user handed it back for the next turn — the stash entry carries the note and the tabs (one carrier, nothing billed)' };
  if (c === 'idle' || c === 'viewer-left') return announceIdle
    ? { deliver: true, reason: SPEND_REASON, why: `browser.announceIdleHandback is ON — a ${c} handback is announced under the same reason and the same ceiling` }
    : { deliver: false, reason: null, why: `a ${c} handback is nobody's action: zero-spend by default (the lease flips, the live view and the card update, the agent discovers it when its next command succeeds; the notice rides the next message)` };
  return { deliver: false, reason: null, why: `a ${c} handback is a state change only` };
}

/**
 * r6 A-F9 (money): HOW MANY billed turns ONE explicit Hand back starts — the conversation whose view it is pressed on
 * plus every sibling conversation taken WITH it whose own cycle has something to re-run: the SAME `announceVerdict` the
 * announcer runs, once per conversation, so the number on the control is the number the ladder will spend.
 * `siblings` = [{rerun}] (each sibling's open cycle's `interruptedVerbs`).
 */
function handbackWakes({ own = true, ownRerun = [], siblings = [] } = {}) {
  let wakes = 0;
  if (own && announceVerdict({ cause: 'explicit', sibling: false, rerun: ownRerun }).deliver) wakes++;
  for (const s of Array.isArray(siblings) ? siblings : []) if (announceVerdict({ cause: 'explicit', sibling: true, rerun: (s && s.rerun) || [] }).deliver) wakes++;
  return wakes;
}
/** The echo (the channels `expectWakes` precedent): an explicit Hand back carries the count its control showed; another
 *  count ⇒ refused BY NAME, nothing handed back, the current count returned. Absent ⇒ not checked (a surface that shows
 *  no count — the card row, the chip's menu — hands back the one conversation it names plus what the words said). */
function handbackWakeEcho({ wakes = 0, expect } = {}) {
  if (expect === undefined || expect === null) return { ok: true };
  if (Number.isInteger(expect) && expect === wakes) return { ok: true };
  return { ok: false, code: 'wake_count_changed', error: `this Hand back would wake ${wakes} conversation(s) = ${wakes} billed turn(s), but the control you pressed said ${Number.isInteger(expect) ? expect : '?'} — nothing was handed back; look at the button again and press it once more`, wakes };
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
 *  say the whole thing once, with the URL first). `rerun` (the owner's ruling,
 *  2026-09-27 — "交还时提醒它重新运行") = the verbs the takeover interrupted or
 *  refused: said LAST, once; absent/empty ⇒ the words are byte-identical to before. */
function handbackText({ cause = 'explicit', label = null, url = '', heldMs = 0, idleMs = DEFAULT_TAKEOVER_IDLE_MS, target = 'browser', handle = null, rerun = [], userActs = [] } = {}) {
  const tg = targetOf(target);
  const who = whoOf(label, tg);
  const c = HANDBACK_CAUSES.includes(cause) ? cause : 'explicit';
  const head = c === 'explicit' ? `The user handed ${who} back to you after ${spellDur(heldMs)} of driving it.`
    : c === 'idle' ? `The user's takeover of ${who} lapsed (no input for ${spellDur(idleMs)}); control is back with you.`
      : c === 'viewer-left' ? `The user closed the live view that held ${who}; control is back with you.`
        : c === 'stop' ? `The user stopped ${who} while they were driving it; control is back with you.`
          : `Control of ${who} is back with you (${c}).`;
  const again = tg === 'browser' ? INT.rerunSentence(rerun) : '';
  // lane browser-resume C (the owner's ruling 3): what the user did to the agent's tabs while he drove — said once, here
  const acts = tg === 'browser' ? TBS.userActsSentence(userActs) : '';
  const tail = (acts ? ` ${acts}` : '') + (again ? ` ${again}` : '');
  // lane H verify r6 LOW 3: a stopped browser has no page to re-orient on — its pages are gone; the next command starts it
  if (c === 'stop' && tg === 'browser') return `${head} Its open pages are closed — your next browser command starts it again${url ? ` (the user was last on ${url})` : ''}.${tail}`;
  if (tg === 'window') return `${head} Snapshot it before continuing (\`vibespace-window snapshot ${handle || '<handle>'}\`) — the window may have changed (something typed, a dialog opened, a different state); refs from before the takeover are stale.`;
  const where = url ? `Current URL: ${url}` : 'Current URL: unknown (read it with `vibespace-browser -- get url`)';
  return `${head} ${where}. Re-orient before continuing — the page may have changed (a login, a captcha, a navigation).${tail}`;
}

/**
 * READ BACK the words `handbackText` wrote (lane S3): the chat card of a
 * delivered handback is titled "VibeSpace · you handed control back after 17 s
 * — the page is now …", and on a transcript rebuild the card has only the
 * delivered TEXT to go on. This module wrote that text, so this module is the
 * one that parses it (test-chat-hygiene round-trips every cause × target).
 * → { cause, target, dur, url, title: {key, params} } | null. The title is an
 * i18n KEY: the reader's device words it, the user is "you".
 */
const DUR = '(\\d+ (?:s|min|h))';
const WHO = '(?:your (browser|window)|the "[^"]*" (browser|window))';
function handbackFacts(text) {
  const s = String(text == null ? '' : text);
  const url = (/Current URL: (\S+?)\.(?:\s|$)/.exec(s) || [])[1] || null;
  const tg = (m) => (m && (m[1] || m[2])) || 'browser';
  let m;
  if ((m = new RegExp(`The user handed ${WHO} back to you after ${DUR} of driving it\\.`).exec(s))) {
    const target = tg(m), dur = m[3];
    const title = target === 'window' ? { key: 'you handed control of the window back after {dur}', params: { dur } }
      : url ? { key: 'you handed control back after {dur} — the page is now {url}', params: { dur, url } }
        : { key: 'you handed control back after {dur}', params: { dur } };
    return { cause: 'explicit', target, dur, url, title };
  }
  if ((m = new RegExp(`The user's takeover of ${WHO} lapsed \\(no input for ${DUR}\\)`).exec(s))) {
    return { cause: 'idle', target: tg(m), dur: m[3], url, title: { key: 'your takeover lapsed after {dur} without input — the assistant has control again', params: { dur: m[3] } } };
  }
  if ((m = new RegExp(`The user closed the live view that held ${WHO}`).exec(s))) {
    return { cause: 'viewer-left', target: tg(m), dur: null, url, title: { key: 'you closed the live view — the assistant has control again', params: {} } };
  }
  if ((m = new RegExp(`The user stopped ${WHO} while they were driving it`).exec(s))) {
    return { cause: 'stop', target: tg(m), dur: null, url, title: { key: tg(m) === 'window' ? 'you stopped the window while driving it' : 'you stopped the browser while driving it', params: {} } };
  }
  if ((m = new RegExp(`Control of ${WHO} is back with you \\(([\\w-]+)\\)`).exec(s))) {
    return { cause: m[3], target: tg(m), dur: null, url, title: { key: 'the assistant has control again', params: {} } };
  }
  return null;
}

/** The zero-spend notice (session-status `pushNotice`, kind `browser-handback`)
 *  that rides the user's own next message when nothing is delivered. */
function handbackNotice({ cause = 'idle', label = null, url = '', heldMs = 0, idleMs = DEFAULT_TAKEOVER_IDLE_MS, at = 0, target = 'browser', handle = null, rerun = [], userActs = [] } = {}) {
  const tg = targetOf(target);
  const again = tg === 'browser' && Array.isArray(rerun) ? rerun.map(String).filter(Boolean).slice(0, 20) : [];
  // lane browser-resume C: the user's tab acts ride the notice too (bounded like the cycle: 16, the words cut)
  const acts = tg === 'browser' && Array.isArray(userActs) ? userActs.filter((a) => a && INT.USER_ACT_KINDS.includes(a.kind)).slice(-INT.USER_ACTS_CAP).map((a) => ({ kind: a.kind, title: String(a.title || '').slice(0, 300), url: String(a.url || '').slice(0, 2048) })) : [];
  return { kind: 'browser-handback', cause: HANDBACK_CAUSES.includes(cause) ? cause : 'idle', label: label || null, url: url || null, heldMs: num(heldMs), idleMs: num(idleMs), at: num(at), ...(tg === 'window' ? { target: tg, handle: handle || null } : {}), ...(again.length ? { rerun: again } : {}), ...(acts.length ? { userActs: acts } : {}) };
}
function renderHandbackNotice(n) {
  return '<system-reminder>\n' + handbackText(n || {}) + '\n</system-reminder>';
}

/** THE TAKEOVER'S NOTICE (the owner's ruling, 2026-09-27 — "告知agent发生了打断"): zero-spend (session-status
 *  `pushNotice`, kind `browser-takeover`) — the agent reads it at its next turn; the conversation card carries the
 *  same words at the takeover (the handback announcer, never the delivery ladder: nothing is billed). */
function takeoverNotice({ label = null, n = 0, verbs = [], at = 0 } = {}) {
  return { kind: 'browser-takeover', label: label || null, n: Math.max(0, Math.floor(num(n))), verbs: (Array.isArray(verbs) ? verbs : []).map(String).filter(Boolean).slice(0, 20), at: num(at) };
}
function takeoverNoticeText(n) { const x = n || {}; return INT.takeoverText({ label: x.label || null, n: x.n || 0, verbs: x.verbs || [] }); }
function renderTakeoverNotice(n) {
  return '<system-reminder>\n' + takeoverNoticeText(n) + '\n</system-reminder>';
}

/** The "For you" item an idle handback files (§4.3.1: "file one item saying the takeover lapsed"). `rerun` = what the
 *  takeover interrupted (the owner's ruling, 2026-09-27): the agent is told with the notice; the owner sees the same list. */
function idleInboxItem({ label = null, idleMs = DEFAULT_TAKEOVER_IDLE_MS, url = '', sessionName = '', target = 'browser', rerun = [] } = {}) {
  const tg = targetOf(target);
  const who = label ? `the "${label}" ${tg}` : `the agent's ${tg}`;
  const again = tg === 'browser' && Array.isArray(rerun) ? rerun.map(String).filter(Boolean) : [];
  return {
    text: `Your takeover of ${who}${sessionName ? ` (${sessionName})` : ''} lapsed after ${spellDur(idleMs)} without input — the agent is driving again`,
    detail: `${url ? `Page you left it on: ${url}. ` : ''}Nothing was sent to the agent (browser.announceIdleHandback is off); it learns of the handback when its next ${tg} command succeeds, or with your next message. Take over again from the live view if you were not done.${again.length ? ` Interrupted when you took over — the agent is told to re-run: ${again.join(', ')}.` : ''}`,
    urgency: 'low',
  };
}

// ── --confirm-actions (§4.3) ──────────────────────────────────────────────
// r6 A-F8 ("what you approve is what runs"): a confirmation is read ONLY off upstream's STRUCTURED fields of a `result`
// record (`confirmation_required` + `confirmation_id`, top level or under `data` — the 0.38.1 binary's own JSON keys),
// never matched out of an error / message string: a `click` whose error text echoed "requires confirmation c_<the pending
// upload's id>" parsed as {id: that upload, action: 'click'}, overwrote the upload's card, and Confirm confirmed the upload.
// The card carries the action's TARGET (the paired `command` record's params: url / selector / files / path / script, or
// upstream's own `description`), and an answer carries the DIGEST of what the card showed (`confirmationDigest`).
const CONFIRMATION_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TARGET_MAX = 300;
/** Invisible / reordering characters shown as what they are (the Trojan-Source class): the card is textContent, but a
 *  U+202E inside a url or a path would still reorder what the owner reads. */
// verify-r6 Z2: THE SET is src/hidden-chars.js; a one-line card marks a tab / line break too (it would break the line)
const HC = require('./hidden-chars.js');
const visibleText = (s) => HC.revealHidden(String(s), { open: '⟨', close: '⟩' }).replace(/[\t\n]/g, (c) => `⟨${HC.codeOf(c)}⟩`);
/** What the pending action acts ON, as one line the owner reads (≤ 300 chars, cut said with …). Fill/type VALUES are
 *  never shown (the trace's redaction rule — the selector is the target, the text is content). */
function confirmationTarget({ params = null, data = null } = {}) {
  const p = isObj(params) ? params : {};
  const d = isObj(data) ? data : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''));
  const parts = [];
  const url = str(p.url) || str(p.href);
  if (url) parts.push(url);
  const sel = ['selector', 'ref', 'target', 'source', 'from'].map((k) => str(p[k])).find(Boolean);
  if (sel) parts.push(sel);
  if (str(p.to)) parts.push('→ ' + str(p.to));
  const files = Array.isArray(p.files) ? p.files : Array.isArray(p.paths) ? p.paths : null;
  if (files && files.length) parts.push(files.map((f) => str(f)).filter(Boolean).join(', '));
  if (str(p.path)) parts.push(str(p.path));
  const script = str(p.script) || str(p.expression) || str(p.js) || str(p.code);
  if (script) parts.push(script.length > 200 ? script.slice(0, 200) + '…' : script);
  if (!parts.length && str(d.description)) parts.push(str(d.description));
  if (!parts.length) return null;
  const line = visibleText(parts.join(' · '));
  return line.length > TARGET_MAX ? line.slice(0, TARGET_MAX - 1) + '…' : line;
}
/** THE canonical text of what a card shows — the ONE thing both sides digest. */
function confirmationShown(c) {
  const x = c && typeof c === 'object' ? c : {};
  return [String(x.id || ''), String(x.action || ''), String(x.category || ''), String(x.target || '')].join('\n');
}
/** A 64-bit FNV-1a (two 32-bit lanes) of `confirmationShown` — PURE, the same in the bundle and on the server. */
function confirmationDigest(c) {
  const s = confirmationShown(c);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ ch, 0x01000193) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0; }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
/** A pending confirmation read off the stream's `result` mirror — its STRUCTURED fields only. `command` = the paired
 *  `command` record the bridge saw under the same id (its params name the target). null when the record is not one. */
function confirmationFromUpstream(msg, now = 0, { command = null } = {}) {
  if (!isObj(msg) || msg.type !== 'result') return null;
  const d = isObj(msg.data) ? msg.data : null;
  const flag = msg.confirmation_required === true || (d && d.confirmation_required === true) || msg.status === 'confirmation_required' || (d && d.status === 'confirmation_required');
  if (!flag) return null;
  const id = [msg.confirmation_id, d && d.confirmation_id, msg.confirmationId, d && d.confirmationId].find((x) => typeof x === 'string' && x) || null;
  if (!id || !CONFIRMATION_ID_RE.test(id)) return null; // an id the answer could never name is no card
  const cmd = isObj(command) && command.type === 'command' && (command.id == null || msg.id == null || String(command.id) === String(msg.id)) ? command : null;
  const action = visibleText(String(msg.action || (d && d.action) || (cmd && cmd.action) || (isObj(msg.params) && msg.params.action) || 'action').slice(0, 40));
  const category = visibleText(String((d && d.category) || msg.category || '').slice(0, 60)) || null;
  const target = confirmationTarget({ params: isObj(msg.params) ? msg.params : (cmd && cmd.params), data: d });
  const at = num(msg.timestamp) || num(now);
  return { id, action, category, target, at, expiresAt: at + CONFIRM_TTL_MS, commandId: msg.id ? String(msg.id).slice(0, 40) : null };
}
/** FIRST WRITE WINS (r6 A-F8): a second record for an id the registry already holds may never change what the owner
 *  was shown — `same` (a re-mirror, nothing to do) | `conflict` (other content: kept, said) | `new`. */
function pendingNoteVerdict(held, incoming) {
  if (!held) return { kind: 'new' };
  if (confirmationDigest(held) === confirmationDigest(incoming)) return { kind: 'same' };
  return { kind: 'conflict', error: `a second record for confirmation ${held.id} carries other content (${JSON.stringify(String((incoming && incoming.action) || ''))}${incoming && incoming.target ? ' on ' + JSON.stringify(String(incoming.target)) : ''}) than the pending one (${JSON.stringify(String(held.action || ''))}${held.target ? ' on ' + JSON.stringify(String(held.target)) : ''}) — the first is kept, the second ignored` };
}
/** Before ANY answer reaches upstream (r6 A-F8): the id must be pending for THIS browser (the registry's entry, not
 *  expired), and a Confirm must carry the digest of the card it was pressed on — equal to the entry's. A Deny runs
 *  nothing, so it needs only the pending entry. → {ok:true} | the named refusal (nothing sent upstream). */
function answerGate({ entry = null, decision = 'confirm', shown, now = 0 } = {}) {
  if (!entry || num(entry.expiresAt) <= num(now)) return { ok: false, code: 'no_confirmation', error: 'no confirmation with that id is pending for this browser — nothing was sent (it was answered, it expired and the browser denied it, or it belongs to another browser)' };
  if (decision !== 'confirm') return { ok: true };
  if (typeof shown !== 'string' || !shown) return { ok: false, code: 'shown_required', error: 'a Confirm names the card it was pressed on (the digest of what it showed) — nothing was sent; press Confirm on the live view\'s card' };
  const cur = confirmationDigest(entry);
  if (shown !== cur) return { ok: false, code: 'confirmation_changed', error: 'the pending confirmation is not what your card showed — nothing was sent; look at the card again before confirming', digest: cur };
  return { ok: true };
}
/** THE CARD'S SLOTS (r6 A-F8 ⑤): a row that goes (answered / expired) keeps its slot as a tombstone while any live row
 *  sits BELOW it — the row under the pointer never moves up into a Confirm the owner meant for another; a new row joins
 *  at the END; trailing tombstones go (nothing below them moves). `gone` is sticky. */
function confirmSlots(prev = [], liveIds = []) {
  const live = new Set((Array.isArray(liveIds) ? liveIds : []).map(String));
  const out = (Array.isArray(prev) ? prev : []).map((s) => ({ id: String(s.id), gone: !!s.gone || !live.has(String(s.id)) }));
  const have = new Set(out.map((s) => s.id));
  for (const id of live) if (!have.has(id)) out.push({ id, gone: false });
  while (out.length && out[out.length - 1].gone) out.pop();
  return out;
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
  return { type: 'confirmation', id: c.id, action: c.action, category: c.category || null, target: c.target || null, digest: confirmationDigest(c), at: num(c.at), expiresAt: num(c.expiresAt), remainingMs, expired: remainingMs <= 0 };
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
 * the window is open. `{owns, why}`. lane takeover-keyboard: `yielded` — the
 * user pressed a text box outside the view (`focusVerdict` → 'yield'), so the
 * view owns no keys until a press inside it; the takeover itself continues.
 */
function keyboardOwnership({ mode = 'watch', mine = false, connected = true, displayed = true, closed = false, yielded = false, dialog = false } = {}) {
  if (closed) return { owns: false, why: 'closed' };
  if (mode !== 'takeover') return { owns: false, why: 'watch' };
  if (!mine) return { owns: false, why: 'another viewer drives' };
  if (!connected) return { owns: false, why: 'disconnected' };
  if (!displayed) return { owns: false, why: 'hidden' };
  if (dialog) return { owns: false, why: 'dialog' }; // lane dialog-keys: a dialog the user's own press opened holds the keys until it closes
  if (yielded) return { owns: false, why: 'yielded' };
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
// ── lane live-input (2026-09-27, the owner on a Mac driving a Linux Chromium): ⌘ CHORDS, COPY OUT, LOG-SAFE URLS ──
/** Does a platform string (navigator.userAgentData.platform / navigator.platform / a UA / node's process.platform)
 *  name a Mac? iPad/iPhone count (their keyboards send ⌘ too). */
function isMacPlatform(s) { return /mac|darwin|iphone|ipad|ipod/i.test(String(s || '')); }
/**
 * THE MAC CHORD TABLE (item B). On a Mac the editing chords are ⌘-chords; a Linux (or Windows) Chromium gives ⌘ (Meta)
 * no editing meaning and — MEASURED on Chromium 151, the owner's build — TYPES the letter of a Meta chord: ⌘A / ⌘C /
 * ⌘X / ⌘Z typed "a" / "c" / "x" / "z" into the page. So when the VIEWER is a Mac and the BROWSER is not, a chord is
 * translated before it becomes a key record. Rows are matched in order; `from` names the Mac keys, `to` what reaches the
 * page. Only a key already routed to the PAGE is translated (Ctrl+Backslash / Ctrl+Alt+←/→ keep their app route: keyRoute runs
 * first; ⌘V is the paste route, never a key record).
 */
const MAC_CHORD_ROWS = Object.freeze([
  Object.freeze({ id: 'meta-key', from: '⌘ alone', to: 'Ctrl', why: 'the modifier itself: the page sees Ctrl held while ⌘ is (its keyup matches its keydown)' }),
  Object.freeze({ id: 'line-start', from: '⌘←', to: 'Home', why: 'the Mac start-of-line (Shift kept: ⌘⇧← selects to the start)' }),
  Object.freeze({ id: 'line-end', from: '⌘→', to: 'End', why: 'the Mac end-of-line' }),
  Object.freeze({ id: 'doc-start', from: '⌘↑', to: 'Ctrl+Home', why: 'the Mac top of the document' }),
  Object.freeze({ id: 'doc-end', from: '⌘↓', to: 'Ctrl+End', why: 'the Mac bottom of the document' }),
  Object.freeze({ id: 'word-jump', from: '⌥← / ⌥→ / ⌥↑ / ⌥↓', to: 'Ctrl+← / → / ↑ / ↓', why: 'the Mac word jump; Alt+← on Linux is the browser’s Back' }),
  Object.freeze({ id: 'word-delete', from: '⌥⌫ / ⌥⌦ / ⌘⌫', to: 'Ctrl+Backspace / Ctrl+Delete / Ctrl+Backspace', why: 'delete a word (⌘⌫ deletes to the line start on a Mac — the nearest single chord)' }),
  Object.freeze({ id: 'command', from: '⌘ + any other key (A C X Z ⇧Z F R …)', to: 'Ctrl + the same key, no text', why: 'the editing and browser chords (select all, copy, cut, undo, redo, find, reload …) — the text is dropped so a chord never types a letter' }),
  Object.freeze({ id: 'option-char', from: '⌥ + a key that produced a character (⌥2 = ™, ⌥e then e = é)', to: 'that character, no Alt', why: 'the Mac\'s Option characters are text, not an Alt accelerator' }),
]);
const META_CODES = Object.freeze({ MetaLeft: 'ControlLeft', MetaRight: 'ControlRight', OSLeft: 'ControlLeft', OSRight: 'ControlRight' });
/**
 * `k` = the DOM KeyboardEvent's fields {key, code, keyCode, ctrlKey, altKey, metaKey, shiftKey}; → the same fields
 * translated (+ `dropText` when the record must carry no text, `rule` = the MAC_CHORD_ROWS id, null = unchanged).
 * Identity unless `viewerMac && !remoteMac`.
 */
function macChord(k, { viewerMac = false, remoteMac = false } = {}) {
  const f = { key: String((k && k.key) || ''), code: String((k && k.code) || ''), keyCode: Number(k && k.keyCode) || 0, ctrlKey: !!(k && k.ctrlKey), altKey: !!(k && k.altKey), metaKey: !!(k && k.metaKey), shiftKey: !!(k && k.shiftKey), dropText: false, rule: null };
  if (!viewerMac || remoteMac) return f;
  const out = (o, rule) => ({ ...f, ...o, rule });
  if (f.key === 'Meta' || f.key === 'OS' || META_CODES[f.code]) return out({ key: 'Control', code: META_CODES[f.code] || 'ControlLeft', keyCode: 17, metaKey: false, ctrlKey: f.metaKey || f.ctrlKey }, 'meta-key'); // held on its keydown, released on its keyup
  if (f.metaKey && !f.ctrlKey) {
    const nav = { ArrowLeft: ['Home', 'Home', 36, false, 'line-start'], ArrowRight: ['End', 'End', 35, false, 'line-end'], ArrowUp: ['Home', 'Home', 36, true, 'doc-start'], ArrowDown: ['End', 'End', 35, true, 'doc-end'] }[f.key];
    if (nav) return out({ key: nav[0], code: nav[1], keyCode: nav[2], metaKey: false, ctrlKey: nav[3], altKey: false, dropText: true }, nav[4]);
    if (f.key === 'Backspace') return out({ metaKey: false, ctrlKey: true, altKey: false, dropText: true }, 'word-delete');
    return out({ metaKey: false, ctrlKey: true, dropText: true }, 'command');
  }
  if (f.altKey && !f.metaKey && !f.ctrlKey) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(f.key)) return out({ altKey: false, ctrlKey: true, dropText: true }, 'word-jump');
    if (f.key === 'Backspace' || f.key === 'Delete') return out({ altKey: false, ctrlKey: true, dropText: true }, 'word-delete');
    if (Array.from(f.key).length === 1) return out({ altKey: false }, 'option-char');
  }
  return f;
}
/** The copy-out chords (item C): Ctrl/⌘+C and Ctrl+Insert copy, Ctrl/⌘+X and Shift+Delete cut — still forwarded to the
 *  page (its own copy runs, a web terminal's Ctrl+C still interrupts); the view stamps its gesture for the answer. */
function copyChordOf(k) {
  const f = kflags(k);
  const mod = (f.ctrl || f.meta) && !f.alt;
  if (mod && (f.key === 'c' || f.key === 'C')) return 'copy';
  if (mod && (f.key === 'x' || f.key === 'X')) return 'cut';
  if (f.key === 'Insert' && f.ctrl && !f.shift && !f.alt && !f.meta) return 'copy';
  if (f.key === 'Delete' && f.shift && !f.ctrl && !f.alt && !f.meta) return 'cut';
  return null;
}
/**
 * THE COPY-OUT DOOR IS THE USER'S OWN GESTURE (lane live-input verify, 2026-09-27 — CONFIRMED on the real stack, the S2
 * law applied to the copy path): the bridge delivered EVERY copy/cut event the page fired to the driving viewer, and the
 * viewer wrote it to the clipboard on the Clipboard API (a secure page: NO act of the user's at all) or inside the 5 s a
 * plain CLICK on the picture had left the page active (plain http). A page's own script — or one the AGENT planted with
 * `eval` before the takeover — selecting a hidden element and dispatching a synthetic `copy` on a timer put ITS text on
 * the driving user's clipboard (measured: "HIJACK-19" after a takeover with nothing pressed; "HIJACK-11" after one
 * click). The clipboard is the user's device; the takeover fences the agent OUT of the user's act. So, like an input
 * credit: a copy leaves the server only on the driving user's own gesture the bridge itself forwarded — single-use,
 * short-lived (COPY_GESTURE_MS), fail closed:
 *   'chord'  a copy / cut chord keyDown (Ctrl/⌘+C, +X, Ctrl+Insert, Shift+Delete — as the bridge forwards it, the ⌘ row
 *            already translated) — the ONE gesture whose copy the viewer may write to the clipboard by itself;
 *   'click'  a mousePressed (the page's own "Copy" button) — its copy reaches the viewer as the CHIP only (one explicit
 *            click puts it on the clipboard; a page firing on the user's click gets a chip, never a silent write);
 *   none     dropped at the bridge, counted (`copiesDropped`) — nothing leaves the server.
 * `modifiers` on a record are the stream's bitmask (browser-stream KEY_MODIFIERS: alt 1, ctrl 2, meta 4, shift 8).
 */
const REC_MODIFIERS = Object.freeze({ alt: 1, ctrl: 2, meta: 4, shift: 8 });
const COPY_GESTURES = Object.freeze(['chord', 'click']);
const COPY_GESTURE_MS = 2000;
/** What a forwarded input record ARMS: 'chord' | 'click' | null. */
function copyGestureOfRecord(rec) {
  if (!isObj(rec)) return null;
  if (rec.type === 'input_mouse') return rec.eventType === 'mousePressed' ? 'click' : null;
  if (rec.type === 'input_keyboard' && rec.eventType === 'keyDown') {
    const m = Number(rec.modifiers) || 0;
    return copyChordOf({ key: rec.key, ctrlKey: !!(m & REC_MODIFIERS.ctrl), altKey: !!(m & REC_MODIFIERS.alt), metaKey: !!(m & REC_MODIFIERS.meta), shiftKey: !!(m & REC_MODIFIERS.shift) }) ? 'chord' : null;
  }
  return null;
}
/** The arm after a forwarded record: a gesture REPLACES it (the latest act is the one a copy answers); any other record leaves it. */
function armCopyGesture(arm, rec, now) { const g = copyGestureOfRecord(rec); return g ? { gesture: g, at: Number(now) || 0 } : (arm || null); }
/** A copy the page reported: delivered ONLY on a live arm, which it CONSUMES; none / stale ⇒ dropped, by name. */
function copyDeliverVerdict(arm, now, { ttlMs = COPY_GESTURE_MS } = {}) {
  if (!arm || !COPY_GESTURES.includes(arm.gesture)) return { deliver: false, gesture: null, arm: null, why: 'no-gesture' };
  if ((Number(now) || 0) - (Number(arm.at) || 0) > ttlMs || (Number(now) || 0) < (Number(arm.at) || 0)) return { deliver: false, gesture: null, arm: null, why: 'stale' };
  return { deliver: true, gesture: arm.gesture, arm: null, why: null };
}
/** The VIEWER's half: only a copy answering the user's own CHORD, inside the chord's window, is written by itself — the
 *  Clipboard API on a secure page, else the gesture copy on plain http; a click's copy, an unknown gesture, a chord too old
 *  ⇒ the chip (one explicit click). */
function copyWriteVerdict({ gesture = null, chordAge = null, secure = false, canWrite = false, windowMs = 5000 } = {}) {
  if (gesture !== 'chord' || typeof chordAge !== 'number' || !Number.isFinite(chordAge) || chordAge < 0 || chordAge > windowMs) return 'chip';
  return secure && canWrite ? 'api' : 'gesture';
}
/** A page URL as the JOURNAL may print it (item F): origin + path — the query string (order ids, tokens, search terms)
 *  and the fragment never reach a log line; a query is marked `?…`. The agent's own handback sentence keeps the URL. */
function urlForLog(url) {
  const s = String(url || '');
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'javascript:') return u.protocol + '…';
    const base = /^https?:$/.test(u.protocol) ? u.origin : u.protocol + (u.host ? '//' + u.host : ''); // about:blank's origin is "null"
    return base + u.pathname + (u.search ? '?…' : '');
  } catch { return s.split(/[?#]/)[0].slice(0, 200) + (/[?]/.test(s) ? '?…' : ''); }
}

/**
 * Focus while a view owns the keyboard: an EDITABLE element (a textarea, an
 * input, a contenteditable — the chat composer, a terminal's hidden textarea,
 * a dialog's field) outside the owning view may not hold it — the view takes
 * it back (`'reclaim'`); the view's own sink and every non-editable element
 * are left alone (`'allow'`). Not owning ⇒ always `'allow'`.
 * lane takeover-keyboard (userW inc-mum339id-1zsb): the rule is about focus the
 * user did NOT make — `byUserPress` (PURE `userPressFocus`: the focus follows
 * the user's own press on that editable) ⇒ `'yield'`: the keyboard goes where
 * the user pressed, the takeover continues (the agent stays refused), and a
 * press inside the view takes the keys back (`yieldAfter`). Without it the
 * answer is `'reclaim'` as before — the password guard.
 * verify r2 (H1): `mine` = the takeover is this view's even while it does not
 * drive (minimized, on another desktop, its stream reconnecting): the user's
 * press there YIELDS too — the caret's home wins until a press on the view.
 * Before, the press was not judged at all and the view, back on screen, took
 * the next keys from the text box the user had pressed (measured: "c2" typed
 * into the composer reached the PAGE). Not driving and no press ⇒ 'allow'
 * (the transition back is `keyboardTransition`'s).
 */
function focusVerdict({ owns = false, mine = false, editable = false, insideView = false, byUserPress = false } = {}) {
  if (!editable || insideView) return 'allow';
  if (!owns) return byUserPress && mine ? 'yield' : 'allow';
  return byUserPress ? 'yield' : 'reclaim';
}
/**
 * verify r2 (H1): ONE OWNERSHIP TRANSITION of a view — `was` / `now` = `{owns,
 * yielded}` before and after (was null = never judged). `changed` ⇒ the bar's
 * chip and the composers' line are redrawn AT ONCE (measured on cd867c05: a
 * view restored with the caret in the composer said nothing until the first
 * key had gone to the page); `moveCaret` ⇒ the keys just moved to the page
 * while a text box (or a frame) OUTSIDE the view holds the caret — the caret
 * moves to the sink explicitly, never merely the keys routed past it.
 * verify r2 (H3): `release` ⇒ the keys just LEFT the page (hidden, the stream
 * down, another view's claim) — every key still held there gets its keyup now
 * (`heldReleases`), while this view can still send it; after, its keyup goes
 * nowhere (measured: Shift held across a minimize — the page logged the
 * keydown and never the keyup).
 */
function keyboardTransition({ was = null, now = {}, caretOutside = false } = {}) {
  const w = { owns: !!(was && was.owns), yielded: !!(was && was.yielded), dialog: !!(was && was.dialog) };
  const n = { owns: !!(now && now.owns), yielded: !!(now && now.yielded), dialog: !!(now && now.dialog) };
  const changed = !was || w.owns !== n.owns || w.yielded !== n.yielded || w.dialog !== n.dialog; // lane dialog-keys: a dialog taking the keys (or giving them back) is a transition too
  return { changed, moveCaret: n.owns && !w.owns && !!caretOutside, release: w.owns && !n.owns };
}
/** How long after the user's own press its focus may land and still be his: a mouse press focuses in the SAME task
 *  (the mousedown's default action; xterm focuses its textarea in its mousedown handler); a touch tap focuses at its
 *  end, which the view re-stamps (pointerup on the pressed element). */
const USER_PRESS_MS = 250;
/**
 * Did the user's OWN press put the focus here? `press` = the last press the view saw OUTSIDE itself `{at, trusted}`;
 * `sameInput` = the DOM fact that the pressed element IS the focused editable, lies inside it (a child of a
 * contenteditable) or shares its input host (a terminal: a press on xterm's screen focuses its helper textarea);
 * `focusAt` = the focus's instant. `{byUserPress, why}` — a script's .focus() has no press ('no press'), a synthetic
 * pointerdown is not the user's ('synthetic press'), a press on anything else — the picture, the sidebar, a taskbar
 * button whose handler then focuses the composer — is not a press on this editable ('pressed elsewhere'), and a press
 * from before `windowMs` did not move the focus now ('stale press'). Fails closed: anything unproven is not a press.
 */
function userPressFocus({ press = null, sameInput = false, focusAt = 0, windowMs = USER_PRESS_MS } = {}) {
  if (!press) return { byUserPress: false, why: 'no press' };
  if (press.trusted !== true) return { byUserPress: false, why: 'synthetic press' };
  if (!sameInput) return { byUserPress: false, why: 'pressed elsewhere' };
  const age = Number(focusAt) - Number(press.at);
  if (!(Number.isFinite(age) && age >= 0 && age <= windowMs)) return { byUserPress: false, why: 'stale press' };
  return { byUserPress: true, why: 'pressed' };
}
/**
 * verify r2 (Q1): a focus the user CAUSED without pressing the box — a button
 * of his that focuses a text box (the composer's expand button; a Reply that
 * opens its box) — stays reclaimed: binding it would reopen verify r1's K2 (a
 * message arriving within the window of ANY press would take the keys, the
 * password guard's whole case). It is SAID instead (measured on cd867c05: the
 * expand button's box reclaimed, "qq" to the page, nothing said), at most
 * every `RECLAIM_CUE_MS`, with advice that works — a press on the box itself
 * yields. `why` = userPressFocus's answer: only 'pressed elsewhere' by the
 * user's own fresh press; a script's focus (no press) stays unsaid.
 */
const RECLAIM_CUE_MS = 6000;
function reclaimCue({ why = '', press = null, focusAt = 0, lastCueAt = null, windowMs = USER_PRESS_MS, everyMs = RECLAIM_CUE_MS } = {}) {
  if (why !== 'pressed elsewhere' || !press || press.trusted !== true) return false;
  const age = Number(focusAt) - Number(press.at);
  if (!(Number.isFinite(age) && age >= 0 && age <= windowMs)) return false;
  return !(lastCueAt != null && Number(focusAt) - Number(lastCueAt) < everyMs);
}
/** THE YIELD's transitions, per claim (two views driving each yield to the user's press): `'yield'` (the verdict above)
 *  sets it; a press inside the view (`'press-view'`), a fresh takeover (`'claim'`) or its end (`'release'`) clears it;
 *  anything else keeps it. */
const YIELD_EVENTS = Object.freeze(['yield', 'press-view', 'claim', 'release', 'homeless']);
function yieldAfter(yielded, event) {
  if (event === 'yield') return true;
  if (event === 'press-view' || event === 'claim' || event === 'release' || event === 'homeless') return false;
  return !!yielded;
}
/**
 * verify r2 (H1b'): a yield made while the view was OFF SCREEN (another desktop) can outlive its home — back on the view's
 * desktop the text box the user pressed is on the OTHER desktop, hidden, and may still hold the focus: the keys the user
 * types for the page he now sees would go into a chat box he cannot see (one Enter from the agent). The caret's home wins
 * only while it is a home — when the view comes back to driving and the yielded-to element is not a visible, focused text
 * box, the yield ends ('homeless') and the transition moves the caret to the sink.
 */
function yieldHomeVerdict({ yielded = false, drivesNow = false, drovePrev = true, homeVisible = false } = {}) {
  if (!yielded || !drivesNow || drovePrev) return 'keep';
  return homeVisible ? 'keep' : 'end';
}
// ── lane dialog-keys (the owner's "ok", 2026-09-30, on takeover-keyboard r4's proposal): A DIALOG YOU OPENED TAKES THE KEYS ──
/**
 * WHO OPENED an app MODAL (src/lib/utils.js createModalShell / the static #dialog-overlay, both announce their open in the
 * opening act's own task): the user's own act on the APP — his TRUSTED press (re-stamped at its release: a click opens at
 * the pointerup), or a key the app itself took (a reserved chord / command mode, a key typed into a dialog he opened) —
 * within `windowMs` of the open. `press` = `{at, trusted, picture}` — `picture`: the press landed on the live view's
 * PICTURE, i.e. it went to the agent's PAGE and can open nothing in the app (a dialog that opens by itself right after a
 * click into the page is not his). `{byUserPress, why}` — 'no press' | 'synthetic press' (isTrusted false: a script's
 * dispatched event is never the user — the password guard's fact) | 'pressed the page' | 'stale press' | 'pressed'.
 * Fails closed: anything unproven is not his.
 */
function dialogOpener({ press = null, openAt = 0, windowMs = USER_PRESS_MS } = {}) {
  const p = press && typeof press === 'object' ? press : null;
  const since = p ? Number(openAt) - Number(p.at) : NaN;
  const why = !p ? 'no press'
    : p.trusted !== true ? 'synthetic press'      // the browser's own isTrusted, never a flag a script could set
      : p.picture ? 'pressed the page'
        : !(Number.isFinite(since) && since >= 0 && since <= windowMs) ? 'stale press'
          : 'pressed';
  return { byUserPress: why === 'pressed', why };
}
/** What can raise a dialog the keyboard rules see: an app modal, or the agent's PAGE dialog (the live view's own
 *  Accept / Dismiss bar, lane browser-stuck) — the page's is not an app modal and is never taken by this rule. */
const DIALOG_OPENERS = Object.freeze(['app', 'page']);
/**
 * An APP MODAL opened while this client drives the agent's browser (asked only while the takeover is this view's).
 * Before (takeover-keyboard verify r3 F4): every one was TAKEN BACK — Delete → the confirm → Enter put a line break into
 * the page's textarea and the file was kept; the user was told to click the dialog's buttons. The owner's rule: a modal
 * the user's OWN fresh act opened (`byUserPress`, PURE `dialogOpener`) TAKES THE KEYBOARD — Enter, Escape, Tab and typing
 * are the dialog's, the takeover continues (the agent stays refused), and when it closes the keys go back where they were
 * (PURE `dialogReturn`); one that opens BY ITSELF (a broadcast, a timer, a notification) while the keys are the page's
 * (`owns` — driving, not `yielded` to a text box, no dialog `held` already) is TAKEN BACK and said, as before: nothing but
 * the user's own act moves the keys out of the page. Not his and the keys are not the page's (yielded, a dialog he opened
 * holds them, the view off screen) ⇒ 'allow' — not the view's to decide. `opener` ∈ DIALOG_OPENERS (anything else = not an
 * app modal). → 'take' | 'reclaim' | 'allow'.
 */
function dialogVerdict({ owns = false, yielded = false, held = false, byUserPress = false, opener = 'app' } = {}) {
  if (opener !== 'app') return 'allow';
  if (byUserPress) return 'take';
  return owns && !yielded && !held ? 'reclaim' : 'allow';
}
/**
 * Where the keys go when a dialog that took them CLOSES — answered, dismissed, or removed by a script (no orphan hold).
 * `left` = the dialogs still holding after it; `back` = `{valid}` of the element focused when it opened (the older
 * dialog's field — a confirm over an input dialog); `base` = where they were before the FIRST one: `{to: 'sink'}` (the
 * page — the view owned them) | `{to: 'yield', valid}` (the text box they had been yielded to, still a visible box).
 * → 'back' (refocus the older dialog's element) | 'older' (the older dialog still holds but the element the keys would go
 * back to is gone — replaced by a re-render, or inside a dialog a script removed: the older dialog's OWN field, its first
 * text box else its overlay, never <body>, where the keys would go nowhere while the chip still says "in the dialog" —
 * verify r1) | 'sink' (the view's sink: the keys are the page's again) | 'yield' (the text box) | 'stay' (move nothing:
 * the yielded box is gone — the yield's own home rule answers when the view next drives).
 */
function dialogReturn({ left = 0, back = null, base = null } = {}) {
  if (Number(left) > 0) return back && back.valid ? 'back' : 'older';
  if (!base) return 'stay';
  if (base.to === 'sink') return 'sink';
  return base.to === 'yield' && base.valid ? 'yield' : 'stay';
}
/** A modal that opened by itself and was TAKEN BACK is said once — rate-limited with the Q1 cue (one limiter for every
 *  "typing still goes to the browser" sentence). → true = say it now. */
function dialogReclaimCue({ verdict = null, at = 0, lastCueAt = null, everyMs = RECLAIM_CUE_MS } = {}) {
  if (verdict !== 'reclaim') return false;
  return !(lastCueAt != null && Number(at) - Number(lastCueAt) < everyMs);
}
/** CDP's modifier bits (Input.dispatchKeyEvent `modifiers`) by the key that holds each. */
const MODIFIER_KEY_BITS = Object.freeze({ Alt: 1, Control: 2, Meta: 4, Shift: 8 });
/**
 * verify r1 (K4): the keys STILL HELD in the page when the user's press yields the keyboard. Their keyups now go to the
 * text box he pressed, so the page would hold them down for good (measured in chrome: Shift held while pressing the
 * composer — the page's log had the Shift keydown and never its keyup; a held "x" the same). → the page's releases, the
 * LAST pressed first, each carrying the modifiers still held after it (an ordinary release sequence to the page).
 * `pressed` = the view's held keys `[{key, code, keyCode}]` in press order (what reached the page as keydowns).
 */
function heldReleases(pressed = []) {
  const list = (Array.isArray(pressed) ? pressed : []).filter((p) => p && typeof p.key === 'string' && p.key);
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    let modifiers = 0;
    for (let j = 0; j < i; j++) modifiers |= MODIFIER_KEY_BITS[list[j].key] || 0;
    out.push({ kind: 'up', key: list[i].key, code: String(list[i].code || ''), keyCode: Number(list[i].keyCode) || 0, modifiers });
  }
  return out;
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
  inputKeyFor, newInputState, takeoverIdleMs, decideTakeover, decideHandback, decidePass, idleHandbackVerdict, announceVerdict,
  handbackWakes, handbackWakeEcho, // r6 A-F9: the count one explicit Hand back spends + its echo
  browserPausedRefusal, handbackText, handbackFacts, handbackNotice, renderHandbackNotice, idleInboxItem,
  // the owner's ruling (2026-09-27): the takeover interrupts, tells, and the handback reminds (PURE browser-interrupt.js)
  takeoverNotice, takeoverNoticeText, renderTakeoverNotice, INTERRUPTED_CODE, INTERRUPTED_TEXT,
  inFlightAt, openInterruption, noteRefused, closeInterruption, interruptedVerbs, interruptionView, takeoverText, rerunSentence,
  confirmationFromUpstream, confirmationResolvedFromUpstream, confirmationView, decisionArgv, decisionVerdict,
  // r6 A-F8: the target, the digest of what a card showed, first write wins, the answer's gate, the card's slots
  confirmationTarget, confirmationShown, confirmationDigest, pendingNoteVerdict, answerGate, confirmSlots,
  agentCursorFromCommand, modeBadge, inputSummary,
  // lane J r2: the keyboard while you drive; stale approvals
  RESERVED_CHORDS, reservedChordOf, isPasteChord, keyboardOwnership, keyRoute, focusVerdict, ownerOf,
  USER_PRESS_MS, userPressFocus, YIELD_EVENTS, yieldAfter, // lane takeover-keyboard: the user's own press yields the keyboard
  keyboardTransition, yieldHomeVerdict, // lane takeover-keyboard verify r2 (H1): every ownership transition redraws at once; keys moving to the page move the caret
  RECLAIM_CUE_MS, reclaimCue, // lane takeover-keyboard verify r2 (Q1): a reclaim the user's own press elsewhere caused is said (rate-limited)
  heldReleases, // lane takeover-keyboard verify r1 (K4): a yield releases in the page what is still held there
  DIALOG_OPENERS, dialogOpener, dialogVerdict, dialogReturn, dialogReclaimCue, // lane dialog-keys: a dialog the user's own act opened takes the keys; one that opens by itself never does
  // lane live-input: a Mac viewer's ⌘ chords on a non-Mac browser, the copy-out chords, the journal's URL
  MAC_CHORD_ROWS, isMacPlatform, macChord, copyChordOf, urlForLog,
  COPY_GESTURES, COPY_GESTURE_MS, copyGestureOfRecord, armCopyGesture, copyDeliverVerdict, copyWriteVerdict, // lane live-input verify: the copy-out door is the user's own gesture (single-use, fail closed)
  STALE_MOMENTS, STALE_MARK, SHELL_TOOLS, shellSegments, browserArgvOf, browserApprovalVerdict, staleDenyText, staleFromDenyMessage,
};
