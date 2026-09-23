'use strict';
/**
 * DESKTOP VIEWERS — PURE (imports nothing; CJS so the keeper, the bridge's
 * wiring, the routes AND the browser bundle share ONE spelling of the rule).
 * P8-2 x5 (docs/design-desktop-apps.zh.md §7 P8-2 "x5 多客户端 = 单活跃 viewer",
 * 2026-09-22). The owner's ruling, verbatim: "直接block掉非active客户端的app界面，
 * 因为多客户端同时操作鼠标感觉也会有问题" + "仿照terminal…可以手动take over".
 *
 * Among the HUMAN viewers of one app window exactly ONE is ACTIVE: its pane
 * size drives the app's geometry and only its input / clipboard reach the app.
 * Every other human viewer is BLOCKED: no picture at all (an overlay with the
 * app's title, "Active on another client" and "Resume here"), and nothing it
 * sends reaches the picture server. Resume here takes over (the taker becomes
 * active, the previous active becomes blocked); when the active viewer leaves,
 * the most recently active remaining viewer takes over by itself — after the
 * keeper's GRACE (2.369.156, default 5 s: the seat is held for the leaving
 * pane, or its `prev` successor after a page reload; a reload or a network
 * blip must not hand the app to another device). This is the
 * terminal's size-override mode (server.js `resizeSessionToMin` +
 * `_sizeOwnerWs`, terminal.js "Resume here") made the default.
 *
 * Composition with the agent lease (P9b): while an agent DRIVES the window
 * (lease input 'agent') every human is WATCH — the picture, scaled to fit the
 * pane, and nothing else (no input, no geometry, no keymap). A human takeover
 * of an agent-held window (lease input 'user') makes that viewer the active
 * one; the others are blocked like any other non-active viewer.
 *
 *   state    picture   input/clipboard   geometry (display size, configure-window)
 *   active   yes       relayed           relayed — the app follows ITS pane
 *   blocked  no        nothing relayed   nothing relayed
 *   watch    yes (fit) cut               cut (held, replayed at a takeover)
 *
 * A viewer here is `{ viewerId, pane, label, since }`: `viewerId` is the
 * per-SOCKET secret the bridge binds (never broadcast), `pane` the window's
 * stable public key (one per desktop-app window per client, kept across the
 * socket's reconnects — the broadcast names viewers by it), `since` when that
 * pane first joined. `paneActiveAt` records, per pane, the last instant it
 * WAS the active viewer — the re-election's "most recently active".
 */

const VIEWER_STATES = Object.freeze(['active', 'blocked', 'watch']);

/** What each state may do — the table above as data (the suites read it). */
const RELAY_RULES = Object.freeze({
  active: Object.freeze({ picture: true, input: true, geometry: true }),
  blocked: Object.freeze({ picture: false, input: false, geometry: false }),
  watch: Object.freeze({ picture: true, input: false, geometry: false }),
});

/**
 * The state of ONE viewer.
 *   session — { active: viewerId|null }   (the keeper's election)
 *   lease   — null (no agent holds the window) | { input: 'agent'|'user', holder: viewerId|null }
 *             (the window-targets engine's lease, holder = the taker's viewer id)
 */
function viewerState(session, viewerId, lease = null) {
  if (lease && typeof lease === 'object') {
    if (lease.input !== 'user') return 'watch';
    return lease.holder != null && viewerId != null && String(lease.holder) === String(viewerId) ? 'active' : 'blocked';
  }
  const active = session && session.active != null ? String(session.active) : null;
  return active !== null && viewerId != null && active === String(viewerId) ? 'active' : 'blocked';
}

/**
 * Who takes over when `leaving` goes (or null when nobody is left): the
 * remaining viewer whose pane was active most recently; a tie (or panes that
 * were never active) goes to the most recently joined — the client a person
 * just opened. `viewers` = [{ viewerId, pane, since }], `paneActiveAt` =
 * { [pane]: ms } (a Map or a plain object).
 */
function nextActive(viewers, leaving = null, paneActiveAt = {}) {
  const at = (pane) => { const v = paneActiveAt instanceof Map ? paneActiveAt.get(pane) : paneActiveAt && paneActiveAt[pane]; return Number.isFinite(v) ? v : -Infinity; };
  let best = null;
  for (const v of Array.isArray(viewers) ? viewers : []) {
    if (!v || v.viewerId == null || (leaving != null && String(v.viewerId) === String(leaving))) continue;
    if (!best) { best = v; continue; }
    const a = at(v.pane), b = at(best.pane);
    if (a > b || (a === b && (Number(v.since) || 0) > (Number(best.since) || 0))) best = v;
  }
  return best ? String(best.viewerId) : null;
}

/**
 * The election's answer to a JOIN: the joiner becomes active when nobody is
 * (first attach), or when the active viewer id is no longer among the viewers.
 */
function activeAfterJoin(session, viewers, joiner) {
  const active = session && session.active != null ? String(session.active) : null;
  const present = active !== null && (viewers || []).some((v) => v && String(v.viewerId) === active);
  return present ? active : String(joiner);
}

/**
 * The broadcast payload — `desktop-app-viewers` — naming viewers by their
 * PUBLIC pane key (never the socket's secret id), one row per pane (a pane
 * reconnecting briefly holds two sockets), oldest first. `session.activePane`
 * (2.369.156) names the pane whose seat is HELD while it reconnects (the
 * keeper's grace): no socket of it is present, yet the others must read
 * themselves blocked — `active: null` would tell every client "nobody is
 * active, you are" (paneState) while the bridge blocks them.
 */
function viewersView(id, session, viewers) {
  const byPane = new Map();
  for (const v of Array.isArray(viewers) ? viewers : []) {
    if (!v || v.pane == null) continue;
    const cur = byPane.get(v.pane);
    const since = Number(v.since) || 0;
    if (!cur) byPane.set(v.pane, { id: String(v.pane), label: String(v.label || ''), since });
    else if (since < cur.since) cur.since = since;
  }
  const activeRow = session && session.active != null ? (viewers || []).find((v) => v && String(v.viewerId) === String(session.active)) : null;
  const held = session && session.activePane != null ? String(session.activePane) : null;
  return { type: 'desktop-app-viewers', id: String(id), active: activeRow ? String(activeRow.pane) : held, viewers: [...byPane.values()].sort((a, b) => a.since - b.since) };
}

/**
 * The CLIENT's reading (a pane knows its own pane key and its takeover tag,
 * never another socket's id): the lease view the server broadcasts
 * (`input`, `takenBy.tag`) + the viewers broadcast's `active` pane.
 *   known === false (no answer yet) or nobody elected ⇒ 'active' (the server
 *   holds the picture back anyway; the first answer corrects it within one
 *   round trip).
 */
function paneState({ lease = null, myTag = null, active = null, myPane = null, known = true } = {}) {
  if (lease && typeof lease === 'object') {
    if (lease.input !== 'user') return 'watch';
    const tag = lease.takenBy && lease.takenBy.tag != null ? String(lease.takenBy.tag) : null;
    return tag !== null && myTag != null && tag === String(myTag) ? 'active' : 'blocked';
  }
  if (!known || active == null) return 'active'; // nobody elected yet: the first socket to attach will be — the bridge holds the picture back anyway
  return myPane != null && String(active) === String(myPane) ? 'active' : 'blocked';
}

/** "Chrome · Linux" from a User-Agent — the viewer list's label (no version, no device id). */
function viewerLabel(ua) {
  const s = String(ua || '');
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\/|Chromium\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /node|undici|ws\//i.test(s) || !s ? 'Client' : 'Browser';
  const os = /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Windows/.test(s) ? 'Windows' : /CrOS/.test(s) ? 'ChromeOS' : /Linux|X11/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

module.exports = { VIEWER_STATES, RELAY_RULES, viewerState, nextActive, activeAfterJoin, viewersView, paneState, viewerLabel };
