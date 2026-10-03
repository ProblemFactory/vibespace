'use strict';
/**
 * BROWSER SESSIONS AND THEIR REPLAY — PURE (imports nothing; CJS so the
 * recorder, the routes, the normalizers and the bundle share ONE spelling of
 * every rule). The owner (2026-09-27): "最关键是能在聊天界面和浏览器查看界面两个地方都能看到
 * session 的开始和结束，以及每个浏览器 session 的回放".
 *
 * WHAT A SESSION IS: one run of a conversation's browser — from the keeper
 * granting the lease / launching or joining the browser (the first moment the
 * agent can act) to the lease's release (a detach, the lease dropped with its
 * conversation, a stop by a person, a switch of backend). IDLE IS NOT AN END: a
 * browser the keeper stopped for idleness keeps its lease, and a lease that
 * lives is a session that lives (`stopEndsSession`). The recorder
 * (src/server/browser-trace.js) writes one `start` and one `end` MARKER per
 * session into the trace scope's `sessions.ndjson`; every action entry of the
 * run carries the session id (`browserSession`). A session id is `bs-<8 hex>`.
 *
 * WHAT THIS MODULE DECIDES:
 *   · `pairSessions` — markers + entries → the sessions, newest first. A start
 *     with no end is OPEN; an entry tagged with an id no marker names makes its
 *     session from its entries; UNTAGGED entries (recorded before sessions
 *     existed) form IMPLICIT sessions per (browser, scope), split at a gap of
 *     `LEGACY_GAP_MS` — an action before any start is its own session.
 *   · `chatCardsFor` — the two chat cards per session of ONE conversation (its
 *     own browser key; a helper's browser has none in the parent's chat),
 *     stable ids so the live op and every rebuild name the same card.
 *   · the REPLAY model: which session and which action, the keys, the 1 s play
 *     step, and the empty states by NAME (the words are the client's t()).
 * The words are never here: a surface gets kinds and numbers, the device's t()
 * says them (en / zh / ja).
 */

const SESSION_ID_RE = /^bs-[0-9a-f]{8}$/;
const BROWSER_KEY_RE = /^bk-[0-9a-f]{8}(\.\d{1,4})?$/;
const MARKERS_FILE = 'sessions.ndjson';
/** Untagged (pre-session) entries of one browser split into sessions at a gap this long. */
const LEGACY_GAP_MS = 30 * 60 * 1000;
/** Space plays the chosen session one action per second, stopping at its last. */
const PLAY_STEP_MS = 1000;
/** The keeper's stop reasons that are NOT an end (the lease lives on). */
const IDLE_STOPS = Object.freeze(['idle', 'turn-idle']);
/** Why a session ended — a closed set the chat card and the list say in words. BROWSE YOURSELF (B-6ae8): `left` = the
 *  user's own browsing ended because its window closed / its connection dropped and the away clock ran out. */
const END_REASONS = Object.freeze(['released', 'dropped', 'stopped', 'switched', 'restart', 'left']);
/** BROWSE YOURSELF: the only holder a marker names besides a conversation (absent = a conversation's session). */
const HOLDERS = Object.freeze(['user']);

function isSessionId(v) { return SESSION_ID_RE.test(String(v || '')); }
function mintSessionId(hex) { return 'bs-' + String(hex || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 8).padEnd(8, '0'); }
const isKey = (v) => BROWSER_KEY_RE.test(String(v || ''));
const isChild = (v) => /\.\d{1,4}$/.test(String(v || ''));
/** The recorder's in-memory key of an open session: one per (browser key, trace scope). */
function sessionKey(browserKey, scope) { return `${String(browserKey || '')}|${String(scope || '')}`; }
/** Does a keeper `browser-stopped` end the sessions on that browser? Idle never does. */
function stopEndsSession(why) { return !IDLE_STOPS.includes(String(why || '')); }
/** A lease event → the end reason it writes (null = not an end). */
function endReasonFor(ev) {
  const k = ev && ev.kind;
  if (k === 'detach') return 'released';
  if (k === 'lease-dropped') return 'dropped';
  if (k === 'browser-stopped') { if (!stopEndsSession(ev.why)) return null; return ev.why === 'switch' ? 'switched' : 'stopped'; }
  return null;
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** An implicit session's id — derived from its FIRST entry's id (FNV-1a, 8 hex), so every reader names it the same. */
function implicitIdOf(entryId) {
  let h = 0x811c9dc5;
  const s = 'implicit:' + String(entryId || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return mintSessionId(h.toString(16).padStart(8, '0'));
}
const str = (v, n = 200) => (typeof v === 'string' && v ? v.slice(0, n) : null);

/** One marker line, sanitized (what the recorder appends and every reader trusts). */
function markerFor({ phase, id, browserKey, profileId = null, webuiSessionId = null, label = null, at, url = null, count = null, durationMs = null, reason = null, holder = null, recorded = null } = {}) {
  const m = { kind: 'session', phase: phase === 'end' ? 'end' : 'start', id: String(id || ''), browserKey: String(browserKey || ''), profileId: profileId || null, ephemeral: !profileId, at: num(at) };
  // BROWSE YOURSELF (B-6ae8): the USER's own browsing — `holder: 'user'`, never a conversation's (no webui session id);
  // `recorded` = whether his actions were traced (the profile's "Also record my own actions", the owner's opt-out)
  if (HOLDERS.includes(holder)) { m.holder = holder; if (typeof recorded === 'boolean') m.recorded = recorded; }
  if (webuiSessionId && !m.holder) m.webuiSessionId = String(webuiSessionId).slice(0, 120);
  if (label) m.label = String(label).slice(0, 120);
  if (url) m.url = String(url).slice(0, 2000);
  if (m.phase === 'end') { m.count = Math.max(0, Math.round(num(count))); m.durationMs = Math.max(0, Math.round(num(durationMs))); m.reason = END_REASONS.includes(reason) ? reason : 'stopped'; }
  else if (reason) m.reason = String(reason).slice(0, 40);
  return m;
}
function isMarker(m) { return !!(m && m.kind === 'session' && (m.phase === 'start' || m.phase === 'end') && isSessionId(m.id) && Number.isFinite(Number(m.at))); }

/** An entry's frame bytes — each distinct file once (an `afterSame` after IS the before file). */
function entryFrameBytes(e) {
  if (!e) return 0;
  const seen = new Set(); let n = 0;
  for (const f of [e.before, e.after]) { if (!f || !f.file || seen.has(f.file)) continue; seen.add(f.file); n += num(f.bytes); }
  return n;
}
const hasFrames = (e) => !!(e && ((e.before && e.before.file) || (e.after && e.after.file)));
/** lane trace-fits: the live view's own re-fit (src/browser-trace.js FIT_ACTION — the same spelling, this module imports
 *  nothing) — a session COUNTS the agent's actions and carries its fits beside (`fits`, every coalesced one). */
const FIT_ACTION = 'viewer-fit';
const isFitEntry = (e) => !!e && String(e.action || '') === FIT_ACTION;
const fitCount = (e) => (isFitEntry(e) ? Math.max(1, Math.round(num(e.n)) || 1) : 0);

/**
 * markers + entries → the sessions, NEWEST FIRST:
 *   {id, implicit, browserKey, child, profileId, ephemeral, scope, label, webuiSessionId, startAt, endAt|null, open,
 *    reason|null, count, firstAt, lastAt, durationMs, frameEntries, framesRemoved, frameBytes}
 * `count` = the entries recorded under it (an end marker's own count when no entry survives to say it).
 */
function pairSessions({ markers = [], entries = [], now = 0, gapMs = LEGACY_GAP_MS } = {}) {
  const byId = new Map();
  let seq = 0; // the order sessions were first seen (the marker file is appended in time order) — the tie-break
  const mk = (id, base) => { let s = byId.get(id); if (!s) { s = { id, order: seq++, implicit: false, browserKey: null, child: false, profileId: null, ephemeral: true, scope: null, label: null, webuiSessionId: null, holder: null, startAt: 0, endAt: null, open: false, reason: null, count: 0, fits: 0, markCount: null, firstAt: 0, lastAt: 0, durationMs: 0, frameEntries: 0, framesRemoved: 0, frameBytes: 0, hasStart: false, hasEnd: false, ...base }; byId.set(id, s); } return s; };
  const sorted = (markers || []).filter(isMarker).slice().sort((a, b) => num(a.at) - num(b.at));
  for (const m of sorted) {
    const s = mk(m.id, {});
    if (!s.browserKey) s.browserKey = m.browserKey || null;
    if (m.profileId) { s.profileId = m.profileId; s.ephemeral = false; }
    if (m.label && !s.label) s.label = m.label;
    if (m.webuiSessionId && !s.webuiSessionId) s.webuiSessionId = m.webuiSessionId;
    if (HOLDERS.includes(m.holder)) { s.holder = m.holder; if (typeof m.recorded === 'boolean' && s.recorded === undefined) s.recorded = m.recorded; } // BROWSE YOURSELF: the user's own session
    if (m.phase === 'start') { if (!s.hasStart || num(m.at) < s.startAt) s.startAt = num(m.at); s.hasStart = true; }
    else { s.hasEnd = true; s.endAt = Math.max(num(s.endAt), num(m.at)); s.reason = m.reason || 'stopped'; if (Number.isFinite(Number(m.count))) s.markCount = Number(m.count); }
  }
  // entries: tagged → their session; untagged → implicit sessions per (browser key, scope), split at the gap
  const loose = new Map();
  for (const e of (entries || []).slice().sort((a, b) => num(a.at) - num(b.at))) {
    if (!e || !e.id) continue;
    let s;
    if (isSessionId(e.browserSession)) {
      s = byId.get(e.browserSession) || mk(e.browserSession, { implicit: true, webuiSessionId: e.sessionId || null });
      if (!s.browserKey && e.browserKey) s.browserKey = e.browserKey;
      if (!s.profileId && e.profileId) { s.profileId = e.profileId; s.ephemeral = false; }
    } else {
      const lk = sessionKey(e.browserKey || '', e.profileId || 'ephemeral');
      const cur = loose.get(lk);
      if (cur && num(e.at) - cur.lastAt <= gapMs) s = cur;
      else {
        s = mk(implicitIdOf(e.id), { implicit: true, browserKey: e.browserKey || null, profileId: e.profileId || null, ephemeral: !e.profileId, webuiSessionId: e.sessionId || null });
        loose.set(lk, s);
      }
    }
    if (isFitEntry(e)) s.fits += fitCount(e); else s.count++; // lane trace-fits: fits ride beside the count
    if (!s.firstAt || num(e.at) < s.firstAt) s.firstAt = num(e.at);
    if (Math.max(num(e.at), num(e.lastAt)) > s.lastAt) s.lastAt = Math.max(num(e.at), num(e.lastAt));
    if (hasFrames(e)) { s.frameEntries++; s.frameBytes += entryFrameBytes(e); }
    else if (e.framesRemoved) s.framesRemoved++;
  }
  const out = [];
  for (const s of byId.values()) {
    if (!s.hasStart) s.startAt = s.firstAt || num(s.endAt);
    if (s.implicit && !s.hasEnd) { s.endAt = s.lastAt || s.startAt; s.reason = null; }
    s.open = !s.implicit && s.hasStart && !s.hasEnd;
    if (!s.count && s.markCount !== null) s.count = s.markCount;
    s.child = isChild(s.browserKey);
    s.scope = s.profileId || 'ephemeral';
    s.durationMs = Math.max(0, (s.open ? num(now) || s.lastAt || s.startAt : num(s.endAt)) - s.startAt);
    const { hasStart, hasEnd, markCount, ...rest } = s;
    out.push(rest);
  }
  return out.sort((a, b) => b.startAt - a.startAt || b.order - a.order);
}
/** 1-based ordinals, OLDEST first ("Session 3"), over the sessions of one list. */
function sessionOrdinals(sessions) {
  const m = new Map();
  (sessions || []).slice().sort((a, b) => a.startAt - b.startAt || (a.order || 0) - (b.order || 0)).forEach((s, i) => m.set(s.id, i + 1));
  return m;
}
/** Which session an entry belongs to: its tag, else the implicit session of its browser whose span holds it. */
function sessionOfEntry(entry, sessions) {
  if (!entry) return null;
  if (isSessionId(entry.browserSession)) return entry.browserSession;
  const sc = entry.profileId || 'ephemeral';
  const hit = (sessions || []).find((s) => s.implicit && s.scope === sc && (s.browserKey || null) === (entry.browserKey || null) && num(entry.at) >= s.startAt && num(entry.at) <= Math.max(s.endAt || 0, s.lastAt));
  return hit ? hit.id : null;
}
/** Sessions of ONE conversation (its key, its helpers' `bk-….<n>` keys included), newest first. */
function sessionsOfKey(sessions, browserKey) {
  const k = String(browserKey || '');
  return (sessions || []).filter((s) => s.browserKey === k || (isChild(s.browserKey) && String(s.browserKey).slice(0, String(s.browserKey).indexOf('.')) === k));
}
/**
 * The chat's two cards per session of ONE conversation (its OWN key — a helper's browser is not the parent's chat):
 * `{id, phase, at, session, browserKey, profileId, ephemeral, label}` + on the end card `{durationMs, count, reason,
 * framesRemoved}`. Implicit sessions (no markers) have no cards. Oldest first; ids stable: `bs:<id>:start|end`.
 */
function chatCardsFor(sessions, browserKey, { limit = 0 } = {}) {
  const k = String(browserKey || '');
  if (!isKey(k)) return [];
  const out = [];
  // oldest session first, each its start then its end; the stable sort by instant keeps that order on a tie (a session
  // that ended in the same millisecond the next one started reads end → start, never two starts in a row)
  for (const s of (sessions || []).slice().sort((a, b) => a.startAt - b.startAt || (a.order || 0) - (b.order || 0))) {
    // BROWSE YOURSELF (B-6ae8): the user's own browsing is never a card in any chat — its key is not a browser key (the
    // first gate, above) and a marker naming the user as its holder is skipped here too (the second gate)
    if (s.implicit || s.browserKey !== k || s.holder === 'user') continue;
    const base = { session: s.id, browserKey: s.browserKey, profileId: s.profileId || null, ephemeral: !s.profileId, label: s.label || null };
    out.push({ id: `bs:${s.id}:start`, phase: 'start', at: s.startAt, ...base });
    if (!s.open && s.endAt) out.push({ id: `bs:${s.id}:end`, phase: 'end', at: s.endAt, durationMs: s.durationMs, count: s.count, reason: s.reason || 'stopped', framesRemoved: s.framesRemoved > 0 && s.frameEntries === 0, limit: num(limit) || 0, ...base });
  }
  return out.map((c, i) => ({ c, i })).sort((a, b) => a.c.at - b.c.at || a.i - b.i).map((x) => x.c);
}
/** A card sanitized for a normalizer message block (numbers, ids and a label — never markup). */
function cardBlock(card) {
  const c = card || {};
  if (!isSessionId(c.session) || !(c.phase === 'start' || c.phase === 'end')) return null;
  const b = { type: 'browser_session', phase: c.phase, session: c.session, at: num(c.at), browserKey: isKey(c.browserKey) ? c.browserKey : null, profileId: /^bp-[0-9a-f]{8}$/.test(String(c.profileId || '')) ? c.profileId : null, label: str(c.label, 120) };
  b.ephemeral = !b.profileId;
  if (c.phase === 'end') { b.durationMs = Math.max(0, Math.round(num(c.durationMs))); b.count = Math.max(0, Math.round(num(c.count))); b.reason = END_REASONS.includes(c.reason) ? c.reason : 'stopped'; b.framesRemoved = !!c.framesRemoved; b.limit = Math.max(0, Math.round(num(c.limit))); }
  return b;
}

/** A duration in parts (the client says them): ≥ 1 h ⇒ {h, m}; ≥ 1 min ⇒ {m}; else {s}. */
function durationParts(ms) {
  const s = Math.max(0, Math.round(num(ms) / 1000));
  if (s >= 3600) return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) };
  if (s >= 60) return { m: Math.round(s / 60) };
  return { s };
}

// ── THE REPLAY MODEL ──
/** The empty state a replay pane shows, by NAME (null = there is something to show). */
function replayEmpty({ traceOn = true, sessions = [], session = null, entries = null } = {}) {
  if (!sessions || !sessions.length) return traceOn === false ? 'trace-off' : 'no-sessions';
  if (!session) return null;
  // BROWSE YOURSELF (B-6ae8): the user's own session — recorded like an agent's unless the profile's "Also record my own
  // actions" was off (then only when it started and stopped is kept)
  if (session.holder === 'user' && session.recorded === false) return 'yours-not-recorded';
  if (session.holder === 'user' && !(entries || []).length && !session.count) return traceOn === false ? 'trace-off' : 'yours-no-actions';
  const list = entries || [];
  // nothing listed: the trace was off (nothing could be recorded), the agent did nothing, or the list is still coming
  if (!list.length) return traceOn === false ? 'trace-off' : (session.count ? null : 'no-actions');
  if (list.every((e) => !hasFrames(e) && e.framesRemoved)) return 'frames-removed';
  return null;
}
/** Does THIS action show its frames, or say they were removed? */
function frameState(entry, which = 'after') {
  if (!entry) return 'none';
  const f = which === 'before' ? entry.before : entry.after;
  if (f && f.file) return 'frame';
  if (entry.framesRemoved) return 'removed';
  return 'none';
}
/** The replay's state after a key: ←/→ step, Home/End jump, Space plays / pauses (stops by itself at the end). */
function replayKey(state, key, n) {
  const st = { index: 0, playing: false, ...(state || {}) };
  const last = Math.max(0, (Number(n) || 0) - 1);
  const clamp = (i) => Math.max(0, Math.min(last, i));
  switch (key) {
    case 'ArrowLeft': return { ...st, index: clamp(st.index - 1), playing: false };
    case 'ArrowRight': return { ...st, index: clamp(st.index + 1), playing: false };
    case 'Home': return { ...st, index: 0, playing: false };
    case 'End': return { ...st, index: last, playing: false };
    case ' ': case 'Space': {
      if (st.playing) return { ...st, playing: false };
      if (!n) return { ...st, playing: false };
      // play from the start when the last action is showing (a replay, not a no-op)
      return { ...st, index: st.index >= last ? 0 : st.index, playing: last > 0 };
    }
    default: return st;
  }
}
/** One play step: the next action, stopping at the last. */
function playTick(state, n) {
  const st = { index: 0, playing: false, ...(state || {}) };
  if (!st.playing) return st;
  const last = Math.max(0, (Number(n) || 0) - 1);
  const index = Math.min(last, st.index + 1);
  return { ...st, index, playing: index < last };
}
/** Which session a replay opens on: the one asked for, else the newest (the list is newest first). */
function pickSession(sessions, asked = null, at = null) {
  const list = sessions || [];
  if (asked) { const s = list.find((x) => x.id === asked); if (s) return s; }
  if (Number.isFinite(Number(at)) && Number(at) > 0) { const s = list.find((x) => Number(at) >= x.startAt && Number(at) <= (x.endAt || Infinity)); if (s) return s; }
  return list[0] || null;
}
/** The action index a replay opens on: the entry nearest `at` (else the first). */
function pickIndex(entries, at = null) {
  const list = entries || [];
  if (!list.length) return 0;
  if (!(Number(at) > 0)) return 0;
  let best = 0;
  for (let i = 0; i < list.length; i++) if (num(list[i].at) <= Number(at)) best = i;
  return best;
}

module.exports = {
  SESSION_ID_RE, MARKERS_FILE, LEGACY_GAP_MS, PLAY_STEP_MS, IDLE_STOPS, END_REASONS, HOLDERS, FIT_ACTION,
  isSessionId, mintSessionId, sessionKey, stopEndsSession, endReasonFor, markerFor, isMarker, entryFrameBytes,
  pairSessions, sessionOrdinals, sessionOfEntry, sessionsOfKey, chatCardsFor, cardBlock, durationParts,
  replayEmpty, frameState, replayKey, playTick, pickSession, pickIndex,
};
