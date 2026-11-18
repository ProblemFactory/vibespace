'use strict';
/**
 * THE FOR-YOU REPLY ROUTE (docs/design-user-inbox-reply.md D1).
 *
 *   POST /api/user-todos/:id/reply   {text, images?: [{base64, mediaType?, name?}]}
 *     B-51dd: a reply takes PICTURES (the box's button / paste / drop) — each judged again HERE by THE picture rule
 *       (PURE src/image-attach-rule.js, the one the page's door asked: the type from its bytes, HEIC by name, no empty
 *       picture; the size / sides / total of the RECEIVING conversation's harness row — the live one's, else the reopen key's —
 *       and VibeSpace's own ceiling) → `bad_image` 400 {picture:{name, code, …, limits}} with nothing sent; the taken ones ride the chat
 *       composer's own frame (image blocks typed by their bytes, then the quoted text) down THE typing path, on the reopen
 *       road too (a frame over 64 KiB waits, ≤ 15 s, for the fresh wrapper's frame-file report, then goes once); a
 *       picture alone is a reply (no text needed), and the item keeps how many pictures it carried (`reply.pictures`).
 *     → {ok:true, msgId, item}  — the reply went down the ONE typing path
 *       (src/server/user-input.js, the chat composer's own server path) as a
 *       user message opening with the item's quote block (PURE
 *       src/inbox-reply.js composeReply), and ONLY THEN the item was resolved
 *       (`resolvedBy:'reply'`, the reply kept on it) — ONE store broadcast
 *     | {error, code} by NAME: agent_forbidden 403 · not_found 404 ·
 *       empty / too_long / input_rejected / too_large 400 ·
 *       no_session / job_item / card_item / exit_ask / no_live_session / not_chat / host_unreachable 409 ·
 *       send_failed 500. A refusal resolves nothing.
 *     A CONVERSATION THAT ENDED IS REOPENED (lane inbox-reply-dead-session, userW inc-mvfuzlom-nwav 2026-10-19:
 *       「在 inbox 里面回复 session 的时候, 如果那个 session 已经挂了, 就回不了了.」): with the `reopen` dep wired
 *       (src/server/inbox-reopen.js) a reply whose verdict is `no_live_session` RESUMES the item's conversation by
 *       the page's own resume road (the ws create {resume:true, resumeId}, its config from user-state), types the
 *       reply as its first input through the SAME sender, resolves the item and answers
 *       → {ok:true, reopened:true, sessionId, conversation:{backend, backendSessionId, cwd, hostId, name}, msgId, item}
 *       (the page opens that conversation's window) | {error, code:'resume_failed'} 409 — the resume's own reason
 *       (no transcript, the CLI missing, an account that cannot serve…), the item still open. A live session's
 *       path is untouched.
 *
 *   POST /api/user-todos/resolve-many   {ids: string[] (1..200), status: 'dismissed'|'done'} → {ok, changed, unknown, decisions}
 *                                        (`decisions` = the open DECISION rows it passed by — lane wake-approve-card r2)
 *     → {ok:true, changed: n, unknown: [id…]} — "Mark all seen" on a group head
 *       (design-user-inbox-reply §4 d, chunk 4): the store's setStatusMany,
 *       resolvedBy 'user', ONE save + ONE broadcast; an unknown id is named, the
 *       rest still applies | {error, code}: agent_forbidden 403 · too_many /
 *       bad_ids / bad_status 400. A reopen is not a batch verb (↺ is per row).
 *       server.js registers it BEFORE `POST /api/user-todos/:id` — Express
 *       matches in order, and after it `resolve-many` would read as an item id.
 *
 *   POST /api/user-todos/notices/read-all   {ids: string[] (1..1000)}  ·  POST /api/user-todos/notices/unread {ids}
 *     → {ok:true, changed: [id…], already: n, refused: [id…], unknown: [id…]} — «Mark all read» on the notices
 *       (lane inbox-fyi-mark-all): the store's readNotices — every open NOTICE among the ids done in ONE save + ONE
 *       broadcast, an id already resolved left as it is (idempotent), an ask refused by id; `unread` is its 5 s Undo
 *       (exactly the `changed` ids back open, as they were) | {error, code}: agent_forbidden 403 · too_many / bad_ids 400.
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
const { judgeImageBase64, refusalVars, REFUSAL_WORDS, REPLY_WORDS } = require('../image-attach-rule.js'); // B-51dd: THE picture rule — the page's door asked it, the route asks it again
const { imageLimitsOf, harnessOfRecord } = require('../backend-caps.js');   // batch 20 cure: judged with the HARNESS of the conversation the reply goes to
const { conversationOfKey } = require('../inbox-reopen.js');   // …a reopened one's harness is its key's

const STATUS = Object.freeze({
  agent_forbidden: 403, not_found: 404,
  empty: 400, too_long: 400, input_rejected: 400, too_large: 400, bad_image: 400,
  no_session: 409, job_item: 409, card_item: 409, exit_ask: 409, no_live_session: 409, not_chat: 409, host_unreachable: 409,
  resume_failed: 409, send_failed: 500,
});
// who pressed it (a sign-in's handle, never the cookie) — the act a reopen starts on a device names it (src/device-audit.js)
const byOf = (req) => { try { return require('../device-audit.js').byOfReq(req); } catch { return null; } };
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));

/** B-51dd: a reply's pictures → {ok, blocks} (the composer's image blocks, typed by their BYTES) | {ok:false, error, picture}
 *  — the first picture the rule refuses names the refusal; anything but an array (or nothing) is refused too. `limits` = the
 *  receiving conversation's harness row (batch 20 cure; null = it states none: no numeric cap); the refusal carries them so the
 *  page says THAT harness's numbers. */
function picturesOf(raw, { limits = null } = {}) {
  if (raw == null) return { ok: true, blocks: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'images must be an array of pictures', picture: null };
  const blocks = [];
  let total = 0;   // the reply's pictures together — the API's stated request size bounds them (the rule's too_much)
  for (const p of raw) {
    const name = p && typeof p.name === 'string' ? p.name.slice(0, 200) : '';
    const v = judgeImageBase64(p && p.base64, { total, limits });
    if (!v.ok) {
      const picture = { name, code: v.code, size: v.size || 0, ...(v.width ? { width: v.width, height: v.height } : {}), limits };
      const vars = refusalVars(picture, limits);
      return { ok: false, picture, error: `${name || 'a picture'}: ${REFUSAL_WORDS[v.code].replace(/\{(\w+)\}/g, (_, k) => String(vars[k]))}` };
    }
    total += v.b64;
    blocks.push({ type: 'image', source: { type: 'base64', media_type: v.mediaType, data: p.base64 } });
  }
  return { ok: true, blocks };
}

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

const CAPS_WAIT_MS = 15000, CAPS_POLL_MS = 200, BIG_FRAME = 64 * 1024;   // B-51dd: how long a reopen waits for its wrapper's frame-file verb, how often it looks, the frame size that needs it (the sender's own 64 KiB)
function registerUserTodoReplyRoutes(app, { userTodos, activeSessions, sendUserInput, sessionStatusKey, reopen = null, now = () => Date.now() }) {
  const fail = (res, code, error, extra = null) => res.status(STATUS[code] || 400).json({ error, code, ...(extra || {}) });
  // THE REOPEN (lane inbox-reply-dead-session): the conversation ended ⇒ resume it, then the reply is its first input
  // (`frame` = what is typed: the quoted reply, or — B-51dd — the composer's frame carrying its pictures)
  // B-51dd: a frame over the pipe's size right after the start would meet a wrapper that has not reported its frame-file
  // verb YET («too large … still starting up?») — the reopen waits for that report (the sender's framesReady: one sidecar
  // read a look, never a re-parse of the frame), bounded, then sends ONCE; whatever the send answers is the answer
  const sendWhenReady = async (sessionId, frame) => {
    const ready = sendUserInput && sendUserInput.framesReady;
    if (typeof ready === 'function' && frame.length > BIG_FRAME) {
      const until = Date.now() + CAPS_WAIT_MS;   // the wall clock (the route's `now` stamps the quote — a test freezes it)
      while (!ready(sessionId) && Date.now() < until) await new Promise((ok) => setTimeout(ok, CAPS_POLL_MS));
    }
    return sendUserInput(sessionId, frame, { msgId: Date.now() + '-reply', origin: 'inbox-reply', door: 'enter' });   // the conversation's own Enter door (lane reply-door-follows-enter)
  };
  const reopenAndSend = (req, res, item, text, frame, pictures) => Promise.resolve(reopen(item, { by: byOf(req) })).then(async (o) => {
    if (!o || !o.ok) return fail(res, 'resume_failed', (o && o.why) || 'the conversation could not be reopened', o && o.i18n ? { i18n: o.i18n } : null);
    // NOT AN UNATTENDED SPEND: this first turn is the PERSON's — the reply they typed and pressed Send on (owner-only,
    // agent tokens refused above), exactly the turn the composer would send after a hand Resume; the resume itself
    // sends nothing. So it rides THE typing path (no authorizer, no ladder — src/server/user-input.js says why) and
    // the spend census excuses it with this file's typed-send row (scripts/test-spend-paths.mjs).
    const r = await sendWhenReady(o.sessionId, frame);   // ONE send, once the fresh wrapper can take a big frame
    // (batch 20 cure: the frame the just-started conversation cannot take yet is ALSO said as words the page translates)
    const tooLarge = r && r.code === 'too_large' && r.reason === 'no-sidecar' ? { words: { key: REPLY_WORDS.reopenTooLarge, params: { mb: (frame.length / 1048576).toFixed(1) } } } : {};   // only «still starting» is a wait (an old wrapper needs Terminate + Resume: its English stays)
    if (!r || !r.ok) return res.status(STATUS[(r && r.code) || 'send_failed'] || 500).json({ ...tooLarge, error: (r && r.error) || 'the reply was not sent', code: (r && r.code) || 'send_failed', reopened: true, sessionId: o.sessionId, conversation: o.conversation || null });
    const updated = userTodos.resolveByReply(item.id, text, undefined, { pictures });
    res.json({ ok: true, reopened: true, sessionId: o.sessionId, conversation: o.conversation || null, msgId: r.msgId, item: updated });
  }).catch((e) => { if (!res.headersSent) fail(res, 'resume_failed', 'the conversation could not be reopened: ' + e.message); });
  app.post('/api/user-todos/:id/reply', (req, res) => {
    try {
      if (isAgentBearer(req)) return fail(res, 'agent_forbidden', 'a reply is the user\'s own message — an agent token cannot send one');
      const item = userTodos.get(String(req.params.id));
      if (!item) return fail(res, 'not_found', 'item not found');
      // the conversation the reply goes to — FIRST, so its pictures are judged with ITS harness (the live one's, else the one the
      // reopen would resume: its key names it); a conversation nobody can name has no numbers (the reopen refuses it anyway)
      const hit = sessionForItem(item, activeSessions, sessionStatusKey);
      const s = hit && hit[1];
      // (cure 2: a record that names no harness is claude's — backend-caps harnessOfRecord, the release's reading everywhere — never «no numbers»)
      const rec = s || conversationOfKey(item.sessionKey) || null;
      const backend = rec ? harnessOfRecord(rec) : null;
      const pics = picturesOf(req.body && req.body.images, { limits: imageLimitsOf(backend) });
      if (!pics.ok) return res.status(STATUS.bad_image).json({ error: pics.error, code: 'bad_image', ...(pics.picture ? { picture: pics.picture } : {}) });
      const t0 = checkReplyText(req.body && req.body.text);
      const t = !t0.ok && t0.code === 'empty' && pics.blocks.length ? { ok: true, text: '' } : t0;   // a picture alone is a reply
      if (!t.ok) return fail(res, t.code, t.why);
      const quoted = composeReply(item, t.text, { now: now() });
      const frame = pics.blocks.length ? JSON.stringify({ type: 'user', message: { role: 'user', content: [...pics.blocks, { type: 'text', text: quoted }] } }) : quoted;
      const v = replyVerdict({ item, session: s ? { live: true, mode: s.mode || 'terminal', remoteState: (s._remoteState && s._remoteState.state !== 'connected') ? s._remoteState.state : null } : null });
      if (!v.ok && v.code === 'no_live_session' && typeof reopen === 'function') return reopenAndSend(req, res, item, t.text, frame, pics.blocks.length);
      if (!v.ok) return fail(res, v.code, v.why);
      const r = sendUserInput(hit[0], frame, { msgId: Date.now() + '-reply', origin: 'inbox-reply', door: 'enter' });   // the conversation's own Enter door (lane reply-door-follows-enter)
      if (!r || !r.ok) {
        const code = r && r.code === 'no_session' ? 'no_live_session' : (r && r.code) || 'send_failed';
        return fail(res, code, (r && r.error) || 'the reply was not sent');
      }
      const updated = userTodos.resolveByReply(item.id, t.text, undefined, { pictures: pics.blocks.length });   // B-51dd: the reply keeps how many pictures it carried
      res.json({ ok: true, msgId: r.msgId, item: updated });
    } catch (e) { res.status(500).json({ error: e.message, code: 'send_failed' }); }
  });
}

const RESOLVE_MANY_MAX = 200; // one group holds ≤ 20 open items per session (the store's cap) — 200 is ten groups, never a whole-store wipe
const RESOLVE_MANY_STATUSES = ['dismissed', 'done'];
// lane inbox-fyi-mark-all: «Mark all read» covers every listed notice in ONE request — the ledger's own cap (MAX_ITEMS),
// so no number of notices ever takes N round-trips; the store touches notices only (an ask in `ids` is refused by id)
const NOTICES_READ_MAX = 1000;

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
      res.json({ ok: true, changed: r.changed.length, unknown: r.unknown, decisions: r.decisions || [] });   // lane wake-approve-card r2: a decision row stays until decided
    } catch (e) { fail(500, 'failed', e.message); }
  });
  // «Mark all read» (lane inbox-fyi-mark-all): POST /api/user-todos/notices/read-all {ids} — every open NOTICE among the
  // ids done in ONE store write + ONE broadcast (idempotent: an id already resolved stays as it is); …/unread {ids} = its
  // 5 s Undo — exactly those come back open. Owner-only like resolve-many; `changed` lists the ids, the Undo's input.
  const noticesDoor = (read) => (req, res) => {
    const fail = (status, code, error) => res.status(status).json({ error, code });
    try {
      if (isAgentBearer(req)) return fail(403, 'agent_forbidden', 'reading the user\'s notices is the user\'s act — an agent token cannot');
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || !ids.length || !ids.every((x) => typeof x === 'string' && x)) return fail(400, 'bad_ids', 'ids must be a non-empty array of item ids');
      if (ids.length > NOTICES_READ_MAX) return fail(400, 'too_many', `at most ${NOTICES_READ_MAX} ids per request (got ${ids.length})`);
      const r = userTodos.readNotices(ids, read, 'user');
      res.json({ ok: true, changed: r.changed, already: r.already.length, refused: r.refused, unknown: r.unknown });
    } catch (e) { fail(500, 'failed', e.message); }
  };
  app.post('/api/user-todos/notices/read-all', noticesDoor(true));
  app.post('/api/user-todos/notices/unread', noticesDoor(false));
}

/** GET /api/user-todos/:id → {item} — ONE item WHOLE, whatever its status (2026-09-27, the
 *  For-you window's verify round). The snapshot every client receives carries a RESOLVED
 *  item's detail as a 300-char preview (`detailTruncated: true`, src/user-todos.js previewOf)
 *  so history never grows the broadcast; the window fetches the whole record here when it
 *  shows one (src/lib/user-todos-actions.js ensureDetail). Cookie-only like the routes above
 *  — an agent token is refused by name (an agent reads its OWN items through
 *  `vibespace-ask show`); an unknown id is 404 `not_found`. */
function registerItemReadRoute(app, { userTodos }) {
  app.get('/api/user-todos/:id', (req, res) => {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'the user\'s inbox is read with the user\'s cookie — an agent token reads its own items through vibespace-ask show', code: 'agent_forbidden' });
    const item = userTodos.get(String(req.params.id));
    if (!item) return res.status(404).json({ error: 'item not found', code: 'not_found' });
    res.json({ item });
  });
}

module.exports = { registerUserTodoReplyRoutes, registerResolveManyRoute, registerItemReadRoute, RESOLVE_MANY_MAX, NOTICES_READ_MAX, STATUS, sessionForItem, picturesOf, CAPS_WAIT_MS };
