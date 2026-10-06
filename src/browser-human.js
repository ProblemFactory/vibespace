'use strict';
/**
 * BROWSE YOURSELF — THE USER AS ONE MORE HOLDER (B-6ae8, docs/design-browse-yourself.md + the owner's decisions of
 * 2026-09-28: "我其实也相当于是一个agent而已"). PURE: imports nothing; CJS so the keeper, the routes, the live-view bridge and
 * the bundle share ONE spelling of every rule and every sentence.
 *
 * THE MODEL. One profile = one Chrome shared by several conversations at once, each on its own tabs; the user is ONE MORE
 * HOLDER with his OWN tab. Browse yourself (a button on every local profile row) starts the profile's browser through the
 * SAME `start()` an agent's first command uses, or joins it; the user gets his OWN pinned tab under a session of his own
 * (`vs-hu-<hex>` over the keeper browser's RAW CDP url — never the directory, never mediated), and the live view opens on
 * that tab with an address row. NOTHING of the agents is paused, interrupted or told: the takeover ruling (2026-09-27)
 * applies only when the user drives an AGENT's tab from a conversation's live view — the existing path, unchanged.
 *   · ONE human holder per profile; its key is DERIVED — `hu-` + the profile id's 8 hex (profile ids come from a
 *     fresh-id loop, so it cannot collide) — and never matches a browser key (`bk-…`): every admission, chat card,
 *     binding, told, pin and cap path that gates on a browser key rejects it BY CONSTRUCTION.
 *   · Persisted with the keeper's registry (verify r1, H4): a server restart restores him AWAY — his keep and his tab
 *     continue, the idle clock still counts him; his session marker ends `restart` and re-opens at his next take.
 *   · States: `driving` (one of the user's windows holds his tab's controls) · `away` (none does: the window closed, the
 *     connection dropped — his tab is kept for the KEEP: `browser.humanKeepMs`, 12 h, when HE launched the browser; the
 *     10-min `browser.takeoverIdleMs` when he joined a browser an agent launched) · ended.
 *   · His actions ARE recorded like an agent's (the owner, 3/4): the bridge turns his forwarded input into ACTS
 *     (`humanActStep`) the recorder traces with frames — a click at a point, a key chord by name, typing as «N chars»
 *     (never the text), a scroll — unless the profile's "Also record my own actions" is off (`recordsMine`).
 *   · Two ends: Close (his tab / window; the browser stays and idles out by the keeper's rule when nobody holds it) and
 *     Quit the whole browser (a stop for everyone; the confirm names the conversations that lose their tabs).
 */

const HUMAN_KEY_RE = /^hu-[0-9a-f]{8}$/;
const PROFILE_ID_RE = /^bp-([0-9a-f]{8})$/;
/** The holder a human row names (the digest's `holder`, a session marker's / a trace entry's `holder`). */
const HUMAN_HOLDER = 'user';
/** The live-view window's deterministic sync id: two clients converge on ONE window (the `win-blive-<session>` rule). */
const HUMAN_SYNC_PREFIX = 'win-bhuman-';
const HUMAN_STATES = Object.freeze(['driving', 'away']);
/** Why a human holder ended — `released` (Close), `left` (away past the keep), `stopped` (the browser stopped / quit /
 *  the profile deleted), `restart` (the server restarted: nothing of it is persisted). */
const HUMAN_END_REASONS = Object.freeze(['released', 'left', 'stopped', 'restart']);
/** The lifecycle's events (the table's columns). */
/** The keep while away when the USER launched the browser (the owner, 8: his page and the browser stay 12 h). */
const DEFAULT_HUMAN_KEEP_MS = 12 * 60 * 60 * 1000;
const MIN_HUMAN_KEEP_MS = 60 * 1000;
const HUMAN_KEEP_SETTING = 'browser.humanKeepMs';
/** The address row's verbs besides a URL (the daemon's own). */
const NAV_VERBS = Object.freeze(['back', 'forward', 'reload']);
/** A tab ref the Tabs pane may name: the daemon's `t<N>` or a CDP target id (both stable within the session). */
const TAB_REF_RE = /^(?:t\d{1,4}|[0-9A-Fa-f]{32})$/;
/** Every refusal `browseYourselfVerdict` can answer, in its order (the census and the STATUS rows read this). */
const REFUSAL_CODES = Object.freeze(['not-found', 'not_attachable', 'remote_profile', 'not_ours', 'backend_unavailable', 'browser_restarting', 'profile_locked', 'browser_unstable', 'cap']);
/** Launch-time refusals `start()` throws — passed through with their own words, never re-worded. */
const LAUNCH_CODES = Object.freeze(['backend_no_key', 'fence_refused', 'launch_failed', 'profile_locked', 'browser_closed', 'backend_seat_taken', 'backend_seat_ceiling', 'browser_no_cdp', 'cap']);
/** An act's typing / scrolling burst ends after this long without its kind of input (the recorder writes ONE entry). */
const TYPE_IDLE_MS = 1200;
const WHEEL_IDLE_MS = 700;
/** A press and a release within this many px is a click; farther is a drag (two points). */
const CLICK_SLOP_PX = 5;
/** Keys that are part of typing (an edit, never an entry of their own). */
const TYPING_EDIT_KEYS = Object.freeze(['Backspace', 'Delete']);
/** Keys that are no act on their own (a modifier pressed alone). */
const MODIFIER_KEYS = Object.freeze(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

const str = (v) => (v == null ? '' : String(v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }
const tOf = (t) => (typeof t === 'function' ? (s, p) => t(s, p) : fill);

/** `hu-<the profile id's 8 hex>` — derived, never minted; null for anything that is not a profile id. */
function humanKeyFor(profileId) { const m = PROFILE_ID_RE.exec(str(profileId)); return m ? 'hu-' + m[1] : null; }
function isHumanKey(v) { return HUMAN_KEY_RE.test(str(v)); }
/** The profile a human key names (`bp-<hex>`), or null. */
function profileOfHumanKey(key) { return isHumanKey(key) ? 'bp-' + str(key).slice(3) : null; }
function humanSyncId(profileId) { return HUMAN_SYNC_PREFIX + str(profileId); }
/** Does this profile record the user's own actions? The per-profile opt-OUT (`recordMine`, the owner 4): absent = ON. */
function recordsMine(profile) { return !!profile && profile.recordMine !== false; }
/** `browser.humanKeepMs` → a usable number: unreadable ⇒ 12 h, 0 = never (a real choice), else ≥ 1 min. */
function humanKeepMs(v) {
  if (v === undefined || v === null || v === '') return DEFAULT_HUMAN_KEEP_MS;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_HUMAN_KEEP_MS;
  if (n === 0) return 0;
  return Math.max(MIN_HUMAN_KEEP_MS, Math.round(n));
}
/** How long an AWAY holder keeps its tab (the owner, 8): the user launched the browser ⇒ `keepMs` (12 h); he joined one
 *  an agent launched ⇒ `joinKeepMs` (the 10-min takeover idle) — the browser then follows its other holders. 0 = never. */
function keepFor({ launched = false, keepMs = DEFAULT_HUMAN_KEEP_MS, joinKeepMs = 10 * 60 * 1000 } = {}) { return launched ? num(keepMs) : num(joinKeepMs); }

/**
 * MAY THE USER BROWSE THIS PROFILE NOW? The first match wins (the order is the decision):
 *   1 not-found · 2 not_attachable (a conversation's own temporary browser) · 3 remote_profile (a paired machine this
 *   VibeSpace does not know any more — lane remote-profile-start: a KNOWN machine's profile is browsed like a local one, its
 *   start() refusals (offline, an older agent, no browser there + the one step) passing through by name — was: not
 *   in v1) · 4 not_ours (a provider that only connects: `cdp`, tier 3) · 5 backend_unavailable (the machine's provider
 *   control refused) · 6 browser_restarting (a backend switch in flight) · 7 profile_locked (another browser — maybe the
 *   user's own Chrome — holds its folder) · 8 browser_unstable (its heal budget is spent) · 9 focus (a window of the
 *   user's already drives his tab: not an error — the client focuses it) · 10 cap (a LAUNCH at the machine ceiling; a
 *   join never counts) · then rejoin (the holder is away: its tab kept) · join (a live browser) · launch.
 * "Who can use it" is NOT an input (the owner may browse every profile); another conversation driving, or the user
 * driving an agent's tab from its live view, is NOT a refusal either (his own tab is a peer's).
 *   profile the keeper's record · row the provider row ({starts, leaseKind}) · control the provider control for this
 *   profile's machine ({ok, error}) · switching bool · closed the keeper's close verdict of a ready record ({code,
 *   holderPid}) · live bool · human {state, alive} | null · running (live browsers + other holders) · cap
 * → {ok:true, how:'launch'|'join'|'rejoin'|'focus', key, syncId} | {ok:false, code, error, …extra}
 */
function browseYourselfVerdict({ profile = null, row = null, control = null, switching = false, closed = null, live = false, human = null, running = 0, cap = 6, hostKnown = true } = {}) {
  const p = isObj(profile) ? profile : null;
  const label = p ? str(p.label || p.id) : '';
  const no = (code, facts = {}) => ({ ok: false, code, error: humanRefusalText(code, { label, ...facts }), ...facts });
  if (!p) return no('not-found');
  if (p.ephemeral === true) return no('not_attachable');
  if (p.host && hostKnown === false) return no('remote_profile', { machine: str(p.host) });
  const r = isObj(row) ? row : {};
  if (r.starts === false || r.leaseKind === 'window-target') return no('not_ours');
  if (isObj(control) && control.ok === false) return { ...no('backend_unavailable'), detail: str(control.error).slice(0, 400) };
  if (switching) return no('browser_restarting');
  if (isObj(closed) && closed.code === 'profile_locked') return no('profile_locked', { pid: Number.isInteger(closed.holderPid) ? closed.holderPid : null });
  if (isObj(closed) && closed.code === 'browser_unstable') return no('browser_unstable');
  const key = humanKeyFor(p.id);
  if (!key) return no('not-found');
  const syncId = humanSyncId(p.id);
  if (isObj(human) && human.state === 'driving' && human.alive) return { ok: true, how: 'focus', key, syncId };
  if (!live && num(running) >= (num(cap) || 6)) return no('cap', { n: num(running) });
  if (isObj(human) && (human.state === 'away' || human.state === 'driving')) return { ok: true, how: 'rejoin', key, syncId };
  return { ok: true, how: live ? 'join' : 'launch', key, syncId };
}

/**
 * THE HOLDER'S LIFECYCLE (one table). `state` ∈ HUMAN_STATES ('ended' is terminal); `event` a kind or
 * `{kind, fresh, held}`. → {state, effects[]} — what the keeper / the bridge run:
 *   take (this window holds his tab) · claim (this window takes the controls from his other LIVE window: one holder) ·
 *   watch (another live window holds them — "You're browsing this in another window") · away-clock · close-tab ·
 *   end:<reason>
 *   away    + attach            → driving (take)
 *   driving + attach fresh      → driving (claim — the window he just opened wins)
 *   driving + attach (held)     → driving (watch)          driving + attach (the holder's socket is gone) → take
 *   driving + viewer-left       → away (away-clock)        away + viewer-left → away
 *   *       + idle              → unchanged: his own tab NEVER lapses by the idle clock (nobody to give it back to)
 *   away    + away-timeout      → ended (close-tab, end:left)
 *   *       + close             → ended (close-tab, end:released)
 *   *       + stop              → ended (end:stopped)
 */
function humanStep(state, event) {
  const s = state === 'driving' || state === 'away' ? state : (state === 'ended' ? 'ended' : 'away');
  const ev = typeof event === 'string' ? { kind: event } : (isObj(event) ? event : {});
  if (s === 'ended') return { state: 'ended', effects: [] };
  switch (ev.kind) {
    case 'attach':
      if (s === 'away') return { state: 'driving', effects: ['take'] };
      if (ev.fresh) return { state: 'driving', effects: ['claim'] };
      return ev.held ? { state: 'driving', effects: ['watch'] } : { state: 'driving', effects: ['take'] };
    case 'viewer-left': return { state: 'away', effects: s === 'driving' ? ['away-clock'] : [] };
    case 'idle': return { state: s, effects: [] };
    case 'away-timeout': return s === 'away' ? { state: 'ended', effects: ['close-tab', 'end:left'] } : { state: s, effects: [] };
    case 'close': return { state: 'ended', effects: ['close-tab', 'end:released'] };
    case 'stop': return { state: 'ended', effects: ['end:stopped'] };
    default: return { state: s, effects: [] };
  }
}
/** The reason an `end:<reason>` effect names (null when the step ends nothing). */
function endReasonOf(step) { const e = (step && Array.isArray(step.effects) ? step.effects : []).find((x) => /^end:/.test(x)); return e ? e.slice(4) : null; }
/** Has an away holder's keep run out? `keepMs` 0 = never. */
function awayExpired({ state = 'away', awaySince = 0, now = 0, keepMs = DEFAULT_HUMAN_KEEP_MS } = {}) {
  if (state !== 'away' || !(num(keepMs) > 0)) return false;
  return num(now) - num(awaySince) >= num(keepMs);
}

/**
 * DOES THIS VIEWER OF A BROWSING WINDOW TAKE THE CONTROLS OF HIS TAB AT ONCE? (One of his windows holds them at a time;
 * no agent is involved — his tab is his own, so a replayed window takes them too when nobody holds them.)
 *   fresh (the window the Browse yourself press just opened, its token unused) ⇒ take — `claim` when a live window holds
 *   another live window holds them ⇒ `held` (the window watches: "You're browsing this in another window" + Continue here)
 *   otherwise ⇒ take
 */
function humanAttachVerdict({ fresh = false, driving = false, holderAlive = false } = {}) {
  if (fresh) return { take: true, how: driving && holderAlive ? 'claim' : 'take', why: 'fresh' };
  if (driving && holderAlive) return { take: false, how: 'watch', why: 'held' };
  return { take: true, how: 'take', why: driving ? 'holder-gone' : 'nobody' };
}

/**
 * THE TWO END BUTTONS (always on the browsing window's bar, beside the badge) and the line under them (the owner, 5):
 *   Close — his tab / window only; the browser stays for the agents and idles out by the keeper's rule;
 *   Quit the whole browser — a stop for everyone; with conversations on it, ONE confirm names them (their pages close;
 *   their next command opens the browser again).
 * `names` = the conversations' names (the client's own rows); `idleMs` = browser.idleTimeoutMs.
 */
function humanEndChoices({ conversations = 0, names = [], idleMs = 15 * 60 * 1000 } = {}, tIn) {
  const t = tOf(tIn);
  const n = Math.max(0, Math.floor(num(conversations)));
  const who = (Array.isArray(names) ? names : []).map(str).filter(Boolean);
  const name = who.length ? who.join(', ') : (n === 1 ? t('a conversation') : t('{n} conversations', { n }));
  const min = Math.max(1, Math.round((num(idleMs) || 15 * 60 * 1000) / 60000));
  const close = { kind: 'close', label: t('Close'), title: t('Close your tab — the browser stays for your agents') };
  const quit = { kind: 'quit', label: t('Quit the whole browser'), title: t('Stop this browser for everyone using it') };
  const line = n ? t('{name} also uses this browser — Close leaves it running for them.', { name })
    : (num(idleMs) > 0 ? t('After Close, it closes by itself in {min} min if nothing uses it.', { min }) : '');
  const confirm = n ? { title: t('Quit the whole browser?'), message: t('{name} also uses this browser. Quitting closes their pages too; their next browser command opens it again.', { name }), confirmText: t('Quit the browser'), danger: true } : null;
  return { close, quit, line, confirm, conversations: n };
}

/** The digest's holder row of a human holder (the keeper's `holderRows` appends it; `sessionId: null` = no conversation). */
function humanHolderRow(h, { viewers = 0 } = {}) {
  if (!isObj(h) || !isHumanKey(h.key) || profileOfHumanKey(h.key) !== h.profileId) return null;
  const driving = h.state === 'driving';
  return { profileId: h.profileId, browserKey: h.key, holder: HUMAN_HOLDER, human: true, sessionId: null, since: num(h.since), input: driving ? 'user' : 'agent', state: driving ? 'driving' : 'away', awaySince: driving ? 0 : num(h.awaySince), keepMs: num(h.keepMs), launched: !!h.launched, recording: !!h.recording, viewers: Math.max(0, Math.floor(num(viewers))) };
}

/**
 * THE ADDRESS ROW: web addresses only (http / https, and about:blank to clear) — the agent's rule, stricter (no data:).
 * A bare host ("example.com", "localhost:3000/x") gains a scheme (http for loopback, https otherwise).
 * → {ok:true, url} | {ok:false, code:'not_web', error}
 */
function addressVerdict(input) {
  const raw = str(input).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const refuse = () => ({ ok: false, code: 'not_web', error: 'Only web addresses' });
  if (!raw || raw.length > 4096) return refuse();
  if (/^about:blank$/i.test(raw)) return { ok: true, url: 'about:blank' };
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(raw);
  if (m && (m[1].toLowerCase() === 'http' || m[1].toLowerCase() === 'https')) {
    let u = null; try { u = new URL(raw); } catch { return refuse(); }
    return u.hostname ? { ok: true, url: u.href } : refuse();
  }
  // "localhost:3000" parses as a scheme `localhost` — a host with a port, not a scheme; any other scheme is refused
  if (m && !/^[A-Za-z0-9.-]+:\d{1,5}(?:[/?#].*)?$/.test(raw)) return refuse();
  if (/\s/.test(raw)) return refuse();
  const host = raw.split(/[/?#]/)[0].replace(/:\d{1,5}$/, '');
  if (!(host === 'localhost' || /\./.test(host) || /^\[[0-9a-f:]+\]$/i.test(host))) return refuse();
  const loop = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(host);
  let u = null; try { u = new URL((loop ? 'http://' : 'https://') + raw); } catch { return refuse(); }
  return { ok: true, url: u.href };
}
/**
 * HIS TABS (verify r1, H6): the tab `tab new` bound for him + every tab it opened, transitively — Chrome's own `openerId`
 * (MEASURED on 154 through the keeper: set for a target=_blank link (implicit noopener), rel="noopener noreferrer",
 * window.open and window.open(…,'noopener'); an agent's popup names the AGENT's tab). Everything else in the browser is a
 * conversation's (or nobody's): never his to switch to, to drive or to close — the boundary is the tab's OWNER, never "a
 * human is present". `targets` = CDP Target.getTargets' targetInfos (`{targetId, type, openerId}`). → Set of target ids.
 */
const TARGET_ID_RE = /^[0-9A-Fa-f]{32}$/;
const pageTargets = (targets) => (Array.isArray(targets) ? targets : []).filter((x) => isObj(x) && str(x.type || 'page') === 'page' && TARGET_ID_RE.test(str(x.targetId)));
/** `adopted` (verify r2): the ORPHAN tabs he took (a tab left behind by a conversation that ended — see orphanTabSet) are
 *  roots of his set too, with what THEY open. His own tab gone and no adopted tab left ⇒ nothing in the browser is his. */
function humanTabSet(targets, ownTab, adopted = []) {
  const own = new Set();
  const pages = pageTargets(targets);
  const present = new Set(pages.map((x) => str(x.targetId)));
  const roots = [str(ownTab), ...(Array.isArray(adopted) ? adopted.map(str) : [])].filter((id) => TARGET_ID_RE.test(id) && present.has(id));
  if (!roots.length) return own; // his tab is gone (and he adopted none that lives): nothing in the browser is his
  for (const id of roots) own.add(id);
  for (let grew = true; grew;) { grew = false; for (const x of pages) { const id = str(x.targetId), op = str(x.openerId); if (!own.has(id) && op && own.has(op)) { own.add(id); grew = true; } } }
  return own;
}
/**
 * THE ORPHANS (verify r2 — the judge: "may he click into them? yes, and they become his; an agent's later `tab new` never
 * takes his"): a conversation that ENDED leaves its tab in the shared browser (the tick drops its lease after the carrier
 * grace; nothing closes its page). Whose is a tab nobody holds? Only when NO conversation holds the browser (`leased`
 * false) is every page outside his set nobody's — with a lease on it, a conversation's other tabs (its `tab new`s, its
 * popups) are invisible to the keeper, so nothing is adoptable (fail closed). → Set of target ids he may take.
 */
function orphanTabSet(targets, own, { leased = true } = {}) {
  const out = new Set();
  if (leased || !(own instanceof Set)) return out;
  for (const x of pageTargets(targets)) { const id = str(x.targetId); if (!own.has(id)) out.add(id); }
  return out;
}
/** May his Tabs pane move his session to this tab? A CDP target id in HIS set (`own`, or null when his tabs could not be
 *  read — fail CLOSED), or an ORPHAN (`orphans`: nobody holds the browser — the tab becomes his: `adopt`).
 *  → {ok:true, targetId, adopt?} | {ok:false, code:'not_your_tab'|'tabs_unreadable', error}. */
function humanTabVerdict({ ref = null, own = null, orphans = null } = {}) {
  const r = str(ref);
  if (!(own instanceof Set)) return { ok: false, code: 'tabs_unreadable', error: humanRefusalText('tabs_unreadable') };
  if (TARGET_ID_RE.test(r) && own.has(r)) return { ok: true, targetId: r };
  if (TARGET_ID_RE.test(r) && orphans instanceof Set && orphans.has(r)) return { ok: true, targetId: r, adopt: true };
  return { ok: false, code: 'not_your_tab', error: humanRefusalText('not_your_tab') };
}
/** One address-row act → the daemon's own argv under the human session (`--pin-tab` keeps it on its tab), or a refusal.
 *  `{url}` · `{verb:'back'|'forward'|'reload'}` · `{tab:'t3'|<CDP target id>}` (the keeper admits a tab only through
 *  `humanTabVerdict`: a target id of HIS set). */
function navArgv({ url = null, verb = null, tab = null } = {}, { pinTab = true } = {}) {
  const pin = pinTab ? ['--pin-tab'] : [];
  if (verb !== null && verb !== undefined && verb !== '') {
    if (!NAV_VERBS.includes(verb)) return { ok: false, code: 'bad-request', error: `the address row knows ${NAV_VERBS.join(' / ')}` };
    return { ok: true, argv: [...pin, verb], act: verb };
  }
  if (tab !== null && tab !== undefined && tab !== '') {
    if (!TAB_REF_RE.test(str(tab))) return { ok: false, code: 'bad-request', error: 'a tab is named by its id (t<N>) or its target id' };
    return { ok: true, argv: ['tab', str(tab)], act: 'tab' };
  }
  const v = addressVerdict(url);
  if (!v.ok) return v;
  return { ok: true, argv: [...pin, 'open', v.url], act: 'open', url: v.url };
}

// ── THE USER'S ACTS (the owner, 3: recorded like an agent's) ────────────────────────────────────────────────────────────
/**
 * ONE forwarded input record of the user's browsing window → the ACTS the recorder traces, as the daemon's own action
 * names (src/browser-trace.js TRACED_ACTIONS): a click (`mouseclick` at the page point), a drag (`mousedown` + `mouseup`),
 * a key chord or a named key (`press` Control+A / Enter / ArrowDown), a burst of typing (`type` — its text is a run of
 * placeholders of the typed LENGTH: the words never leave the bridge; the trace keeps «N chars»), a paste / IME commit (one
 * `type`), a burst of wheel (`scroll` with its direction and amount). A mouse move is no act; Backspace / Delete are part of
 * typing; a modifier alone is nothing. PURE step: `(state, record, now) → {state, acts}`; `humanActFlush(state, now)`
 * closes a typing / scrolling burst that went quiet (TYPE_IDLE_MS / WHEEL_IDLE_MS) — or every open one with `force`.
 */
function newActState() { return { typing: null, wheel: null, press: null }; }
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
function chordName(rec) {
  const m = num(rec && rec.modifiers);
  const parts = [];
  if (m & MOD.ctrl) parts.push('Control');
  if (m & MOD.alt) parts.push('Alt');
  if (m & MOD.meta) parts.push('Meta');
  if (m & MOD.shift) parts.push('Shift');
  const k = str(rec && rec.key);
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join('+');
}
const PLACEHOLDER = '•';
function flushTyping(st, out) { if (st.typing && st.typing.n > 0) out.push({ action: 'type', params: { text: PLACEHOLDER.repeat(Math.min(10000, st.typing.n)) } }); st.typing = null; }
function flushWheel(st, out) {
  if (st.wheel && (st.wheel.dy || st.wheel.dx)) {
    const w = st.wheel;
    const vertical = Math.abs(w.dy) >= Math.abs(w.dx);
    const d = vertical ? w.dy : w.dx;
    out.push({ action: 'scroll', params: { direction: vertical ? (d < 0 ? 'up' : 'down') : (d < 0 ? 'left' : 'right'), amount: Math.round(Math.abs(d)), x: w.x, y: w.y } });
  }
  st.wheel = null;
}
function humanActStep(state, record, now = 0) {
  const st = isObj(state) ? { typing: state.typing ? { ...state.typing } : null, wheel: state.wheel ? { ...state.wheel } : null, press: state.press ? { ...state.press } : null } : newActState();
  const acts = [];
  const r = isObj(record) ? record : {};
  const t = num(now);
  const done = () => ({ state: st, acts });
  if (r.type === 'input_text') { flushWheel(st, acts); flushTyping(st, acts); const n = Array.from(str(r.text)).length; if (n) acts.push({ action: 'type', params: { text: PLACEHOLDER.repeat(Math.min(20000, n)) } }); return done(); }
  if (r.type === 'input_mouse' || r.type === 'input_touch') {
    const touch = r.type === 'input_touch';
    const ev = str(r.eventType);
    const pt = touch ? (Array.isArray(r.touchPoints) && isObj(r.touchPoints[0]) ? r.touchPoints[0] : null) : r;
    if (!touch && ev === 'mouseWheel') {
      flushTyping(st, acts);
      if (!st.wheel) st.wheel = { dx: 0, dy: 0, x: num(r.x), y: num(r.y), since: t };
      st.wheel.dx += num(r.deltaX); st.wheel.dy += num(r.deltaY); st.wheel.last = t;
      return done();
    }
    if (ev === 'mousePressed' || ev === 'touchStart') {
      flushTyping(st, acts); flushWheel(st, acts);
      if (pt) st.press = { x: num(pt.x), y: num(pt.y), button: touch ? 'left' : str(r.button || 'left'), at: t, clickCount: num(r.clickCount) || 1, lastX: num(pt.x), lastY: num(pt.y) };
      return done();
    }
    if (ev === 'touchMove' && st.press && pt) { st.press.lastX = num(pt.x); st.press.lastY = num(pt.y); return done(); }
    if (ev === 'mouseReleased' || ev === 'touchEnd') {
      const p = st.press;
      st.press = null;
      if (!p) return done();
      const ex = touch ? p.lastX : num(r.x), ey = touch ? p.lastY : num(r.y);
      if (Math.abs(ex - p.x) <= CLICK_SLOP_PX && Math.abs(ey - p.y) <= CLICK_SLOP_PX) acts.push({ action: 'mouseclick', params: { x: p.x, y: p.y, button: p.button, ...(p.clickCount > 1 ? { clickCount: p.clickCount } : {}) } });
      else { acts.push({ action: 'mousedown', params: { x: p.x, y: p.y, button: p.button } }); acts.push({ action: 'mouseup', params: { x: ex, y: ey, button: p.button } }); }
      return done();
    }
    return done(); // a move / anything else: no act
  }
  if (r.type === 'input_keyboard') {
    const ev = str(r.eventType);
    const k = str(r.key);
    if (ev === 'char') { flushWheel(st, acts); if (!st.typing) st.typing = { n: 0, since: t }; st.typing.n += Array.from(str(r.text)).length; st.typing.last = t; return done(); }
    if (ev !== 'keyDown' || !k || MODIFIER_KEYS.includes(k)) return done();
    const mods = num(r.modifiers);
    const chord = (mods & (MOD.ctrl | MOD.alt | MOD.meta)) !== 0;
    const printable = typeof r.text === 'string' && r.text.length > 0 && r.text !== '\r' && r.text !== '\t';
    // verify r1 (H2): a character made WITH Alt — AltGr on Windows (reported as Ctrl+Alt: "@" "€" "{" on a German layout), a
    // Mac's Option ("™" "å") — is TYPED text, counted as a length like any other; as a chord its name WAS the character
    // (`press Control+Alt+@` in the trace: a password's symbols, in order). A ⌘ / Ctrl chord without Alt stays a chord.
    const typed = printable && (!chord || ((mods & MOD.alt) !== 0 && (mods & MOD.meta) === 0));
    if (typed) { flushWheel(st, acts); if (!st.typing) st.typing = { n: 0, since: t }; st.typing.n += Array.from(r.text).length; st.typing.last = t; return done(); }
    if (!chord && TYPING_EDIT_KEYS.includes(k)) { if (st.typing) st.typing.last = t; return done(); }
    flushTyping(st, acts); flushWheel(st, acts);
    acts.push({ action: 'press', params: { key: chordName(r) } });
    return done();
  }
  return done();
}
function humanActFlush(state, now = 0, { force = false } = {}) {
  const st = isObj(state) ? { typing: state.typing ? { ...state.typing } : null, wheel: state.wheel ? { ...state.wheel } : null, press: state.press ? { ...state.press } : null } : newActState();
  const acts = [];
  const t = num(now);
  if (st.typing && (force || t - num(st.typing.last) >= TYPE_IDLE_MS)) flushTyping(st, acts);
  if (st.wheel && (force || t - num(st.wheel.last) >= WHEEL_IDLE_MS)) flushWheel(st, acts);
  return { state: st, acts };
}
/** When the next flush is due (ms from `now`), or null when no burst is open. */
function humanActDueIn(state, now = 0) {
  const st = isObj(state) ? state : {};
  const due = [];
  if (st.typing) due.push(num(st.typing.last) + TYPE_IDLE_MS - num(now));
  if (st.wheel) due.push(num(st.wheel.last) + WHEEL_IDLE_MS - num(now));
  return due.length ? Math.max(0, Math.min(...due)) : null;
}

/** THE WORDS of every refusal code (en; the client passes its t() for zh / ja — the server's English stays for the journal). */
function humanRefusalText(code, facts = {}, tIn) {
  const t = tOf(tIn);
  const f = isObj(facts) ? facts : {};
  const label = str(f.label) || t('this profile');
  switch (code) {
    case 'not-found': return t('This profile no longer exists.');
    case 'not_attachable': return t("This is a conversation's own temporary browser — open its live view and take over instead.");
    case 'remote_profile': return t('“{label}” is saved on {machine}, which is not paired with this VibeSpace any more — pair it again to browse it.', { label, machine: str(f.machine) || t('another computer') });
    case 'not_ours': return t('VibeSpace only connects to this browser — open it where it runs.');
    case 'backend_unavailable': return t("“{label}”'s browser can't run on this computer right now — open its switch dialog to see why.", { label });
    case 'browser_restarting': return t('The browser is restarting on another backend — try again in a moment.');
    case 'profile_locked': return Number.isInteger(f.pid) ? t('“{label}” is open in a browser VibeSpace did not start (pid {pid}) — it may be your own Chrome. Close it first.', { label, pid: f.pid }) : t('“{label}” is open in a browser VibeSpace did not start — it may be your own Chrome. Close it first.', { label });
    case 'browser_unstable': return t('Its browser keeps closing — press Stop on its row first, then try again.');
    case 'cap': return t('{n} browsers are running on this computer — the most it runs at once. Stop one, then Browse yourself again.', { n: num(f.n) || 6 });
    case 'not_browsing': return t('You are not browsing “{label}” any more.', { label });
    case 'not_web': return t('Only web addresses');
    case 'not_your_tab': return t("That tab is a conversation's, not yours — open that conversation's live view and take over to use it.");
    case 'tabs_unreadable': return t('Your tabs could not be read just now — try again.');
    // the .197 integration (browse-yourself × browser-stuck): the human Restart of an unresponsive page never stops HIS page either
    case 'browsing_yourself': if (f.act === 'restart') return t('You are browsing “{label}” yourself — press Close in your browsing window (or Quit the whole browser) first, then restart it.', { label });
      return f.act === 'stop' ? t('You are browsing “{label}” yourself — stop it from your browsing window (Quit the whole browser) or with Stop on its row in the Agent browser panel.', { label }) : t('You are browsing “{label}” yourself — press Close in your browsing window (or Quit the whole browser) first, then delete it.', { label });
    default: return '';
  }
}
/**
 * THE SHARED-TABS LINE (the owner, 2026-09-28, on r1's held question — option A, "有提醒就行"): on a profile whose tabs its
 * conversations SHARE (not "separate tabs"), every agent on it holds the browser's raw endpoint and can list, see and drive
 * every tab of it — his too. His browsing window says so in ONE line at its top (a keyed chip patched in place, never a
 * toast); a "separate tabs" profile (`mediated`: each conversation fenced to its own tabs) shows nothing. The line only
 * TELLS — nothing of the browsing changes. `profile` = the digest's row of the profile (`mediated` is the keeper's fact);
 * no row yet ⇒ null (nothing is claimed about a profile the client has not read). → the sentence | null
 */
function humanShareLine(profile, tIn) {
  const t = tOf(tIn);
  if (!isObj(profile) || !str(profile.id)) return null;
  if (profile.mediated === true || profile.ephemeral === true || profile.host) return null;
  return t('Agents on this profile can also see and drive this tab');
}
/** The Agent browser panel's state line for a profile the user browses (null = no holder). */
function humanStateLine(h, tIn) {
  const t = tOf(tIn);
  if (!isObj(h)) return null;
  return h.state === 'driving' ? t('You are browsing it') : t('You were browsing it — Continue');
}

module.exports = {
  HUMAN_KEY_RE, HUMAN_HOLDER, HUMAN_SYNC_PREFIX, HUMAN_STATES, HUMAN_END_REASONS, NAV_VERBS, TAB_REF_RE, REFUSAL_CODES, LAUNCH_CODES,
  DEFAULT_HUMAN_KEEP_MS, MIN_HUMAN_KEEP_MS, HUMAN_KEEP_SETTING, TYPE_IDLE_MS, WHEEL_IDLE_MS, CLICK_SLOP_PX,
  humanKeyFor, isHumanKey, profileOfHumanKey, humanSyncId, recordsMine, humanKeepMs, keepFor,
  browseYourselfVerdict, humanStep, endReasonOf, awayExpired, humanAttachVerdict, humanEndChoices, humanHolderRow, addressVerdict, navArgv, humanTabSet, orphanTabSet, humanTabVerdict,
  newActState, humanActStep, humanActFlush, humanActDueIn, chordName,
  humanRefusalText, humanStateLine, humanShareLine,
};
