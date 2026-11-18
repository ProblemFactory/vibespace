'use strict';
/**
 * "CLEAR CONTENT…" — THE OWNER'S ROUTES (2026-09-28).
 *
 *   POST /api/records/clear       {kind, id, groupId?, sessionKey?}
 *     → {ok:true, cleared: 0|1, already: 0|1, archiveUnread?: true} | {error, code} by NAME:   (B-20b6: archiveUnread = a job's archived records could not be reached, their words not cleared)
 *       agent_forbidden 403 · bad_items / bad_kind 400 · not_found 404 ·
 *       ambiguous 409 · unavailable 503 · archive_unread 503 (a job id found only in the held archive) · failed 500
 *   POST /api/records/clear-many  {items: [{kind, id, groupId?, sessionKey?}…] (1..200)}
 *     → {ok:true, cleared: n, already: n, unknown: [{kind, id}], refused: [{kind, id, code, error}], archiveUnread?: true}
 *       — every KNOWN record the owner named is cleared; an unknown one is NAMED,
 *       never a throw; ONE write + ONE broadcast per store container.
 *
 * kind: activity (groupId + a P- id or the entry's ms `at`) · todo (id) · status
 * (sessionKey + the history entry's ms `at`) · job (id — a cron parent takes its
 * runs, then the job's For-you items) · group-message (groupId + the vendorId).
 * What a clear replaces, and why a record keeps its place, is PURE
 * src/record-clear.js; the doors and the journal line are src/server/record-clear.js.
 *
 * OWNER-ONLY: cookie auth comes from auth.middleware (every non-/api/agent/* route)
 * and an agent's session / job token is refused by name — an agent clears only
 * what its own session wrote, through its own verbs (`vibespace-task
 * progress-redact`, `vibespace-ask clear`). WITH SIGN-IN OFF the owner cannot be
 * told apart from a local agent's curl that sends no token (the channels routes
 * say the same): every cookie route is open then, this one included.
 */
const RC = require('../record-clear.js');

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const OWNER = Object.freeze({ role: 'owner' });
const itemOf = (b) => ({ kind: b && b.kind, id: b && (typeof b.id === 'number' ? b.id : b.id != null ? String(b.id) : b.id), ...(b && b.groupId ? { groupId: String(b.groupId) } : {}), ...(b && b.sessionKey ? { sessionKey: String(b.sessionKey) } : {}) });

function registerRecordClearRoutes(app, { recordClear }) {
  const fail = (res, v) => res.status(v.status || (RC.REFUSALS[v.code] || {}).status || 400).json({ error: v.why || (RC.REFUSALS[v.code] || {}).why || 'refused', code: v.code || 'failed' });
  app.post('/api/records/clear', async (req, res) => {
    try {
      if (isAgentBearer(req)) return fail(res, RC.refuse('agent_forbidden'));
      // lane lg-store-writes, the U4/U5 cure: the answer rides the clear's own — once its stores are on disk, on the store
      // writer's synchronous road (a clear still waiting at the hub's stop answers inside the exit's flush); not landed ⇒
      // notOnDisk, which the page says
      await recordClear.clear(itemOf(req.body || {}), { caller: OWNER, answer: (r) => { try {
        if (!r.ok) return void fail(res, r);
        require('../store-writer.js').identityAtExit(res);   // an answer made while the hub stops goes out unencoded (compression's zlib is asynchronous)
        res.json({ ok: true, cleared: r.cleared, already: r.already, ...(r.notOnDisk ? { notOnDisk: true } : {}), ...(r.archiveUnread ? { archiveUnread: true } : {}) });   // B-20b6: the archived records left uncleared are said
      } catch { } } });
    } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message, code: 'failed' }); }
  });
  app.post('/api/records/clear-many', async (req, res) => {
    try {
      if (isAgentBearer(req)) return fail(res, RC.refuse('agent_forbidden'));
      const items = req.body && req.body.items;
      await recordClear.clearMany(Array.isArray(items) ? items.map(itemOf) : items, { caller: OWNER, answer: (r) => { try {
        if (!r.ok) return void fail(res, r);
        require('../store-writer.js').identityAtExit(res);   // an answer made while the hub stops goes out unencoded (compression's zlib is asynchronous)
        res.json({ ok: true, cleared: r.cleared, already: r.already, unknown: r.unknown, refused: [...r.refused, ...r.ambiguous].map((x) => ({ kind: x.kind, id: x.id, code: x.code, error: x.why })), ...(r.notOnDisk ? { notOnDisk: true } : {}), ...(r.archiveUnread ? { archiveUnread: true } : {}) });   // B-20b6
      } catch { } } });   // the same road as /api/records/clear (the U4/U5 cure)
    } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message, code: 'failed' }); }
  });
}

module.exports = { registerRecordClearRoutes, isAgentBearer };
