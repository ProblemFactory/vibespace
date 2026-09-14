'use strict';
/**
 * CHANNELS ROUTES (docs/design-communication-panel.zh.md §10.2, §16).
 *
 * EVERY ROUTE TAKES `host` AND PASSES IT DOWN — `hostId` is a PARAMETER, never
 * a branch (decision 15). v1 is LOCAL ONLY, and that is expressed as a NAMED
 * REFUSAL for any other machine rather than as a missing parameter: when the
 * fleet half lands, the signature does not change and no caller is rewritten.
 * A silent local answer to a question about another machine is the failure
 * this rule exists to stop.
 *
 * `GET /api/channels` returns the index DIGEST — adapters, conversations,
 * their resolved `convCaps`, their offers and their freshness claims — and
 * NEVER message bodies. Bodies come from the messages route, one page at a
 * time, because a vendor body is hostile input that syncs to every client
 * (fence 5) and because the panel must stay a panel.
 *
 * EVERY MUTATION BROADCASTS the recomputed digest through the engine's ONE
 * notify point (the cache-invalidation law: one dirty signal, one
 * computation), and every failure answers `{error}` with a reason — `fetchJson`
 * never throws, so a route that returned 200-with-nothing would be a silent
 * failure of a user action.
 */
const express = require('express');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const bad = (res, code, error, extra = {}) => res.status(code).json({ error, ...extra });

/** THE host parameter. v1 serves device #0 only and SAYS so for anything else. */
function forHost(req) {
  const host = (req.method === 'GET' ? req.query.host : (req.body && req.body.host)) || null;
  if (host && host !== 'local') {
    const e = new Error(`Channels v1 runs on this machine only — '${host}' is not served yet`);
    e.status = 501; e.code = 'host-not-served';
    throw e;
  }
  return null; // device #0
}

function engine() {
  const e = ctx && ctx.getEngine && ctx.getEngine();
  if (!e) { const err = new Error('Channels are not available on this instance'); err.status = 503; err.code = 'unavailable'; throw err; }
  return e;
}

function fail(res, e) {
  return res.status(e && e.status ? e.status : 500).json({ error: String((e && e.message) || e), code: (e && e.code) || null });
}

/** LIST — the whole panel in one read. */
router.get('/api/channels', (req, res) => {
  try { forHost(req); res.json(engine().digest()); } catch (e) { fail(res, e); }
});

/** OPEN — one conversation's summary (what the window's context bar shows). */
router.get('/api/channels/:adapterId/:convId', (req, res) => {
  try {
    forHost(req);
    const d = engine().digest();
    const key = `${req.params.adapterId}/${req.params.convId}`;
    const conv = d.conversations.find((c) => c.key === key);
    if (!conv) return bad(res, 404, 'No such conversation');
    const adapter = d.adapters.find((a) => a.id === conv.adapterId) || null;
    res.json({ conversation: conv, adapter });
  } catch (e) { fail(res, e); }
});

/**
 * HISTORY PAGING — one page, oldest-first, strictly before the BOUNDARY
 * RECORD `(before, beforeId)`.
 *
 * The boundary is a PAIR, not an instant: `at` is not unique (a Lark burst
 * shares a millisecond, Gmail's `internalDate` is second-derived) and paging
 * on it alone with a strict `<` made every record of such a group at or after
 * a page boundary permanently unreachable. `beforeId` is the boundary
 * record's `vendorId`, which invariant 2 makes unique per conversation; the
 * store orders by `(at, vendorId)`.
 */
router.get('/api/channels/:adapterId/:convId/messages', (req, res) => {
  try {
    forHost(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const before = req.query.before ? Number(req.query.before) : null;
    const beforeId = req.query.beforeId ? String(req.query.beforeId) : null;
    const records = engine().messages(req.params.adapterId, req.params.convId, { before, beforeId, limit });
    res.json({ records, limit, before: before || null, beforeId });
  } catch (e) { fail(res, e); }
});

/** MARK-READ. `at` is optional; the engine re-derives `unread` from the log —
 *  and 404s on an id it does not hold, rather than minting a row for it. */
router.post('/api/channels/:adapterId/:convId/read', async (req, res) => {
  try {
    forHost(req);
    const at = Number(req.body && req.body.at);
    const ok = await engine().markRead(req.params.adapterId, req.params.convId, Number.isFinite(at) ? at : null);
    if (!ok) return bad(res, 404, 'No such conversation');
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

/** TRACK — the opt-in that decides whether anything is ingested at all
 *  (§5 invariant 6). Without it the panel could never show a message, so it
 *  ships with the panel rather than with the adapters. */
router.post('/api/channels/:adapterId/:convId/track', async (req, res) => {
  try {
    forHost(req);
    const tracked = !(req.body && req.body.tracked === false);
    const ok = await engine().setTracked(req.params.adapterId, req.params.convId, tracked);
    if (!ok) return bad(res, 404, 'No such conversation');
    res.json({ ok: true, tracked });
  } catch (e) { fail(res, e); }
});

module.exports = { router, setup };
