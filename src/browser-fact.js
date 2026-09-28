'use strict';
/**
 * THE BROWSER FACT — "which browser is this conversation using right now", ONE answer per session
 * (lane S2, 2026-09-26; naive-user study 2 on 2.369.186, tasks T4 / T5 / T7).
 *
 * The study found three answers on one screen: Session Properties said pinned "work", the status-bar chip said
 * "Agent browser · tester-b-scratch" then "(ephemeral) Second chat", the live view's tab said "ephemeral (no
 * profile)"; after a detach the chip still said "work"; the strip tab said "work (default)" while the chip's menu said
 * "pinned: ephemeral (no profile)". Every surface derived its own answer from a different pair of raw fields
 * (`browserProfileId` = the pin, `browserProfileActive` = the last command, `browserLive` = the live holder, the
 * strip's `isDefault` = the attachment set's default) and each pair disagrees with the others by construction.
 *
 * This module is the ONE computation (PURE, imports nothing; CJS so the keeper — server — and the bundle — the
 * words — share it). The keeper builds a view of its registry (`keeper.factView`) and `browserFactFor(session,
 * view)` answers the fact the `active-sessions` payload publishes as `browserFact` (one LIVE_SESSION_FACTS row);
 * `browserFactWords(fact, t)` is the ONE spelling every surface prints (chip, strip tab, live view title, Session
 * Properties, the pin menu). No surface derives its own answer (test-browser-fact's census).
 *
 * The model, one line each:
 *   · `pinned`   — the conversation's pin (its preference; a spawn on rung D / C opens that profile's directory).
 *   · `using`    — the browser the agent is on now: the attachment its LAST command named while that is still one of
 *                  the conversation's, else what a BARE command lands on — the set's default attachment (`profile`),
 *                  else the conversation's own browser (`own` — on the pinned profile's directory when pinned on rung
 *                  D / C, else a temporary one), `several` (≥ 2 attachments, no default), `unmanaged` (the shared
 *                  rung, a remote session — VibeSpace does not run that browser).
 *   · `differs`  — WHY the pin and the browser in use are not the same thing, when they are not: the pin's profile
 *                  was deleted (`pin_gone`) or deleted and the pin cleared (`pin_cleared`), it could not start
 *                  (`pin_failed`; `locked` when another browser holds its directory), it applies from the agent's
 *                  next command (`pin_pending`), the agent is still on another attachment it named
 *                  (`agent_elsewhere`), another profile is attached instead (`other_attached`), or this rung
 *                  cannot open a profile (`pin_unsupported`).
 *   · `lastUsed` — what the agent's last command actually landed on (the §3.8 layer ③ fact, kept for the tooltip).
 */

const EPHEMERAL_REF = '~ephemeral'; // mirrored from src/browser-stream.js (this module imports nothing)
const CHILD_HANDLE_RE = /^bk-[0-9a-f]{8}\.\d{1,4}$/;
const CHILD_REF_PREFIX = '~child:';
/** The rungs whose OWN browser opens the pinned profile's directory (the generated config's `profile` / the link). */
const PIN_RUNGS = Object.freeze(['D', 'C']);
/** The rungs VibeSpace runs a conversation's own browser on (H = on the host: not managed here). */
const MANAGED_RUNGS = Object.freeze(['D', 'C', 'N']);
/** How long a "its profile was deleted — pin cleared" notice rides the fact (then the fact is just "no pin"). */
const PIN_CLEARED_MS = 24 * 3600 * 1000;
const DIFFERS = Object.freeze(['pin_gone', 'pin_cleared', 'pin_failed', 'pin_pending', 'agent_elsewhere', 'other_attached', 'pin_unsupported']);
const USING_STATES = Object.freeze(['running', 'starting', 'stopped', 'failed', 'not-started']);

const str = (v) => (v == null ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** A start failure that is a profile DIRECTORY held by another browser (Chrome's own words / the keeper's code). */
const LOCKED_RE = /SingletonLock|ProcessSingleton|profile_locked|profile directory is in use|another browser (?:holds|has)/i;

/** The session's own facts, projected off its live record (the underscore fields ws-create / the pin route write). */
function sessionFactsOf(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    browserKey: s._browserKey || null,
    pinId: s._browserProfileId || null,
    pinOrigin: s._browserPinOrigin || null,
    active: s._browserProfileActive === undefined ? null : s._browserProfileActive,
    variant: s._browserVariant || null,
    remote: !!(s.host || s.hostId),
  };
}

/** A browser record (the keeper's view) → the fact's state word + the verbatim failure. */
function stateOf(rec) {
  if (!rec || typeof rec !== 'object') return { state: 'not-started', error: null, locked: false };
  const st = str(rec.state);
  const error = rec.lastError ? str(rec.lastError).slice(0, 400) : null;
  if (st === 'ready') return rec.closed ? { state: 'stopped', error: error || null, locked: false } : { state: 'running', error: null, locked: false };
  if (st === 'starting') return { state: 'starting', error: null, locked: false };
  if (st === 'failed') return { state: 'failed', error, locked: !!(error && LOCKED_RE.test(error)) || str(rec.code) === 'profile_locked' };
  if (st === 'not-started' || !st) return { state: 'not-started', error: null, locked: false };
  return { state: 'stopped', error: null, locked: false };
}

/**
 * THE FACT. `session` = sessionFactsOf(liveSession); `view` = the keeper's registry view for its key:
 *   { profiles: [{id, label}], pin: {profileId, origin, at, cleared?} | null, attachments: [{profileId, alias, label,
 *     isDefault}], browsers: {id: record}, own: {profileId, state, lastError, startedAt, lastVerbAt} | null,
 *     input: 'user'|'agent'|null, live: '' | 'ephemeral' | profileId, now }
 * null when the session has no browser key (no browser to name) — a live local session whose first browser command WILL
 * get one is published as `keylessFact()` instead (B-f7ab: "no browser yet").
 */
function browserFactFor(session, view) {
  const s = session || {};
  const bk = str(s.browserKey);
  if (!bk) return null;
  const v = view && typeof view === 'object' ? view : {};
  const profiles = arr(v.profiles);
  const labelOf = (id) => { const p = profiles.find((x) => x && x.id === id); return p ? (str(p.label) || str(id)) : null; };
  const rawPin = v.pin && typeof v.pin === 'object' ? v.pin : null;
  // the pin: the session's own record first (what the pin route / the spawn wrote), the keeper's mirror when it has none
  const pinId = str(s.pinId) || (rawPin && rawPin.profileId ? str(rawPin.profileId) : '');
  const pinLabel = pinId ? labelOf(pinId) : null;
  const pinned = pinId && pinLabel ? { id: pinId, label: pinLabel, origin: str(s.pinOrigin || (rawPin && rawPin.origin)) || 'chosen' } : null;
  const pinGone = pinId && !pinLabel ? { id: pinId } : null;
  const now = num(v.now) || 0;
  const cleared = !pinId && rawPin && rawPin.cleared && typeof rawPin.cleared === 'object' && (rawPin.cleared.label || rawPin.cleared.id) ? rawPin.cleared : null;
  const pinCleared = cleared && (!now || now - num(cleared.at) < PIN_CLEARED_MS) ? { label: str(cleared.label), id: str(cleared.id) || null, at: num(cleared.at) } : null;
  const variant = str(s.variant);
  const browsers = v.browsers && typeof v.browsers === 'object' ? v.browsers : {};
  const atts = arr(v.attachments).filter((a) => a && a.profileId);
  // ── the conversation's default: what a BARE command lands on (the set's default attachment, else its own) ──
  let def;
  // (verify S2: an attachment whose record is gone has NO label — the words say "a profile"; a raw id never reaches the face)
  const attOf = (a) => { const id = str(a.profileId); return { kind: 'profile', id, label: str(a.label) || labelOf(id) || null, temporary: false, ...stateOf(browsers[id]) }; };
  if (atts.length) {
    const d = atts.find((a) => a.isDefault) || (atts.length === 1 ? atts[0] : null);
    if (d) def = attOf(d);
    else {
      const anyRunning = atts.some((a) => stateOf(browsers[a.profileId]).state === 'running');
      def = { kind: 'several', id: null, label: null, temporary: false, count: atts.length, state: anyRunning ? 'running' : 'stopped', error: null, locked: false };
    }
  } else if (!s.remote && MANAGED_RUNGS.includes(variant)) {
    const onPin = !!(pinned && PIN_RUNGS.includes(variant));
    def = { kind: 'own', id: onPin ? pinned.id : null, label: onPin ? pinned.label : null, temporary: !onPin, ...stateOf(v.own) };
  } else {
    def = { kind: 'unmanaged', id: null, label: null, temporary: false, state: 'not-started', error: null, locked: false, why: s.remote ? 'remote' : 'shared' };
  }
  // ── the last command's landing (§3.8 ③): null never · '' the conversation's own · an id ──
  let lastUsed = null;
  if (s.active === '') lastUsed = { kind: 'own', id: null, label: null };
  else if (s.active) lastUsed = { kind: 'profile', id: str(s.active), label: labelOf(str(s.active)) };
  // ── USING = what the agent is on now: the attachment its last command named while that is still one of the set
  //    (it may have named a handle that is not the default — §3.8 ③'s "I pinned it, now what?"), else the default ──
  let using = def;
  if (lastUsed && lastUsed.kind === 'profile' && def.kind !== 'unmanaged') { const a = atts.find((x) => str(x.profileId) === lastUsed.id); if (a) using = attOf(a); }
  // ── why the pin and the browser in use differ ──
  let differs = null;
  if (pinGone) differs = 'pin_gone';
  else if (!pinned && pinCleared) differs = 'pin_cleared';
  else if (pinned) {
    const pinAttached = atts.some((a) => str(a.profileId) === pinned.id);
    if (using.kind === 'profile' && using.id !== pinned.id) differs = pinAttached ? 'agent_elsewhere' : 'other_attached';
    else if (using.kind === 'several') differs = 'other_attached';
    else if (using.kind === 'profile' && using.state === 'failed') differs = 'pin_failed';
    else if (using.kind === 'own' && !PIN_RUNGS.includes(variant)) differs = 'pin_unsupported';
    else if (using.kind === 'own' && using.state === 'failed') differs = 'pin_failed';
    else if (using.kind === 'own' && (using.state === 'running' || using.state === 'starting') && v.own
      && num(rawPin && rawPin.at) > Math.max(num(v.own.startedAt), num(v.own.lastVerbAt))) differs = 'pin_pending';
  }
  const input = v.input === 'user' || v.input === 'agent' ? v.input : null;
  const liveRef = str(v.live);
  // the conversation's OWN browser (the live view's "This conversation" pane): what it opens and whether it runs
  const managed = !s.remote && MANAGED_RUNGS.includes(variant);
  // (named after the pin only while the pin is NOT attached: an attached pin IS its own browser — the attachment —
  // and two tabs named "work" would be the study's confusion again)
  const own = managed ? { label: pinned && PIN_RUNGS.includes(variant) && !atts.some((a) => str(a.profileId) === pinned.id) ? pinned.label : null, state: stateOf(v.own).state } : null;
  const fact = { v: 1, key: bk, pinned, pinGone, pinCleared, using, own, lastUsed, differs, input, live: !!liveRef, liveRef: liveRef || null };
  fact.digest = factDigest(fact);
  return fact;
}

/**
 * B-f7ab: THE FACT OF A LIVE LOCAL SESSION WITH NO BROWSER KEY YET — one that started before per-session browsers (or
 * while they were off). Its first browser command gets a key (src/server/browser-key.js `ensureBrowserKey`), so every
 * surface says "no browser yet", never "predates the feature" / nothing at all. The ORCH publishes it only where that
 * first command WOULD get one (`keylessFactOf`); `using.kind` = 'none', `key` = '' (a surface that needs a key — the
 * status-bar chip — keeps itself hidden, as `show` is false).
 */
function keylessFact() {
  const fact = { v: 1, key: '', keyless: true, pinned: null, pinGone: null, pinCleared: null,
    using: { kind: 'none', id: null, label: null, temporary: false, state: 'not-started', error: null, locked: false },
    own: null, lastUsed: null, differs: null, input: null, live: false, liveRef: null };
  fact.digest = factDigest(fact);
  return fact;
}

/** The render-gate projection: every field a surface prints, and nothing that churns (no clocks). */
function factDigest(f) {
  if (!f) return '';
  const u = f.using || {};
  return [f.key, f.pinned ? `${f.pinned.id}:${f.pinned.label}:${f.pinned.origin}` : '-', f.pinGone ? f.pinGone.id : '-', f.pinCleared ? f.pinCleared.label : '-',
    `${u.kind}:${u.id || ''}:${u.label || ''}:${u.state}:${u.locked ? 'L' : ''}:${u.count || ''}:${u.error ? u.error.length : 0}`,
    f.own ? `${f.own.label || ''}:${f.own.state}` : '-',
    f.lastUsed ? `${f.lastUsed.kind}:${f.lastUsed.id || ''}:${f.lastUsed.label || ''}` : '-', f.differs || '-', f.input || '-', f.liveRef || '-'].join('|');
}

/** `{name}` placeholders, for a `t` that is not given (the server's journal, a test). */
function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }

/**
 * THE WORDS — every surface prints these, never its own. `t` is the client's i18n (English-string-as-key); every key
 * is a literal below so the extractor finds it. Returns null for a null fact.
 *   name   the browser in use, short ("work" / "no profile (temporary browser)")
 *   line   THE answer: `name`, or — when the pin and the browser in use differ — both, in one sentence:
 *          "pinned work · running nothing — work could not start"
 *   state  running / starting / not running / could not start / not started yet
 *   pinned the pin's name ("none" when unpinned)
 *   tooltip the lines behind the answer (ids live here, never on the face)
 *   show   whether a surface that appears only once a browser matters should appear
 *   ownName / ownShort  the conversation's OWN browser (the live view's pane / its tab): the pinned profile it opens,
 *          else "no profile (temporary browser)" / "Temp browser"
 */
function browserFactWords(fact, tIn) {
  if (!fact) return null;
  const t = typeof tIn === 'function' ? (s, p) => tIn(s, p) : fill;
  const u = fact.using || {};
  const TEMP = t('no profile (temporary browser)');
  if (fact.keyless || u.kind === 'none') {
    // B-f7ab: no key yet — the first browser command gets one (no restart); nothing runs, nothing is pinned
    const none = t('no browser yet');
    return { name: none, line: none, state: t('not started yet'), pinned: t('none'), why: '', running: t('nothing'), amber: false,
      tooltip: t('This session has no browser yet — the agent’s first browser command gets one, no restart needed'), show: false, temporary: false, ownName: TEMP, ownShort: t('Temp browser') };
  }
  const name = u.kind === 'profile' ? (u.label || t('a profile'))
    : u.kind === 'own' ? (u.label || TEMP)
    : u.kind === 'several' ? t('{n} browsers — the agent names one', { n: u.count || 2 })
    : (u.why === 'remote' ? t('the browser on its machine') : t('the machine’s shared browser'));
  const STATE = { running: t('running'), starting: t('starting'), stopped: t('not running'), failed: t('could not start'), 'not-started': t('not started yet') };
  const state = STATE[u.state] || '';
  const pinnedName = fact.pinned ? fact.pinned.label : (fact.pinGone ? t('a deleted profile') : t('none'));
  const runningName = (u.state === 'running' || u.state === 'starting') ? name : t('nothing');
  let why = '';
  switch (fact.differs) {
    case 'pin_gone': why = t('the pinned profile was deleted'); break;
    case 'pin_cleared': why = t('{p} was deleted — its pin was cleared', { p: fact.pinCleared && fact.pinCleared.label ? fact.pinCleared.label : t('a deleted profile') }); break;
    case 'pin_failed': why = u.locked ? t('{p} could not start — another browser has it open', { p: pinnedName }) : t('{p} could not start', { p: pinnedName }); break;
    case 'pin_pending': why = t('{p} applies from the agent’s next browser command', { p: pinnedName }); break;
    case 'agent_elsewhere': why = t('the agent is still on {r}', { r: name }); break;
    case 'other_attached': why = u.kind === 'several' ? t('other profiles are attached instead') : t('{r} is attached instead', { r: name }); break;
    case 'pin_unsupported': why = t('this conversation’s browser cannot open a profile — attach it instead'); break;
    default: why = '';
  }
  let line = name;
  if (fact.differs === 'pin_cleared') line = t('{why} · running {r}', { why, r: runningName });
  else if (fact.differs === 'pin_pending') line = t('pinned {p} · {why}', { p: pinnedName, why });
  else if (fact.differs) line = t('pinned {p} · running {r} — {why}', { p: pinnedName, r: runningName, why });
  const lines = [];
  lines.push(t('Using: {name} — {state}', { name, state }));
  lines.push(fact.pinned ? t('Pinned: {p}', { p: fact.pinned.label }) : (fact.pinGone ? t('Pinned: a profile that no longer exists') : t('Pinned: none')));
  if (why) lines.push(why);
  if (u.error) lines.push(t('Why it did not start: {error}', { error: u.error }));
  lines.push(fact.lastUsed ? t('The agent last used: {x}', { x: fact.lastUsed.kind === 'own' ? (u.kind === 'own' ? name : TEMP) : (fact.lastUsed.label || t('a deleted profile')) }) : t('The agent has not used a browser yet'));
  const ids = [fact.pinned && fact.pinned.id, fact.pinGone && fact.pinGone.id, u.kind === 'profile' && u.id, fact.key].filter(Boolean);
  lines.push(t('ids: {ids}', { ids: [...new Set(ids)].join(' · ') }));
  const show = !!(fact.pinned || fact.pinGone || fact.pinCleared || fact.lastUsed || fact.input || fact.live || (u.kind === 'profile'));
  // the conversation's own browser, named the same way everywhere (the live view's pane, its tab, its title)
  const ownName = fact.own && fact.own.label ? fact.own.label : TEMP;
  const ownShort = fact.own && fact.own.label ? fact.own.label : t('Temp browser');
  return { name, line, state, pinned: pinnedName, why, running: runningName, amber: !!fact.differs, tooltip: lines.join('\n'), show, temporary: !!u.temporary, ownName, ownShort };
}

/** The ref a live view shows for the browser in use (a profile id, the conversation's own, else none). */
function refOfUsing(u) {
  if (!u) return null;
  if (u.kind === 'profile' && u.id) return u.id;
  if (u.kind === 'own') return EPHEMERAL_REF;
  return null;
}
const isHelperRef = (r) => { const x = str(r); return CHILD_HANDLE_RE.test(x) || x.startsWith(CHILD_REF_PREFIX); };
/** Refusal codes that say the view's target is no browser of this session any more (a detach / delete / recreate). */
const STALE_CODES = Object.freeze(['not_attached', 'not-found']);

/**
 * A LIVE VIEW FOLLOWS ITS SESSION'S BROWSER. `view` = { ref (what the window asked for; '' = the session's
 * default), shown (the ref the bridge's hello named, when there was one), errorCode (the last refusal), sessionEnded };
 * `prev` / `next` = the session's facts before / after the change; `force` = the user pressed Reconnect;
 * `view.driving` = this view holds a takeover.
 *   · a helper's view never follows (it shows a sub-agent's browser, not the conversation's);
 *   · a view the user DRIVES is never moved (unless its browser is gone);
 *   · the FIRST fact a view sees is a snapshot, not a move (only a stale target acts on it);
 *   · a view is FOLLOWING when it asked for the default, or it shows the browser the fact named before, or its
 *     target is gone (a stale refusal) — then it moves to the browser in use now (`retarget`);
 *   · a view the user pointed at another browser that still exists stays (never displaced);
 *   · a following view already on the right browser whose last word was an error reconnects when that browser runs.
 * Returns { act: 'retarget' | 'reconnect' | 'none', ref?, why }.
 */
function liveFollowPlan({ view = {}, prev = null, next = null, force = false } = {}) {
  const vw = view || {};
  if (vw.sessionEnded) return { act: 'none', why: 'the session ended' };
  if (isHelperRef(vw.ref) || isHelperRef(vw.shown)) return { act: force ? 'reconnect' : 'none', why: 'a helper’s browser stays on its helper' };
  const stale = STALE_CODES.includes(str(vw.errorCode));
  if (vw.driving && !stale) return { act: 'none', why: 'you are driving this browser — it is never taken from under you' };
  const nextRef = refOfUsing(next && next.using);
  if (!nextRef) return stale && force ? { act: 'retarget', ref: '', why: 'stale target; the session’s default decides' } : { act: force ? 'reconnect' : 'none', why: 'no single browser to follow' };
  if (!prev && !stale && !force) return { act: 'none', why: 'the first fact is a snapshot, not a move' };
  const shown = str(vw.shown || vw.ref);
  if (!shown && !stale) return { act: force ? 'reconnect' : 'none', why: 'not connected yet — the bridge resolves the session’s browser when it connects' };
  const prevRef = refOfUsing(prev && prev.using);
  const following = !str(vw.ref) || stale || (prevRef !== null && shown === prevRef) || shown === nextRef;
  if (!following) return { act: force ? 'reconnect' : 'none', why: 'the user chose this browser and it is still the session’s' };
  if (shown !== nextRef) return { act: 'retarget', ref: nextRef, why: stale ? 'its browser is gone' : 'the conversation moved to another browser' };
  if (force) return { act: 'reconnect', why: 'the user asked' };
  const s = next.using.state;
  if (vw.errorCode && !stale && (s === 'running' || s === 'starting')) return { act: 'reconnect', why: 'its browser runs again' };
  return { act: 'none', why: 'already on the browser in use' };
}

/**
 * DELETE A PINNED PROFILE: refuse-or-warn. `pinnedBy` = the conversations whose pin names it ([{browserKey, name?}]).
 * Without `unpin` a delete of a pinned profile is refused `pinned` with the count (the UI asks "3 conversations use
 * this profile — unpin them?"); with it, the delete proceeds and every one of those pins is cleared first.
 */
function deletePinnedVerdict({ label = '', pinnedBy = [], unpin = false } = {}) {
  const list = arr(pinnedBy).filter((x) => x && x.browserKey);
  const n = new Set(list.map((x) => x.browserKey)).size;
  if (!n) return { ok: true, unpin: [] };
  if (unpin) return { ok: true, unpin: list };
  return { ok: false, code: 'pinned', count: n, names: list.map((x) => str(x.name)).filter(Boolean).slice(0, 12),
    error: `${n} conversation${n === 1 ? '' : 's'} use${n === 1 ? 's' : ''} ${label ? `"${label}"` : 'this profile'} as ${n === 1 ? 'its' : 'their'} pin — unpin ${n === 1 ? 'it' : 'them'} first (the delete can do it: unpin:true)` };
}

module.exports = {
  EPHEMERAL_REF, PIN_RUNGS, MANAGED_RUNGS, PIN_CLEARED_MS, DIFFERS, USING_STATES, STALE_CODES,
  sessionFactsOf, stateOf, browserFactFor, keylessFact, factDigest, browserFactWords, refOfUsing, liveFollowPlan, deletePinnedVerdict,
};
