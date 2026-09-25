'use strict';
/**
 * THE FOR-YOU REPLY ROUTE (docs/design-user-inbox-reply.md D1).
 *
 *   POST /api/user-todos/:id/reply   {text}
 *     → {ok:true, msgId, item}  — the reply went down the ONE typing path
 *       (src/server/user-input.js, the chat composer's own server path) as a
 *       user message opening with the item's quote block (PURE
 *       src/inbox-reply.js composeReply), and ONLY THEN the item was resolved
 *       (`resolvedBy:'reply'`, the reply kept on it) — ONE store broadcast
 *     | {error, code} by NAME: agent_forbidden 403 · not_found 404 ·
 *       empty / too_long / input_rejected / too_large 400 ·
 *       no_session / job_item / no_live_session / not_chat / host_unreachable 409 ·
 *       send_failed 500. A refusal resolves nothing.
 *
 *   POST /api/user-todos/resolve-many   {ids: string[] (1..200), status: 'dismissed'|'done'}
 *     → {ok:true, changed: n, unknown: [id…]} — "Mark all seen" on a group head
 *       (design-user-inbox-reply §4 d, chunk 4): the store's setStatusMany,
 *       resolvedBy 'user', ONE save + ONE broadcast; an unknown id is named, the
 *       rest still applies | {error, code}: agent_forbidden 403 · too_many /
 *       bad_ids / bad_status 400. A reopen is not a batch verb (↺ is per row).
 *       server.js registers it BEFORE `POST /api/user-todos/:id` — Express
 *       matches in order, and after it `resolve-many` would read as an item id.
 *
 * OWNER-ONLY (both routes): cookie auth comes from auth.middleware (every non-/api/agent/*
 * route), and an agent's session / job token is refused by name — a reply is
 * the USER's own message (a per-occurrence owner action), so it goes through
 * neither the spend authorizer nor the delivery ladder, and an agent must not
 * be able to speak as the owner into another conversation through it. This
 * file composes no frame of its own (the sender does), so it is not a site in
 * the spend census.
 */
const { checkReplyText, composeReply, replyVerdict } = require('../inbox-reply.js');

const STATUS = Object.freeze({
  agent_forbidden: 403, not_found: 404,
  empty: 400, too_long: 400, input_rejected: 400, too_large: 400,
  no_session: 409, job_item: 409, no_live_session: 409, not_chat: 409, host_unreachable: 409,
  send_failed: 500,
});
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));

/** The live session an item belongs to: [webuiId, session] | null. A chat-mode
 *  entry with a pty wins over another entry under the same key (a view). */
function sessionForItem(item, activeSessions, sessionStatusKey) {
  let best = null;
  for (const [id, s] of activeSessions) {
    if (!s || s.isTmuxView) continue;
    let k = null;
    try { k = sessionStatusKey(s, id); } catch { }
    if (k !== item.sessionKey && `webui:${id}` !== item.sessionKey) continue;
    if (s.pty && s.mode === 'chat') return [id, s];
    if (!best) best = [id, s];
  }
  return best;
}

function registerUserTodoReplyRoutes(app, { userTodos, activeSessions, sendUserInput, sessionStatusKey, now = () => Date.now() }) {
  const fail = (res, code, error) => res.status(STATUS[code] || 400).json({ error, code });
  app.post('/api/user-todos/:id/reply', (req, res) => {
    try {
      if (isAgentBearer(req)) return fail(res, 'agent_forbidden', 'a reply is the user\'s own message — an agent token cannot send one');
      const item = userTodos.get(String(req.params.id));
      if (!item) return fail(res, 'not_found', 'item not found');
      const t = checkReplyText(req.body && req.body.text);
      if (!t.ok) return fail(res, t.code, t.why);
      const hit = sessionForItem(item, activeSessions, sessionStatusKey);
      const s = hit && hit[1];
      const v = replyVerdict({ item, session: s ? { live: true, mode: s.mode || 'terminal', remoteState: (s._remoteState && s._remoteState.state !== 'connected') ? s._remoteState.state : null } : null });
      if (!v.ok) return fail(res, v.code, v.why);
      const r = sendUserInput(hit[0], composeReply(item, t.text, { now: now() }), { msgId: Date.now() + '-reply', origin: 'inbox-reply' });
      if (!r || !r.ok) {
        const code = r && r.code === 'no_session' ? 'no_live_session' : (r && r.code) || 'send_failed';
        return fail(res, code, (r && r.error) || 'the reply was not sent');
      }
      const updated = userTodos.resolveByReply(item.id, t.text);
      res.json({ ok: true, msgId: r.msgId, item: updated });
    } catch (e) { res.status(500).json({ error: e.message, code: 'send_failed' }); }
  });
}

const RESOLVE_MANY_MAX = 200; // one group holds ≤ 20 open items per session (the store's cap) — 200 is ten groups, never a whole-store wipe
const RESOLVE_MANY_STATUSES = ['dismissed', 'done'];

function registerResolveManyRoute(app, { userTodos }) {
  app.post('/api/user-todos/resolve-many', (req, res) => {
    const fail = (status, code, error) => res.status(status).json({ error, code });
    try {
      if (isAgentBearer(req)) return fail(403, 'agent_forbidden', 'resolving the user\'s inbox is the user\'s act — an agent token cannot');
      const { ids, status } = req.body || {};
      if (!Array.isArray(ids) || !ids.length || !ids.every((x) => typeof x === 'string' && x)) return fail(400, 'bad_ids', 'ids must be a non-empty array of item ids');
      if (ids.length > RESOLVE_MANY_MAX) return fail(400, 'too_many', `at most ${RESOLVE_MANY_MAX} ids per request (got ${ids.length})`);
      if (!RESOLVE_MANY_STATUSES.includes(status)) return fail(400, 'bad_status', `status must be one of ${RESOLVE_MANY_STATUSES.join('/')}`);
      const r = userTodos.setStatusMany(ids, status, 'user');
      res.json({ ok: true, changed: r.changed.length, unknown: r.unknown });
    } catch (e) { fail(500, 'failed', e.message); }
  });
}

module.exports = { registerUserTodoReplyRoutes, registerResolveManyRoute, RESOLVE_MANY_MAX, STATUS, sessionForItem };
