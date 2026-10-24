'use strict';
/**
 * A TAKEOVER REQUEST — PURE (imports only hidden-chars — PURE → PURE, THE one set of hidden characters; CJS so the keeper,
 * the routes, the handback announcer, the agent answers and the bundle spell ONE record, ONE state machine and ONE set of
 * words). Lane browser-takeover-queue (a fleet power
 * user, 2026-10-23: 「…经常会有很多时候它会需要我这边 take over 操作嘛，那所有等待我 take over 的都在这里集中一下，然后
 * 这样我多个 task 并行的时候都可以在这集中处理这些需要 take over 的东西」).
 *
 * THE INVARIANT: a request for a human is a RECORD, seen in ONE place for all of them (the Agent browser window's
 * «Waiting for you» section, and the SAME For-you item), resolved by the handback.
 *
 *   · THE RECORD: { id, browserKey, profileId (null = the conversation's own managed browser), ephemeral, conversationKey
 *     (the For-you key), sessionId (the live session that asked — a hint: the client finds the conversation by its
 *     browserKey), conversationName, profileLabel, text (the agent's words, ≤ LIMITS.textChars), url + title (the tab it
 *     is about), at (the first ask), askedAt (the last), asks, state, takenAt, takenBy, doneAt, how, parked, itemId }.
 *   · ONE REQUEST PER LEASE (browserKey × profileId): a second ask on the same lease while one is open RE-ASSERTS it (the
 *     same id, its new words, a newer askedAt) — never a second row.
 *   · THE STATE FOLLOWS THE LEASE'S INPUT SIDE (the keeper's takeover road, src/server/browser-keeper.js §4.3 P3):
 *       waiting ──take──▶ taken ──handback (explicit: the live view's Hand back, the queue's Done / Hand back)──▶ done
 *       taken ──release (a handback nobody chose: idle, the view closed, the browser stopped)──▶ waiting (it still stands)
 *       waiting ──done (the person's Done without taking over)──▶ done
 *       waiting | taken ──withdraw (the agent) / lease-gone (its lease ended)──▶ withdrawn
 *     A closed request (done / withdrawn) never moves again; a new ask on that lease is a NEW request.
 *   · WHO MAY SEE IT (`seeVerdict`) — exactly the live view's rule: the owner (cookie) while the conversation still holds
 *     that browser (a lease on the named profile, or its own managed browser) — the live view's target needs the same; an
 *     agent only its OWN conversation's; anybody else nothing.
 *   · A DISMISSAL ALONE NEVER RESOLVES IT: the For-you item dismissed parks the request (band 4 — `parked`), still listed.
 *
 * The agent's words here are English (agent-facing, never t()); the person's words are t() keys the client words with its
 * own dictionaries (zh/ja in src/lib/i18n-zh.js / i18n-ja.js). Gate: scripts/test-browser-takeover-request.mjs.
 */

const HC = require('./hidden-chars.js'); // THE one set: the agent's words a person reads carry no hidden / reordering character

const STATES = Object.freeze(['waiting', 'taken', 'done', 'withdrawn']);
const OPEN_STATES = Object.freeze(['waiting', 'taken']);
const HOWS = Object.freeze(['take', 'handback', 'release', 'done', 'withdraw', 'lease-gone']);
/** THE BOUNDS: the agent's words (one line in a row), the tab's title and url, how many records the store keeps. */
const LIMITS = Object.freeze({ textChars: 300, titleChars: 200, urlChars: 2048, openMax: 64, closedKept: 100 });
/** How long ONE CLI verb waits for the human before it says so and ends (under the agent harness's own 2-min tool cap). */
const WAIT_MS = 90 * 1000;
/** One long-poll's own hold (the CLI asks again until WAIT_MS ran out). */
const POLL_MS = 20 * 1000;
const ID_RE = /^tr-[0-9a-f]{8}$/;
const ACTION_TYPE = 'browser-takeover';
const CODE = 'human_asked';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
/** One line of words, cut at `max` code points (the cut said with …): whitespace runs (line breaks too) become one space;
 *  a hidden / reordering character (src/hidden-chars.js — a U+202E would reorder what the person reads) is dropped. */
function cleanLine(s, max) {
  const one = str(s).replace(/[\u0000-\u001f\u007f\s]+/g, ' ').replace(HC.HIDDEN_RE, '').trim();
  const cps = [...one];
  if (cps.length <= max) return { text: one, cut: 0 };
  return { text: cps.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…', cut: max };
}
const cleanUrl = (u) => { const s = str(u).trim(); return /^[a-z][a-z0-9+.-]*:/i.test(s) && !/[\u0000-\u001f\s]/.test(s) ? s.slice(0, LIMITS.urlChars) : ''; };
/** THE LEASE a request is about — its key (one request per key). */
const leaseKeyOf = ({ browserKey = '', profileId = null } = {}) => `${str(browserKey)}|${profileId ? str(profileId) : 'ephemeral'}`;
const isOpen = (r) => !!r && OPEN_STATES.includes(r.state);

/** May this agent ask? `text` = its words; `lease` = the browser the ask is about ({browserKey, profileId, ephemeral}) or
 *  null (it has none yet). → {ok:true, text, cut} | {ok:false, code, error, remedy} */
function askVerdict({ text = '', lease = null } = {}) {
  const w = cleanLine(text, LIMITS.textChars);
  if (!w.text) return { ok: false, code: 'empty', error: 'say what you need the person to do, in their words', remedy: 'vibespace-browser ask-human "Log in to the bank and solve the captcha, then hand back"' };
  if (!lease || !lease.browserKey) return { ok: false, code: 'no_browser', error: 'this conversation has no browser yet — a person takes over a page that is open', remedy: 'open the page first (`vibespace-browser open <url>`), then ask' };
  return { ok: true, text: w.text, cut: w.cut };
}

/** A NEW request (state waiting). `id` / `at` come from the caller (the keeper's clock and its random id). */
function newRequest({ id, browserKey, profileId = null, ephemeral = false, conversationKey = null, sessionId = null, conversationName = '', profileLabel = '', text = '', url = '', title = '', at = 0 } = {}) {
  const w = cleanLine(text, LIMITS.textChars);
  return {
    id: str(id), browserKey: str(browserKey), profileId: profileId ? str(profileId) : null, ephemeral: !!ephemeral || !profileId,
    conversationKey: conversationKey ? str(conversationKey).slice(0, 200) : null, sessionId: sessionId ? str(sessionId).slice(0, 80) : null,
    conversationName: cleanLine(conversationName, 120).text, profileLabel: cleanLine(profileLabel, 120).text,
    text: w.text, url: cleanUrl(url), title: cleanLine(title, LIMITS.titleChars).text,
    at: num(at), askedAt: num(at), asks: 1, state: 'waiting', takenAt: 0, takenBy: null, doneAt: 0, how: null, parked: false, itemId: null,
  };
}
/** A second ask on the SAME open lease: the same record, its new words (and tab), a newer askedAt — the parking ends
 *  (an ask again is a fact that raises it back to band 1). A closed record is never re-asserted (a new ask is new). */
function reassert(rec, { text = '', url = '', title = '', at = 0, sessionId = null, conversationName = null } = {}) {
  if (!isOpen(rec)) return { ok: false, code: 'closed', rec };
  const w = cleanLine(text, LIMITS.textChars);
  const next = { ...rec, text: w.text || rec.text, url: cleanUrl(url) || rec.url, title: cleanLine(title, LIMITS.titleChars).text || rec.title, askedAt: Math.max(num(at), num(rec.askedAt)), asks: num(rec.asks) + 1, parked: false,
    ...(sessionId ? { sessionId: str(sessionId).slice(0, 80) } : {}), ...(conversationName ? { conversationName: cleanLine(conversationName, 120).text } : {}) };
  return { ok: true, rec: next, changed: true };
}

/** A keeper handback's cause → what it does to the request: the person's own Hand back (explicit, «hand back and
 *  continue») ends it; a handback nobody chose (idle, the view closed, a stop, a detach) puts it back to waiting. */
const howOfHandback = (cause) => (cause === 'explicit' || cause === 'continue' ? 'handback' : 'release');

/**
 * THE STATE MACHINE. `how` ∈ HOWS; `at` the instant; `viewerId` the live view that took over (take only).
 * → {ok:true, rec, changed, from, to} | {ok:false, code:'closed'|'bad_how', from, rec}
 */
function transition(rec, how, { at = 0, viewerId = null } = {}) {
  const from = rec && rec.state;
  if (!HOWS.includes(how)) return { ok: false, code: 'bad_how', from, rec };
  if (!isOpen(rec)) return { ok: false, code: 'closed', from, rec };
  const t = num(at);
  const close = (state) => ({ ok: true, rec: { ...rec, state, doneAt: t, how, takenBy: null }, changed: true, from, to: state });
  if (how === 'take') {
    if (from === 'taken') return { ok: true, rec, changed: false, from, to: from };
    return { ok: true, rec: { ...rec, state: 'taken', takenAt: t, takenBy: viewerId == null ? null : str(viewerId).slice(0, 40) }, changed: true, from, to: 'taken' };
  }
  if (how === 'release') {
    if (from === 'waiting') return { ok: true, rec, changed: false, from, to: from };
    return { ok: true, rec: { ...rec, state: 'waiting', takenBy: null }, changed: true, from, to: 'waiting' };
  }
  if (how === 'handback' || how === 'done') return close('done');
  return close('withdrawn'); // withdraw / lease-gone
}

/** WHO MAY SEE IT (the live view's own rule). viewer = {kind:'owner'} (the cookie) | {kind:'agent', browserKey} (a
 *  session token); `leaseHeld` = does the conversation still hold that browser now. → {ok, why} */
function seeVerdict({ request = null, viewer = null, leaseHeld = false } = {}) {
  if (!request || !request.id) return { ok: false, why: 'no request' };
  const kind = viewer && viewer.kind;
  if (kind === 'owner') return leaseHeld ? { ok: true, why: 'the owner, and the conversation still holds this browser' } : { ok: false, why: 'the conversation no longer holds this browser (the live view could not open it either)' };
  if (kind === 'agent') return str(viewer.browserKey).replace(/\.\d+$/, '') === str(request.browserKey).replace(/\.\d+$/, '') ? { ok: true, why: 'its own conversation\'s request' } : { ok: false, why: 'another conversation\'s request' };
  return { ok: false, why: 'nobody else sees a request' };
}

/** The row a client draws (no internals: the viewer id never leaves the keeper). */
function viewOf(rec, { live = true } = {}) {
  if (!rec) return null;
  return { id: rec.id, state: rec.state, browserKey: rec.browserKey, profileId: rec.profileId, ephemeral: !!rec.ephemeral, conversationKey: rec.conversationKey, sessionId: rec.sessionId,
    conversationName: rec.conversationName, profileLabel: rec.profileLabel, text: rec.text, url: rec.url, title: rec.title, at: rec.at, askedAt: rec.askedAt, asks: rec.asks,
    takenAt: rec.takenAt, doneAt: rec.doneAt, how: rec.how, parked: !!rec.parked, itemId: rec.itemId || null, live: !!live };
}
/** THE QUEUE the window draws: every OPEN request the viewer may see — the ones being driven first, then the waiting ones
 *  longest-waiting first (a queue), id last (total). `leaseHeld(rec)` / `live(rec)` = the keeper's facts. */
function queueOf(list, { viewer = { kind: 'owner' }, leaseHeld = () => true, live = () => true } = {}) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!isOpen(r)) continue;
    let held = false; try { held = !!leaseHeld(r); } catch { held = false; }
    if (!seeVerdict({ request: r, viewer, leaseHeld: held }).ok) continue;
    let lv = true; try { lv = !!live(r); } catch { lv = false; }
    out.push(viewOf(r, { live: lv }));
  }
  return out.sort((a, b) => ((b.state === 'taken') - (a.state === 'taken')) || (a.askedAt - b.askedAt) || a.id.localeCompare(b.id));
}
/** How many wait for a takeover (the window's title, the rail's count): the `waiting` rows only — a driven one is being done. */
const waitingCount = (rows) => (Array.isArray(rows) ? rows.filter((r) => r && r.state === 'waiting').length : 0);

/** The attention row of a request (the For-you item's own band: urgent ⇒ band 1; parked ⇒ an action row, band 4). */
function attentionRowOf(r) {
  if (!r || !r.id || !isOpen(r)) return null;
  return { id: 'takeover:' + r.id, key: r.conversationKey || null, source: 'browser', at: num(r.askedAt), due: null, urgency: r.parked ? 'normal' : 'urgent', origin: 'browser', kind: 'action', options: 0, action: ACTION_TYPE, card: false, plugin: null, judged: null, reasks: Math.max(0, num(r.asks) - 1), blocked: false, waitedBy: null, deadlineMoney: false, answered: false, notice: false };
}
/** THE RAIL'S BROWSER BADGE (channelsBadge's sibling): the waiting requests the attention list puts in bands 1–4 — `needsMe`
 *  injected (src/attention-model.js), `bands` the owner's band switches (a band 1 switched off falls to band 5: no count). */
function takeoverBadge(rows, now = 0, { bands = null, needsMe = null } = {}) {
  const ar = (Array.isArray(rows) ? rows : []).filter((r) => r && r.state === 'waiting').map(attentionRowOf).filter(Boolean);
  if (!ar.length || typeof needsMe !== 'function') return 0;
  return needsMe(ar, now, bands).counts.needsMe;
}

// ── THE AGENT'S WORDS (English: agent-facing) ──
const ago = (ms) => { const s = Math.max(0, Math.round(num(ms) / 1000)); return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
const quoted = (t) => `"${str(t)}"`;
const WITHDRAW_CMD = '`vibespace-browser ask-human --withdraw`';
/** The answer to an ask (new or re-asserted). */
function askAnswer(rec, { reasserted = false, cut = 0 } = {}) {
  const where = rec.profileLabel ? `the "${rec.profileLabel}" browser` : 'your browser';
  const head = reasserted ? `asked again — the same request ${rec.id} (no second row), now ${quoted(rec.text)}` : `asked a human to take over ${where}: ${quoted(rec.text)} (request ${rec.id})`;
  return `${head}${cut ? ` — your words were cut at ${cut} characters` : ''}. The person sees it at the top of the Agent browser window and in For you. Your next \`vibespace-browser\` verb on this browser waits until they hand back or you withdraw (${WITHDRAW_CMD}); you may end your turn now — the handback arrives as a message.`;
}
function withdrawAnswer(rec) { return `withdrew request ${rec.id} (${quoted(rec.text)}) — nobody is asked any more; your verbs on this browser run again`; }
function statusAnswer(rec, now = 0) {
  if (!rec) return 'no request is open on this browser — `vibespace-browser ask-human "<what you need>"` asks a person';
  return `request ${rec.id}: ${rec.state === 'taken' ? `the person is driving (since ${ago(num(now) - num(rec.takenAt))})` : `waiting for a person (asked ${ago(num(now) - num(rec.askedAt))})`} — ${quoted(rec.text)}`;
}
/** What the agent's verbs carry while a request is open — the CLI waits on it (`wait`) and prints these lines verbatim. */
function agentRequestView(rec, now = 0, { waitMs = WAIT_MS } = {}) {
  if (!rec) return null;
  const w = num(waitMs) > 0 ? num(waitMs) : WAIT_MS; // the gate's seam (a short wait); production: WAIT_MS
  return { id: rec.id, state: rec.state, text: rec.text, askedAt: rec.askedAt, takenAt: rec.takenAt, waitMs: w, pollMs: Math.min(POLL_MS, w),
    waitLine: `waiting for the person (request ${rec.id}, asked ${ago(num(now) - num(rec.askedAt))}: ${quoted(rec.text)}) — up to ${Math.round(w / 1000)} s here`,
    stillLine: `still waiting for the person after ${Math.round(w / 1000)} s (request ${rec.id}) — your command did NOT run. End your turn: their handback arrives as a message in this conversation; or withdraw the request (${WITHDRAW_CMD}). Do not retry in a loop.` };
}
/** `human_asked` — a page verb while the request WAITS (nobody took over yet): nothing ran; the CLI waits on it. */
function humanAskedRefusal(rec, { handles = [], now = 0, waitMs = WAIT_MS } = {}) {
  return { ok: false, code: CODE, error: `a person is asked to take over this browser (request ${rec.id}, ${ago(num(now) - num(rec.askedAt))}): ${quoted(rec.text)} — your command did NOT run yet; it waits for their handback (or ${WITHDRAW_CMD})`, handles: Array.isArray(handles) ? handles : [], request: agentRequestView(rec, now, { waitMs }) };
}
/** What the wait answers when the request is over: the next verb runs. */
function endedLine(rec) {
  if (!rec) return 'the request is gone — your command runs now';
  if (rec.state === 'withdrawn') return rec.how === 'lease-gone' ? `request ${rec.id} ended with your lease on this browser — your command runs now` : `request ${rec.id} was withdrawn — your command runs now`;
  return `the person is done (request ${rec.id}${rec.how === 'done' ? ', marked done without taking over here' : ', handed back'}) — re-read the page first; your command runs now`;
}
/** The sentence the HANDBACK's delivery carries for the request it ends (src/server/browser-handback.js appends it). */
function handbackLine(rec) { return rec ? `This answers your request ${rec.id} (${quoted(rec.text)}) — it is done.` : ''; }
/** The person's Done WITHOUT a takeover (the queue's row): delivered by the announcer (one notification). */
function doneText(rec) {
  return `The user marked your browser request ${rec.id} (${quoted(rec.text)}) done from the Agent browser window — they did not take over your browser for it (it may have been done elsewhere).${rec.url ? ` The page it was about: ${rec.url}.` : ''} Re-read the page before continuing.`;
}

// ── THE FOR-YOU ITEM (ONE record: the item IS the request) ──
/** The item's dedupe TEXT is stable per request (the words change on a re-ask: they ride `i18n` + `detail`); the action's
 *  identity is the request id (src/user-todos.js ACTION_IDENTITY). Open ⇒ urgent (band 1); parked ⇒ normal (band 4). */
function itemOf(rec) {
  const page = rec.title || rec.url || '';
  return {
    text: 'An assistant needs you in its browser',
    detail: [`"${rec.text}"`, page ? `Page: ${page}${rec.title && rec.url ? ` (${rec.url})` : ''}` : '', 'Take over opens its live view with the controls yours; Hand back (or Done) tells the agent.'].filter(Boolean).join('\n'),
    urgency: rec.parked ? 'normal' : 'urgent',
    i18n: { text: { key: 'Take over the browser: {words}', params: { words: rec.text } }, detail: [...(page ? [{ key: 'Page: {page}', params: { page } }] : []), { key: 'Take over opens its live view with the controls yours; Hand back (or Done) tells the agent.' }] },
    action: { type: ACTION_TYPE, requestId: rec.id, profileId: rec.profileId || '', browserKey: rec.browserKey, ephemeral: !!rec.ephemeral },
  };
}
/** Who resolved the item, by how the request ended (src/lib/user-todos-row.js resolvedByText words them). */
const resolvedByOf = (rec) => (!rec ? 'system' : rec.how === 'handback' ? 'handed-back' : rec.how === 'done' ? 'user' : rec.how === 'lease-gone' ? 'conversation-gone' : 'agent');

module.exports = {
  STATES, OPEN_STATES, HOWS, LIMITS, WAIT_MS, POLL_MS, ID_RE, ACTION_TYPE, CODE,
  cleanLine, leaseKeyOf, isOpen, askVerdict, newRequest, reassert, howOfHandback, transition, seeVerdict, viewOf, queueOf, waitingCount,
  attentionRowOf, takeoverBadge, askAnswer, withdrawAnswer, statusAnswer, agentRequestView, humanAskedRefusal, endedLine, handbackLine, doneText,
  itemOf, resolvedByOf,
};
