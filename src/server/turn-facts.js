'use strict';
/**
 * PURE (imports nothing) — the TURN FACT the `active-sessions` payload carries
 * (docs/design-user-inbox-reply.md D1.7: the For-you inbox's running dot).
 *
 * `_isStreaming` has nine write sites across five server files and `_turnState`
 * rides the harness's own requires_action record; hooking a broadcast on each
 * flip would be a twin-drift nursery. The fact is DERIVED instead: `turnOf`
 * reads the two fields, `turnDigest` summarises the whole live map, and ONE
 * unref'd 1 s timer in server.js re-broadcasts the session list only when the
 * digest moved (derived, never written — the view-visibility.js rule).
 *
 * The digest names only the NON-idle sessions: idle is the default, and a
 * session appearing or leaving idle-to-idle is already announced by the
 * session list's own broadcasts (create/kill/rename) — counting it here would
 * send a duplicate list one second after each of them.
 */

/** 'waiting' (paused on the user: the harness's requires_action) | 'running'
 *  (mid-turn) | 'idle' */
function turnOf(s) {
  if (!s) return 'idle';
  if (s._turnState === 'requires_action') return 'waiting';
  return s._isStreaming ? 'running' : 'idle';
}

/**
 * Does this session PUBLISH turn facts at all? (lane P verify r2, F1,
 * 2026-09-26.) Every `_isStreaming` / `_turnState` writer is a CHAT consumer
 * (the stream-json / codex / ACP stdout consumers, chat-input, the sidecar
 * reconciliation, the exit path) — a TERMINAL-mode session (plain claude /
 * codex in a PTY) never sets them, so `turnOf` reads it 'idle' BY
 * CONSTRUCTION. That is harmless for the running dot and wrong for any
 * decision that ACTS on "the turn ended": such a reader asks `turnKnown` first
 * and treats false as UNKNOWN (null), never as idle.
 */
function turnKnown(s) {
  return !!s && s.mode === 'chat';
}

/** The sorted `${id}:${turn}` join over every NON-idle session of a
 *  Map(id → session) (or any iterable of [id, session] pairs). */
function turnDigest(map) {
  const out = [];
  for (const [id, s] of map || []) {
    if (!s || s.isTmuxView) continue;
    const t = turnOf(s);
    if (t !== 'idle') out.push(`${id}:${t}`);
  }
  return out.sort().join(',');
}

module.exports = { turnOf, turnKnown, turnDigest };
